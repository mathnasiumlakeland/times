<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { Check, Keyboard, LockKeyhole, MousePointer2, Rocket, Swords } from 'lucide-svelte';
	import {
		STORY_MAP_HEIGHT,
		STORY_MAP_WIDTH,
		STORY_NODES,
		getStoryNodeStatus,
		getStoryProgress,
		getStoryTravelFlightMs,
		getStoryTravelPath,
		makeStoryPath,
		STORY_TRAVEL_TIMING,
		type StoryNode,
		type StoryProgress,
		type StoryTravel
	} from '$lib/story';

	let {
		progress,
		travel = null,
		rocketIndex,
		difficulty,
		onselect,
		ondifficultychange,
		ontravelstart = () => {},
		ontravelcomplete = () => {}
	}: {
		progress: StoryProgress;
		travel?: StoryTravel | null;
		rocketIndex: number;
		difficulty: 'easy' | 'hard';
		onselect: (node: StoryNode) => void;
		ondifficultychange: (difficulty: 'easy' | 'hard') => void;
		ontravelstart?: (travel: StoryTravel) => void;
		ontravelcomplete?: (travel: StoryTravel) => void;
	} = $props();

	type TravelPhase = 'idle' | 'waiting' | 'ignition' | 'flight' | 'arrival';

	let travelling = $state(false);
	let arrivalAnnouncement = $state('');
	let travelPhase = $state<TravelPhase>('idle');
	let activeTravel = $state<StoryTravel | null>(null);
	let selectionTravelId = 0;
	let travelTimers: number[] = [];
	let cameraFrame: number | undefined;
	let mapCanvas = $state<HTMLOListElement>();
	let travelMotionGuide = $state<SVGPathElement>();
	let routeProgress = $derived(getStoryProgress(progress));
	let currentNode = $derived(STORY_NODES[routeProgress.currentIndex]);
	let resolvedRocketIndex = $derived(STORY_NODES[rocketIndex] ? rocketIndex : routeProgress.currentIndex);
	let rocketNode = $derived(STORY_NODES[resolvedRocketIndex]);
	let travelStartNode = $derived(activeTravel ? STORY_NODES[activeTravel.fromIndex] : undefined);
	let travelEndNode = $derived(activeTravel ? STORY_NODES[activeTravel.toIndex] : undefined);
	let fullPath = makeStoryPath();
	let completedPath = $derived(makeStoryPath(STORY_NODES.slice(0, routeProgress.currentIndex + 1)));
	let travelPath = $derived(activeTravel ? getStoryTravelPath(activeTravel.fromIndex, activeTravel.toIndex) : '');
	let travelFlightMs = $derived(activeTravel ? getStoryTravelFlightMs(activeTravel.fromIndex, activeTravel.toIndex) : 0);
	const captureMapCanvas: Attachment<HTMLOListElement> = (element) => {
		mapCanvas = element;
		return () => {
			if (mapCanvas === element) mapCanvas = undefined;
		};
	};
	const captureTravelGuide: Attachment<SVGPathElement> = (element) => {
		travelMotionGuide = element;
		return () => {
			if (travelMotionGuide === element) travelMotionGuide = undefined;
		};
	};

	onMount(() => {
		if (travel) beginTravel(travel);
		return clearTravelTimers;
	});

	function nodeTitle(node: StoryNode) {
		return node.kind === 'planet' ? `Planet ×${node.table}: ${node.title}` : `${node.rank}: ${node.bossName}`;
	}

	function nodeSubtitle(node: StoryNode) {
		return node.kind === 'planet' ? node.chapter : `Mixed ×${node.tables.join(', ×')}`;
	}

	function accessibleNodeLabel(node: StoryNode, index: number) {
		const status = getStoryNodeStatus(index, progress);
		const prerequisite = STORY_NODES[index - 1];
		const stateCopy = status === 'completed'
			? 'completed; replay available'
			: status === 'current'
				? 'unlocked; current mission'
				: `locked; complete ${prerequisite ? nodeTitle(prerequisite) : 'the previous mission'} first`;
		return `Stage ${index + 1}, ${nodeTitle(node)}, ${stateCopy}`;
	}

	function clearTravelTimers() {
		for (const timer of travelTimers) window.clearTimeout(timer);
		travelTimers = [];
		if (cameraFrame !== undefined) window.cancelAnimationFrame(cameraFrame);
		cameraFrame = undefined;
	}

	function centerStoryNode(index: number, behavior: ScrollBehavior) {
		document.querySelector<HTMLButtonElement>(`#story-node-${STORY_NODES[index]?.id}`)
			?.scrollIntoView({ behavior, block: 'center' });
	}

	function followTravelCamera(duration: number) {
		const guide = travelMotionGuide;
		const canvas = mapCanvas;
		if (!guide || !canvas || duration <= 0) return;
		const pathLength = guide.getTotalLength();
		const startedAt = performance.now();
		const follow = (now: number) => {
			const progress = Math.min(1, (now - startedAt) / duration);
			const point = guide.getPointAtLength(pathLength * progress);
			const canvasRect = canvas.getBoundingClientRect();
			const canvasTop = window.scrollY + canvasRect.top;
			const rocketPageY = canvasTop + (point.y / STORY_MAP_HEIGHT) * canvasRect.height;
			window.scrollTo({ top: Math.max(0, rocketPageY - window.innerHeight * 0.5), behavior: 'auto' });
			if (progress < 1) cameraFrame = window.requestAnimationFrame(follow);
			else cameraFrame = undefined;
		};
		cameraFrame = window.requestAnimationFrame(follow);
	}

	function finishTravel(completedTravel: StoryTravel, launchNode?: StoryNode) {
		clearTravelTimers();
		travelPhase = 'idle';
		travelling = false;
		activeTravel = null;
		arrivalAnnouncement = launchNode
			? `Arrived at ${nodeTitle(launchNode)}. Launching mission.`
			: `${nodeTitle(STORY_NODES[completedTravel.toIndex])} unlocked.`;
		ontravelcomplete(completedTravel);
		if (launchNode) {
			onselect(launchNode);
			return;
		}
		void tick().then(() => document.querySelector<HTMLButtonElement>(`#story-node-${STORY_NODES[completedTravel.toIndex].id}`)?.focus());
	}

	function beginTravel(nextTravel: StoryTravel, launchNode?: StoryNode) {
		const path = getStoryTravelPath(nextTravel.fromIndex, nextTravel.toIndex);
		if (!path) {
			finishTravel(nextTravel, launchNode);
			return;
		}
		clearTravelTimers();
		activeTravel = nextTravel;
		travelling = true;
		travelPhase = 'waiting';
		const destination = STORY_NODES[nextTravel.toIndex];
		arrivalAnnouncement = `Rocket traveling to ${nodeTitle(destination)}.`;
		const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (reduceMotion) {
			centerStoryNode(nextTravel.toIndex, 'auto');
			finishTravel(nextTravel, launchNode);
			return;
		}

		const preflightMs = nextTravel.reason === 'selection'
			? STORY_TRAVEL_TIMING.selectionCameraMs
			: STORY_TRAVEL_TIMING.ignitionDelayMs;
		const flightMs = getStoryTravelFlightMs(nextTravel.fromIndex, nextTravel.toIndex);
		const flightStartsAt = preflightMs + STORY_TRAVEL_TIMING.ignitionMs;
		const arrivalStartsAt = flightStartsAt + flightMs;
		const landingHoldMs = nextTravel.reason === 'selection' ? STORY_TRAVEL_TIMING.selectionLandingHoldMs : 0;
		if (nextTravel.reason === 'selection') centerStoryNode(nextTravel.fromIndex, 'smooth');
		travelTimers = [
			window.setTimeout(() => travelPhase = 'ignition', preflightMs),
			window.setTimeout(() => {
				travelPhase = 'flight';
				if (nextTravel.reason === 'selection') void tick().then(() => followTravelCamera(flightMs));
			}, flightStartsAt),
			window.setTimeout(() => travelPhase = 'arrival', arrivalStartsAt),
			window.setTimeout(
				() => finishTravel(nextTravel, launchNode),
				arrivalStartsAt + STORY_TRAVEL_TIMING.arrivalMs + landingHoldMs
			)
		];
	}

	function chooseNode(node: StoryNode, index: number) {
		if (travelling || getStoryNodeStatus(index, progress) === 'locked') return;
		if (index === resolvedRocketIndex) {
			onselect(node);
			return;
		}
		selectionTravelId += 1;
		const selectionTravel: StoryTravel = {
			id: -selectionTravelId,
			fromIndex: resolvedRocketIndex,
			toIndex: index,
			reason: 'selection'
		};
		ontravelstart(selectionTravel);
		beginTravel(selectionTravel, node);
	}
</script>

{#snippet travelRocket(stateClass: string)}
	<svg
		class="travel-rocket-art"
		x="-60"
		y="-60"
		width="120"
		height="120"
		viewBox="-48 -48 96 96"
		preserveAspectRatio="xMidYMid meet"
		overflow="visible"
		aria-hidden="true"
	>
		<g class={['travel-ship', stateClass]}>
			<path class="travel-flame" d="M -23 0 L -38 -8 L -34 0 L -38 8 Z"></path>
			<path class="travel-body" d="M -25 -13 L 18 -13 L 34 0 L 18 13 L -25 13 L -13 0 Z"></path>
			<circle class="travel-window" cx="8" cy="0" r="6"></circle>
		</g>
	</svg>
{/snippet}

<section class="story-map-shell" id="story-map" aria-labelledby="story-map-title">
	<div class="story-map-copy">
		<span class="story-kicker">Story mode · Chapter 1</span>
		<h2 id="story-map-title">Chart a path through the tables.</h2>
		<p>Clear one-table planets, then prove what you learned when an alien blocks the route.</p>

		<fieldset class="story-difficulty" disabled={travelling}>
			<legend>Story difficulty</legend>
			<div class="story-difficulty-switch">
				<button
					type="button"
					class:selected={difficulty === 'easy'}
					onclick={() => ondifficultychange('easy')}
					aria-pressed={difficulty === 'easy'}
				>
					<span><MousePointer2 size={18} strokeWidth={2.5} /></span>
					<strong>Easy</strong>
					<small>Pick answers</small>
				</button>
				<button
					type="button"
					class:selected={difficulty === 'hard'}
					class:hard-selected={difficulty === 'hard'}
					onclick={() => ondifficultychange('hard')}
					aria-pressed={difficulty === 'hard'}
				>
					<span><Keyboard size={19} strokeWidth={2.5} /></span>
					<strong>Hard</strong>
					<small>Type answers</small>
				</button>
			</div>
			<p>{difficulty === 'hard' ? 'Manual controls apply to every planet and boss.' : 'Choose from four answers on every mission.'}</p>
		</fieldset>

		<div
			class="story-route-progress"
			role="progressbar"
			aria-label="Story route completion"
			aria-valuemin="0"
			aria-valuemax={STORY_NODES.length}
			aria-valuenow={routeProgress.completedCount}
		>
			<div><span style:width={`${routeProgress.percent}%`}></span></div>
			<strong>{routeProgress.completedCount} / {STORY_NODES.length} stages cleared</strong>
		</div>

		<div class="next-destination">
			<span>{routeProgress.isComplete ? 'Route complete' : 'Next destination'}</span>
			<strong>{routeProgress.isComplete ? 'Galaxy secured' : nodeTitle(currentNode)}</strong>
			<small>{routeProgress.isComplete ? 'Every planet and guardian is cleared.' : nodeSubtitle(currentNode)}</small>
		</div>
	</div>

	<nav class="story-route" id="story-route" aria-label="Story missions" aria-busy={travelling}>
		<ol class="story-map-canvas" {@attach captureMapCanvas}>
			<svg
				class="story-route-lines"
				viewBox={`0 0 ${STORY_MAP_WIDTH} ${STORY_MAP_HEIGHT}`}
				preserveAspectRatio="none"
				aria-hidden="true"
			>
				<path class="route-shadow" d={fullPath}></path>
				<path class="route-dashes" d={fullPath}></path>
				{#if routeProgress.currentIndex > 0 || routeProgress.isComplete}
					<path class="route-complete" d={completedPath}></path>
				{/if}
			</svg>

			{#each STORY_NODES as node, index (node.id)}
				{@const status = getStoryNodeStatus(index, progress)}
				<li
					class={['story-stop', `is-${status}`, `is-${node.kind}`]}
					class:travel-target={travelling && activeTravel?.toIndex === index}
					style:left={`${(node.x / STORY_MAP_WIDTH) * 100}%`}
					style:top={`${(node.y / STORY_MAP_HEIGHT) * 100}%`}
					style:--node-color={node.color}
				>
					<button
						id={`story-node-${node.id}`}
						type="button"
						onclick={() => chooseNode(node, index)}
						disabled={travelling}
						aria-disabled={status === 'locked'}
						aria-current={status === 'current' ? 'step' : undefined}
						aria-label={accessibleNodeLabel(node, index)}
					>
						<span class="node-number">{String(index + 1).padStart(2, '0')}</span>
						{#if node.kind === 'planet'}
							<span class="story-planet" aria-hidden="true">
								<span class="planet-glint"></span>
								<span class="planet-crater"></span>
								<strong><small>×</small>{node.table}</strong>
							</span>
						{:else}
							<span class="story-ufo" aria-hidden="true">
								<span class="ufo-dome"><i></i><i></i></span>
								<span class="ufo-rim"><i></i><i></i><i></i></span>
								<span class="ufo-command"><Swords size={21} strokeWidth={2.5} /></span>
							</span>
						{/if}

						{#if status === 'locked'}
							<span class="node-state lock-state" aria-hidden="true"><LockKeyhole size={15} /></span>
						{:else if status === 'completed'}
							<span class="node-state complete-state" aria-hidden="true"><Check size={16} strokeWidth={3} /></span>
						{/if}
					</button>
					<div class="node-label">
						<strong>{node.kind === 'planet' ? node.title : node.bossName}</strong>
						<span>{node.kind === 'planet' ? `×${node.table} planet` : `Boss · ×${node.tables.join(' ×')}`}</span>
					</div>
				</li>
			{/each}

			{#if travelling && travelPath}
				<svg
					class="story-travel-layer"
					viewBox={`0 0 ${STORY_MAP_WIDTH} ${STORY_MAP_HEIGHT}`}
					preserveAspectRatio="none"
					aria-hidden="true"
				>
					<path class="travel-motion-guide" d={travelPath} {@attach captureTravelGuide}></path>
					{#if travelPhase === 'ignition' && travelStartNode}
						<g transform={`translate(${travelStartNode.x} ${travelStartNode.y})`}>
							{@render travelRocket('travel-ship-ignition')}
						</g>
					{:else if travelPhase === 'flight'}
						<g class="travel-ship-flight">
							<animateMotion dur={`${travelFlightMs / 1000}s`} path={travelPath} rotate="auto" fill="freeze"></animateMotion>
							{@render travelRocket('')}
						</g>
					{:else if travelPhase === 'arrival' && travelEndNode}
						<g class="travel-arrival" transform={`translate(${travelEndNode.x} ${travelEndNode.y})`}>
							<svg x="-60" y="-60" width="120" height="120" viewBox="-48 -48 96 96" preserveAspectRatio="xMidYMid meet" overflow="visible">
								<circle class="arrival-ring arrival-ring-one" r="28"></circle>
								<circle class="arrival-ring arrival-ring-two" r="28"></circle>
							</svg>
							{@render travelRocket('travel-ship-arrived')}
						</g>
					{/if}
				</svg>
			{/if}

			{#if rocketNode}
				<div
					class="current-rocket"
					class:travel-hidden={travelling && travelPhase !== 'waiting'}
					style:left={`${(rocketNode.x / STORY_MAP_WIDTH) * 100}%`}
					style:top={`${(rocketNode.y / STORY_MAP_HEIGHT) * 100}%`}
					data-rocket-node={rocketNode.id}
					aria-hidden="true"
				>
					<span><Rocket size={28} strokeWidth={2.5} /></span>
				</div>
			{/if}
		</ol>
	</nav>
	<p class="sr-only" aria-live="polite">{arrivalAnnouncement}</p>
</section>

<style>
	.story-map-shell {
		position: relative;
		display: grid;
		grid-template-columns: minmax(320px, 0.65fr) minmax(520px, 1.35fr);
		align-items: start;
		gap: clamp(34px, 4vw, 62px);
		padding: 100px max(clamp(20px, 7vw, 110px), env(safe-area-inset-right)) 110px max(clamp(20px, 7vw, 110px), env(safe-area-inset-left));
		color: white;
		background: var(--deep);
	}

	.story-map-copy {
		position: sticky;
		top: 70px;
		z-index: 3;
		padding-top: 22px;
	}

	.story-kicker {
		display: inline-block;
		margin-bottom: 17px;
		color: var(--lime);
		font-size: 11px;
		font-weight: 900;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	h2 {
		max-width: 440px;
		font-size: clamp(42px, 4.3vw, 62px);
		line-height: 0.96;
		letter-spacing: -0.06em;
		text-wrap: balance;
	}

	.story-map-copy > p {
		max-width: 380px;
		margin-top: 22px;
		color: #aab4cb;
		font-size: 16px;
		line-height: 1.6;
		text-wrap: pretty;
	}

	.story-difficulty {
		max-width: 360px;
		margin: 28px 0 0;
		padding: 0;
		border: 0;
	}

	.story-difficulty legend {
		margin-bottom: 9px;
		color: #8995af;
		font-size: 9px;
		font-weight: 900;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.story-difficulty-switch {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 7px;
		padding: 5px;
		border-radius: 18px;
		background: rgba(255, 255, 255, 0.07);
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.07);
	}

	.story-difficulty-switch button {
		min-width: 0;
		min-height: 58px;
		padding: 9px 10px;
		display: grid;
		grid-template-columns: 30px 1fr;
		grid-template-rows: auto auto;
		column-gap: 8px;
		cursor: pointer;
		border: 0;
		border-radius: 13px;
		color: #aeb8ce;
		background: transparent;
		text-align: left;
		transition-property: color, background-color, box-shadow, transform;
		transition-duration: 160ms;
		transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
	}

	.story-difficulty-switch button > span {
		grid-row: 1 / 3;
		width: 30px;
		height: 30px;
		display: grid;
		place-items: center;
		align-self: center;
		border-radius: 9px;
		background: rgba(255, 255, 255, 0.08);
	}

	.story-difficulty-switch button strong {
		align-self: end;
		font-family: 'Space Grotesk', sans-serif;
		font-size: 13px;
		line-height: 1.1;
	}

	.story-difficulty-switch button small {
		align-self: start;
		margin-top: 3px;
		font-size: 8px;
		font-weight: 800;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.story-difficulty-switch button:hover:not(.selected):not(:disabled) {
		color: white;
		background: rgba(255, 255, 255, 0.07);
	}

	.story-difficulty-switch button:active:not(:disabled) { transform: scale(0.96); }
	.story-difficulty-switch button:disabled { cursor: wait; }

	.story-difficulty-switch button.selected {
		color: var(--deep);
		background: var(--lime);
		box-shadow: 0 4px 0 #7f9300;
	}

	.story-difficulty-switch button.hard-selected {
		color: white;
		background: var(--violet);
		box-shadow: 0 4px 0 #5940cf;
	}

	.story-difficulty-switch button.selected > span { background: rgba(16, 26, 51, 0.12); }

	.story-difficulty > p {
		margin-top: 10px;
		color: #7f8aa5;
		font-size: 10px;
		font-weight: 700;
		line-height: 1.45;
	}

	.story-route-progress {
		max-width: 360px;
		margin-top: 32px;
	}

	.story-route-progress > div {
		height: 9px;
		overflow: hidden;
		border-radius: 99px;
		background: rgba(255, 255, 255, 0.09);
		box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3);
	}

	.story-route-progress > div span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--lime);
		box-shadow: 0 0 15px rgba(214, 242, 71, 0.35);
		transition-property: width;
		transition-duration: 600ms;
		transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
	}

	.story-route-progress strong {
		display: block;
		margin-top: 10px;
		color: #7f8aa5;
		font-size: 10px;
		font-variant-numeric: tabular-nums;
		font-weight: 900;
		letter-spacing: 0.11em;
		text-transform: uppercase;
	}

	.next-destination {
		max-width: 360px;
		margin-top: 34px;
		padding: 18px 20px;
		border-radius: 20px;
		background: rgba(255, 255, 255, 0.06);
		box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08), 0 15px 35px rgba(0, 0, 0, 0.18);
	}

	.next-destination span,
	.next-destination small {
		display: block;
		color: #8995af;
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.next-destination strong {
		display: block;
		margin: 6px 0 5px;
		font-family: 'Space Grotesk', sans-serif;
		font-size: 17px;
	}

	.next-destination small { color: var(--sky); }

	.story-route { min-width: 0; scroll-margin-block: 16px; }

	.story-map-canvas {
		position: relative;
		width: 100%;
		height: clamp(1320px, 158vw, 1780px);
		margin: 0;
		padding: 0;
		overflow: hidden;
		list-style: none;
		border-radius: 36px;
		background:
			radial-gradient(circle at 84% 9%, rgba(141, 117, 255, 0.18), transparent 19%),
			radial-gradient(circle at 13% 58%, rgba(167, 221, 237, 0.1), transparent 24%),
			radial-gradient(circle, rgba(255, 255, 255, 0.6) 1px, transparent 1.5px) 0 0 / 73px 73px,
			radial-gradient(circle, rgba(214, 242, 71, 0.5) 1px, transparent 1.5px) 21px 33px / 131px 131px,
			#101a33;
		box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08), 0 32px 65px rgba(0, 0, 0, 0.25);
	}

	.story-route-lines {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
		pointer-events: none;
	}

	.story-travel-layer {
		position: absolute;
		z-index: 6;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
		pointer-events: none;
	}

	.travel-motion-guide {
		fill: none;
		stroke: none;
	}

	.route-shadow,
	.route-dashes,
	.route-complete {
		fill: none;
		stroke-linecap: round;
		stroke-linejoin: round;
		vector-effect: non-scaling-stroke;
	}

	.route-shadow { stroke: rgba(0, 0, 0, 0.28); stroke-width: 8; }
	.route-dashes { stroke: rgba(255, 255, 255, 0.25); stroke-width: 3; stroke-dasharray: 4 13; }
	.route-complete { stroke: var(--lime); stroke-width: 4; stroke-dasharray: 5 11; filter: drop-shadow(0 0 7px rgba(214, 242, 71, 0.35)); }

	.story-stop {
		position: absolute;
		z-index: 3;
		width: 118px;
		text-align: center;
		transform: translate(-50%, -50%);
	}

	.story-stop button {
		position: relative;
		width: 94px;
		height: 94px;
		padding: 0;
		cursor: pointer;
		border: 0;
		border-radius: 50%;
		color: var(--deep);
		background: transparent;
		transition-property: transform, filter;
		transition-duration: 180ms;
		transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
	}

	.story-stop button:hover:not([aria-disabled='true']):not(:disabled) { transform: translateY(-5px) rotate(-2deg); filter: brightness(1.08); }
	.story-stop button:active:not([aria-disabled='true']):not(:disabled) { transform: scale(0.96); }
	.story-stop button[aria-disabled='true'] { cursor: default; }
	.story-stop button:disabled { cursor: wait; }

	.node-number {
		position: absolute;
		z-index: 5;
		left: -5px;
		top: 1px;
		min-width: 28px;
		height: 24px;
		display: grid;
		place-items: center;
		border-radius: 8px;
		color: white;
		background: #202b47;
		box-shadow: 0 4px 0 rgba(0, 0, 0, 0.22);
		font-family: 'Space Grotesk', sans-serif;
		font-size: 9px;
		font-variant-numeric: tabular-nums;
		font-weight: 800;
	}

	.story-planet {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		border-radius: 50%;
		background: var(--node-color);
		box-shadow: inset -13px -13px 0 rgba(16, 26, 51, 0.15), 0 8px 0 color-mix(in srgb, var(--node-color), #101a33 44%), 0 17px 28px rgba(0, 0, 0, 0.28);
	}

	.story-planet strong {
		position: relative;
		z-index: 2;
		font-family: 'Space Grotesk', sans-serif;
		font-size: 33px;
		letter-spacing: -0.06em;
		font-variant-numeric: tabular-nums;
	}

	.story-planet strong small { margin-right: 2px; font-size: 15px; }
	.planet-glint { position: absolute; left: 20%; top: 17%; width: 34%; height: 16%; border-radius: 50%; background: rgba(255, 255, 255, 0.34); transform: rotate(-26deg); filter: blur(1px); }
	.planet-crater { position: absolute; right: 18%; bottom: 19%; width: 15%; aspect-ratio: 1; border-radius: 50%; background: rgba(16, 26, 51, 0.14); }

	.story-ufo {
		position: absolute;
		inset: 5px -5px;
		filter: drop-shadow(0 9px 0 rgba(33, 20, 92, 0.82)) drop-shadow(0 18px 22px rgba(0, 0, 0, 0.32));
	}

	.ufo-dome {
		position: absolute;
		left: 29%;
		top: 5%;
		width: 42%;
		height: 47%;
		overflow: hidden;
		border-radius: 50% 50% 31% 31%;
		background: var(--sky);
		box-shadow: inset -7px -6px 0 rgba(16, 26, 51, 0.16);
	}

	.ufo-dome::after { content: ''; position: absolute; left: 22%; top: 18%; width: 29%; height: 13%; border-radius: 50%; background: rgba(255, 255, 255, 0.48); transform: rotate(-18deg); }
	.ufo-dome i { position: absolute; z-index: 2; top: 54%; width: 8px; height: 13px; border-radius: 50%; background: var(--deep); }
	.ufo-dome i:first-child { left: 33%; transform: rotate(10deg); }
	.ufo-dome i:last-child { right: 33%; transform: rotate(-10deg); }
	.ufo-rim { position: absolute; left: 2%; right: 2%; top: 42%; height: 40%; border-radius: 50%; background: var(--node-color); box-shadow: inset -12px -7px 0 rgba(16, 26, 51, 0.18), inset 0 5px 0 rgba(255, 255, 255, 0.14); }
	.ufo-rim i { position: absolute; bottom: 16%; width: 7px; aspect-ratio: 1; border-radius: 50%; background: var(--gold); box-shadow: 0 0 7px var(--gold); }
	.ufo-rim i:first-child { left: 25%; }
	.ufo-rim i:nth-child(2) { left: 47%; background: var(--coral); box-shadow: 0 0 7px var(--coral); }
	.ufo-rim i:last-child { right: 25%; }
	.ufo-command { position: absolute; z-index: 3; left: 50%; bottom: 0; width: 29px; height: 29px; display: grid; place-items: center; border-radius: 8px; color: var(--deep); background: var(--gold); transform: translateX(-50%); }

	.node-state {
		position: absolute;
		z-index: 7;
		right: -1px;
		bottom: 0;
		width: 30px;
		height: 30px;
		display: grid;
		place-items: center;
		border-radius: 10px;
		box-shadow: 0 4px 0 rgba(0, 0, 0, 0.25);
	}

	.complete-state { color: var(--deep); background: var(--lime); }
	.lock-state { color: #8f99b1; background: #27324f; }
	.story-stop.is-locked .story-planet, .story-stop.is-locked .story-ufo { filter: grayscale(0.65) saturate(0.45); opacity: 0.38; }
	.story-stop.is-locked .node-number { opacity: 0.55; }
	.story-stop.is-current button::before { content: ''; position: absolute; z-index: -1; inset: -14px; border: 2px solid var(--lime); border-radius: 50%; box-shadow: 0 0 0 7px rgba(214, 242, 71, 0.08), 0 0 28px rgba(214, 242, 71, 0.18); animation: currentPulse 1.7s ease-in-out infinite alternate; }
	.story-stop.travel-target button::after { content: ''; position: absolute; z-index: -1; inset: -20px; border: 2px dashed var(--sky); border-radius: 50%; box-shadow: 0 0 30px rgba(167, 221, 237, 0.3); animation: destinationBeacon 1s linear infinite; }

	.node-label {
		position: absolute;
		left: 50%;
		top: 105px;
		width: 150px;
		pointer-events: none;
		transform: translateX(-50%);
	}

	.node-label strong,
	.node-label span { display: block; }
	.node-label strong { color: white; font-family: 'Space Grotesk', sans-serif; font-size: 12px; line-height: 1.15; }
	.node-label span { margin-top: 3px; color: #7f8aa4; font-size: 9px; font-weight: 800; letter-spacing: 0.07em; text-transform: uppercase; }
	.story-stop.is-locked .node-label { opacity: 0.45; }
	.story-stop.is-current .node-label span { color: var(--lime); }

	.current-rocket {
		position: absolute;
		z-index: 8;
		width: 48px;
		height: 48px;
		pointer-events: none;
		transform: translate(-93px, -68px) rotate(42deg);
		transition-property: opacity, filter, scale;
		transition-duration: 240ms;
	}

	.current-rocket.travel-hidden { opacity: 0; scale: 0.25; filter: blur(4px); }
	.current-rocket span { width: 48px; height: 48px; display: grid; place-items: center; border-radius: 16px; color: var(--deep); background: white; box-shadow: 0 6px 0 #9ca5b9, 0 13px 22px rgba(0, 0, 0, 0.28); animation: rocketHover 1.5s ease-in-out infinite alternate; }

	.travel-body { fill: white; stroke: var(--deep); stroke-width: 4; }
	.travel-window { fill: var(--sky); stroke: var(--deep); stroke-width: 3; }
	.travel-flame { fill: var(--lime); filter: drop-shadow(0 0 7px rgba(214, 242, 71, 0.8)); }
	.travel-ship { transform-box: fill-box; transform-origin: center; filter: drop-shadow(0 8px 7px rgba(0, 0, 0, 0.32)); }
	.travel-ship-ignition { animation: rocketIgnition 90ms ease-in-out infinite alternate; }
	.travel-ship-ignition .travel-flame { transform-box: fill-box; transform-origin: right center; animation: ignitionFlame 130ms ease-in-out infinite alternate; }
	.travel-ship-flight { will-change: transform; }
	.travel-ship-arrived { animation: rocketSettle 260ms cubic-bezier(0.2, 0, 0, 1) both; }
	.travel-arrival { pointer-events: none; }
	.arrival-ring { fill: none; stroke: var(--lime); stroke-width: 6; opacity: 0; }
	.arrival-ring-one { animation: arrivalBurst 420ms ease-out both; }
	.arrival-ring-two { animation: arrivalBurst 420ms 70ms ease-out both; }

	.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

	@keyframes currentPulse { from { opacity: 0.55; transform: scale(0.97); } to { opacity: 1; transform: scale(1.04); } }
	@keyframes destinationBeacon { from { transform: rotate(0deg) scale(0.96); } to { transform: rotate(360deg) scale(1.04); } }
	@keyframes rocketHover { from { transform: translateY(-3px); } to { transform: translateY(3px); } }
	@keyframes rocketIgnition { from { transform: translate(-2px, -1px) scale(0.96); } to { transform: translate(2px, 1px) scale(1.04); } }
	@keyframes ignitionFlame { from { opacity: 0.48; transform: scaleX(0.55); } to { opacity: 1; transform: scaleX(1.18); } }
	@keyframes rocketSettle { from { opacity: 0; transform: scale(1.18); filter: blur(4px); } to { opacity: 1; transform: scale(1); filter: blur(0); } }
	@keyframes arrivalBurst { 0% { opacity: 0.9; transform: scale(0.35); } 100% { opacity: 0; transform: scale(2.15); } }

	@media (max-width: 920px) {
		.story-map-shell { grid-template-columns: 1fr; }
		.story-map-copy { position: relative; top: auto; max-width: 650px; padding-top: 0; }
		.story-map-copy > p { max-width: 540px; }
		.story-difficulty, .story-route-progress, .next-destination { max-width: 520px; }
	}

	@media (max-width: 650px) {
		.story-map-shell { gap: 34px; padding: 72px max(14px, env(safe-area-inset-right)) 80px max(14px, env(safe-area-inset-left)); }
		.story-map-copy { padding-inline: 7px; }
		h2 { font-size: 43px; }
		.story-map-copy > p { font-size: 14px; }
		.story-difficulty-switch button { min-height: 56px; padding-inline: 8px; }
		.story-map-canvas { height: 1320px; border-radius: 24px; }
		.story-stop { width: 96px; }
		.story-stop button { width: 70px; height: 70px; }
		.story-planet strong { font-size: 26px; }
		.story-planet strong small { font-size: 12px; }
		.node-number { left: -2px; min-width: 24px; height: 21px; font-size: 8px; }
		.node-state { width: 26px; height: 26px; border-radius: 8px; }
		.story-ufo { inset: 4px -7px; }
		.node-label { top: 80px; width: 118px; }
		.node-label strong { font-size: 10px; }
		.node-label span { font-size: 7px; }
		.current-rocket { transform: translate(-70px, -53px) rotate(42deg) scale(0.82); }
	}

	@media (prefers-reduced-motion: reduce) {
		.story-route-progress > div span,
		.story-difficulty-switch button,
		.story-stop button,
		.current-rocket { transition-duration: 0.01ms; }
		.story-stop.is-current button::before,
		.story-stop.travel-target button::after,
		.current-rocket span { animation: none; }
		.travel-ship { display: none; }
	}
</style>
