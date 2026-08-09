<script lang="ts">
	import { Rocket } from 'lucide-svelte';
	import type { BattleAction, ChallengeOutcome } from '$lib/challenge';

	let {
		alienHealth,
		playerShields,
		action = 'idle',
		actionId = 0,
		outcome = null,
		compact = false,
		locked = false
	}: {
		alienHealth: number;
		playerShields: number;
		action?: BattleAction;
		actionId?: number;
		outcome?: ChallengeOutcome;
		compact?: boolean;
		locked?: boolean;
	} = $props();

	let isDamaged = $derived(alienHealth <= 4);
	let isCritical = $derived(alienHealth <= 2);
	let playerCritical = $derived(playerShields === 1);
	const effectSparks = Array.from({ length: 8 }, (_, index) => index + 1);
	const debrisPieces = [1, 2, 3];
</script>


<div class={['battle-scene', { compact, locked }]} aria-hidden="true">
	<div class={['battle-camera', { 'player-action': action === 'hit', 'alien-action': action === 'counter' }]}>
		<span class="scene-star star-one"></span>
		<span class="scene-star star-two"></span>
		<span class="scene-star star-three"></span>
		<span class="scene-star star-four"></span>
		<span class="space-horizon"></span>
		<span class="combat-platform enemy-platform"></span>
		<span class="combat-platform player-platform"></span>

		<div class={['alien-position', { defeated: outcome === 'victory' }]}>
			<div class={['alien-combat', { hit: action === 'hit', firing: action === 'counter', critical: isCritical }]}>
				<span class="tractor-glow"></span>
				<div class="alien-craft">
					<div class="alien-dome">
						<span class="dome-shine"></span>
						<div class="alien-pilot">
							<span class="alien-eye eye-left"></span>
							<span class="alien-eye eye-right"></span>
							<span class="alien-mouth"></span>
						</div>
					</div>
					<div class="saucer-rim">
						<span class="saucer-light light-one"></span>
						<span class="saucer-light light-two"></span>
						<span class="saucer-light light-three"></span>
					</div>
					<div class="saucer-base"></div>
					{#if isDamaged}<span class="hull-crack crack-one"></span>{/if}
					{#if isCritical}
						<span class="hull-crack crack-two"></span>
						<span class="damage-smoke smoke-one"></span>
						<span class="damage-smoke smoke-two"></span>
					{/if}
				</div>
			</div>
		</div>

		<div class="player-position">
			<div
				class={[
					'player-ship',
					{
						firing: action === 'hit',
						countered: action === 'counter',
						disabled: outcome === 'defeat',
						critical: playerCritical
					}
				]}
			>
				<span class="rocket-flame"></span>
				<span class="player-rocket"><Rocket size={82} strokeWidth={2.3} /></span>
			</div>
		</div>

		{#key actionId}
			{#if action === 'hit'}
				<span class="muzzle-flash player-muzzle-flash"></span>
				<span class="player-bolt"></span>
				<span class="impact-effect alien-impact">
					<i class="impact-core"></i>
					<i class="impact-ring"></i>
					{#each effectSparks as spark (spark)}
						<i class={`impact-spark spark-${spark}`}></i>
					{/each}
					{#each debrisPieces as piece (piece)}
						<i class={`impact-debris debris-${piece}`}></i>
					{/each}
				</span>
			{:else if action === 'counter'}
				<span class="muzzle-flash alien-muzzle-flash"></span>
				<span class="alien-bolt"></span>
				<span class="impact-effect player-impact">
					<i class="impact-core"></i>
					<i class="impact-ring"></i>
					{#each effectSparks as spark (spark)}
						<i class={`impact-spark spark-${spark}`}></i>
					{/each}
					{#each debrisPieces as piece (piece)}
						<i class={`impact-debris debris-${piece}`}></i>
					{/each}
				</span>
			{/if}
		{/key}

		{#if outcome === 'victory'}
			<span class="terminal-burst alien-burst-one"></span>
			<span class="terminal-burst alien-burst-two"></span>
		{:else if outcome === 'defeat'}
			<span class="terminal-burst player-burst-one"></span>
			<span class="terminal-burst player-burst-two"></span>
		{/if}
	</div>
</div>

<style>
	.battle-scene {
		position: relative;
		width: 100%;
		aspect-ratio: 2 / 1;
		overflow: hidden;
		border-radius: 28px;
		background:
			radial-gradient(circle at 74% 22%, rgba(141, 117, 255, 0.2), transparent 29%),
			linear-gradient(to bottom, transparent 58%, rgba(68, 55, 145, 0.13) 58%, rgba(14, 22, 48, 0.55)),
			#0a1125;
		box-shadow:
			inset 0 0 0 1px rgba(255, 255, 255, 0.08),
			inset 0 -28px 55px rgba(0, 0, 0, 0.18);
	}

	.battle-camera {
		position: absolute;
		inset: 0;
		transform-origin: center;
	}

	.battle-camera.player-action {
		animation: cameraKickLeft 250ms 310ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
		will-change: transform;
	}

	.battle-camera.alien-action {
		animation: cameraKickRight 250ms 310ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
		will-change: transform;
	}

	.battle-scene.compact {
		border-radius: 24px;
	}

	.battle-scene.compact .alien-position.defeated {
		animation: none;
		opacity: 0.34;
		transform: translate3d(18%, -10%, 0) rotate(12deg) scale(0.76);
	}

	.battle-scene.compact .player-ship.disabled {
		animation: none;
		opacity: 0.38;
		transform: translate3d(-15%, 22%, 0) rotate(91deg) scale(0.82);
		filter: grayscale(0.6);
	}

	.battle-scene.locked {
		filter: saturate(0.55);
	}

	.scene-star {
		position: absolute;
		width: 4px;
		aspect-ratio: 1;
		border-radius: 50%;
		background: white;
		box-shadow: 0 0 10px rgba(255, 255, 255, 0.72);
		opacity: 0.72;
	}

	.star-one { left: 9%; top: 18%; }
	.star-two { left: 43%; top: 12%; width: 3px; opacity: 0.45; }
	.star-three { right: 10%; top: 57%; width: 3px; background: var(--lime); }
	.star-four { left: 58%; bottom: 9%; width: 2px; opacity: 0.5; }

	.space-horizon {
		position: absolute;
		left: -8%;
		right: -8%;
		bottom: -42%;
		height: 63%;
		border: 1px solid rgba(167, 221, 237, 0.13);
		border-radius: 50% 50% 0 0;
		background: rgba(27, 38, 75, 0.46);
		box-shadow: inset 0 18px 35px rgba(167, 221, 237, 0.045);
	}

	.combat-platform { position: absolute; z-index: 1; height: 5%; border-radius: 50%; background: rgba(167, 221, 237, 0.12); filter: blur(1px); }
	.enemy-platform { right: 11%; top: 67%; width: 31%; }
	.player-platform { left: 8%; bottom: 9%; width: 22%; background: rgba(214, 242, 71, 0.1); }

	.alien-position {
		position: absolute;
		right: 9%;
		top: 14%;
		width: 38%;
		aspect-ratio: 1.7;
		animation: alienDrift 3.4s ease-in-out infinite alternate;
		transform-origin: center;
	}

	.alien-combat {
		position: absolute;
		inset: 0;
		transform-origin: center;
	}

	.alien-combat.hit {
		animation: alienHit 650ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
		will-change: transform, filter;
	}

	.alien-combat.firing {
		animation: alienFires 430ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
		will-change: transform;
	}

	.alien-position.defeated {
		animation: alienDefeated 1120ms 390ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
		will-change: transform, opacity, filter;
	}

	.tractor-glow {
		position: absolute;
		left: 20%;
		right: 20%;
		top: 60%;
		height: 54%;
		background: linear-gradient(to bottom, rgba(167, 221, 237, 0.18), transparent);
		clip-path: polygon(25% 0, 75% 0, 100% 100%, 0 100%);
		filter: blur(6px);
		opacity: 0.65;
	}

	.alien-craft {
		position: absolute;
		inset: 0;
		filter: drop-shadow(0 12px 0 rgba(44, 29, 117, 0.65)) drop-shadow(0 18px 25px rgba(0, 0, 0, 0.34));
		transition-property: filter;
		transition-duration: 220ms;
		transition-delay: 300ms;
		transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
	}

	.alien-combat.critical .alien-craft {
		filter: drop-shadow(0 12px 0 rgba(174, 48, 52, 0.58)) drop-shadow(0 0 19px rgba(255, 98, 98, 0.3));
	}

	.alien-combat.firing .saucer-light {
		animation: saucerLightVolley 320ms ease-out both;
	}

	.alien-dome {
		position: absolute;
		left: 28%;
		top: 2%;
		width: 44%;
		height: 58%;
		overflow: hidden;
		border-radius: 50% 50% 34% 34%;
		background: var(--sky);
		box-shadow: inset -12px -9px 0 rgba(37, 99, 118, 0.18);
	}

	.dome-shine {
		position: absolute;
		left: 18%;
		top: 13%;
		width: 34%;
		height: 16%;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.52);
		transform: rotate(-18deg);
	}

	.alien-pilot {
		position: absolute;
		left: 50%;
		bottom: -8%;
		width: 48%;
		aspect-ratio: 0.9;
		border-radius: 52% 52% 44% 44%;
		background: var(--lime);
		box-shadow: inset -7px -5px 0 rgba(93, 109, 0, 0.18);
		transform: translateX(-50%);
	}

	.alien-eye {
		position: absolute;
		top: 34%;
		width: 16%;
		height: 29%;
		border-radius: 50%;
		background: var(--deep);
	}

	.eye-left { left: 22%; transform: rotate(13deg); }
	.eye-right { right: 22%; transform: rotate(-13deg); }
	.alien-mouth { position: absolute; left: 42%; bottom: 20%; width: 16%; height: 4%; border-radius: 99px; background: rgba(10, 17, 37, 0.62); }

	.saucer-rim {
		position: absolute;
		left: 4%;
		right: 4%;
		top: 47%;
		height: 35%;
		border-radius: 50%;
		background: var(--violet);
		box-shadow: inset -18px -12px 0 rgba(58, 38, 155, 0.24), inset 0 7px 0 rgba(255, 255, 255, 0.13);
	}

	.saucer-base {
		position: absolute;
		left: 23%;
		right: 23%;
		bottom: 2%;
		height: 25%;
		border-radius: 10% 10% 50% 50%;
		background: #5940cf;
	}

	.saucer-light {
		position: absolute;
		bottom: 17%;
		width: 7%;
		aspect-ratio: 1;
		border-radius: 50%;
		background: var(--gold);
		box-shadow: 0 0 9px rgba(255, 212, 90, 0.62);
	}

	.light-one { left: 23%; }
	.light-two { left: 47%; background: var(--coral); box-shadow: 0 0 9px rgba(255, 98, 98, 0.62); }
	.light-three { right: 23%; }

	.hull-crack {
		position: absolute;
		z-index: 3;
		width: 17%;
		height: 20%;
		border-left: 3px solid var(--coral);
		border-bottom: 3px solid var(--coral);
		filter: drop-shadow(0 0 5px rgba(255, 98, 98, 0.7));
		opacity: 0;
		animation: crackReveal 260ms 300ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
	}

	.crack-one { right: 26%; top: 51%; transform: skew(-23deg) rotate(-9deg); }
	.crack-two { left: 26%; top: 58%; transform: scaleX(-1) skew(-23deg) rotate(-3deg); }

	.damage-smoke {
		position: absolute;
		z-index: 4;
		width: 10%;
		aspect-ratio: 1;
		border-radius: 50%;
		background: rgba(201, 210, 224, 0.5);
		box-shadow: 9px -5px 0 rgba(127, 138, 163, 0.34), 16px -12px 0 rgba(91, 101, 128, 0.18);
		opacity: 0;
		filter: blur(1px);
		animation: damageSmoke 1.65s 430ms ease-out infinite;
	}

	.smoke-one { right: 18%; top: 34%; }
	.smoke-two { left: 25%; top: 50%; animation-delay: 1.1s; }

	.player-position {
		position: absolute;
		left: 12%;
		bottom: 14%;
		width: 14%;
		aspect-ratio: 1;
		display: grid;
		place-items: center;
		color: white;
		animation: playerEnter 520ms 120ms ease both;
	}

	.player-ship {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		transform: rotate(43deg);
		transform-origin: center;
		filter: drop-shadow(0 8px 14px rgba(0, 0, 0, 0.34));
		transition-property: filter;
		transition-duration: 220ms;
		transition-delay: 300ms;
		transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
	}

	.player-ship.firing {
		animation: playerFires 430ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
		will-change: transform;
	}

	.player-ship.countered {
		animation: playerCountered 600ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
		will-change: transform, filter;
	}

	.player-ship.disabled {
		animation: playerDefeated 1120ms 300ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
		will-change: transform, opacity, filter;
	}

	.player-ship.critical:not(.disabled) {
		filter: drop-shadow(0 0 12px rgba(255, 98, 98, 0.48));
	}

	.player-rocket { position: relative; z-index: 2; display: grid; place-items: center; }
	.player-rocket :global(svg) { width: clamp(60px, 7vw, 82px); height: auto; }

	.rocket-flame {
		position: absolute;
		left: 3%;
		bottom: 7%;
		width: 35%;
		height: 16%;
		border-radius: 50%;
		background: var(--lime);
		box-shadow: -8px 0 12px rgba(214, 242, 71, 0.46);
		animation: flamePulse 260ms ease-in-out infinite alternate;
	}

	.player-ship.firing .rocket-flame {
		animation: firingFlame 260ms ease-out both;
	}

	.player-ship.disabled .rocket-flame {
		animation: flameFailure 720ms 300ms ease-out both;
	}

	.player-bolt,
	.alien-bolt {
		position: absolute;
		z-index: 6;
		width: 19%;
		height: 8px;
		border-radius: 99px;
		transform-origin: center;
		pointer-events: none;
	}

	.player-bolt {
		left: 22%;
		bottom: 27%;
		background: linear-gradient(90deg, transparent 0%, var(--lime) 18%, white 64%, var(--sky) 100%);
		box-shadow: 0 0 5px white, 0 0 15px var(--lime), 0 0 28px rgba(214, 242, 71, 0.74);
		clip-path: polygon(0 50%, 18% 9%, 100% 31%, 100% 69%, 18% 91%);
		transform: rotate(-24deg);
		animation: playerShot 430ms cubic-bezier(0.2, 0.65, 0.3, 1) both;
		will-change: transform, opacity;
	}

	.player-bolt::before {
		content: '';
		position: absolute;
		right: 72%;
		top: 50%;
		width: 80%;
		height: 2px;
		background: linear-gradient(90deg, transparent, rgba(214, 242, 71, 0.82));
		box-shadow: 0 0 9px var(--lime);
		transform: translateY(-50%);
	}

	.player-bolt::after {
		content: '';
		position: absolute;
		right: 1%;
		top: 50%;
		width: 14px;
		aspect-ratio: 1;
		border-radius: 50%;
		background: white;
		box-shadow: 0 0 14px 5px rgba(167, 221, 237, 0.72);
		transform: translate(35%, -50%);
	}

	.alien-bolt {
		right: 27%;
		top: 42%;
		width: 17%;
		height: 10px;
		background: linear-gradient(90deg, var(--violet), white 48%, var(--coral));
		box-shadow: 0 0 5px white, 0 0 16px var(--coral), 0 0 30px rgba(141, 117, 255, 0.76);
		clip-path: polygon(0 32%, 77% 13%, 100% 50%, 77% 87%, 0 68%, 15% 50%);
		transform: rotate(-24deg);
		animation: alienShot 430ms cubic-bezier(0.2, 0.65, 0.3, 1) both;
		will-change: transform, opacity;
	}

	.alien-bolt::before,
	.alien-bolt::after {
		content: '';
		position: absolute;
		left: 4%;
		width: 82%;
		height: 2px;
		border-radius: 99px;
		background: var(--coral);
		box-shadow: 0 0 8px var(--coral);
	}

	.alien-bolt::before { top: -5px; transform: rotate(-6deg); }
	.alien-bolt::after { bottom: -5px; transform: rotate(6deg); }

	.muzzle-flash {
		position: absolute;
		z-index: 7;
		width: 7%;
		aspect-ratio: 1;
		clip-path: polygon(50% 0, 61% 32%, 86% 14%, 71% 40%, 100% 50%, 70% 60%, 86% 86%, 60% 69%, 50% 100%, 40% 69%, 14% 86%, 30% 60%, 0 50%, 30% 40%, 14% 14%, 40% 32%);
		opacity: 0;
		animation: muzzlePop 190ms ease-out both;
		pointer-events: none;
	}

	.player-muzzle-flash {
		left: 21%;
		bottom: 25%;
		background: white;
		box-shadow: 0 0 18px 8px rgba(214, 242, 71, 0.52);
	}

	.alien-muzzle-flash {
		right: 28%;
		top: 39%;
		background: var(--coral);
		box-shadow: 0 0 18px 8px rgba(141, 117, 255, 0.58);
	}

	.impact-effect {
		--impact-primary: var(--coral);
		--impact-secondary: var(--gold);
		position: absolute;
		z-index: 8;
		width: 14%;
		aspect-ratio: 1;
		pointer-events: none;
	}

	.alien-impact { right: 24%; top: 32%; }
	.player-impact {
		--impact-primary: var(--sky);
		--impact-secondary: var(--coral);
		left: 16%;
		bottom: 20%;
	}

	.impact-core,
	.impact-ring,
	.impact-spark,
	.impact-debris {
		position: absolute;
		left: 50%;
		top: 50%;
		display: block;
		opacity: 0;
	}

	.impact-core {
		width: 48%;
		aspect-ratio: 1;
		background: white;
		clip-path: polygon(50% 0, 61% 30%, 84% 9%, 72% 39%, 100% 50%, 71% 61%, 89% 86%, 60% 72%, 50% 100%, 39% 71%, 13% 88%, 29% 60%, 0 50%, 30% 39%, 12% 13%, 40% 29%);
		box-shadow: 0 0 24px 11px color-mix(in srgb, var(--impact-primary), transparent 25%);
		animation: impactCore 390ms 310ms ease-out both;
	}

	.impact-ring {
		width: 62%;
		aspect-ratio: 1;
		border: 4px solid var(--impact-primary);
		border-radius: 50%;
		box-shadow: 0 0 16px var(--impact-secondary), inset 0 0 11px var(--impact-secondary);
		animation: impactRing 460ms 320ms cubic-bezier(0.15, 0.65, 0.25, 1) both;
	}

	.impact-spark {
		--spark-angle: 0deg;
		--spark-distance: 42px;
		width: 5px;
		height: 17px;
		border-radius: 99px;
		background: linear-gradient(to top, var(--impact-primary), white);
		box-shadow: 0 0 8px var(--impact-secondary);
		transform-origin: 50% 100%;
		animation: sparkBurst 500ms 325ms cubic-bezier(0.12, 0.7, 0.25, 1) both;
	}

	.spark-1 { --spark-angle: 0deg; --spark-distance: 44px; }
	.spark-2 { --spark-angle: 45deg; --spark-distance: 51px; }
	.spark-3 { --spark-angle: 90deg; --spark-distance: 39px; }
	.spark-4 { --spark-angle: 135deg; --spark-distance: 49px; }
	.spark-5 { --spark-angle: 180deg; --spark-distance: 42px; }
	.spark-6 { --spark-angle: 225deg; --spark-distance: 53px; }
	.spark-7 { --spark-angle: 270deg; --spark-distance: 41px; }
	.spark-8 { --spark-angle: 315deg; --spark-distance: 48px; }

	.impact-debris {
		--debris-x: 30px;
		--debris-y: -28px;
		--debris-rotation: 160deg;
		width: 9px;
		height: 6px;
		border-radius: 2px;
		background: var(--impact-secondary);
		box-shadow: 0 0 6px var(--impact-primary);
		animation: debrisBurst 560ms 335ms cubic-bezier(0.12, 0.65, 0.25, 1) both;
	}

	.debris-2 { --debris-x: -38px; --debris-y: -19px; --debris-rotation: -210deg; width: 7px; }
	.debris-3 { --debris-x: 17px; --debris-y: 36px; --debris-rotation: 245deg; height: 8px; }

	.terminal-burst {
		position: absolute;
		z-index: 9;
		width: 9%;
		aspect-ratio: 1;
		border-radius: 50%;
		background: white;
		box-shadow: 0 0 0 8px rgba(255, 98, 98, 0.42), 0 0 29px 16px rgba(255, 212, 90, 0.38);
		opacity: 0;
		animation: terminalBurst 420ms ease-out both;
		pointer-events: none;
	}

	.terminal-burst::after {
		content: '';
		position: absolute;
		inset: -22%;
		border: 3px solid var(--gold);
		border-radius: 50%;
	}

	.alien-burst-one { right: 20%; top: 22%; animation-delay: 540ms; }
	.alien-burst-two { right: 39%; top: 43%; width: 7%; animation-delay: 760ms; }
	.player-burst-one { left: 11%; bottom: 14%; animation-delay: 490ms; }
	.player-burst-two { left: 22%; bottom: 30%; width: 6%; animation-delay: 710ms; }

	@keyframes alienDrift {
		from { transform: translate3d(-5px, -4px, 0) rotate(-2deg); }
		to { transform: translate3d(7px, 5px, 0) rotate(2deg); }
	}

	@keyframes cameraKickLeft {
		0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
		32% { transform: translate3d(-5px, 2px, 0) scale(1.008); }
		58% { transform: translate3d(3px, -1px, 0) scale(1.004); }
		78% { transform: translate3d(-2px, 1px, 0) scale(1.002); }
	}

	@keyframes cameraKickRight {
		0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
		32% { transform: translate3d(5px, -2px, 0) scale(1.008); }
		58% { transform: translate3d(-3px, 1px, 0) scale(1.004); }
		78% { transform: translate3d(2px, -1px, 0) scale(1.002); }
	}

	@keyframes alienHit {
		0%, 40% { transform: translate3d(0, 0, 0) rotate(0); }
		52% { transform: translate3d(9px, -2px, 0) rotate(5deg); filter: brightness(1.5); }
		64% { transform: translate3d(-8px, 3px, 0) rotate(-5deg); }
		78% { transform: translate3d(5px, 0, 0) rotate(3deg); }
		100% { transform: translate3d(0, 0, 0) rotate(0); filter: brightness(1); }
	}

	@keyframes alienFires {
		0%, 100% { transform: translate3d(0, 0, 0) rotate(0) scale(1); }
		18% { transform: translate3d(7px, -3px, 0) rotate(3deg) scale(0.97); }
		42% { transform: translate3d(-3px, 2px, 0) rotate(-1deg) scale(1.015); }
		68% { transform: translate3d(2px, -1px, 0) rotate(1deg) scale(1); }
	}

	@keyframes alienDefeated {
		0% { transform: translate3d(0, 0, 0) rotate(0) scale(1); opacity: 1; }
		36% { transform: translate3d(-8px, 4px, 0) rotate(-9deg) scale(0.98); opacity: 1; }
		100% { transform: translate3d(72%, -48%, 0) rotate(24deg) scale(0.35); opacity: 0; }
	}

	@keyframes playerEnter {
		from { opacity: 0; transform: translate3d(-12px, 12px, 0); }
		to { opacity: 1; transform: translate3d(0, 0, 0); }
	}

	@keyframes playerFires {
		0%, 100% { transform: translate3d(0, 0, 0) rotate(43deg) scale(1); }
		18% { transform: translate3d(-7px, 6px, 0) rotate(39deg) scale(0.96); }
		43% { transform: translate3d(3px, -2px, 0) rotate(45deg) scale(1.015); }
		68% { transform: translate3d(-1px, 1px, 0) rotate(42deg) scale(1); }
	}

	@keyframes playerCountered {
		0%, 40% { transform: translate3d(0, 0, 0) rotate(43deg); }
		55% { transform: translate3d(-8px, 6px, 0) rotate(35deg); filter: brightness(1.45); }
		68% { transform: translate3d(6px, -4px, 0) rotate(51deg); }
		82% { transform: translate3d(-3px, 2px, 0) rotate(39deg); }
		100% { transform: translate3d(0, 0, 0) rotate(43deg); filter: brightness(1); }
	}

	@keyframes playerDefeated {
		0% { opacity: 1; transform: translate3d(0, 0, 0) rotate(43deg) scale(1); filter: brightness(1); }
		16% { opacity: 1; transform: translate3d(-10px, 7px, 0) rotate(31deg) scale(0.96); filter: brightness(1.8); }
		34% { opacity: 1; transform: translate3d(7px, -4px, 0) rotate(58deg) scale(1.02); filter: brightness(1.05); }
		58% { opacity: 0.82; transform: translate3d(-12%, 17%, 0) rotate(91deg) scale(0.9); filter: grayscale(0.25); }
		100% { opacity: 0.3; transform: translate3d(-34%, 48%, 0) rotate(148deg) scale(0.7); filter: grayscale(0.72); }
	}

	@keyframes flamePulse {
		from { transform: scaleX(0.78); opacity: 0.66; }
		to { transform: scaleX(1.12); opacity: 1; }
	}

	@keyframes firingFlame {
		0% { opacity: 0.75; transform: scaleX(0.8); }
		28% { opacity: 1; transform: scaleX(1.65) scaleY(1.3); }
		100% { opacity: 0.82; transform: scaleX(1); }
	}

	@keyframes flameFailure {
		0%, 34% { opacity: 1; transform: scaleX(1); }
		52% { opacity: 0.85; transform: scaleX(0.48) scaleY(1.4); background: var(--coral); }
		70% { opacity: 0.35; transform: scaleX(0.72) scaleY(0.5); }
		100% { opacity: 0; transform: scaleX(0.12); }
	}

	@keyframes saucerLightVolley {
		0%, 100% { opacity: 1; scale: 1; }
		24% { opacity: 0.32; scale: 0.7; }
		46% { opacity: 1; scale: 1.55; }
		72% { opacity: 0.62; scale: 0.88; }
	}

	@keyframes crackReveal {
		0% { opacity: 0; scale: 0.35; }
		55% { opacity: 1; scale: 1.22; }
		100% { opacity: 1; scale: 1; }
	}

	@keyframes damageSmoke {
		0% { opacity: 0; transform: translate3d(0, 4px, 0) scale(0.45); }
		24% { opacity: 0.48; }
		100% { opacity: 0; transform: translate3d(15px, -28px, 0) scale(1.8); }
	}

	@keyframes playerShot {
		0% { opacity: 0; transform: translate3d(0, 0, 0) rotate(-24deg) scaleX(0.25); }
		12% { opacity: 1; }
		100% { opacity: 0; transform: translate3d(278%, -265%, 0) rotate(-24deg) scaleX(1); }
	}

	@keyframes alienShot {
		0% { opacity: 0; transform: translate3d(0, 0, 0) rotate(-24deg) scaleX(0.25); }
		12% { opacity: 1; }
		100% { opacity: 0; transform: translate3d(-260%, 250%, 0) rotate(-24deg) scaleX(1); }
	}

	@keyframes muzzlePop {
		0% { opacity: 0; transform: rotate(-12deg) scale(0.25); filter: blur(3px); }
		36% { opacity: 1; transform: rotate(4deg) scale(1.18); filter: blur(0); }
		100% { opacity: 0; transform: rotate(13deg) scale(0.62); filter: blur(1px); }
	}

	@keyframes impactCore {
		0% { opacity: 0; transform: translate(-50%, -50%) rotate(-10deg) scale(0.18); filter: blur(4px); }
		30% { opacity: 1; transform: translate(-50%, -50%) rotate(4deg) scale(1.28); filter: blur(0); }
		65% { opacity: 0.82; transform: translate(-50%, -50%) rotate(17deg) scale(0.88); filter: blur(0); }
		100% { opacity: 0; transform: translate(-50%, -50%) rotate(28deg) scale(1.55); filter: blur(3px); }
	}

	@keyframes impactRing {
		0% { opacity: 0; transform: translate(-50%, -50%) scale(0.18); }
		28% { opacity: 0.9; }
		100% { opacity: 0; transform: translate(-50%, -50%) scale(2.05); }
	}

	@keyframes sparkBurst {
		0% { opacity: 0; transform: translate(-50%, -100%) rotate(var(--spark-angle)) translateY(-4px) scaleY(0.25); }
		24% { opacity: 1; }
		100% { opacity: 0; transform: translate(-50%, -100%) rotate(var(--spark-angle)) translateY(calc(var(--spark-distance) * -1)) scaleY(0.62); }
	}

	@keyframes debrisBurst {
		0% { opacity: 0; transform: translate(-50%, -50%) rotate(0) scale(0.4); }
		22% { opacity: 1; }
		100% { opacity: 0; transform: translate(calc(-50% + var(--debris-x)), calc(-50% + var(--debris-y))) rotate(var(--debris-rotation)) scale(0.9); }
	}

	@keyframes terminalBurst {
		0% { opacity: 0; transform: scale(0.2); filter: blur(4px); }
		30% { opacity: 1; transform: scale(1.15); filter: blur(0); }
		100% { opacity: 0; transform: scale(1.75); filter: blur(3px); }
	}

	@media (max-width: 650px) {
		.battle-scene { aspect-ratio: 1.68 / 1; border-radius: 21px; }
		.alien-position { right: 5%; top: 15%; width: 49%; }
		.player-position { left: 9%; bottom: 13%; width: 18%; }
		.player-bolt { left: 23%; bottom: 26%; }
		.alien-bolt { right: 30%; top: 43%; }
		.alien-impact { right: 27%; top: 34%; }
		.player-impact { left: 14%; bottom: 17%; }
		.player-muzzle-flash { left: 20%; bottom: 24%; }
		.alien-muzzle-flash { right: 30%; top: 40%; }
	}

	@media (prefers-reduced-motion: reduce) {
		.battle-camera,
		.alien-position,
		.alien-combat,
		.alien-position.defeated,
		.player-position,
		.player-ship,
		.rocket-flame,
		.damage-smoke,
		.impact-core,
		.impact-ring,
		.impact-spark,
		.impact-debris,
		.terminal-burst {
			animation: none !important;
		}

		.alien-position.defeated { opacity: 0.22; }
		.player-ship.disabled { opacity: 0.35; }
		.player-bolt,
		.alien-bolt,
		.muzzle-flash,
		.damage-smoke,
		.impact-spark,
		.impact-debris,
		.terminal-burst { display: none; }
		.impact-core { opacity: 0.38; transform: translate(-50%, -50%); }
		.impact-ring { opacity: 0.28; transform: translate(-50%, -50%) scale(1.35); }
	}
</style>
