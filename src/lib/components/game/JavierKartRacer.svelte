<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { resolve } from '$app/paths';
	import {
		ArrowLeft,
		ChevronDown,
		ChevronLeft,
		ChevronRight,
		ChevronUp,
		Flag,
		Gauge,
		Music,
		Pause,
		Play,
		RotateCcw,
		Sparkles,
		Trophy,
		Volume2,
		VolumeX,
		Zap
	} from 'lucide-svelte';
	import { KartAudio } from '$lib/kart-audio';
	import { getCourseMapPoint, getCourseMinimap } from '$lib/kart-course-layout';
	import {
		createRaceState,
		getRaceEvents,
		updateRace,
		type KartItem,
		type KartTrackId,
		type RaceEvent,
		type RaceInput,
		type RaceState
	} from '$lib/kart-race';
	import type { KartScene3D } from '$lib/kart-renderer-3d';
	import { signedTrackDistance, type KartRenderState } from '$lib/kart-renderer';

	type MusicStatus = 'off' | 'loading' | 'playing' | 'unavailable';
	type GameScreen = 'select' | 'race' | 'finish';
	type InputAction = 'left' | 'right' | 'throttle' | 'brake' | 'drift' | 'item';
	type MinimapRacer = {
		id: string;
		name: string;
		color: string;
		progress: number;
		rank: number;
		player: boolean;
	};
	type HudState = {
		rank: number;
		lap: number;
		laps: number;
		speed: number;
		boost: number;
		drift: number;
		time: number;
		countdown: string;
		item: KartItem | null;
		holdingItem: boolean;
		roulette: boolean;
		roulettePreview: KartItem;
		mapRacers: MinimapRacer[];
	};

	let {
		musicStatus,
		onToggleMusic,
		onAudioGesture,
		onMusicThemeChange,
		onVisualReady
	}: {
		musicStatus: MusicStatus;
		onToggleMusic: () => void;
		onAudioGesture: () => void;
		onMusicThemeChange: (theme: 'menu' | 'rainbow' | 'coconut') => void;
		onVisualReady: () => void;
	} = $props();

	const courseChoices = [
		{
			id: 'prism-circuit' as const,
			name: 'Rainbow Road',
			energy: 'Prismatic space route',
			description: 'Race a luminous skyway through planets, prism gates, and open space.',
			accent: '#d6f247'
		},
		{
			id: 'sunset-galleria' as const,
			name: 'Coconut Mall',
			energy: 'Two-level mall route',
			description: 'Climb the escalator, clear the fountain jump, and race the upper gallery.',
			accent: '#ff7d91'
		}
	] as const;

	const rivalColors = ['#ff718d', '#66dfff', '#9d7dff', '#ffd45a', '#49d2a7'];
	const emptyHud: HudState = {
		rank: 1,
		lap: 1,
		laps: 3,
		speed: 0,
		boost: 0,
		drift: 0,
		time: 0,
		countdown: '',
		item: null,
		holdingItem: false,
		roulette: false,
		roulettePreview: 'green-shell',
		mapRacers: []
	};

	let selectedTrack = $state<KartTrackId>('prism-circuit');
	let screen = $state<GameScreen>('select');
	let paused = $state(false);
	let hud = $state.raw<HudState>({ ...emptyHud });
	let announcement = $state('Choose a course to begin the Grand Prix.');
	let canvas: HTMLCanvasElement;
	let canvasWidth = 1;
	let canvasHeight = 1;
	let canvasScale = 1;
	let renderer3d: KartScene3D | undefined;
	let rendererLoading = true;
	let componentMounted = false;
	let race: RaceState | undefined;
	let animationFrame = 0;
	let resizeFrame = 0;
	let settleResizeFrame = 0;
	let resizeObserver: ResizeObserver | undefined;
	let observedViewport: VisualViewport | undefined;
	let lastFrameAt = 0;
	let lastHudAt = 0;
	let demoProgress = 0.93;
	let raceAudio: KartAudio | undefined;
	let reducedMotion = false;
	let finishHandled = false;
	let finishTimer: number | undefined;
	let lastDriftTier = 0;
	let visualReadySent = false;
	let renderFailureReported = false;
	let canvasFailed = $state(false);
	const keys = new SvelteSet<string>();
	const pointerActions = new SvelteMap<number, InputAction>();
	const touchInputs: Record<InputAction, boolean> = {
		left: false,
		right: false,
		throttle: false,
		brake: false,
		drift: false,
		item: false
	};

	const selectedCourse = $derived(courseChoices.find((course) => course.id === selectedTrack) ?? courseChoices[0]);
	const selectedCourseNumber = $derived(selectedTrack === 'prism-circuit' ? '01' : '02');
	const placement = $derived(formatPlacement(hud.rank));
	const shownItem = $derived(hud.roulette ? hud.roulettePreview : hud.item);
	const minimap = $derived(getCourseMinimap(selectedTrack));
	const minimapStart = $derived(getCourseMapPoint(selectedTrack, 0));
	const minimapDescription = $derived(
		`Full course map. ${hud.mapRacers.map((racer) => `${racer.name} is ${formatPlacement(racer.rank)}`).join('. ')}.`
	);

	onMount(() => {
		componentMounted = true;
		document.documentElement.classList.add('jkr-page');
		document.body.classList.add('jkr-page');
		try {
			raceAudio = new KartAudio();
		} catch {
			// The visual game remains available on browsers that reject Web Audio setup.
		}
		void import('$lib/kart-renderer-3d')
			.then(({ KartScene3D }) => {
				if (!componentMounted) return;
				renderer3d = new KartScene3D(canvas);
				rendererLoading = false;
				resizeCanvas();
			})
			.catch((error) => {
				if (!componentMounted) return;
				rendererLoading = false;
				canvasFailed = true;
				console.error('The Grand Prix 3D renderer could not start.', error);
			});
		reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if ('ResizeObserver' in window) {
			try {
				resizeObserver = new ResizeObserver(queueCanvasResize);
				resizeObserver.observe(canvas);
			} catch {
				resizeObserver?.disconnect();
				resizeObserver = undefined;
			}
		}
		observedViewport = window.visualViewport ?? undefined;
		observedViewport?.addEventListener('resize', queueCanvasResize);
		window.addEventListener('resize', queueCanvasResize);
		window.addEventListener('orientationchange', handleViewportRestore);
		window.addEventListener('pageshow', handleViewportRestore);
		resizeCanvas();
		queueCanvasResize();
		lastFrameAt = performance.now();
		animationFrame = requestAnimationFrame(frame);
	});

	onDestroy(() => {
		componentMounted = false;
		if (typeof window !== 'undefined') window.cancelAnimationFrame(animationFrame);
		if (typeof window !== 'undefined') window.cancelAnimationFrame(resizeFrame);
		if (typeof window !== 'undefined') window.cancelAnimationFrame(settleResizeFrame);
		if (typeof window !== 'undefined' && finishTimer !== undefined) window.clearTimeout(finishTimer);
		resizeObserver?.disconnect();
		observedViewport?.removeEventListener('resize', queueCanvasResize);
		if (typeof window !== 'undefined') {
			window.removeEventListener('resize', queueCanvasResize);
			window.removeEventListener('orientationchange', handleViewportRestore);
			window.removeEventListener('pageshow', handleViewportRestore);
		}
		if (typeof document !== 'undefined') {
			document.documentElement.classList.remove('jkr-page');
			document.body.classList.remove('jkr-page');
		}
		raceAudio?.destroy();
		renderer3d?.dispose();
		renderer3d = undefined;
		keys.clear();
		pointerActions.clear();
	});

	function queueCanvasResize() {
		if (typeof window === 'undefined') return;
		window.cancelAnimationFrame(resizeFrame);
		window.cancelAnimationFrame(settleResizeFrame);
		resizeFrame = window.requestAnimationFrame(() => {
			resizeCanvas();
			settleResizeFrame = window.requestAnimationFrame(resizeCanvas);
		});
	}

	function handleViewportRestore() {
		lastFrameAt = performance.now();
		queueCanvasResize();
		window.cancelAnimationFrame(animationFrame);
		animationFrame = window.requestAnimationFrame(frame);
	}

	function resizeCanvas() {
		if (!canvas) return;
		const bounds = canvas.getBoundingClientRect();
		const coarse = window.matchMedia('(pointer: coarse)').matches;
		canvasScale = Math.min(window.devicePixelRatio || 1, coarse ? 1.25 : 1.5);
		canvasWidth = Math.max(1, Math.round(bounds.width));
		canvasHeight = Math.max(1, Math.round(bounds.height));
		renderer3d?.resize(canvasWidth, canvasHeight, canvasScale);
	}

	function frame(now: number) {
		// Queue first so a recoverable renderer error cannot permanently freeze the canvas.
		animationFrame = requestAnimationFrame(frame);
		const delta = Math.min(0.05, Math.max(0, (now - lastFrameAt) / 1000));
		lastFrameAt = now;

		try {
			if (race && screen === 'race' && !paused) {
				updateRace(race, readInput(), delta);
				handleRaceEvents(getRaceEvents(race));
				if (now - lastHudAt > 70) {
					hud = snapshotHud(race);
					lastHudAt = now;
				}
				const maxSpeed = Math.max(1, race.track.maxSpeed);
				raceAudio?.setEngine(race.player.speed / maxSpeed, readInput().throttle > 0);
				if (race.finished && !finishHandled) finishRace();
			} else if (!race) {
				demoProgress = (demoProgress + delta * (reducedMotion ? 0.004 : 0.022)) % 1;
			}

			if (render(now / 1000)) {
				canvasFailed = false;
				renderFailureReported = false;
				if (!visualReadySent) {
					visualReadySent = true;
					onVisualReady();
				}
			}
		} catch (error) {
			canvasFailed = true;
			if (!renderFailureReported) {
				renderFailureReported = true;
				console.error('Grand Prix renderer recovered from an error.', error);
			}
		}
	}

	function render(time: number) {
		if (!renderer3d) {
			if (!rendererLoading) canvasFailed = true;
			return false;
		}
		if (canvasWidth < 2 || canvasHeight < 2) return false;
		const renderState = race ? toRenderState(race, time) : demoRenderState(time);
		renderer3d.resize(canvasWidth, canvasHeight, canvasScale);
		renderer3d.render(renderState);
		return true;
	}

	function demoRenderState(time: number): KartRenderState {
		return {
			trackId: selectedTrack,
			progress: demoProgress,
			speed: reducedMotion ? 0.2 : 0.72,
			lane: Math.sin(time * 0.22) * 0.16,
			steer: Math.sin(time * 0.22) * 0.28,
			drifting: false,
			driftCharge: 0,
			boosting: false,
			spin: 0,
			time,
			reducedMotion,
			rivals: [
				{ id: 'preview-one', name: 'Nova', color: '#ff718d', lane: -0.45, distance: 0.035 },
				{ id: 'preview-two', name: 'Orbit', color: '#66dfff', lane: 0.38, distance: 0.061 }
			],
			itemBoxes: [
				{ id: 'preview-box-left', lane: -0.55, distance: 0.024 },
				{ id: 'preview-box-center', lane: 0, distance: 0.024 },
				{ id: 'preview-box-right', lane: 0.55, distance: 0.024 }
			],
			mallObstacles:
				selectedTrack === 'sunset-galleria'
					? [
							{ id: 'preview-kiosk', type: 'kiosk', lane: 0.56, distance: 0.052 },
							{ id: 'preview-planter', type: 'planter', lane: -0.55, distance: 0.094 }
						]
					: []
		};
	}

	function toRenderState(state: RaceState, time: number): KartRenderState {
		const maxSpeed = Math.max(1, state.track.maxSpeed);
		const heldItem = state.player.heldItem;
		const heldItemLane = state.player.lane + (state.player.lane >= 0 ? -0.15 : 0.15);
		return {
			trackId: state.track.id,
			progress: state.player.progress,
			speed: state.player.speed / maxSpeed,
			lane: state.player.lane,
			steer: readInput().steer,
			drifting: state.player.drift.active,
			driftCharge: state.player.drift.charge,
			boosting: state.player.boost.remaining > 0,
			spin: reducedMotion ? 0 : state.player.stun.remaining,
			time,
			reducedMotion,
			rivals: state.rivals.map((rival, index) => ({
				id: rival.id,
				name: rival.name,
				color: rival.color || rivalColors[index % rivalColors.length],
				lane: rival.lane,
				distance: rival.distance - state.player.distance,
				hit: Math.min(1, rival.stun.remaining / 0.72)
			})),
			itemBoxes: state.pickups.map((pickup) => ({
				id: pickup.id,
				lane: pickup.lane,
				distance: signedTrackDistance(state.player.progress, pickup.progress),
				active: pickup.active
			})),
			projectiles: [
				...(heldItem === 'green-shell' || heldItem === 'red-shell'
					? [{ id: 'player-held-item', type: heldItem, lane: heldItemLane, distance: -0.0048, heading: 0 }]
					: []),
				...state.projectiles.map((projectile) => ({
					id: projectile.id,
					type: projectile.type,
					lane: projectile.lane,
					distance: projectile.distance - state.player.distance,
					heading: Math.max(-1, Math.min(1, projectile.laneVelocity * 1.7))
				}))
			],
			bananas: [
				...(heldItem === 'banana'
					? [{ id: 'player-held-item', lane: heldItemLane, distance: -0.0048 }]
					: []),
				...state.bananas.map((banana) => ({
					id: banana.id,
					lane: banana.lane,
					distance: banana.distance - state.player.distance
				}))
			],
			impacts: state.impacts.map((impact) => ({
				id: impact.id,
				lane: impact.lane,
				distance: impact.distance - state.player.distance,
				progress: Math.min(1, impact.elapsed / impact.duration),
				color: impact.color
			})),
			mallObstacles: state.mallObstacles.map((obstacle) => ({
				id: obstacle.id,
				type: obstacle.type,
				lane: obstacle.lane,
				distance: signedTrackDistance(state.player.progress, obstacle.progress),
				hit: Math.min(1, obstacle.cooldown / 0.46)
			})),
			playerHit: Math.min(1, state.player.stun.remaining / 0.72)
		};
	}

	function snapshotHud(state: RaceState): HudState {
		return {
			rank: state.player.rank,
			lap: Math.min(state.laps, state.player.lap + 1),
			laps: state.laps,
			speed: Math.round((state.player.speed / Math.max(1, state.track.maxSpeed)) * 220),
			boost: Math.min(1, state.player.boost.remaining / Math.max(0.01, state.player.boost.duration)),
			drift: Math.min(1, state.player.drift.charge),
			time: state.raceTime,
			countdown: state.phase === 'countdown' ? (state.countdown > 0 ? String(Math.ceil(state.countdown)) : 'IGNITE!') : '',
			item: state.player.heldItem ?? state.player.item,
			holdingItem: Boolean(state.player.heldItem),
			roulette: state.player.roulette.active,
			roulettePreview: state.player.roulette.preview,
			mapRacers: [
				{
					id: state.player.id,
					name: 'You',
					color: '#d6f247',
					progress: state.player.progress,
					rank: state.player.rank,
					player: true
				},
				...state.rivals.map((rival) => ({
					id: rival.id,
					name: rival.name,
					color: rival.color,
					progress: rival.progress,
					rank: rival.rank,
					player: false
				}))
			]
		};
	}

	function readInput(): RaceInput {
		const left = keys.has('ArrowLeft') || keys.has('KeyA') || touchInputs.left;
		const right = keys.has('ArrowRight') || keys.has('KeyD') || touchInputs.right;
		return {
			steer: (right ? 1 : 0) - (left ? 1 : 0),
			throttle: keys.has('ArrowUp') || keys.has('KeyW') || touchInputs.throttle ? 1 : 0,
			brake: keys.has('ArrowDown') || keys.has('KeyS') || touchInputs.brake ? 1 : 0,
			drift: keys.has('Space') || keys.has('ShiftLeft') || keys.has('ShiftRight') || touchInputs.drift,
			useItem: keys.has('KeyE') || touchInputs.item
		};
	}

	function startRace() {
		if (finishTimer !== undefined) window.clearTimeout(finishTimer);
		finishTimer = undefined;
		onMusicThemeChange(selectedTrack === 'prism-circuit' ? 'rainbow' : 'coconut');
		onAudioGesture();
		void raceAudio?.unlock().catch(() => {
			// The race starts immediately even when Web Audio is blocked or still suspended.
		});
		race = createRaceState(selectedTrack, { laps: 3, seed: Math.floor(performance.now()) });
		hud = snapshotHud(race);
		screen = 'race';
		paused = false;
		finishHandled = false;
		lastDriftTier = 0;
		announcement = `${selectedCourse.name}. Three laps. Get ready.`;
		playRaceSound((audio) => audio.startEngine());
	}

	function finishRace() {
		if (!race) return;
		finishHandled = true;
		hud = snapshotHud(race);
		raceAudio?.stopEngine();
		playRaceSound((audio) => audio.playFinish(race?.player.rank === 1));
		announcement = `Finished ${formatPlacement(race.player.rank)} in ${formatTime(race.raceTime)}.`;
		finishTimer = window.setTimeout(() => {
			screen = 'finish';
			finishTimer = undefined;
		}, reducedMotion ? 0 : 650);
	}

	function restartRace() {
		void startRace();
	}

	function chooseCourse() {
		if (finishTimer !== undefined) window.clearTimeout(finishTimer);
		finishTimer = undefined;
		raceAudio?.stopEngine();
		onMusicThemeChange('menu');
		race = undefined;
		screen = 'select';
		paused = false;
		hud = { ...emptyHud };
		announcement = 'Choose a course to begin the Grand Prix.';
		clearInputs();
	}

	function selectCourse(trackId: KartTrackId) {
		selectedTrack = trackId;
		onMusicThemeChange(trackId === 'prism-circuit' ? 'rainbow' : 'coconut');
	}

	function togglePause() {
		if (screen !== 'race' || race?.finished) return;
		paused = !paused;
		clearInputs();
		if (paused) {
			raceAudio?.stopEngine();
			announcement = 'Race paused.';
		} else {
			lastFrameAt = performance.now();
			playRaceSound((audio) => audio.startEngine());
			announcement = 'Race resumed.';
		}
	}

	function handleRaceEvents(events: RaceEvent[]) {
		for (const event of events) {
			switch (event.type) {
				case 'countdown':
					playRaceSound((audio) => audio.playCountdown(false));
					announcement = String(event.value);
					break;
				case 'go':
					playRaceSound((audio) => audio.playCountdown(true));
					announcement = 'Ignite!';
					break;
				case 'drift':
					if (event.tier > lastDriftTier) playRaceSound((audio) => audio.playDriftSpark(event.tier));
					lastDriftTier = event.tier;
					break;
				case 'boost':
					playRaceSound((audio) => audio.playBoost());
					lastDriftTier = 0;
					announcement = 'Mini boost!';
					break;
				case 'pickup':
					if (event.racerId === 'player') {
						announcement = `${itemLabel(event.item)} ready. Hold to defend, release to use.`;
					}
					break;
				case 'roulette-start':
					if (event.racerId === 'player') {
						playRaceSound((audio) => audio.playPickup());
						announcement = 'Item roulette!';
					}
					break;
				case 'roulette-tick':
					if (event.racerId === 'player') playRaceSound((audio) => audio.playRouletteTick(event.index));
					break;
				case 'roulette-award':
					if (event.racerId === 'player') playRaceSound((audio) => audio.playItemReady(event.item));
					break;
				case 'item':
					break;
				case 'item-hold':
					if (event.racerId === 'player') {
						playRaceSound((audio) => audio.playDefenseArm(event.item));
						announcement = `${itemLabel(event.item)} held behind. Release to use.`;
					}
					break;
				case 'item-block':
					playRaceSound((audio) => audio.playDefenseBlock());
					if ('vibrate' in navigator) navigator.vibrate([24, 28, 24]);
					announcement = `${itemLabel(event.defenseItem)} blocked the ${itemLabel(event.incomingItem)}!`;
					break;
				case 'item-use':
					if (event.racerId === 'player') {
						if (event.item === 'banana') playRaceSound((audio) => audio.playBananaDrop());
						else playRaceSound((audio) => audio.playShellLaunch(event.item === 'red-shell'));
						announcement = `${itemLabel(event.item)} deployed!`;
					}
					break;
				case 'projectile-bounce':
					if (event.ownerId === 'player') playRaceSound((audio) => audio.playShellBounce());
					break;
				case 'item-hit':
					if (event.targetId === 'player' || event.ownerId === 'player') playRaceSound((audio) => audio.playHit());
					if (event.targetId === 'player') {
						if ('vibrate' in navigator) navigator.vibrate(55);
						announcement = `${itemLabel(event.item)} impact! Recover your line.`;
					} else if (event.ownerId === 'player') {
						announcement = `${itemLabel(event.item)} hit!`;
					}
					break;
				case 'hit':
					if (event.source !== 'item') {
						playRaceSound((audio) => audio.playHit());
						if ('vibrate' in navigator) navigator.vibrate(45);
						announcement =
							event.source === 'obstacle' ? 'Mall obstacle! Find the open lane.' : 'Impact! Recover your line.';
					}
					break;
				case 'pickup-respawn':
					break;
				case 'lap':
					playRaceSound((audio) => audio.playLap());
					announcement = event.lap >= 3 ? 'Final lap!' : `Lap ${event.lap}.`;
					break;
				case 'finish':
					break;
			}
		}
	}

	function playRaceSound(play: (audio: KartAudio) => void) {
		if (!raceAudio) return;
		try {
			play(raceAudio);
		} catch {
			// Unsupported or interrupted Web Audio never blocks the visual race.
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		const target = event.target;
		const isInteractiveTarget =
			target instanceof Element && Boolean(target.closest('button, a, input, select, textarea, [contenteditable="true"]'));
		if (isInteractiveTarget) return;
		if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
		if (event.code === 'Escape' && screen === 'race') {
			togglePause();
			return;
		}
		if (event.code === 'Enter') {
			if (screen === 'select') void startRace();
			else if (screen === 'finish') restartRace();
			else if (paused) togglePause();
		}
		keys.add(event.code);
	}

	function handleKeyUp(event: KeyboardEvent) {
		keys.delete(event.code);
	}

	function handleVisibilityChange() {
		if (document.hidden && screen === 'race' && !paused && !race?.finished) togglePause();
	}

	function handleWindowBlur() {
		clearInputs();
		if (screen === 'race' && !paused && !race?.finished) togglePause();
	}

	function pressControl(action: InputAction, event: PointerEvent) {
		event.preventDefault();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		pointerActions.set(event.pointerId, action);
		touchInputs[action] = true;
		onAudioGesture();
		void raceAudio?.unlock().catch(() => undefined);
	}

	function releaseControl(event: PointerEvent) {
		const action = pointerActions.get(event.pointerId);
		if (!action) return;
		pointerActions.delete(event.pointerId);
		touchInputs[action] = [...pointerActions.values()].includes(action);
	}

	function clearInputs() {
		keys.clear();
		pointerActions.clear();
		for (const action of Object.keys(touchInputs) as InputAction[]) touchInputs[action] = false;
	}

	function formatTime(seconds: number) {
		const minutes = Math.floor(seconds / 60);
		const remainder = Math.max(0, seconds - minutes * 60);
		return `${minutes}:${remainder.toFixed(2).padStart(5, '0')}`;
	}

	function formatPlacement(rank: number) {
		if (rank === 1) return '1st';
		if (rank === 2) return '2nd';
		if (rank === 3) return '3rd';
		return `${rank}th`;
	}

	function itemLabel(item: KartItem) {
		if (item === 'green-shell') return 'Green shell';
		if (item === 'red-shell') return 'Red shell';
		return 'Banana peel';
	}
</script>

<svelte:window onkeydown={handleKeyDown} onkeyup={handleKeyUp} onblur={handleWindowBlur} />
<svelte:document onvisibilitychange={handleVisibilityChange} />

{#snippet itemArtwork(item: KartItem | null)}
	{#if item === 'green-shell' || item === 'red-shell'}
		<svg class:red-shell={item === 'red-shell'} class="jkr-item-art jkr-shell-art" viewBox="0 0 72 64" role="presentation">
			<g class="jkr-shell-feet">
				<path d="M14 24C7 23 4 27 6 33c2 5 8 6 14 3Z" />
				<path d="M58 24c7-1 10 3 8 9-2 5-8 6-14 3Z" />
				<path d="M19 43c-6 2-7 7-3 11 4 3 10 1 14-4Z" />
				<path d="M53 43c6 2 7 7 3 11-4 3-10 1-14-4Z" />
			</g>
			<ellipse class="jkr-shell-rim" cx="36" cy="34" rx="27" ry="23" />
			<ellipse class="jkr-shell-dome" cx="36" cy="32" rx="22" ry="18" />
			<path class="jkr-shell-panels" d="M36 18 45 26 42 38 30 38 27 26Zm-9 8-12 2m30-2 12 2M30 38l-6 11m18-11 6 11" />
			<path class="jkr-shell-shine" d="M22 26c4-6 10-9 17-9" />
		</svg>
	{:else if item === 'banana'}
		<svg class="jkr-item-art jkr-banana-art" viewBox="0 0 72 68" role="presentation">
			<path class="jkr-banana-flap jkr-banana-left" d="M34 29C28 38 20 43 8 48c3 8 13 9 21 3 6-5 8-13 8-22Z" />
			<path class="jkr-banana-flap jkr-banana-right" d="M38 29c6 9 14 14 26 19-3 8-13 9-21 3-6-5-8-13-8-22Z" />
			<path class="jkr-banana-flap jkr-banana-center" d="M35 29c-2 12-3 22 1 33 8-1 12-8 9-17-2-7-6-12-10-16Z" />
			<ellipse class="jkr-banana-core" cx="36" cy="29" rx="8" ry="7" />
			<path class="jkr-banana-stem" d="M36 25c-2-9 1-15 6-20" />
			<path class="jkr-banana-tip" d="m40 7 5-5" />
			<path class="jkr-banana-glint" d="M16 46c5-2 9-5 13-9" />
		</svg>
	{:else}
		<strong class="jkr-item-question">?</strong>
	{/if}
{/snippet}

{#snippet coursePicker()}
	<div class="jkr-course-picker">
		<div class="jkr-picker-heading">
			<span>Choose your course</span>
			<strong>{selectedCourseNumber} / 02</strong>
		</div>
		<div class="jkr-course-list">
			{#each courseChoices as course (course.id)}
				<button
					class:selected={selectedTrack === course.id}
					class="jkr-course-option"
					type="button"
					onclick={() => selectCourse(course.id)}
					aria-pressed={selectedTrack === course.id}
				>
					<span class="jkr-course-number">{course.id === 'prism-circuit' ? '01' : '02'}</span>
					<span class="jkr-course-copy">
						<small>{course.energy}</small>
						<strong>{course.name}</strong>
						<span>{course.description}</span>
					</span>
					<span class="jkr-course-art" aria-hidden="true">
						{#if course.id === 'prism-circuit'}
							<svg viewBox="0 0 128 72" role="presentation">
								<circle cx="102" cy="15" r="11" fill="#8d75ff" />
								<path d="M53 72C58 48 73 37 104 25" fill="none" stroke="#251454" stroke-width="27" />
								<path d="M51 72C58 47 73 36 106 24" fill="none" stroke="#d6f247" stroke-width="4" />
								<path d="M63 72C66 51 78 41 111 30" fill="none" stroke="#66dfff" stroke-width="4" />
								<path d="M42 72C50 44 66 31 99 20" fill="none" stroke="#ff718d" stroke-width="4" />
							</svg>
						{:else}
							<svg viewBox="0 0 128 72" role="presentation">
								<path d="M4 15H124L104 60H23Z" fill="#d9f4ea" opacity=".9" />
								<path d="M48 72C51 46 68 38 96 30" fill="none" stroke="#405968" stroke-width="28" />
								<path d="M39 72C44 43 62 31 96 24" fill="none" stroke="#ff718d" stroke-width="4" />
								<path d="M59 72C59 52 72 43 101 36" fill="none" stroke="#ffd45a" stroke-width="4" />
								<path d="M18 11V48M18 21L7 13M18 22L31 13" stroke="#2aa67b" stroke-width="5" stroke-linecap="round" />
							</svg>
						{/if}
					</span>
					<span class="jkr-select-dot"><span></span></span>
				</button>
			{/each}
		</div>
		<button class="jkr-start" type="button" onclick={() => void startRace()}>
			<span><Flag size={20} strokeWidth={2.6} /> Race {selectedCourse.name}</span>
			<ChevronRight size={21} strokeWidth={2.8} />
		</button>
	</div>
{/snippet}

<main
	class:race-active={screen === 'race'}
	class:course-galleria={selectedTrack === 'sunset-galleria'}
	class="jkr-shell"
>
	<p class="jkr-live" aria-live="polite">{announcement}</p>

	<div class="jkr-topbar" inert={paused || screen === 'finish'}>
		<a class="jkr-brand" href={resolve('/')} aria-label="Back to Multiply Mission">
			<span class="jkr-brand-mark"><Zap size={17} strokeWidth={3} /></span>
			<span>Grand <strong>Prix</strong></span>
		</a>

		{#if screen !== 'select'}
			<div class="jkr-course-chip"><i></i>{selectedCourse.name}</div>
		{/if}

		<div class="jkr-top-actions">
			{#if screen === 'race'}
				<button class="jkr-icon-button" type="button" onclick={togglePause} aria-label={paused ? 'Resume race' : 'Pause race'}>
					{#if paused}<Play size={19} fill="currentColor" />{:else}<Pause size={19} fill="currentColor" />{/if}
				</button>
			{/if}
			<button
				class:playing={musicStatus === 'playing'}
				class="jkr-music"
				type="button"
				onclick={onToggleMusic}
				disabled={musicStatus === 'unavailable'}
				aria-pressed={musicStatus === 'playing'}
				aria-label={musicStatus === 'playing' ? 'Turn music off' : 'Turn music on'}
			>
				{#if musicStatus === 'playing'}
					<Volume2 size={18} strokeWidth={2.7} /> <span>Music on</span>
				{:else if musicStatus === 'loading'}
					<Music size={18} strokeWidth={2.7} /> <span>Loading</span>
				{:else}
					<VolumeX size={18} strokeWidth={2.7} /> <span>{musicStatus === 'unavailable' ? 'No music' : 'Music off'}</span>
				{/if}
			</button>
		</div>
	</div>

	<div class="jkr-screen-frame" inert={paused || screen === 'finish'}>
		<canvas bind:this={canvas} class="jkr-canvas" aria-label={`3D Grand Prix race view on ${selectedCourse.name}`}></canvas>
		<div class="jkr-vignette" aria-hidden="true"></div>
		{#if canvasFailed}
			<div class="jkr-canvas-fallback" role="status">
				<strong>Reconnecting race screen</strong>
				<span>The game will resume automatically.</span>
			</div>
		{/if}

		{#if screen === 'select'}
			<section class="jkr-select" aria-labelledby="jkr-title">
				<div class="jkr-title-block">
					<p class="jkr-kicker"><span></span> Bonus circuit · 3D</p>
					<h1 id="jkr-title">Grand <span>Prix</span></h1>
					<div class="jkr-key-legend" aria-label="Keyboard controls">
						<span><kbd>WASD</kbd> drive</span>
						<span><kbd>SPACE</kbd> drift</span>
						<span><kbd>HOLD E</kbd> defend</span>
					</div>
				</div>

				{@render coursePicker()}
			</section>
		{:else}
			<section class="jkr-hud" aria-label="Race status">
				<div class="jkr-rank-block">
					<strong>{placement}</strong>
					<span>of 8 racers</span>
				</div>
				<div class="jkr-lap-block">
					<span>Lap</span>
					<strong>{hud.lap}<small>/{hud.laps}</small></strong>
				</div>
				<div class="jkr-time-block"><span>Race time</span><strong>{formatTime(hud.time)}</strong></div>
			</section>

			<aside class="jkr-minimap" aria-label={minimapDescription}>
				<div class="jkr-minimap-heading">
					<span><Flag size={12} strokeWidth={2.8} /> Course map</span>
					<strong>{selectedTrack === 'sunset-galleria' ? '2 levels' : 'Live'}</strong>
				</div>
				<svg viewBox="0 0 100 74" aria-hidden="true">
					<defs>
						<linearGradient id="jkr-map-gradient" x1="0" y1="0" x2="1" y2="1">
							<stop offset="0" stop-color="#66dfff" />
							<stop offset=".5" stop-color="#8d75ff" />
							<stop offset="1" stop-color="#ff718d" />
						</linearGradient>
					</defs>
					<path class="jkr-minimap-shadow" d={minimap.path}></path>
					<path class="jkr-minimap-route" d={minimap.path}></path>
					<circle class="jkr-minimap-start" cx={minimapStart.x} cy={minimapStart.y} r="2.1"></circle>
					{#each hud.mapRacers as racer (racer.id)}
						{@const marker = getCourseMapPoint(selectedTrack, racer.progress)}
						{#if racer.player}
							<circle class="jkr-minimap-player-pulse" cx={marker.x} cy={marker.y} r="5.1"></circle>
						{/if}
						<circle
							class:player={racer.player}
							class="jkr-minimap-racer"
							cx={marker.x}
							cy={marker.y}
							r={racer.player ? 3.5 : 2.45}
							fill={racer.color}
						></circle>
					{/each}
				</svg>
			</aside>

			<div class="jkr-speedometer" aria-label={`${hud.speed} kilometers per hour`}>
				<Gauge size={18} strokeWidth={2.5} />
				<strong>{hud.speed}</strong>
				<span>KM/H</span>
			</div>

			<div class="jkr-boost-meter">
				<div class="jkr-boost-label"><span><Sparkles size={14} /> Mini turbo</span><strong>{Math.round(Math.max(hud.boost, hud.drift) * 100)}%</strong></div>
				<div class="jkr-boost-track"><span style:width={`${Math.max(hud.boost, hud.drift) * 100}%`}></span></div>
			</div>

			<div
				class:roulette={hud.roulette}
				class:ready={Boolean(hud.item)}
				class:holding={hud.holdingItem}
				class="jkr-item-slot"
				aria-label={hud.roulette
					? 'Choosing an item'
					: shownItem
						? hud.holdingItem
							? `${itemLabel(shownItem)} defending. Release the item control to use.`
							: `${itemLabel(shownItem)} ready. Hold the item control to defend and release to use.`
						: 'No item'}
			>
				<span class="jkr-item-title">{hud.roulette ? 'Roulette' : hud.item ? itemLabel(hud.item) : 'Item'}</span>
				<div class="jkr-item-icon" aria-hidden="true">{@render itemArtwork(shownItem)}</div>
				<small>{hud.roulette ? 'Choosing...' : hud.item ? (hud.holdingItem ? 'Release E' : 'Hold E to defend') : 'Find a ? box'}</small>
			</div>

			{#if hud.countdown}
				<div class="jkr-countdown" aria-hidden="true"><span>{hud.countdown}</span></div>
			{/if}
		{/if}
	</div>

	{#if screen === 'select'}
		<div class="jkr-mobile-course-deck">{@render coursePicker()}</div>
	{:else if screen === 'race'}
		<div class="jkr-touch-controls" aria-label="Touch race controls" inert={paused}>
			<div class="jkr-steer-controls">
				<button class="jkr-dpad-up" type="button" aria-label="Accelerate" onpointerdown={(event) => pressControl('throttle', event)} onpointerup={releaseControl} onpointercancel={releaseControl} onlostpointercapture={releaseControl}><ChevronUp size={25} strokeWidth={3} /></button>
				<button class="jkr-dpad-left" type="button" aria-label="Steer left" onpointerdown={(event) => pressControl('left', event)} onpointerup={releaseControl} onpointercancel={releaseControl} onlostpointercapture={releaseControl}><ChevronLeft size={27} strokeWidth={3} /></button>
				<span class="jkr-dpad-center" aria-hidden="true"></span>
				<button class="jkr-dpad-right" type="button" aria-label="Steer right" onpointerdown={(event) => pressControl('right', event)} onpointerup={releaseControl} onpointercancel={releaseControl} onlostpointercapture={releaseControl}><ChevronRight size={27} strokeWidth={3} /></button>
				<button class="jkr-dpad-down" type="button" aria-label="Brake" onpointerdown={(event) => pressControl('brake', event)} onpointerup={releaseControl} onpointercancel={releaseControl} onlostpointercapture={releaseControl}><ChevronDown size={25} strokeWidth={3} /></button>
			</div>
			<div class="jkr-action-controls">
				<button class="jkr-touch-brake" type="button" aria-label="Brake" onpointerdown={(event) => pressControl('brake', event)} onpointerup={releaseControl} onpointercancel={releaseControl} onlostpointercapture={releaseControl}>BRAKE</button>
				<button class="jkr-touch-drift" type="button" aria-label="Drift" onpointerdown={(event) => pressControl('drift', event)} onpointerup={releaseControl} onpointercancel={releaseControl} onlostpointercapture={releaseControl}>DRIFT</button>
				<button
					class:ready={Boolean(hud.item)}
					class:holding={hud.holdingItem}
					class="jkr-touch-item"
					type="button"
					disabled={!hud.item}
					aria-label={hud.item
						? hud.holdingItem
							? `${itemLabel(hud.item)} defending. Release to use.`
							: `Press and hold ${itemLabel(hud.item)} to defend. Release to use.`
						: 'No item available'}
					onpointerdown={(event) => pressControl('item', event)}
					onpointerup={releaseControl}
					onpointercancel={releaseControl}
					onlostpointercapture={releaseControl}
				>
					<span class="jkr-control-item-art" aria-hidden="true">{@render itemArtwork(hud.item)}</span>
					{#if hud.item}
						<span class="jkr-touch-item-copy" aria-hidden="true">{hud.holdingItem ? 'RELEASE' : 'HOLD'}</span>
					{/if}
				</button>
				<button class="jkr-touch-go" type="button" aria-label="Accelerate" onpointerdown={(event) => pressControl('throttle', event)} onpointerup={releaseControl} onpointercancel={releaseControl} onlostpointercapture={releaseControl}>GO</button>
			</div>
		</div>
	{/if}

	{#if paused && screen === 'race'}
		<div class="jkr-modal-wrap">
			<div class="jkr-modal jkr-pause-modal" role="dialog" aria-modal="true" aria-labelledby="pause-title">
				<p class="jkr-modal-kicker">Pit stop</p>
				<h2 id="pause-title">Race paused.</h2>
				<p>Your place is frozen. The soundtrack keeps rolling.</p>
				<div class="jkr-modal-actions">
					<button class="jkr-primary" type="button" onclick={togglePause}><Play size={18} fill="currentColor" /> Resume</button>
					<button type="button" onclick={restartRace}><RotateCcw size={18} /> Restart</button>
					<button type="button" onclick={chooseCourse}><Flag size={18} /> Switch course</button>
				</div>
				<a href={resolve('/')}><ArrowLeft size={16} /> Back to Multiply Mission</a>
			</div>
		</div>
	{/if}

	{#if screen === 'finish'}
		<div class="jkr-modal-wrap jkr-finish-wrap">
			<div class="jkr-modal jkr-finish-modal" role="dialog" aria-modal="true" aria-labelledby="finish-title">
				<div class="jkr-trophy"><Trophy size={42} strokeWidth={2.4} /></div>
				<p class="jkr-modal-kicker">Transmission complete</p>
				<h2 id="finish-title">{placement} place!</h2>
				<p>{hud.rank === 1 ? 'You take the crown. The idea kart is unstoppable.' : 'Clean racing. One more run and the podium is yours.'}</p>
				<div class="jkr-results-row">
					<span><small>Course</small><strong>{selectedCourse.name}</strong></span>
					<span><small>Time</small><strong>{formatTime(hud.time)}</strong></span>
					<span><small>Finish</small><strong>{placement}</strong></span>
				</div>
				<div class="jkr-modal-actions">
					<button class="jkr-primary" type="button" onclick={restartRace}><RotateCcw size={18} /> Race again</button>
					<button type="button" onclick={chooseCourse}><Flag size={18} /> Choose course</button>
				</div>
				<a href={resolve('/')}><ArrowLeft size={16} /> Back to Multiply Mission</a>
			</div>
		</div>
	{/if}

</main>

<style>
	:global(html.jkr-page), :global(body.jkr-page), :global(html:has(.jkr-shell)), :global(body:has(.jkr-shell)) { height: 100%; overflow: hidden; background: #060a18; }

	.jkr-shell {
		--ease: cubic-bezier(.2, 0, 0, 1);
		position: fixed;
		inset: 0;
		width: 100vw;
		height: 100vh;
		height: 100dvh;
		isolation: isolate;
		min-width: 320px;
		overflow: hidden;
		touch-action: none;
		color: white;
		background: #060a18;
		-webkit-user-select: none;
		user-select: none;
	}

	.jkr-screen-frame { position: absolute; z-index: 0; inset: 0; overflow: hidden; }
	.jkr-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
	.jkr-vignette { position: absolute; inset: 0; z-index: 1; pointer-events: none; background: linear-gradient(90deg, rgba(3,5,14,.9) 0%, rgba(3,5,14,.55) 35%, transparent 68%), linear-gradient(0deg, rgba(3,5,14,.55), transparent 30%); }
	.race-active .jkr-vignette { background: radial-gradient(circle at 50% 46%, transparent 37%, rgba(2,4,13,.16) 74%, rgba(2,4,13,.45) 100%); }
	.jkr-live { position: fixed; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
	.jkr-canvas-fallback { position: absolute; z-index: 30; inset: 0; padding: 28px; display: grid; place-content: center; gap: 7px; color: white; background: radial-gradient(circle at 50% 35%, #20184b, #070b19 68%); text-align: center; }
	.jkr-canvas-fallback strong { color: #d6f247; font-family: 'Space Grotesk', sans-serif; font-size: 20px; }
	.jkr-canvas-fallback span { color: #9da8be; font-size: 12px; }
	.jkr-mobile-course-deck { display: none; }

	.jkr-topbar { position: absolute; z-index: 20; left: 0; right: 0; top: 0; min-height: calc(72px + env(safe-area-inset-top)); padding: env(safe-area-inset-top) max(22px, env(safe-area-inset-right)) 0 max(22px, env(safe-area-inset-left)); display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 20px; pointer-events: none; }
	.jkr-brand, .jkr-top-actions, .jkr-course-chip { pointer-events: auto; }
	.jkr-brand { width: max-content; min-height: 44px; display: inline-flex; align-items: center; gap: 10px; color: white; font-family: 'Space Grotesk', sans-serif; font-size: 16px; font-weight: 700; letter-spacing: -.035em; text-decoration: none; transition-property: color, transform; transition-duration: 180ms; transition-timing-function: var(--ease); }
	.jkr-brand:hover { color: #d6f247; transform: translateY(-2px); }
	.jkr-brand:active { transform: scale(.96); }
	.jkr-brand strong { color: #d6f247; }
	.jkr-brand-mark { width: 37px; height: 37px; display: grid; place-items: center; border-radius: 12px; color: #0a1125; background: #d6f247; box-shadow: 0 5px 0 #829600; transform: rotate(-6deg); }
	.jkr-course-chip { grid-column: 2; min-height: 36px; padding: 0 14px; display: flex; align-items: center; gap: 8px; border-radius: 999px; color: rgba(255,255,255,.76); background: rgba(7,10,24,.58); box-shadow: inset 0 0 0 1px rgba(255,255,255,.12), 0 8px 22px rgba(0,0,0,.15); font-size: 10px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; }
	.jkr-course-chip i { width: 7px; height: 7px; border-radius: 50%; background: #d6f247; box-shadow: 0 0 12px #d6f247; }
	.jkr-top-actions { grid-column: 3; justify-self: end; display: flex; align-items: center; gap: 9px; }
	.jkr-icon-button, .jkr-music { min-height: 44px; cursor: pointer; border: 0; color: white; background: rgba(7,10,24,.72); box-shadow: inset 0 0 0 1px rgba(255,255,255,.14), 0 10px 25px rgba(0,0,0,.2); font: inherit; transition-property: transform, color, background-color, box-shadow; transition-duration: 180ms; transition-timing-function: var(--ease); }
	.jkr-icon-button:hover, .jkr-music:hover:not(:disabled) { transform: translateY(-2px); box-shadow: inset 0 0 0 1px rgba(214,242,71,.55), 0 13px 28px rgba(0,0,0,.25); }
	.jkr-icon-button:active, .jkr-music:active:not(:disabled) { transform: scale(.96); }
	.jkr-icon-button { width: 44px; padding: 0; display: grid; place-items: center; border-radius: 14px; }
	.jkr-music { padding: 0 14px; display: inline-flex; align-items: center; gap: 8px; border-radius: 14px; font-size: 11px; font-weight: 800; }
	.jkr-music.playing { color: #0a1125; background: #d6f247; box-shadow: 0 5px 0 #829600, 0 12px 24px rgba(0,0,0,.22); }
	.jkr-music:disabled { cursor: wait; opacity: .65; }

	.jkr-select { position: relative; z-index: 5; min-height: 100%; padding: max(100px, calc(74px + env(safe-area-inset-top))) max(clamp(28px, 7vw, 108px), env(safe-area-inset-right)) max(34px, env(safe-area-inset-bottom)) max(clamp(28px, 7vw, 108px), env(safe-area-inset-left)); display: grid; grid-template-columns: minmax(400px, 1.05fr) minmax(390px, .78fr); align-items: center; gap: clamp(40px, 8vw, 140px); }
	.jkr-title-block { align-self: center; max-width: 730px; padding-top: 4vh; }
	.jkr-kicker { display: flex; align-items: center; gap: 10px; color: #d6f247; text-transform: uppercase; letter-spacing: .16em; font-size: 11px; font-weight: 900; animation: jkrRise 600ms var(--ease) both; }
	.jkr-kicker span { width: 31px; height: 2px; background: currentColor; box-shadow: 0 0 12px currentColor; }
	.jkr-title-block h1 { max-width: 720px; margin-top: 22px; font-size: clamp(72px, 9.2vw, 142px); line-height: .75; letter-spacing: -.078em; text-shadow: 0 20px 55px rgba(0,0,0,.25); animation: jkrRise 650ms 70ms var(--ease) both; }
	.jkr-title-block h1 span { display: block; color: #d6f247; font-size: .5em; letter-spacing: -.055em; }
	.jkr-key-legend { margin-top: 31px; display: flex; flex-wrap: wrap; gap: 11px 21px; color: #98a3bb; font-size: 11px; font-weight: 700; animation: jkrRise 650ms 140ms var(--ease) both; }
	.jkr-key-legend span { display: inline-flex; align-items: center; gap: 8px; }
	kbd { min-height: 26px; padding: 0 8px; display: inline-grid; place-items: center; border-radius: 7px; color: #eaf0ff; background: rgba(255,255,255,.1); box-shadow: inset 0 -2px 0 rgba(255,255,255,.08); font-family: 'Space Grotesk', sans-serif; font-size: 9px; letter-spacing: .08em; }

	.jkr-course-picker { align-self: center; padding: 15px; border-radius: 30px; background: rgba(7,10,24,.82); box-shadow: inset 0 0 0 1px rgba(255,255,255,.11), 0 28px 70px rgba(0,0,0,.35); animation: jkrPanelIn 700ms 120ms var(--ease) both; }
	.jkr-picker-heading { min-height: 43px; padding: 0 9px; display: flex; align-items: center; justify-content: space-between; color: #8f9ab0; text-transform: uppercase; letter-spacing: .13em; font-size: 9px; font-weight: 900; }
	.jkr-picker-heading strong { color: #d6f247; font-variant-numeric: tabular-nums; }
	.jkr-course-list { display: grid; gap: 9px; }
	.jkr-course-option { position: relative; min-height: 132px; padding: 18px 118px 18px 54px; cursor: pointer; overflow: hidden; border: 0; border-radius: 18px; color: #abb5ca; background: rgba(255,255,255,.055); text-align: left; box-shadow: inset 0 0 0 1px rgba(255,255,255,.06); transition-property: transform, color, background-color, box-shadow; transition-duration: 200ms; transition-timing-function: var(--ease); }
	.jkr-course-option:hover { color: white; background: rgba(255,255,255,.095); transform: translateY(-2px); }
	.jkr-course-option:active { transform: scale(.96); }
	.jkr-course-option.selected { color: white; background: #21184c; box-shadow: inset 0 0 0 2px #8d75ff, 0 8px 23px rgba(0,0,0,.25); }
	.course-galleria .jkr-course-option.selected { background: #553044; box-shadow: inset 0 0 0 2px #ff7d91, 0 8px 23px rgba(0,0,0,.25); }
	.jkr-course-number { position: absolute; left: 17px; top: 21px; color: #657089; font-family: 'Space Grotesk', sans-serif; font-size: 11px; font-weight: 800; font-variant-numeric: tabular-nums; }
	.selected .jkr-course-number { color: #d6f247; }
	.course-galleria .selected .jkr-course-number { color: #ffcf72; }
	.jkr-course-copy, .jkr-course-copy > * { display: block; }
	.jkr-course-copy small { margin-bottom: 4px; color: #7f8ca6; text-transform: uppercase; letter-spacing: .11em; font-size: 8px; font-weight: 900; }
	.selected .jkr-course-copy small { color: #a7dded; }
	.jkr-course-copy strong { color: white; font-family: 'Space Grotesk', sans-serif; font-size: 21px; letter-spacing: -.035em; }
	.jkr-course-copy > span { max-width: 260px; margin-top: 7px; font-size: 11px; line-height: 1.4; }
	.jkr-course-art { position: absolute; right: -10px; top: 50%; width: 126px; height: 82px; opacity: .62; transform: translateY(-50%); transition-property: opacity, transform; transition-duration: 220ms; transition-timing-function: var(--ease); }
	.jkr-course-art svg { width: 100%; height: 100%; display: block; }
	.selected .jkr-course-art { opacity: 1; transform: translate(-4px, -50%) scale(1.06); }
	.jkr-select-dot { position: absolute; right: 14px; top: 13px; width: 17px; height: 17px; display: grid; place-items: center; border-radius: 50%; background: rgba(255,255,255,.08); box-shadow: inset 0 0 0 1px rgba(255,255,255,.1); }
	.jkr-select-dot span { width: 7px; height: 7px; border-radius: 50%; opacity: 0; background: #d6f247; transform: scale(.25); filter: blur(4px); transition-property: opacity, transform, filter; transition-duration: 180ms; transition-timing-function: var(--ease); }
	.selected .jkr-select-dot span { opacity: 1; transform: scale(1); filter: blur(0); }
	.jkr-start { width: 100%; min-height: 61px; margin-top: 11px; padding: 0 17px 0 20px; cursor: pointer; border: 0; border-radius: 18px; display: flex; align-items: center; justify-content: space-between; color: #0a1125; background: #d6f247; box-shadow: 0 7px 0 #829600, 0 16px 32px rgba(0,0,0,.25); font-family: 'Space Grotesk', sans-serif; font-size: 14px; font-weight: 800; transition-property: transform, filter, box-shadow; transition-duration: 180ms; transition-timing-function: var(--ease); }
	.jkr-start > span { display: inline-flex; align-items: center; gap: 10px; }
	.jkr-start:hover { filter: brightness(1.05); transform: translateY(-2px); box-shadow: 0 9px 0 #829600, 0 19px 36px rgba(0,0,0,.3); }
	.jkr-start:active { transform: translateY(5px) scale(.96); box-shadow: 0 2px 0 #829600, 0 8px 19px rgba(0,0,0,.22); }

	.jkr-hud { position: absolute; z-index: 10; left: max(24px, env(safe-area-inset-left)); top: max(86px, calc(78px + env(safe-area-inset-top))); display: flex; align-items: stretch; gap: 8px; pointer-events: none; }
	.jkr-hud > div { min-height: 61px; padding: 9px 15px; display: flex; flex-direction: column; justify-content: center; border-radius: 16px; background: rgba(7,10,24,.7); box-shadow: inset 0 0 0 1px rgba(255,255,255,.12), 0 11px 25px rgba(0,0,0,.2); }
	.jkr-hud span { color: #939eb4; text-transform: uppercase; letter-spacing: .11em; font-size: 8px; font-weight: 900; }
	.jkr-hud strong { color: white; font-family: 'Space Grotesk', sans-serif; font-variant-numeric: tabular-nums; }
	.jkr-rank-block strong { color: #d6f247; font-size: 30px; line-height: .9; letter-spacing: -.055em; }
	.jkr-rank-block span { margin-top: 5px; }
	.jkr-lap-block strong { margin-top: 2px; font-size: 22px; line-height: 1; }
	.jkr-lap-block small { color: #8791a8; font-size: .56em; }
	.jkr-time-block { min-width: 105px; }
	.jkr-time-block strong { margin-top: 3px; font-size: 17px; }
	.jkr-minimap { position: absolute; z-index: 10; right: max(26px, env(safe-area-inset-right)); top: max(86px, calc(78px + env(safe-area-inset-top))); width: 190px; padding: 9px 10px 8px; border-radius: 18px; color: white; background: rgba(7,10,24,.76); box-shadow: inset 0 0 0 1px rgba(255,255,255,.13), 0 13px 30px rgba(0,0,0,.25); backdrop-filter: blur(9px); pointer-events: none; }
	.jkr-minimap-heading { min-height: 18px; display: flex; align-items: center; justify-content: space-between; color: #9da8be; text-transform: uppercase; letter-spacing: .1em; font-size: 7px; font-weight: 900; }
	.jkr-minimap-heading span { display: inline-flex; align-items: center; gap: 5px; }
	.jkr-minimap-heading strong { color: #d6f247; font-size: 7px; }
	.jkr-minimap svg { width: 100%; height: auto; display: block; overflow: visible; }
	.jkr-minimap-shadow, .jkr-minimap-route { fill: none; stroke-linecap: round; stroke-linejoin: round; }
	.jkr-minimap-shadow { stroke: rgba(1,4,13,.9); stroke-width: 7; }
	.jkr-minimap-route { stroke: url(#jkr-map-gradient); stroke-width: 3.4; }
	.course-galleria .jkr-minimap-route { stroke: #ffb36f; }
	.jkr-minimap-start { fill: #fff8dc; stroke: #0a1125; stroke-width: 1.4; }
	.jkr-minimap-racer { stroke: #090f23; stroke-width: 1.2; }
	.jkr-minimap-racer.player { stroke: #fff; stroke-width: 1.6; filter: drop-shadow(0 0 3px rgba(214,242,71,.85)); }
	.jkr-minimap-player-pulse { fill: none; stroke: rgba(214,242,71,.65); stroke-width: 1.1; transform-box: fill-box; transform-origin: center; animation: jkrMapPulse 1.15s ease-out infinite; }

	.jkr-speedometer { position: absolute; z-index: 9; right: max(27px, env(safe-area-inset-right)); bottom: max(27px, env(safe-area-inset-bottom)); width: 126px; aspect-ratio: 1; padding-top: 17px; display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: 50%; color: #a7dded; background: radial-gradient(circle, rgba(10,17,37,.83) 59%, rgba(10,17,37,.34) 61%, rgba(167,221,237,.22) 63%, rgba(10,17,37,.72) 66%); box-shadow: 0 13px 35px rgba(0,0,0,.27); pointer-events: none; }
	.jkr-speedometer strong { color: white; font-family: 'Space Grotesk', sans-serif; font-size: 35px; line-height: .9; letter-spacing: -.055em; font-variant-numeric: tabular-nums; }
	.jkr-speedometer span { margin-top: 5px; color: #8390a9; font-size: 8px; font-weight: 900; letter-spacing: .13em; }
	.jkr-boost-meter { position: absolute; z-index: 9; left: 50%; bottom: max(25px, env(safe-area-inset-bottom)); width: min(330px, 34vw); padding: 11px 14px; border-radius: 14px; background: rgba(7,10,24,.72); box-shadow: inset 0 0 0 1px rgba(255,255,255,.11), 0 10px 24px rgba(0,0,0,.18); transform: translateX(-50%); pointer-events: none; }
	.jkr-boost-label { margin-bottom: 7px; display: flex; align-items: center; justify-content: space-between; color: #8f9ab0; text-transform: uppercase; letter-spacing: .1em; font-size: 8px; font-weight: 900; }
	.jkr-boost-label span { display: inline-flex; align-items: center; gap: 5px; }
	.jkr-boost-label strong { color: #d6f247; font-variant-numeric: tabular-nums; }
	.jkr-boost-track { height: 7px; overflow: hidden; border-radius: 999px; background: rgba(255,255,255,.09); }
	.jkr-boost-track span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #66dfff, #d6f247 62%, #ff718d); box-shadow: 0 0 13px rgba(214,242,71,.45); transition-property: width; transition-duration: 80ms; transition-timing-function: linear; }
	.jkr-item-slot { position: absolute; z-index: 12; left: max(27px, env(safe-area-inset-left)); bottom: max(27px, env(safe-area-inset-bottom)); width: 112px; min-height: 128px; padding: 10px; display: grid; justify-items: center; border-radius: 22px; color: white; background: rgba(7,10,24,.78); box-shadow: inset 0 0 0 1px rgba(255,255,255,.13), 0 13px 32px rgba(0,0,0,.28); pointer-events: none; }
	.jkr-item-slot.ready { box-shadow: inset 0 0 0 2px rgba(214,242,71,.68), 0 0 28px rgba(214,242,71,.18), 0 13px 32px rgba(0,0,0,.28); }
	.jkr-item-slot.holding { box-shadow: inset 0 0 0 2px rgba(167,221,237,.9), 0 0 31px rgba(102,223,255,.26), 0 13px 32px rgba(0,0,0,.28); }
	.jkr-item-slot.holding .jkr-item-icon { transform: translateY(3px) scale(.96); box-shadow: inset 0 -2px 0 rgba(0,0,0,.14), 0 0 20px rgba(102,223,255,.3); }
	.jkr-item-title { align-self: start; color: #9da8be; text-transform: uppercase; letter-spacing: .12em; font-size: 8px; font-weight: 900; }
	.jkr-item-icon { width: 66px; height: 66px; display: grid; place-items: center; border-radius: 17px; color: #8b96ad; background: rgba(255,255,255,.07); box-shadow: inset 0 -4px 0 rgba(0,0,0,.14); transition-property: transform, box-shadow; transition-duration: 150ms; transition-timing-function: var(--ease); }
	.jkr-item-slot.ready .jkr-item-icon { background: #f7f3dc; }
	.jkr-item-icon > strong { font-family: 'Space Grotesk', sans-serif; font-size: 38px; line-height: 1; }
	.jkr-item-slot small { color: #d6f247; font-size: 8px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
	.jkr-item-slot.roulette .jkr-item-icon { animation: jkrRoulette 110ms steps(2, end) infinite; }
	.jkr-item-art { width: 58px; height: 58px; display: block; overflow: visible; filter: drop-shadow(0 3px 0 rgba(12,17,35,.2)); }
	.jkr-shell-feet { fill: #fff3d1; stroke: #131b32; stroke-width: 3.4; stroke-linejoin: round; }
	.jkr-shell-rim { fill: #f7e5b6; stroke: #131b32; stroke-width: 4; }
	.jkr-shell-dome { fill: #31c86f; stroke: #174c36; stroke-width: 2.8; }
	.jkr-shell-art.red-shell .jkr-shell-dome { fill: #f04460; stroke: #792039; }
	.jkr-shell-panels { fill: none; stroke: #174c36; stroke-width: 2.8; stroke-linecap: round; stroke-linejoin: round; }
	.jkr-shell-art.red-shell .jkr-shell-panels { stroke: #792039; }
	.jkr-shell-shine { fill: none; stroke: rgba(255,255,255,.7); stroke-width: 3; stroke-linecap: round; }
	.jkr-banana-flap { stroke: #654415; stroke-width: 3.2; stroke-linejoin: round; }
	.jkr-banana-left { fill: #ffc72e; }
	.jkr-banana-right { fill: #ffda3f; }
	.jkr-banana-center { fill: #f4b721; }
	.jkr-banana-core { fill: #fff0aa; stroke: #76501a; stroke-width: 2.7; }
	.jkr-banana-stem { fill: none; stroke: #ffd83d; stroke-width: 7; stroke-linecap: round; }
	.jkr-banana-tip { fill: none; stroke: #3e2b1d; stroke-width: 4; stroke-linecap: round; }
	.jkr-banana-glint { fill: none; stroke: rgba(255,255,255,.62); stroke-width: 2.1; stroke-linecap: round; }
	.jkr-item-question { font-family: 'Space Grotesk', sans-serif; font-size: 38px; line-height: 1; }
	.jkr-control-item-art { width: 34px; height: 34px; display: grid; place-items: center; }
	.jkr-control-item-art .jkr-item-art { width: 36px; height: 36px; }
	.jkr-control-item-art .jkr-item-question { font-size: 24px; }
	.jkr-touch-item-copy { position: absolute; left: 50%; bottom: 3px; color: #0a1125; font-size: 6px; font-weight: 900; letter-spacing: .04em; line-height: 1; transform: translateX(-50%); }

	.jkr-countdown { position: absolute; z-index: 15; inset: 0; display: grid; place-items: center; pointer-events: none; }
	.jkr-countdown span { min-width: 150px; min-height: 150px; padding: 20px; display: grid; place-items: center; border-radius: 50%; color: #0a1125; background: #d6f247; box-shadow: 0 12px 0 #829600, 0 0 0 14px rgba(214,242,71,.14), 0 30px 70px rgba(0,0,0,.3); font-family: 'Space Grotesk', sans-serif; font-size: clamp(48px, 9vw, 94px); font-weight: 800; letter-spacing: -.07em; animation: jkrCountdown 420ms var(--ease) both; }

	.jkr-touch-controls { display: none; }
	.jkr-modal-wrap { position: absolute; z-index: 40; inset: 0; padding: max(88px, calc(76px + env(safe-area-inset-top))) max(22px, env(safe-area-inset-right)) max(22px, env(safe-area-inset-bottom)) max(22px, env(safe-area-inset-left)); display: grid; place-items: center; background: rgba(4,6,17,.66); animation: jkrFade 220ms var(--ease) both; }
	.jkr-modal { width: min(520px, 100%); padding: 34px; border-radius: 30px; color: white; background: #111831; box-shadow: inset 0 0 0 1px rgba(255,255,255,.11), 0 30px 80px rgba(0,0,0,.45); text-align: center; animation: jkrModalIn 340ms var(--ease) both; }
	.jkr-modal-kicker { color: #d6f247; text-transform: uppercase; letter-spacing: .14em; font-size: 9px; font-weight: 900; }
	.jkr-modal h2 { margin-top: 9px; font-size: clamp(42px, 6vw, 66px); line-height: .92; letter-spacing: -.065em; }
	.jkr-modal > p:not(.jkr-modal-kicker) { max-width: 390px; margin: 15px auto 0; color: #aab4ca; line-height: 1.5; }
	.jkr-modal-actions { margin-top: 27px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; }
	.jkr-modal-actions button { min-height: 49px; padding: 0 13px; cursor: pointer; border: 0; border-radius: 14px; display: flex; align-items: center; justify-content: center; gap: 7px; color: white; background: rgba(255,255,255,.075); font: inherit; font-size: 12px; font-weight: 800; transition-property: transform, background-color, color, box-shadow; transition-duration: 180ms; transition-timing-function: var(--ease); }
	.jkr-modal-actions button:hover { background: rgba(255,255,255,.13); transform: translateY(-2px); }
	.jkr-modal-actions button:active { transform: scale(.96); }
	.jkr-modal-actions button.jkr-primary { color: #0a1125; background: #d6f247; box-shadow: 0 5px 0 #829600; }
	.jkr-modal > a { min-height: 44px; margin-top: 19px; display: inline-flex; align-items: center; gap: 7px; color: #8f9ab0; font-size: 11px; font-weight: 700; text-decoration: none; transition-property: color, transform; transition-duration: 180ms; }
	.jkr-modal > a:hover { color: white; transform: translateX(-3px); }
	.jkr-trophy { width: 78px; height: 78px; margin: -73px auto 24px; display: grid; place-items: center; border-radius: 50%; color: #0a1125; background: #d6f247; box-shadow: 0 8px 0 #829600, 0 0 0 11px rgba(214,242,71,.1); transform: rotate(-4deg); }
	.jkr-finish-wrap { background: radial-gradient(circle at 50% 25%, rgba(214,242,71,.14), transparent 36%), rgba(4,6,17,.72); }
	.jkr-finish-modal { width: min(610px, 100%); }
	.jkr-results-row { margin-top: 27px; padding: 17px 0; display: grid; grid-template-columns: 1.4fr 1fr .7fr; border-top: 1px solid rgba(255,255,255,.09); border-bottom: 1px solid rgba(255,255,255,.09); }
	.jkr-results-row span { min-width: 0; padding: 0 14px; display: flex; flex-direction: column; gap: 5px; }
	.jkr-results-row span + span { border-left: 1px solid rgba(255,255,255,.09); }
	.jkr-results-row small { color: #7f8aa2; text-transform: uppercase; letter-spacing: .11em; font-size: 8px; font-weight: 900; }
	.jkr-results-row strong { overflow: hidden; color: white; font-family: 'Space Grotesk', sans-serif; font-size: 16px; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
	.jkr-finish-modal .jkr-modal-actions { grid-template-columns: repeat(2, 1fr); }

	@keyframes jkrRise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
	@keyframes jkrPanelIn { from { opacity: 0; transform: translateX(24px) scale(.97); } to { opacity: 1; transform: translateX(0) scale(1); } }
	@keyframes jkrFade { from { opacity: 0; } to { opacity: 1; } }
	@keyframes jkrModalIn { from { opacity: 0; transform: translateY(14px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
	@keyframes jkrCountdown { from { opacity: 0; transform: scale(.25); filter: blur(4px); } to { opacity: 1; transform: scale(1); filter: blur(0); } }
	@keyframes jkrRoulette { from { transform: scale(.88) rotate(-7deg); filter: hue-rotate(0); } to { transform: scale(1.06) rotate(7deg); filter: hue-rotate(95deg); } }

	@media (max-width: 1040px) {
		.jkr-select { grid-template-columns: minmax(330px, .9fr) minmax(360px, .85fr); gap: 34px; padding-inline: max(28px, env(safe-area-inset-left)); }
		.jkr-title-block h1 { font-size: clamp(68px, 10vw, 104px); }
		.jkr-course-option { min-height: 120px; }
	}

	@media (max-height: 620px) and (orientation: landscape) {
		.jkr-topbar { min-height: calc(58px + env(safe-area-inset-top)); }
		.jkr-brand { font-size: 14px; }
		.jkr-brand-mark { width: 34px; height: 34px; border-radius: 10px; }
		.jkr-select { padding-top: max(62px, calc(57px + env(safe-area-inset-top))); padding-bottom: max(14px, env(safe-area-inset-bottom)); grid-template-columns: minmax(290px, .95fr) minmax(350px, .92fr); gap: clamp(22px, 5vw, 60px); }
		.jkr-title-block { padding-top: 0; }
		.jkr-title-block h1 { margin-top: 13px; font-size: clamp(58px, 11.5vh, 82px); line-height: .77; }
		.jkr-key-legend { margin-top: 18px; }
		.jkr-course-picker { padding: 10px; border-radius: 23px; }
		.jkr-picker-heading { min-height: 31px; }
		.jkr-course-option { min-height: 91px; padding: 11px 98px 11px 43px; border-radius: 14px; }
		.jkr-course-number { left: 13px; top: 15px; }
		.jkr-course-copy strong { font-size: 17px; }
		.jkr-course-copy > span { margin-top: 4px; font-size: 9px; }
		.jkr-course-art { width: 105px; height: 65px; }
		.jkr-start { min-height: 47px; margin-top: 7px; border-radius: 14px; box-shadow: 0 5px 0 #829600; }
		.jkr-course-chip { display: none; }
		.jkr-hud { top: max(62px, calc(57px + env(safe-area-inset-top))); }
		.jkr-hud > div { min-height: 50px; padding: 7px 11px; border-radius: 13px; }
		.jkr-rank-block strong { font-size: 24px; }
		.jkr-time-block { min-width: 88px; }
		.jkr-time-block strong { font-size: 14px; }
		.jkr-minimap { top: max(62px, calc(57px + env(safe-area-inset-top))); width: 154px; padding: 7px 8px 6px; border-radius: 14px; }
		.jkr-speedometer { width: 91px; right: max(16px, env(safe-area-inset-right)); bottom: max(13px, env(safe-area-inset-bottom)); }
		.jkr-speedometer strong { font-size: 27px; }
		.jkr-boost-meter { bottom: max(12px, env(safe-area-inset-bottom)); width: min(250px, 32vw); padding: 8px 10px; }
		.jkr-item-slot { left: max(16px, env(safe-area-inset-left)); bottom: max(13px, env(safe-area-inset-bottom)); width: 91px; min-height: 102px; padding: 7px; border-radius: 17px; }
		.jkr-item-icon { width: 51px; height: 51px; border-radius: 13px; transform: scale(.82); }
		.jkr-modal-wrap { padding-top: max(62px, calc(57px + env(safe-area-inset-top))); }
		.jkr-modal { width: min(560px, 82vw); padding: 22px 28px; border-radius: 23px; }
		.jkr-modal h2 { font-size: 42px; }
		.jkr-modal > p:not(.jkr-modal-kicker) { margin-top: 9px; font-size: 12px; }
		.jkr-modal-actions { margin-top: 17px; }
		.jkr-trophy { width: 58px; height: 58px; margin: -51px auto 13px; }
		.jkr-results-row { margin-top: 15px; padding-block: 10px; }
	}

	@media (pointer: coarse) and (orientation: landscape) {
		.jkr-key-legend { display: none; }
		.race-active .jkr-speedometer, .race-active .jkr-boost-meter { display: none; }
		.race-active .jkr-item-slot { left: max(151px, calc(env(safe-area-inset-left) + 137px)); bottom: max(13px, env(safe-area-inset-bottom)); width: 58px; min-height: 58px; padding: 4px; border-radius: 17px; }
		.race-active .jkr-item-slot .jkr-item-title, .race-active .jkr-item-slot small { display: none; }
		.race-active .jkr-item-slot .jkr-item-icon { width: 50px; height: 50px; transform: scale(.72); }
		.jkr-touch-controls { position: absolute; z-index: 18; inset: auto max(14px, env(safe-area-inset-right)) max(13px, env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left)); display: flex; align-items: end; justify-content: space-between; pointer-events: none; }
		.jkr-steer-controls, .jkr-action-controls { display: flex; align-items: end; gap: 9px; pointer-events: auto; }
		.jkr-dpad-up, .jkr-dpad-down, .jkr-dpad-center { display: none; }
		.jkr-touch-controls button { cursor: pointer; border: 0; display: grid; place-items: center; color: white; background: rgba(9,14,32,.72); box-shadow: inset 0 0 0 2px rgba(255,255,255,.17), 0 7px 0 rgba(2,5,14,.55); font-family: 'Space Grotesk', sans-serif; font-size: 9px; font-weight: 900; touch-action: none; transition-property: transform, background-color, box-shadow; transition-duration: 100ms; }
		.jkr-touch-controls button:active { transform: translateY(5px) scale(.96); box-shadow: inset 0 0 0 2px rgba(255,255,255,.2), 0 2px 0 rgba(2,5,14,.55); }
		.jkr-touch-controls button:disabled { cursor: default; opacity: .58; }
		.jkr-steer-controls button { width: 62px; height: 62px; border-radius: 20px; }
		.jkr-action-controls { position: relative; padding-right: 4px; }
		.jkr-action-controls .jkr-touch-go { width: 74px; height: 74px; border-radius: 50%; color: #0a1125; background: #d6f247; box-shadow: inset 0 0 0 2px rgba(255,255,255,.3), 0 7px 0 #829600; font-size: 16px; }
		.jkr-action-controls .jkr-touch-drift { width: 62px; height: 62px; border-radius: 20px; color: #0a1125; background: #a7dded; box-shadow: inset 0 0 0 2px rgba(255,255,255,.3), 0 7px 0 #5f9eb1; }
		.jkr-action-controls .jkr-touch-brake { width: 48px; height: 48px; border-radius: 16px; }
		.jkr-action-controls .jkr-touch-item { position: absolute; right: 58px; bottom: 67px; width: 45px; height: 45px; border-radius: 50%; color: #0a1125; background: #ffd45a; box-shadow: inset 0 0 0 2px rgba(255,255,255,.3), 0 5px 0 #aa7800; }
		.jkr-action-controls .jkr-touch-item.ready { background: #d6f247; box-shadow: inset 0 0 0 2px rgba(255,255,255,.4), 0 5px 0 #829600, 0 0 19px rgba(214,242,71,.42); animation: jkrItemReady 800ms ease-in-out infinite alternate; }
		.jkr-action-controls .jkr-touch-item.holding { background: #a7dded; box-shadow: inset 0 0 0 2px rgba(255,255,255,.5), 0 2px 0 #5f9eb1, 0 0 22px rgba(102,223,255,.46); animation: none; transform: translateY(3px) scale(.96); }
		.jkr-control-item-art { transform: scale(.78); }
	}

	@media (pointer: coarse) and (orientation: landscape) and (max-width: 760px) {
		.jkr-select {
			padding-left: calc(env(safe-area-inset-left, 0px) + 12px);
			padding-right: calc(env(safe-area-inset-right, 0px) + 12px);
			grid-template-columns: minmax(180px, .62fr) minmax(300px, 1fr);
			gap: 12px;
		}
		.jkr-title-block h1 { font-size: clamp(45px, 10.5vw, 62px); }
		.jkr-kicker { font-size: 8px; }
		.jkr-course-picker { min-width: 0; }
		.jkr-course-option { padding-right: 82px; }
		.jkr-course-art { right: -4px; width: 88px; }
	}

	@media (max-height: 420px) and (pointer: coarse) and (orientation: landscape) {
		.jkr-topbar { padding-left: max(13px, env(safe-area-inset-left)); padding-right: max(13px, env(safe-area-inset-right)); }
		.jkr-brand > span:last-child, .jkr-music span { display: none; }
		.jkr-music { width: 44px; padding: 0; justify-content: center; }
		.jkr-hud { left: max(13px, env(safe-area-inset-left)); }
		.jkr-minimap { right: max(13px, env(safe-area-inset-right)); width: 118px; }
		.jkr-minimap-heading { display: none; }
		.jkr-lap-block { display: none !important; }
		.jkr-steer-controls button { width: 57px; height: 57px; border-radius: 18px; }
		.jkr-action-controls .jkr-touch-go { width: 66px; height: 66px; }
		.jkr-action-controls .jkr-touch-drift { width: 56px; height: 56px; }
		.jkr-action-controls .jkr-touch-brake { width: 44px; height: 44px; }
		.jkr-action-controls .jkr-touch-item { right: 52px; bottom: 59px; width: 42px; height: 42px; }
		.jkr-countdown span { min-width: 105px; min-height: 105px; font-size: 54px; }
	}

	@media (orientation: portrait) and (max-width: 900px) {
		.jkr-shell {
			min-width: 0;
			padding: calc(env(safe-area-inset-top, 0px) + 8px) calc(env(safe-area-inset-right, 0px) + 12px) calc(env(safe-area-inset-bottom, 0px) + 10px) calc(env(safe-area-inset-left, 0px) + 12px);
			display: grid;
			grid-template-rows: 44px auto minmax(0, 1fr);
			gap: 10px;
			background:
				radial-gradient(circle at 12% 9%, rgba(214,242,71,.11), transparent 20%),
				radial-gradient(circle at 88% 78%, rgba(141,117,255,.18), transparent 26%),
				linear-gradient(155deg, #202945, #111831 58%, #1a2140);
		}

		.jkr-topbar {
			position: relative;
			z-index: 20;
			grid-row: 1;
			left: auto;
			right: auto;
			top: auto;
			min-height: 44px;
			padding: 0;
			grid-template-columns: 1fr auto;
			gap: 10px;
		}
		.jkr-brand { min-height: 44px; gap: 9px; font-size: 14px; }
		.jkr-brand-mark { width: 35px; height: 35px; border-radius: 11px; box-shadow: 0 4px 0 #829600; }
		.jkr-course-chip { display: none; }
		.jkr-top-actions { grid-column: 2; gap: 7px; }
		.jkr-icon-button, .jkr-music { min-height: 44px; }
		.jkr-music { width: 44px; padding: 0; justify-content: center; border-radius: 13px; }
		.jkr-music span { display: none; }

		.jkr-screen-frame {
			position: relative;
			z-index: 2;
			grid-row: 2;
			inset: auto;
			width: min(100%, 520px);
			aspect-ratio: 4 / 3;
			justify-self: center;
			min-height: 0;
			box-sizing: border-box;
			overflow: hidden;
			border: 8px solid #0d1329;
			border-bottom-width: 14px;
			border-radius: 24px;
			background: #030716;
			box-shadow: inset 0 0 0 1px rgba(255,255,255,.1), 0 7px 0 #070b19, 0 17px 35px rgba(0,0,0,.28);
		}
		.jkr-vignette { background: linear-gradient(0deg, rgba(3,5,14,.9), transparent 58%), linear-gradient(90deg, rgba(3,5,14,.38), transparent 45%); }
		.race-active .jkr-vignette { background: radial-gradient(circle at 50% 43%, transparent 40%, rgba(2,4,13,.18) 76%, rgba(2,4,13,.48) 100%); }

		.jkr-select {
			position: absolute;
			inset: 0;
			min-height: 0;
			padding: 0;
			display: block;
		}
		.jkr-select > .jkr-course-picker { display: none; }
		.jkr-title-block { position: absolute; z-index: 4; left: 15px; right: 15px; bottom: 14px; max-width: none; padding: 0; }
		.jkr-kicker { gap: 7px; font-size: 7px; letter-spacing: .14em; }
		.jkr-kicker span { width: 17px; }
		.jkr-title-block h1 { margin-top: 7px; font-size: clamp(38px, 12vw, 54px); line-height: .82; letter-spacing: -.067em; }
		.jkr-title-block h1 span { display: inline; color: #d6f247; font-size: 1em; letter-spacing: inherit; }
		.jkr-key-legend { display: none; }

		.jkr-mobile-course-deck {
			position: relative;
			z-index: 4;
			grid-row: 3;
			width: min(100%, 520px);
			min-height: 0;
			justify-self: center;
			display: block;
			overflow-y: auto;
			overscroll-behavior: contain;
			touch-action: pan-y;
			padding: 2px 2px 8px;
			scrollbar-width: none;
		}
		.jkr-mobile-course-deck::-webkit-scrollbar { display: none; }
		.jkr-mobile-course-deck .jkr-course-picker { padding: 10px; border-radius: 22px; background: rgba(7,10,24,.67); box-shadow: inset 0 0 0 1px rgba(255,255,255,.11), 0 14px 30px rgba(0,0,0,.2); }
		.jkr-mobile-course-deck .jkr-picker-heading { min-height: 29px; padding: 0 4px 3px; font-size: 8px; }
		.jkr-mobile-course-deck .jkr-course-list { gap: 7px; }
		.jkr-mobile-course-deck .jkr-course-option { min-height: 68px; padding: 9px 76px 9px 41px; border-radius: 14px; }
		.jkr-mobile-course-deck .jkr-course-number { left: 12px; top: 13px; font-size: 10px; }
		.jkr-mobile-course-deck .jkr-course-copy small { font-size: 7px; }
		.jkr-mobile-course-deck .jkr-course-copy strong { margin-top: 3px; font-size: 17px; }
		.jkr-mobile-course-deck .jkr-course-copy > span { display: none; }
		.jkr-mobile-course-deck .jkr-course-art { right: -3px; top: 50%; width: 78px; height: 50px; }
		.jkr-mobile-course-deck .jkr-select-dot { right: 9px; top: 9px; width: 14px; height: 14px; }
		.jkr-mobile-course-deck .jkr-start { min-height: 50px; margin-top: 8px; border-radius: 15px; font-size: 12px; box-shadow: 0 5px 0 #829600, 0 11px 22px rgba(0,0,0,.2); }

		.jkr-hud { left: 7px; top: 7px; gap: 4px; }
		.jkr-hud > div { min-height: 39px; padding: 5px 8px; border-radius: 10px; }
		.jkr-hud span { font-size: 6px; }
		.jkr-rank-block strong { font-size: 21px; }
		.jkr-rank-block span { margin-top: 2px; }
		.jkr-lap-block strong { margin-top: 1px; font-size: 16px; }
		.jkr-time-block { min-width: 74px; }
		.jkr-time-block strong { margin-top: 2px; font-size: 11px; }
		.jkr-minimap { right: 6px; top: 6px; width: 86px; padding: 4px 5px; border-radius: 11px; background: rgba(7,10,24,.73); box-shadow: inset 0 0 0 1px rgba(255,255,255,.12), 0 7px 14px rgba(0,0,0,.18); backdrop-filter: none; }
		.jkr-minimap-heading { display: none; }
		.jkr-minimap-shadow { stroke-width: 7.8; }
		.jkr-minimap-route { stroke-width: 4; }
		.jkr-minimap-racer { stroke-width: 1.45; }

		.jkr-speedometer { right: 6px; bottom: 6px; width: 54px; padding-top: 4px; background: radial-gradient(circle, rgba(10,17,37,.86) 58%, rgba(167,221,237,.22) 61%, rgba(10,17,37,.78) 65%); }
		.jkr-speedometer :global(svg) { width: 12px; height: 12px; }
		.jkr-speedometer strong { font-size: 17px; }
		.jkr-speedometer span { margin-top: 2px; font-size: 5px; }
		.jkr-boost-meter { bottom: 6px; width: 116px; padding: 6px 7px; border-radius: 9px; }
		.jkr-boost-label { margin-bottom: 4px; font-size: 6px; }
		.jkr-boost-label :global(svg) { width: 9px; height: 9px; }
		.jkr-boost-track { height: 4px; }
		.jkr-item-slot { left: 6px; bottom: 6px; width: 72px; min-height: 76px; padding: 5px; border-radius: 13px; }
		.jkr-item-title { max-width: 62px; overflow: hidden; font-size: 6px; letter-spacing: .08em; text-overflow: ellipsis; white-space: nowrap; }
		.jkr-item-icon { width: 47px; height: 47px; border-radius: 11px; }
		.jkr-item-icon .jkr-item-art { width: 45px; height: 45px; }
		.jkr-item-icon .jkr-item-question { font-size: 27px; }
		.jkr-item-slot small { display: none; }
		.jkr-countdown span { min-width: 88px; min-height: 88px; padding: 12px; font-size: 46px; box-shadow: 0 8px 0 #829600, 0 0 0 9px rgba(214,242,71,.14), 0 20px 45px rgba(0,0,0,.3); }

		.jkr-touch-controls {
			position: relative;
			z-index: 6;
			grid-row: 3;
			width: min(100%, 520px);
			min-height: 0;
			padding: 8px 3px 4px;
			justify-self: center;
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 6px;
			pointer-events: none;
		}
		.jkr-touch-controls button { cursor: pointer; border: 0; display: grid; place-items: center; color: #f7f8ff; background: #10162b; box-shadow: inset 0 0 0 2px rgba(255,255,255,.1), 0 6px 0 #070a17, 0 10px 17px rgba(0,0,0,.2); font-family: 'Space Grotesk', sans-serif; font-size: 8px; font-weight: 900; touch-action: none; transition: transform 90ms var(--ease), box-shadow 90ms var(--ease), filter 90ms var(--ease); }
		.jkr-touch-controls button:active { transform: translateY(5px) scale(.97); box-shadow: inset 0 0 0 2px rgba(255,255,255,.12), 0 1px 0 #070a17; }
		.jkr-touch-controls button:disabled { cursor: default; opacity: .46; filter: saturate(.45); }
		.jkr-touch-controls button:focus-visible { outline: 3px solid #d6f247; outline-offset: 3px; }

		.jkr-steer-controls { width: 144px; height: 144px; flex: 0 0 144px; display: grid; grid-template: repeat(3, 48px) / repeat(3, 48px); pointer-events: auto; filter: drop-shadow(0 8px 10px rgba(0,0,0,.2)); }
		.jkr-steer-controls button { width: 48px; height: 48px; border-radius: 0; box-shadow: inset 0 0 0 2px rgba(255,255,255,.08), 0 4px 0 #070a17; }
		.jkr-dpad-up { grid-area: 1 / 2; border-radius: 11px 11px 0 0 !important; }
		.jkr-dpad-left { grid-area: 2 / 1; border-radius: 11px 0 0 11px !important; }
		.jkr-dpad-center { grid-area: 2 / 2; display: block; position: relative; background: #10162b; box-shadow: inset 0 0 0 2px rgba(255,255,255,.08); }
		.jkr-dpad-center::after { content: ''; position: absolute; inset: 15px; border-radius: 50%; background: #080d1d; box-shadow: inset 0 2px 0 rgba(255,255,255,.09); }
		.jkr-dpad-right { grid-area: 2 / 3; border-radius: 0 11px 11px 0 !important; }
		.jkr-dpad-down { grid-area: 3 / 2; border-radius: 0 0 11px 11px !important; }

		.jkr-action-controls { position: relative; width: 150px; height: 144px; flex: 0 0 150px; pointer-events: auto; }
		.jkr-action-controls button { position: absolute; border-radius: 50%; }
		.jkr-action-controls .jkr-touch-go { right: 0; bottom: 3px; width: 76px; height: 76px; color: #0a1125; background: #d6f247; box-shadow: inset 0 0 0 2px rgba(255,255,255,.35), 0 7px 0 #829600, 0 12px 20px rgba(0,0,0,.22); font-size: 16px; }
		.jkr-action-controls .jkr-touch-drift { left: 8px; top: 7px; width: 62px; height: 62px; color: #0a1125; background: #a7dded; box-shadow: inset 0 0 0 2px rgba(255,255,255,.35), 0 6px 0 #5f9eb1; font-size: 9px; }
		.jkr-action-controls .jkr-touch-brake { left: 0; bottom: 2px; width: 49px; height: 49px; border-radius: 15px; }
		.jkr-action-controls .jkr-touch-item { right: 15px; top: 0; width: 54px; height: 54px; color: #0a1125; background: #ffd45a; box-shadow: inset 0 0 0 2px rgba(255,255,255,.36), 0 5px 0 #aa7800; }
		.jkr-action-controls .jkr-touch-item.ready { background: #d6f247; box-shadow: inset 0 0 0 2px rgba(255,255,255,.42), 0 5px 0 #829600, 0 0 18px rgba(214,242,71,.38); animation: jkrItemReady 800ms ease-in-out infinite alternate; }
		.jkr-action-controls .jkr-touch-item.holding { background: #a7dded; box-shadow: inset 0 0 0 2px rgba(255,255,255,.5), 0 2px 0 #5f9eb1, 0 0 22px rgba(102,223,255,.42); animation: none; transform: translateY(3px) scale(.96); }

		.jkr-modal-wrap { position: fixed; inset: 0; padding: calc(env(safe-area-inset-top, 0px) + 16px) calc(env(safe-area-inset-right, 0px) + 12px) calc(env(safe-area-inset-bottom, 0px) + 16px) calc(env(safe-area-inset-left, 0px) + 12px); overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y; }
		.jkr-modal { width: min(390px, 100%); padding: 23px 20px; border-radius: 24px; }
		.jkr-modal h2 { font-size: 39px; }
		.jkr-modal > p:not(.jkr-modal-kicker) { margin-top: 10px; font-size: 13px; }
		.jkr-modal-actions { margin-top: 18px; grid-template-columns: 1fr; gap: 8px; }
		.jkr-modal-actions button { min-height: 50px; }
		.jkr-finish-modal .jkr-modal-actions { grid-template-columns: repeat(2, 1fr); }
		.jkr-trophy { width: 56px; height: 56px; margin: -51px auto 17px; }
		.jkr-trophy :global(svg) { width: 31px; height: 31px; }
		.jkr-results-row { margin-top: 18px; padding: 12px 0; }
		.jkr-results-row span { padding: 0 7px; }
		.jkr-results-row strong { font-size: 12px; }
		.jkr-modal > a { margin-top: 13px; }
	}

	@media (orientation: portrait) and (max-width: 340px) {
		.jkr-shell { padding-inline: calc(env(safe-area-inset-left, 0px) + 8px) calc(env(safe-area-inset-right, 0px) + 8px); }
		.jkr-action-controls { width: 140px; flex-basis: 140px; transform: scale(.94); transform-origin: right center; }
		.jkr-mobile-course-deck .jkr-course-option { padding-right: 67px; }
		.jkr-mobile-course-deck .jkr-course-art { width: 69px; }
	}

	@keyframes jkrItemReady { from { transform: translateY(0); } to { transform: translateY(-3px); } }
	@keyframes jkrMapPulse { from { opacity: .9; transform: scale(.65); } to { opacity: 0; transform: scale(1.5); } }

	@media (prefers-reduced-motion: reduce) {
		.jkr-kicker, .jkr-title-block h1, .jkr-key-legend, .jkr-course-picker, .jkr-modal-wrap, .jkr-modal, .jkr-countdown span, .jkr-item-slot.roulette .jkr-item-icon, .jkr-action-controls .jkr-touch-item.ready, .jkr-minimap-player-pulse { animation: none; }
		.jkr-course-option, .jkr-course-art, .jkr-start, .jkr-brand, .jkr-icon-button, .jkr-music, .jkr-modal-actions button, .jkr-modal > a { transition-duration: .01ms; }
	}
</style>
