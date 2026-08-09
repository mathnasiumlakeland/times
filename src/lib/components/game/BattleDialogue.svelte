<script lang="ts">
	import { onMount } from 'svelte';

	let {
		speaker,
		text,
		speed = 20,
		oncharacter = () => {},
		oncomplete = () => {}
	}: {
		speaker: string;
		text: string;
		speed?: number;
		oncharacter?: (character: string, index: number) => void;
		oncomplete?: () => void;
	} = $props();

	let visibleText = $state('');
	let complete = $state(false);
	let timer: number | undefined;

	onMount(() => {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			finishTyping();
			return;
		}

		let index = 0;
		timer = window.setInterval(() => {
			const character = text[index];
			visibleText += character;
			if (character.trim() && index % 2 === 0) oncharacter(character, index);
			index += 1;
			if (index >= text.length) finishTyping();
		}, speed);

		return () => {
			if (timer !== undefined) window.clearInterval(timer);
		};
	});

	function finishTyping() {
		if (timer !== undefined) window.clearInterval(timer);
		timer = undefined;
		visibleText = text;
		if (complete) return;
		complete = true;
		oncomplete();
	}
</script>

<div class="battle-dialogue">
	<span class="speaker-plate">{speaker}</span>
	<button
		class="dialogue-copy"
		type="button"
		onclick={finishTyping}
		aria-label={complete ? `${speaker}: ${text}` : `Reveal full dialogue from ${speaker}`}
	>
		<span class="dialogue-measure" aria-hidden="true">{text}</span>
		<span class="dialogue-typed" aria-hidden="true">{visibleText}<i class:complete></i></span>
	</button>
	<span class="dialogue-hint" aria-hidden="true">{complete ? 'Awaiting command' : 'Tap to reveal'}</span>
	<span class="sr-only" role="status">{speaker}: {text}</span>
</div>

<style>
	.battle-dialogue {
		position: relative;
		min-height: 112px;
		padding: 27px 23px 19px;
		border-radius: 8px 8px 20px 20px;
		color: white;
		background: #171335;
		box-shadow:
			inset 0 0 0 2px rgba(255, 255, 255, 0.09),
			inset 0 0 0 6px rgba(141, 117, 255, 0.12),
			0 9px 0 #080d1c,
			0 20px 35px rgba(0, 0, 0, 0.24);
	}

	.speaker-plate {
		position: absolute;
		left: 17px;
		top: -13px;
		max-width: calc(100% - 34px);
		padding: 7px 12px 6px;
		overflow: hidden;
		border-radius: 8px;
		color: var(--deep);
		background: var(--lime);
		box-shadow: 0 4px 0 #829600;
		font-family: 'Space Grotesk', sans-serif;
		font-size: 10px;
		font-weight: 900;
		letter-spacing: 0.11em;
		text-overflow: ellipsis;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.dialogue-copy {
		position: relative;
		width: 100%;
		min-height: 48px;
		padding: 0 0 17px;
		cursor: pointer;
		border: 0;
		color: inherit;
		background: transparent;
		font-family: 'Space Grotesk', sans-serif;
		font-size: clamp(15px, 2vw, 18px);
		font-weight: 650;
		line-height: 1.48;
		text-align: left;
		text-wrap: pretty;
	}

	.dialogue-copy:active { scale: 0.99; }
	.dialogue-measure { display: block; visibility: hidden; }
	.dialogue-typed { position: absolute; inset: 0 0 auto; }

	.dialogue-typed i {
		display: inline-block;
		width: 8px;
		height: 15px;
		margin-left: 3px;
		vertical-align: -2px;
		background: var(--lime);
		animation: cursorBlink 620ms steps(1) infinite;
	}

	.dialogue-typed i.complete {
		width: 0;
		height: 0;
		border-left: 6px solid transparent;
		border-right: 6px solid transparent;
		border-top: 8px solid var(--lime);
		background: transparent;
		animation: commandNudge 620ms ease-in-out infinite alternate;
	}

	.dialogue-hint {
		position: absolute;
		right: 18px;
		bottom: 12px;
		color: #7f89a1;
		font-size: 8px;
		font-weight: 900;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

	@keyframes cursorBlink { 50% { opacity: 0; } }
	@keyframes commandNudge { from { transform: translateY(-1px); } to { transform: translateY(2px); } }

	@media (max-width: 650px) {
		.battle-dialogue { min-height: 102px; padding: 25px 17px 17px; border-radius: 7px 7px 17px 17px; }
		.dialogue-copy { min-height: 53px; font-size: 14px; }
	}

	@media (prefers-reduced-motion: reduce) {
		.dialogue-typed i { animation: none; }
	}
</style>
