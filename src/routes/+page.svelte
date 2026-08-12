<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { resolve } from '$app/paths';
	import type { Attachment } from 'svelte/attachments';
	import { SvelteSet } from 'svelte/reactivity';
	import {
		ArrowLeft,
		ArrowRight,
		BookOpen,
		Check,
		Flame,
		Gamepad2,
		Home,
		Keyboard,
		Lightbulb,
		LockKeyhole,
		Music,
		MousePointer2,
		Crown,
		Map as MapIcon,
		Rocket,
		RotateCcw,
		RefreshCw,
		Shield,
		Sparkles,
		Star,
		Target,
		Trophy,
		Volume2,
		VolumeX,
		X
	} from 'lucide-svelte';
	import AlienBattleScene from '$lib/components/game/AlienBattleScene.svelte';
	import BattleDialogue from '$lib/components/game/BattleDialogue.svelte';
	import NumberedMedal from '$lib/components/game/NumberedMedal.svelte';
	import StoryMap from '$lib/components/game/StoryMap.svelte';
	import Button from '$lib/components/ui/button/Button.svelte';
	import { BattleAudio } from '$lib/battle-audio';
	import {
		ALIEN_MAX_HEALTH,
		PLAYER_MAX_SHIELDS,
		makeChallengeTableSequence,
		resolveChallengeAttempt,
		type BattleAction,
		type ChallengeOutcome
	} from '$lib/challenge';
	import { destroyHaptics, initializeHaptics, triggerHaptic } from '$lib/haptics';
	import { makeEmptyGameProgress, normalizeGameProgress, type GameProgress } from '$lib/game-progress';
	import { MidiPlayer } from '$lib/midi-player';
	import { makePracticeExample, type PracticeExample } from '$lib/practice-strategies';
	import { getQuestionProgressPercent, makeQuestionSequence, type MultiplicationQuestion } from '$lib/question-sequence';
	import {
		STORY_NODES,
		STORY_TRAVEL_TIMING,
		getStoryProgress,
		getStoryTravelFlightMs,
		recordStoryResult,
		type StoryBossNode,
		type StoryNode,
		type StoryTravel
	} from '$lib/story';

	type GameMode = 'home' | 'quiz' | 'result' | 'challenge' | 'challenge-result';
	type HomeView = 'story' | 'free-play';
	type SessionOrigin = 'story' | 'free-play';
	type ChallengePhase = 'intro' | 'battle';
	type ChallengeTransition = 'next-question' | 'victory' | 'defeat' | null;
	type Difficulty = 'easy' | 'hard';
	type SoundName = 'correct' | 'incorrect' | 'complete' | 'click' | 'click-release';
	type MusicKind = 'regular' | 'boss';
	const totalQuestions = 10;
	const challengeDialogueHoldMs = 900;
	const challengeTerminalHoldMs = 1100;
	const progressStorageKey = 'multiply-mission-progress';
	const tables = Array.from({ length: 12 }, (_, index) => index + 1);
	const soundUrls: Record<SoundName, string> = {
		correct: '/audio/duolingo-correct.mp3',
		incorrect: '/audio/duolingo-incorrect.mp3',
		complete: '/audio/duolingo-complete.mp3',
		click: '/audio/click.wav',
		'click-release': '/audio/click-release.wav'
	};
	const soundVolumes: Partial<Record<SoundName, number>> = {
		click: 0.13125,
		'click-release': 0.13125
	};
	const sounds: Partial<Record<SoundName, HTMLAudioElement>> = {};
	const regularMusicUrl = '/audio/kk-slider-aircheck.mid';
	const bossBattleMusicUrl = '/audio/story-boss-battle-theme.mid';
	const badgeNames = [
		'First Orbit',
		'Double Trouble',
		'Triple Spark',
		'Four-titude',
		'High Five',
		'Six Shooter',
		'Lucky Seven',
		'Octo Ace',
		'Cloud Nine',
		'Power of Ten',
		'Prime Pilot',
		'Dozen Dynamo'
	];

	let mode = $state<GameMode>('home');
	let homeView = $state<HomeView>('story');
	let sessionOrigin = $state<SessionOrigin>('free-play');
	let selectedDifficulty = $state<Difficulty>('easy');
	let storyDifficulty = $state<Difficulty>('easy');
	let sessionDifficulty = $state<Difficulty>('easy');
	let activeTable = $state(1);
	let selectedTables = $state<number[]>([8]);
	let sessionTables = $state<number[]>([1]);
	let questions = $state<MultiplicationQuestion[]>([]);
	let questionIndex = $state(0);
	let score = $state(0);
	let streak = $state(0);
	let bestStreak = $state(0);
	let wrongAnswers = $state<number[]>([]);
	let typedAnswer = $state<number | undefined>(undefined);
	let hardInputStatus = $state<'idle' | 'wrong' | 'correct'>('idle');
	let hardInput = $state<HTMLInputElement>();
	let feedback = $state<'correct' | 'wrong' | null>(null);
	let wrongAttemptCount = $state(0);
	let coachOpen = $state(false);
	let coachExample = $state<PracticeExample | null>(null);
	let orbitProblems = $state<[string, string]>(['7 × 8', '12 × 4']);
	let progress = $state<GameProgress>(makeEmptyGameProgress());
	let activeStoryNodeId = $state<string | null>(null);
	let storyTravel = $state<StoryTravel | null>(null);
	let storyRocketIndex = $state(0);
	let storyTravelId = 0;
	let alienHealth = $state(ALIEN_MAX_HEALTH);
	let playerShields = $state(PLAYER_MAX_SHIELDS);
	let challengeAction = $state<BattleAction>('idle');
	let challengeActionId = $state(0);
	let challengeOutcome = $state<ChallengeOutcome>(null);
	let challengeEnding = $state(false);
	let challengeAnimating = $state(false);
	let challengePhase = $state<ChallengePhase>('intro');
	let battleDialogue = $state({ id: 0, speaker: 'MISSION CONTROL', text: '' });
	let battleDialogueComplete = $state(false);
	let rocketBoostFrame: number | undefined;
	let feedbackTimer: number | undefined;
	let combatTimer: number | undefined;
	let pendingChallengeTransition: ChallengeTransition = null;
	let regularMusicPlayer: MidiPlayer | undefined;
	let bossMusicPlayer: MidiPlayer | undefined;
	let battleAudio: BattleAudio | undefined;
	let currentMusicKind: MusicKind = 'regular';
	let musicReady: Record<MusicKind, boolean> = { regular: false, boss: false };
	let musicPlaybackId = 0;
	let musicMutedByUser = false;
	let pendingMusicMode: GameMode | null = null;
	let musicStatus = $state<'off' | 'loading' | 'playing' | 'unavailable'>('loading');
	const captureHardInput: Attachment<HTMLInputElement> = (element) => {
		hardInput = element;
		return () => {
			if (hardInput === element) hardInput = undefined;
		};
	};

	function loadSavedProgress() {
		try {
			const saved = localStorage.getItem(progressStorageKey);
			return saved ? normalizeGameProgress(JSON.parse(saved)) : null;
		} catch {
			try {
				localStorage.removeItem(progressStorageKey);
			} catch {
				// Storage can be unavailable in restricted browsing modes; play can continue in memory.
			}
			return null;
		}
	}

	function saveProgress() {
		try {
			localStorage.setItem(progressStorageKey, JSON.stringify(progress));
		} catch {
			// Completing a mission should never depend on storage permission or available quota.
		}
	}

	let currentQuestion = $derived(questions[questionIndex] ?? { table: activeTable, multiplier: 1 });
	let correctAnswer = $derived(currentQuestion.table * currentQuestion.multiplier);
	let progressPercent = $derived(getQuestionProgressPercent(questionIndex, totalQuestions, feedback === 'correct'));
	let answerOptions = $derived.by(() => makeOptions(correctAnswer, currentQuestion.table));
	let earnedStars = $derived(score >= 9 ? 3 : score >= 7 ? 2 : score >= 5 ? 1 : 0);
	let accuracy = $derived(Math.round((score / totalQuestions) * 100));
	let isSingleTable = $derived(sessionTables.length === 1);
	let sessionLabel = $derived(sessionOrigin === 'story'
		? `Story ${sessionDifficulty === 'hard' ? 'Hard' : 'Easy'} · ×${sessionTables[0]} planet`
		: `${sessionDifficulty === 'hard' ? 'Hard' : 'Easy'} · ${isSingleTable ? `×${sessionTables[0]} mission` : `${sessionTables.length} tables mixed`}`
	);
	let resultTitle = $derived.by(() => {
		if (sessionOrigin === 'story') return earnedStars === 0 ? 'Refuel and retry!' : 'Planet cleared!';
		return earnedStars === 0
			? 'One more orbit!'
			: isSingleTable
				? sessionDifficulty === 'hard'
					? `Master ${badgeNames[sessionTables[0] - 1]}`
					: badgeNames[sessionTables[0] - 1]
				: sessionDifficulty === 'hard' ? 'Hard mix mastered' : 'Mixed mission mastered';
	});
	let resultDescription = $derived.by(() => {
		if (sessionOrigin === 'story') {
			return earnedStars === 0
				? `Score 5 or more in ${sessionDifficulty} mode to chart a safe route beyond the ×${sessionTables[0]} planet.`
				: `The ×${sessionTables[0]} planet is secure in ${sessionDifficulty} mode. Your next destination is now on the map.`;
		}
		if (!isSingleTable) return `You practiced ${sessionTables.map((table) => `×${table}`).join(', ')} in ${sessionDifficulty} mode.`;
		if (earnedStars === 0) return `Score 5 or more to unlock the ${sessionDifficulty === 'hard' ? 'Master' : 'Easy'} ×${sessionTables[0]} badge.`;
		return sessionDifficulty === 'hard'
			? `You earned the Master ×${sessionTables[0]} badge by typing every answer.`
			: `You conquered the ${sessionTables[0]} times table in Easy mode.`;
	});
	let storyRoute = $derived(getStoryProgress(progress.story));
	let activeStoryNode = $derived(STORY_NODES.find((node) => node.id === activeStoryNodeId));
	let activeStoryBoss = $derived(activeStoryNode?.kind === 'boss' ? activeStoryNode : undefined);
	let bossName = $derived(activeStoryBoss?.bossName ?? 'Alien guardian');
	let alienHits = $derived(ALIEN_MAX_HEALTH - alienHealth);
	let challengeResultTitle = $derived(challengeOutcome === 'victory' ? `${bossName} defeated!` : `${bossName} held the gate!`);
	let challengeResultDescription = $derived(
		challengeOutcome === 'victory'
			? `You broke all ${ALIEN_MAX_HEALTH} shield cells. The route to the next sector is open.`
			: `You landed ${alienHits} ${alienHits === 1 ? 'hit' : 'hits'} before your shields ran out. Repair, reload, and try again.`
	);

	onMount(() => {
		initializeHaptics();
		orbitProblems = makeOrbitProblems();
		regularMusicPlayer = new MidiPlayer(0.78);
		bossMusicPlayer = new MidiPlayer(0.94);
		battleAudio = new BattleAudio();
		void Promise.allSettled([
			regularMusicPlayer.load(regularMusicUrl),
			bossMusicPlayer.load(bossBattleMusicUrl)
		]).then(([regularResult, bossResult]) => {
			musicReady = {
				regular: regularResult.status === 'fulfilled',
				boss: bossResult.status === 'fulfilled'
			};
			musicStatus = musicReady.regular || musicReady.boss ? 'off' : 'unavailable';
			const requestedMode = pendingMusicMode;
			pendingMusicMode = null;
			if (requestedMode && !musicMutedByUser) void playMusicForMode(requestedMode);
		});

		for (const [name, url] of Object.entries(soundUrls) as [SoundName, string][]) {
			const audio = new Audio(url);
			audio.preload = 'auto';
			audio.volume = soundVolumes[name] ?? 1;
			sounds[name] = audio;
		}

		const savedProgress = loadSavedProgress();
		if (savedProgress) {
			progress = savedProgress;
			storyRocketIndex = getStoryProgress(savedProgress.story).currentIndex;
		}

		return () => {
			if (feedbackTimer !== undefined) window.clearTimeout(feedbackTimer);
			if (combatTimer !== undefined) window.clearTimeout(combatTimer);
			musicPlaybackId += 1;
			regularMusicPlayer?.destroy();
			bossMusicPlayer?.destroy();
			battleAudio?.destroy();
			destroyHaptics();
		};
	});

	function playSound(name: SoundName) {
		const audio = sounds[name];
		if (!audio) return;
		audio.currentTime = 0;
		void audio.play().catch(() => {
			// Audio can be blocked until the first user interaction; gameplay continues silently.
		});
	}

	function playDialogueTick(character: string, index: number) {
		battleAudio?.playDialogueTick(character, index);
	}

	function setBattleDialogue(speaker: string, text: string) {
		battleDialogue = { id: battleDialogue.id + 1, speaker, text };
		battleDialogueComplete = false;
	}

	function getBossHitTaunt() {
		const taunts = activeStoryBoss?.hitTaunts ?? ['Drat! You got me that time.'];
		const hitIndex = Math.max(0, ALIEN_MAX_HEALTH - alienHealth - 1);
		return taunts[hitIndex % taunts.length];
	}

	function completeBattleDialogue() {
		battleDialogueComplete = true;
		if (pendingChallengeTransition) {
			const completedTransition = pendingChallengeTransition;
			scheduleFeedbackTransition(() => {
				pendingChallengeTransition = null;
				if (completedTransition === 'next-question') {
					nextChallengeQuestion();
					return;
				}
				void finishChallenge(completedTransition);
			}, completedTransition === 'next-question' ? challengeDialogueHoldMs : challengeTerminalHoldMs);
			return;
		}
		if (coachOpen) return;
		if (challengePhase === 'intro') {
			void tick().then(() => document.querySelector<HTMLButtonElement>('.begin-battle')?.focus());
			return;
		}
		focusChallengeCommand();
	}

	function musicKindForMode(targetMode: GameMode): MusicKind {
		return targetMode === 'challenge' || targetMode === 'challenge-result' ? 'boss' : 'regular';
	}

	function availableMusicKindForMode(targetMode: GameMode): MusicKind {
		const requested = musicKindForMode(targetMode);
		if (musicReady[requested]) return requested;
		return requested === 'boss' ? 'regular' : 'boss';
	}

	function pauseMusic() {
		regularMusicPlayer?.pause();
		bossMusicPlayer?.pause();
	}

	async function playMusicForMode(targetMode: GameMode) {
		if (musicStatus === 'loading') {
			pendingMusicMode = targetMode;
			return;
		}
		const nextMusicKind = availableMusicKindForMode(targetMode);
		const player = nextMusicKind === 'boss' ? bossMusicPlayer : regularMusicPlayer;
		if (!player || !musicReady[nextMusicKind]) {
			musicStatus = 'unavailable';
			return;
		}
		if (musicStatus === 'playing' && currentMusicKind === nextMusicKind && player.isPlaying) return;

		const playbackId = ++musicPlaybackId;
		pendingMusicMode = null;
		currentMusicKind = nextMusicKind;
		// Treat a user-approved AudioContext resume as active so a mode change can supersede it.
		musicStatus = 'playing';
		pauseMusic();
		try {
			await player.play();
			if (playbackId !== musicPlaybackId) {
				player.pause();
				return;
			}
			musicStatus = 'playing';
		} catch {
			if (playbackId === musicPlaybackId) musicStatus = 'unavailable';
		}
	}

	function switchMusicForMode(targetMode: GameMode) {
		if (musicStatus === 'loading') {
			if (pendingMusicMode) pendingMusicMode = targetMode;
			return;
		}
		if (musicStatus !== 'playing' || currentMusicKind === availableMusicKindForMode(targetMode)) return;
		void playMusicForMode(targetMode);
	}

	async function toggleBackgroundMusic() {
		if (!regularMusicPlayer || !bossMusicPlayer || musicStatus === 'loading' || musicStatus === 'unavailable') return;
		if (musicStatus === 'playing') {
			musicMutedByUser = true;
			pendingMusicMode = null;
			musicPlaybackId += 1;
			pauseMusic();
			musicStatus = 'off';
			return;
		}

		musicMutedByUser = false;
		await playMusicForMode(mode);
	}

	function shuffled<T>(items: T[]) {
		return [...items].sort(() => Math.random() - 0.5);
	}

	function makeOrbitProblem() {
		const table = Math.floor(Math.random() * 12) + 1;
		const multiplier = Math.floor(Math.random() * 12) + 1;
		return `${table} × ${multiplier}`;
	}

	function makeOrbitProblems(): [string, string] {
		const first = makeOrbitProblem();
		let second = makeOrbitProblem();
		while (second === first) second = makeOrbitProblem();
		return [first, second];
	}

	function rocketAnimationFrom(event: PointerEvent) {
		const rocketOrbit = (event.currentTarget as HTMLElement).closest<HTMLElement>('.orbit-rocket');
		return rocketOrbit?.getAnimations().find((animation) => animation.playState === 'running');
	}

	function startRocketAcceleration(event: PointerEvent) {
		const orbitAnimation = rocketAnimationFrom(event);
		if (!orbitAnimation) return;

		if (rocketBoostFrame !== undefined) cancelAnimationFrame(rocketBoostFrame);

		const accelerationStartedAt = performance.now();
		const startingRate = Math.max(1, orbitAnimation.playbackRate);

		const accelerate = (now: number) => {
			if (orbitAnimation.playState !== 'running') {
				rocketBoostFrame = undefined;
				return;
			}

			const elapsedSeconds = (now - accelerationStartedAt) / 1000;
			orbitAnimation.playbackRate = startingRate + Math.log1p(elapsedSeconds * 1.8) * 1.6;
			rocketBoostFrame = requestAnimationFrame(accelerate);
		};

		rocketBoostFrame = requestAnimationFrame(accelerate);
	}

	function releaseRocketAcceleration(event: PointerEvent) {
		const orbitAnimation = rocketAnimationFrom(event);
		if (!orbitAnimation) return;

		if (rocketBoostFrame !== undefined) cancelAnimationFrame(rocketBoostFrame);

		const slowdownStartedAt = performance.now();
		const startingRate = Math.max(1, orbitAnimation.playbackRate);
		const slowdownDuration = Math.min(1600, 550 + (startingRate - 1) * 180);

		const settleToCruise = (now: number) => {
			const progress = Math.min((now - slowdownStartedAt) / slowdownDuration, 1);
			const easedProgress = 1 - Math.pow(1 - progress, 3);
			orbitAnimation.playbackRate = startingRate + (1 - startingRate) * easedProgress;

			if (progress < 1) {
				rocketBoostFrame = requestAnimationFrame(settleToCruise);
			} else {
				orbitAnimation.playbackRate = 1;
				rocketBoostFrame = undefined;
			}
		};

		rocketBoostFrame = requestAnimationFrame(settleToCruise);
	}

	function makeOptions(answer: number, table: number) {
		const offsets = shuffled([-2, -1, 1, 2, 3, -3]);
		const options = new SvelteSet([answer]);
		for (const offset of offsets) {
			if (options.size === 4) break;
			const candidate = answer + offset * Math.max(1, Math.ceil(table / 3));
			if (candidate > 0) options.add(candidate);
		}
		return shuffled([...options]);
	}

	function scheduleFeedbackTransition(callback: () => void, delay = 700) {
		if (feedbackTimer !== undefined) window.clearTimeout(feedbackTimer);
		feedbackTimer = window.setTimeout(() => {
			feedbackTimer = undefined;
			callback();
		}, delay);
	}

	function resetAnswerState() {
		questionIndex = 0;
		score = 0;
		streak = 0;
		bestStreak = 0;
		wrongAnswers = [];
		typedAnswer = undefined;
		hardInputStatus = 'idle';
		feedback = null;
		wrongAttemptCount = 0;
		coachOpen = false;
		coachExample = null;
		if (feedbackTimer !== undefined) window.clearTimeout(feedbackTimer);
		feedbackTimer = undefined;
	}

	function showSessionFromTop() {
		const root = document.documentElement;
		const previousScrollBehavior = root.style.scrollBehavior;
		root.style.scrollBehavior = 'auto';
		window.scrollTo({ top: 0, behavior: 'auto' });
		window.requestAnimationFrame(() => {
			if (root.style.scrollBehavior === 'auto') root.style.scrollBehavior = previousScrollBehavior;
		});
	}

	function startQuiz(table: number) {
		startCustomQuiz([table], selectedDifficulty);
	}

	function startCustomQuiz(selection = selectedTables, difficulty = selectedDifficulty) {
		if (selection.length === 0) return;
		const chosen = [...selection].sort((a, b) => a - b);
		const tablePool: number[] = [];
		while (tablePool.length < totalQuestions) tablePool.push(...shuffled(chosen));
		sessionTables = chosen;
		sessionOrigin = 'free-play';
		activeStoryNodeId = null;
		sessionDifficulty = difficulty;
		activeTable = chosen[0];
		questions = makeQuestionSequence(tablePool.slice(0, totalQuestions));
		resetAnswerState();
		challengeOutcome = null;
		challengeEnding = false;
		challengeAction = 'idle';
		switchMusicForMode('quiz');
		mode = 'quiz';
		window.scrollTo({ top: 0, behavior: 'smooth' });
		focusQuizQuestion();
	}

	function startStoryNode(node: StoryNode) {
		const nodeIndex = STORY_NODES.findIndex((storyNode) => storyNode.id === node.id);
		if (nodeIndex > progress.story.completedNodeIds.length) return;
		storyTravel = null;
		activeStoryNodeId = node.id;
		if (node.kind === 'boss') {
			startChallenge(node);
			return;
		}

		const tablePool = Array.from({ length: totalQuestions }, () => node.table);
		sessionOrigin = 'story';
		sessionTables = [node.table];
		sessionDifficulty = storyDifficulty;
		activeTable = node.table;
		questions = makeQuestionSequence(tablePool);
		resetAnswerState();
		challengeOutcome = null;
		challengeEnding = false;
		challengeAction = 'idle';
		switchMusicForMode('quiz');
		mode = 'quiz';
		showSessionFromTop();
		focusQuizQuestion();
	}

	function playStoryMapTravel(nextTravel: StoryTravel) {
		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		battleAudio?.playStoryTravel({
			reducedMotion,
			flightMs: getStoryTravelFlightMs(nextTravel.fromIndex, nextTravel.toIndex),
			ignitionDelayMs: reducedMotion
				? 0
				: nextTravel.reason === 'selection'
				? STORY_TRAVEL_TIMING.selectionCameraMs
				: STORY_TRAVEL_TIMING.ignitionDelayMs
		});
	}

	function completeStoryMapTravel(completedTravel: StoryTravel) {
		storyRocketIndex = completedTravel.toIndex;
		if (completedTravel.reason === 'progression' && storyTravel?.id === completedTravel.id) {
			storyTravel = null;
		}
	}

	function startChallenge(boss: StoryBossNode) {
		const challengeTables = makeChallengeTableSequence([...boss.tables]);
		if (challengeTables.length === 0) return;

		storyTravel = null;
		sessionOrigin = 'story';
		activeStoryNodeId = boss.id;
		sessionTables = [...boss.tables];
		sessionDifficulty = storyDifficulty;
		activeTable = challengeTables[0];
		questions = makeQuestionSequence(challengeTables);
		resetAnswerState();
		alienHealth = ALIEN_MAX_HEALTH;
		playerShields = PLAYER_MAX_SHIELDS;
		challengeAction = 'idle';
		challengeActionId += 1;
		challengeOutcome = null;
		challengeEnding = false;
		challengeAnimating = false;
		pendingChallengeTransition = null;
		challengePhase = 'intro';
		setBattleDialogue(boss.bossName, boss.intro);
		mode = 'challenge';
		void battleAudio?.unlock().then(() => battleAudio?.playEncounter()).catch(() => {
			// Combat remains playable if this browser refuses Web Audio.
		});
		if (!musicMutedByUser) {
			if (musicStatus === 'loading') {
				void bossMusicPlayer?.unlock().catch(() => {
					// The queued play request gets another chance once the MIDI file has loaded.
				});
			}
			void playMusicForMode('challenge');
		}
		showSessionFromTop();
	}

	function beginChallengeBattle() {
		battleAudio?.playBattleReady();
		challengePhase = 'battle';
		setBattleDialogue(
			'MISSION CONTROL',
			`Solve ${currentQuestion.table} × ${currentQuestion.multiplier}. ${sessionDifficulty === 'hard' ? 'Type the answer' : 'Choose an answer'} to fire.`
		);
	}

	function lockChallengeAnimation(duration = 780) {
		if (combatTimer !== undefined) window.clearTimeout(combatTimer);
		challengeAnimating = true;
		combatTimer = window.setTimeout(() => {
			combatTimer = undefined;
			challengeAnimating = false;
			if (mode === 'challenge' && battleDialogueComplete && !challengeEnding && !pendingChallengeTransition) {
				focusChallengeCommand();
			}
		}, duration);
	}

	function toggleTable(table: number) {
		selectedTables = selectedTables.includes(table)
			? selectedTables.filter((item) => item !== table)
			: [...selectedTables, table].sort((a, b) => a - b);
	}

	function selectPreset(selection: number[]) {
		selectedTables = selection;
	}

	function isTableCompleted(table: number) {
		return (selectedDifficulty === 'hard' ? progress.hardCompleted : progress.completed).includes(table);
	}

	function tableBestScore(table: number) {
		return (selectedDifficulty === 'hard' ? progress.hardBestScores : progress.bestScores)[table];
	}

	function openCoach() {
		coachExample = makePracticeExample(currentQuestion.table, currentQuestion.multiplier);
		coachOpen = true;
		hardInput?.blur();
		void tick().then(() => document.querySelector<HTMLButtonElement>('.coach-primary')?.focus());
	}

	function refreshCoachExample() {
		coachExample = makePracticeExample(currentQuestion.table, currentQuestion.multiplier);
	}

	function closeCoach() {
		coachOpen = false;
		if (mode === 'challenge') {
			focusChallengeCommand();
		} else if (sessionDifficulty === 'hard') {
			focusHardInput();
		} else {
			void tick().then(() => document.querySelector<HTMLButtonElement>('.answer-button:not(:disabled)')?.focus());
		}
	}

	function chooseAnswer(answer: number) {
		if (mode === 'challenge') {
			chooseChallengeAnswer(answer);
			return;
		}
		if (feedback === 'correct' || (sessionDifficulty === 'easy' && wrongAnswers.includes(answer))) return;
		if (answer === correctAnswer) {
			const isFinalQuestion = questionIndex >= totalQuestions - 1;
			playSound(isFinalQuestion ? 'complete' : 'correct');
			if (isFinalQuestion) triggerHaptic('success');
			feedback = 'correct';
			hardInputStatus = 'correct';
			if (wrongAnswers.length === 0) {
				score += 1;
				streak += 1;
				bestStreak = Math.max(bestStreak, streak);
			}
			scheduleFeedbackTransition(isFinalQuestion ? finishQuiz : nextQuestion);
		} else {
			playSound('incorrect');
			feedback = 'wrong';
			hardInputStatus = 'wrong';
			if (!wrongAnswers.includes(answer)) wrongAnswers = [...wrongAnswers, answer];
			wrongAttemptCount += 1;
			streak = 0;
			if (wrongAttemptCount % 2 === 0) openCoach();
		}
	}

	function chooseChallengeAnswer(answer: number) {
		if (feedback === 'correct' || challengeEnding || challengeAnimating || (sessionDifficulty === 'easy' && wrongAnswers.includes(answer))) return;
		const firstWrongAttempt = wrongAnswers.length === 0;
		const nextBattle = resolveChallengeAttempt(
			{ alienHealth, playerShields, outcome: challengeOutcome },
			{ correct: answer === correctAnswer, firstWrongAttempt }
		);

		if (answer === correctAnswer) {
			const isVictory = nextBattle.outcome === 'victory';
			pendingChallengeTransition = isVictory ? 'victory' : 'next-question';
			lockChallengeAnimation();
			battleAudio?.playPlayerAttack(isVictory);
			if (isVictory) triggerHaptic('success');
			feedback = 'correct';
			hardInputStatus = 'correct';
			alienHealth = nextBattle.alienHealth;
			challengeOutcome = nextBattle.outcome;
			challengeAction = 'hit';
			challengeActionId += 1;
			setBattleDialogue('MISSION CONTROL', 'Direct hit!');
			if (firstWrongAttempt) {
				score += 1;
				streak += 1;
				bestStreak = Math.max(bestStreak, streak);
			}
			challengeEnding = isVictory;
			return;
		}

		feedback = 'wrong';
		hardInputStatus = 'wrong';
		if (!wrongAnswers.includes(answer)) wrongAnswers = [...wrongAnswers, answer];
		wrongAttemptCount += 1;
		streak = 0;
		if (nextBattle.playerShields !== playerShields) {
			lockChallengeAnimation();
			battleAudio?.playEnemyAttack(nextBattle.outcome === 'defeat');
			playerShields = nextBattle.playerShields;
			challengeOutcome = nextBattle.outcome;
			challengeAction = 'counter';
			challengeActionId += 1;
			setBattleDialogue(
				bossName,
				nextBattle.outcome === 'defeat' ? 'Your shields are gone. This sector remains under my control!' : `Missed! Returning fire. ${nextBattle.playerShields} ship ${nextBattle.playerShields === 1 ? 'shield remains' : 'shields remain'}.`
			);
		} else {
			battleAudio?.playRejectedCommand();
			setBattleDialogue('MISSION CONTROL', 'The counterattack already landed this turn. Recalculate and try again.');
		}
		if (nextBattle.outcome === 'defeat') {
			challengeEnding = true;
			pendingChallengeTransition = 'defeat';
		} else if (wrongAttemptCount % 2 === 0) {
			openCoach();
		}
	}

	function submitHardAnswer() {
		if (feedback === 'correct' || typedAnswer === undefined || !Number.isFinite(typedAnswer)) return;
		chooseAnswer(typedAnswer);
	}

	function handleHardInput() {
		if (feedback === 'wrong') feedback = null;
		hardInputStatus = 'idle';
	}

	function handleHardKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		submitHardAnswer();
	}

	function focusHardInput() {
		if (sessionDifficulty !== 'hard') return;
		void tick().then(() => hardInput?.focus({ preventScroll: true }));
	}

	function focusChallengeCommand() {
		if (sessionDifficulty === 'hard') {
			focusHardInput();
			return;
		}
		void tick().then(() => document.querySelector<HTMLButtonElement>('.jrpg-answer:not(:disabled)')?.focus());
	}

	function focusQuizQuestion() {
		if (sessionDifficulty === 'hard') {
			focusHardInput();
			return;
		}
		void tick().then(() => document.querySelector<HTMLElement>('.quiz-stage .equation')?.focus({ preventScroll: true }));
	}

	function nextQuestion() {
		if (questionIndex >= totalQuestions - 1) {
			finishQuiz();
			return;
		}
		questionIndex += 1;
		wrongAnswers = [];
		typedAnswer = undefined;
		hardInputStatus = 'idle';
		feedback = null;
		wrongAttemptCount = 0;
		coachOpen = false;
		coachExample = null;
		focusHardInput();
	}

	function nextChallengeQuestion() {
		if (questionIndex >= questions.length - 1) {
			finishChallenge(alienHealth === 0 ? 'victory' : 'defeat');
			return;
		}
		questionIndex += 1;
		wrongAnswers = [];
		typedAnswer = undefined;
		hardInputStatus = 'idle';
		feedback = null;
		wrongAttemptCount = 0;
		coachOpen = false;
		coachExample = null;
		challengeAnimating = false;
		pendingChallengeTransition = null;
		challengeAction = 'idle';
		setBattleDialogue(bossName, getBossHitTaunt());
	}

	function finishQuiz() {
		const finalScore = score;
		const stars = finalScore >= 9 ? 3 : finalScore >= 7 ? 2 : finalScore >= 5 ? 1 : 0;
		const isCompleted = stars > 0;
		if (sessionTables.length === 1) {
			const table = sessionTables[0];
			if (sessionOrigin === 'free-play' && sessionDifficulty === 'hard') {
				const wasCompleted = progress.hardCompleted.includes(table);
				progress = {
					...progress,
					hardCompleted: isCompleted && !wasCompleted ? [...progress.hardCompleted, table] : progress.hardCompleted,
					hardBestScores: { ...progress.hardBestScores, [table]: Math.max(progress.hardBestScores[table] ?? 0, finalScore) },
					totalStars: progress.totalStars + (isCompleted && !wasCompleted ? stars : 0)
				};
			} else if (sessionOrigin === 'free-play') {
				const wasCompleted = progress.completed.includes(table);
				progress = {
					...progress,
					completed: isCompleted && !wasCompleted ? [...progress.completed, table] : progress.completed,
					bestScores: { ...progress.bestScores, [table]: Math.max(progress.bestScores[table] ?? 0, finalScore) },
					totalStars: progress.totalStars + (isCompleted && !wasCompleted ? stars : 0)
				};
			}
			if (sessionOrigin === 'story' && activeStoryNodeId) {
				const previousCount = progress.story.completedNodeIds.length;
				const story = recordStoryResult(progress.story, activeStoryNodeId, finalScore, isCompleted);
				if (story.completedNodeIds.length > previousCount && previousCount < STORY_NODES.length - 1) {
					storyTravelId += 1;
					storyTravel = { id: storyTravelId, fromIndex: previousCount, toIndex: previousCount + 1, reason: 'progression' };
				}
				progress = { ...progress, story };
			}
			saveProgress();
		}
		mode = 'result';
		void tick().then(() => document.querySelector<HTMLElement>('#mission-result-title')?.focus());
	}

	async function finishChallenge(outcome: Exclude<ChallengeOutcome, null>) {
		pendingChallengeTransition = null;
		challengeOutcome = outcome;
		challengeEnding = true;
		const previousCount = progress.story.completedNodeIds.length;
		const story = activeStoryNodeId
			? recordStoryResult(progress.story, activeStoryNodeId, score, outcome === 'victory')
			: progress.story;
		if (story.completedNodeIds.length > previousCount && previousCount < STORY_NODES.length - 1) {
			storyTravelId += 1;
			storyTravel = { id: storyTravelId, fromIndex: previousCount, toIndex: previousCount + 1, reason: 'progression' };
		}
		progress = {
			...progress,
			challengeWins: progress.challengeWins + (outcome === 'victory' ? 1 : 0),
			challengeBestScore: Math.max(progress.challengeBestScore, score),
			story
		};
		saveProgress();
		mode = 'challenge-result';
		await tick();
		document.querySelector<HTMLElement>('#challenge-result-title')?.focus();
	}

	function scrollToPageTop(event?: MouseEvent) {
		if (event && (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
		event?.preventDefault();
		if (window.location.hash) {
			window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
		}
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	function goHome() {
		const pendingStoryTravel = sessionOrigin === 'story' ? storyTravel : null;
		const hasTravelAnimation = pendingStoryTravel !== null;
		if (pendingStoryTravel) {
			playStoryMapTravel(pendingStoryTravel);
		}
		if (feedbackTimer !== undefined) window.clearTimeout(feedbackTimer);
		feedbackTimer = undefined;
		if (combatTimer !== undefined) window.clearTimeout(combatTimer);
		combatTimer = undefined;
		coachOpen = false;
		challengeEnding = false;
		challengeAnimating = false;
		pendingChallengeTransition = null;
		switchMusicForMode('home');
		mode = 'home';
		if (sessionOrigin === 'story') {
			homeView = 'story';
			void tick().then(() => {
				const currentNode = STORY_NODES[getStoryProgress(progress.story).currentIndex];
				if (hasTravelAnimation) {
					const destination = document.querySelector<HTMLElement>(`#story-node-${currentNode.id}`);
					if (destination) {
						const destinationRect = destination.getBoundingClientRect();
						const centeredTop = window.scrollY + destinationRect.top - (window.innerHeight - destinationRect.height) / 2;
						const root = document.documentElement;
						const previousScrollBehavior = root.style.scrollBehavior;
						root.style.scrollBehavior = 'auto';
						window.scrollTo({ top: Math.max(0, centeredTop), behavior: 'auto' });
						window.requestAnimationFrame(() => root.style.scrollBehavior = previousScrollBehavior);
					}
					return;
				}
				document.querySelector('#story-map')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
				document.querySelector<HTMLButtonElement>(`#story-node-${currentNode.id}`)?.focus();
			});
		} else {
			scrollToPageTop();
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
		if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || (event.target instanceof HTMLElement && event.target.isContentEditable)) return;
		if (coachOpen) {
			if (event.key === 'Escape') closeCoach();
			return;
		}
		if ((mode !== 'quiz' && mode !== 'challenge') || sessionDifficulty === 'hard' || feedback === 'correct' || challengeEnding) return;
		if (mode === 'challenge' && (challengePhase !== 'battle' || !battleDialogueComplete || challengeAnimating)) return;
		const number = Number(event.key);
		if (number >= 1 && number <= answerOptions.length) chooseAnswer(answerOptions[number - 1]);
	}

	function handleButtonPressHaptic(event: PointerEvent) {
		if (!event.isTrusted || event.pointerType === 'mouse' || !(event.target instanceof Element)) return;
		const button = event.target.closest('button');
		if (button instanceof HTMLButtonElement && !button.disabled) triggerHaptic('tap');
	}
</script>

<svelte:head>
	<title>Multiply Mission | Master times tables 1–12</title>
	<meta
		name="description"
		content="A playful, gamified way to learn multiplication tables from 1 through 12."
	/>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />
<svelte:document onpointerdown={handleButtonPressHaptic} />

<button
	class:playing={musicStatus === 'playing'}
	class="music-toggle"
	type="button"
	onpointerdown={() => playSound('click')}
	onpointerup={() => playSound('click-release')}
	onpointercancel={() => playSound('click-release')}
	onclick={toggleBackgroundMusic}
	disabled={musicStatus === 'loading' || musicStatus === 'unavailable'}
	aria-pressed={musicStatus === 'playing'}
	aria-label={musicStatus === 'playing' ? 'Turn background music off' : 'Turn background music on'}
>
	{#if musicStatus === 'playing'}
		<Volume2 size={20} strokeWidth={2.5} />
		<span>Music on</span>
	{:else if musicStatus === 'loading'}
		<Music size={20} strokeWidth={2.5} />
		<span>Loading music</span>
	{:else if musicStatus === 'unavailable'}
		<VolumeX size={20} strokeWidth={2.5} />
		<span>Music unavailable</span>
	{:else}
		<VolumeX size={20} strokeWidth={2.5} />
		<span>Music off</span>
	{/if}
</button>

{#if mode === 'home'}
	<main class="home-page">
		<header class="site-header">
			<button class="brand" type="button" onclick={scrollToPageTop} aria-label="Multiply Mission home">
				<span class="brand-mark"><Rocket size={19} strokeWidth={2.6} /></span>
				<span>Multiply Mission</span>
			</button>
			<div class="header-stats">
				<div class="mini-stat" title={homeView === 'story' ? 'Story stages cleared' : 'Tables completed'}>
					{#if homeView === 'story'}<BookOpen size={17} />{:else}<Trophy size={17} />{/if}
					<strong>{homeView === 'story' ? storyRoute.completedCount : progress.completed.length + progress.hardCompleted.length}</strong><span>/ {homeView === 'story' ? STORY_NODES.length : 24}</span>
				</div>
				<div class="mini-stat flame-stat" title="Mission stars">
					<Star size={17} fill="currentColor" />
					<strong>{progress.totalStars}</strong>
				</div>
			</div>
		</header>

		<section class="hero">
			<div class="star-field" aria-hidden="true"></div>
			<div class="hero-copy">
				<div class="eyebrow"><Sparkles size={15} /> Your multiplication adventure</div>
				<h1>Blast through<br /><em>times tables.</em></h1>
				<p>Pick a number. Beat the clock. Collect every badge from 1 to 12.</p>
				<Button onclick={() => document.querySelector('#missions')?.scrollIntoView({ behavior: 'smooth' })}>
					Choose a mission <ArrowRight size={19} strokeWidth={2.7} />
				</Button>
				<div class="hero-note"><Target size={15} /> 10 quick questions per mission</div>
			</div>

			<div class="orbit-scene" aria-hidden="true">
				<div class="orbit orbit-one"></div>
				<div class="orbit orbit-two"></div>
				<div class="orbiter orbit-red">
					<span class="orbit-facing"><span class="orbit-dot dot-one"></span></span>
				</div>
				<div class="orbiter orbit-blue">
					<span class="orbit-facing"><span class="orbit-dot dot-two"></span></span>
				</div>
				<div class="planet">
					<div class="planet-shine"></div>
					<span class="planet-number">×</span>
					<span class="planet-crater crater-one"></span>
					<span class="planet-crater crater-two"></span>
				</div>
				<div class="orbiter orbit-rocket">
					<span
						class="orbit-facing rocket-wrap"
						role="presentation"
						onpointerenter={startRocketAcceleration}
						onpointerleave={releaseRocketAcceleration}
						onpointercancel={releaseRocketAcceleration}
					>
						<span class="rocket-icon"><Rocket size={57} strokeWidth={2.1} /></span>
					</span>
				</div>
				<div class="orbiter orbit-problem orbit-problem-one">
					<span class="orbit-facing"><span class="math-spark">{orbitProblems[0]}</span></span>
				</div>
				<div class="orbiter orbit-problem orbit-problem-two">
					<span class="orbit-facing"><span class="math-spark">{orbitProblems[1]}</span></span>
				</div>
			</div>
		</section>

		<section class="play-mode-hub" id="missions" aria-labelledby="play-mode-title">
			<div class="play-mode-heading">
				<span class="section-kicker">Choose your route</span>
				<h2 id="play-mode-title">How do you want to train?</h2>
				<p>Follow the campaign one planet at a time, or build any mission you want.</p>
			</div>
			<div class="play-mode-tabs" role="group" aria-label="Game mode">
				<button
					class:selected={homeView === 'story'}
					type="button"
					aria-pressed={homeView === 'story'}
					onclick={() => homeView = 'story'}
				>
					<span><MapIcon size={23} /></span>
					<strong>Story mode</strong>
					<small>Planets, progression, and bosses</small>
				</button>
				<button
					class:selected={homeView === 'free-play'}
					type="button"
					aria-pressed={homeView === 'free-play'}
					onclick={() => homeView = 'free-play'}
				>
					<span><Gamepad2 size={24} /></span>
					<strong>Free play</strong>
					<small>Choose any tables and difficulty</small>
				</button>
			</div>
		</section>

		{#if homeView === 'story'}
			<StoryMap
				progress={progress.story}
				travel={storyTravel}
				rocketIndex={storyRocketIndex}
				difficulty={storyDifficulty}
				onselect={startStoryNode}
				ondifficultychange={(difficulty) => storyDifficulty = difficulty}
				ontravelstart={playStoryMapTravel}
				ontravelcomplete={completeStoryMapTravel}
			/>
		{:else}
		<section class="mission-section" id="free-play-missions">
			<div class="section-heading">
				<div>
					<span class="section-kicker">Mission control</span>
					<h2>Build your practice</h2>
				</div>
				<p>Mix any tables you want, or use a quick level to get started.</p>
			</div>

			<div class="practice-builder">
				<div class="mode-switch" aria-label="Choose difficulty">
					<button
						class:selected={selectedDifficulty === 'easy'}
						onclick={() => selectedDifficulty = 'easy'}
						aria-pressed={selectedDifficulty === 'easy'}
					>
						<span class="mode-icon"><MousePointer2 size={22} /></span>
						<span><strong>Easy mode</strong><small>Choose from four answers</small></span>
						<Check class="mode-check" size={18} strokeWidth={3} />
					</button>
					<button
						class:selected={selectedDifficulty === 'hard'}
						onclick={() => selectedDifficulty = 'hard'}
						aria-pressed={selectedDifficulty === 'hard'}
					>
						<span class="mode-icon"><Keyboard size={23} /></span>
						<span><strong>Hard mode</strong><small>Type every answer yourself</small></span>
						<Crown class="mode-check" size={19} strokeWidth={2.5} />
					</button>
				</div>
				<div class="preset-row" aria-label="Quick practice levels">
					<span>Quick levels</span>
					<button onclick={() => selectPreset([1, 2, 3])}>Starter <small>1–3</small></button>
					<button onclick={() => selectPreset([4, 5, 6, 7])}>Builder <small>4–7</small></button>
					<button onclick={() => selectPreset([8, 9, 10])}>Power <small>8–10</small></button>
					<button onclick={() => selectPreset([11, 12])}>Boss <small>11–12</small></button>
					<button onclick={() => selectPreset(tables)}>All <small>1–12</small></button>
				</div>
				<div class="selector-row">
					<div class="table-selector" aria-label="Select times tables">
						{#each tables as table (table)}
							<button
								class:selected={selectedTables.includes(table)}
								onclick={() => toggleTable(table)}
								aria-pressed={selectedTables.includes(table)}
								aria-label={`${selectedTables.includes(table) ? 'Remove' : 'Add'} ${table} times table`}
							>
								<span>×</span>{table}
								<Check size={15} strokeWidth={3} />
							</button>
						{/each}
					</div>
					<div class="launch-selection">
						<div><strong>{selectedTables.length}</strong><span>{selectedTables.length === 1 ? 'table selected' : 'tables selected'}</span></div>
						<Button onclick={() => startCustomQuiz()} disabled={selectedTables.length === 0}>
							Launch {selectedDifficulty} <Rocket size={18} />
						</Button>
					</div>
				</div>
			</div>

			<div class="solo-heading">
				<div><span class="section-kicker">Badge missions</span><h3>Or practice one table</h3></div>
				<p>{selectedDifficulty === 'hard' ? 'Hard missions earn Master badges.' : 'Easy missions unlock mission patches.'}</p>
			</div>

			<div class="table-grid">
				{#each tables as table (table)}
					<button
						class:completed={isTableCompleted(table)}
						class:hard-tile={selectedDifficulty === 'hard'}
						class="table-tile"
						onclick={() => startQuiz(table)}
						aria-label={`Practice the ${table} times table in ${selectedDifficulty} mode`}
					>
						<span class="tile-top">
							<span>{isTableCompleted(table) ? (selectedDifficulty === 'hard' ? 'Mastered' : 'Complete') : `${selectedDifficulty} mission`}</span>
							{#if isTableCompleted(table)}
								{#if selectedDifficulty === 'hard'}<Crown size={18} strokeWidth={2.7} />{:else}<Check size={17} strokeWidth={3} />{/if}
							{:else}<ArrowRight size={17} />{/if}
						</span>
						<strong><span>×</span>{table}</strong>
						<span class="tile-bottom">
							{#if tableBestScore(table)}
								Best {tableBestScore(table)}/10
							{:else}
								Launch now
							{/if}
						</span>
					</button>
				{/each}
			</div>
		</section>

		<section class="badges-section">
			<div class="badge-intro">
				<span class="section-kicker">Your collection</span>
				<h2>Twelve tables.<br />Two ranks.</h2>
				<p>Easy mode unlocks a mission patch. Complete Hard mode to upgrade it into a crowned Master badge.</p>
			</div>
			<div class="badge-shelf">
				{#each tables as table (table)}
					<div class:unlocked={progress.completed.includes(table) || progress.hardCompleted.includes(table)} class:mastered={progress.hardCompleted.includes(table)} class="badge-item">
						<div class="badge-medallion">
							{#if progress.hardCompleted.includes(table)}
								<Crown size={31} strokeWidth={2.2} />
								<span>{table}</span>
							{:else if progress.completed.includes(table)}
								<NumberedMedal number={table} size={30} strokeWidth={2.2} />
							{:else}
								<LockKeyhole size={22} />
							{/if}
						</div>
						<span>{progress.hardCompleted.includes(table) ? `Master ${badgeNames[table - 1]}` : progress.completed.includes(table) ? badgeNames[table - 1] : `Table ${table}`}</span>
					</div>
				{/each}
			</div>
		</section>
		{/if}

		<footer>
			<button class="brand footer-brand" type="button" onclick={scrollToPageTop}><span class="brand-mark"><Rocket size={17} /></span>Multiply Mission</button>
			<a class="javier-credit" href={resolve('/javier')} aria-label="Open the secret Javier tribute">Inspired by Javier's awesome idea. Thanks, Javier!</a>
		</footer>
	</main>
{:else if mode === 'quiz' || mode === 'challenge'}
	<main class={['game-page', { 'challenge-page': mode === 'challenge' }]}>
		<div class="game-stars" aria-hidden="true"></div>
		<header class="game-header">
			<Button variant="ghost" size="icon" onclick={goHome} aria-label="Leave mission"><ArrowLeft size={22} /></Button>
			{#if mode === 'challenge'}
				<div class="story-boss-title">
					<span><BookOpen size={14} /> Story boss {activeStoryBoss?.bossNumber ?? 1} · {sessionDifficulty === 'hard' ? 'Hard' : 'Easy'}</span>
					<strong>{bossName}</strong>
				</div>
				<span class="boss-round">{challengePhase === 'intro' ? 'VS' : `${questionIndex + 1}/${ALIEN_MAX_HEALTH}`}</span>
			{:else}
				<div class="game-progress-wrap">
					<div class="game-label"><span>{sessionLabel}</span><span>{questionIndex + 1} of {totalQuestions}</span></div>
					<div
						class="game-progress"
						class:complete={progressPercent === 100}
						role="progressbar"
						aria-label="Mission progress"
						aria-valuemin="0"
						aria-valuemax="100"
						aria-valuenow={progressPercent}
					>
						<span style:width={`${progressPercent}%`}></span>
					</div>
				</div>
				<div class="streak-meter" class:hot={streak >= 3}><Flame size={18} fill={streak >= 3 ? 'currentColor' : 'none'} /><strong>{streak}</strong></div>
			{/if}
		</header>

		{#if mode === 'challenge'}
			<section class="jrpg-battle-stage">
				<div class="jrpg-arena">
					<div class="battle-hud">
						<div class="boss-vitals">
							<span>{activeStoryBoss?.rank ?? 'Sector guardian'}</span>
							<strong>{bossName}</strong>
							<div
								class="boss-shield-cells"
								role="progressbar"
								aria-label={`${bossName} shield strength`}
								aria-valuemin="0"
								aria-valuemax={ALIEN_MAX_HEALTH}
								aria-valuenow={alienHealth}
							>
								{#each Array.from({ length: ALIEN_MAX_HEALTH }, (_, index) => index) as cell (cell)}
									<i
										class:active={cell < alienHealth}
										class:breaking={challengeAction === 'hit' && cell === alienHealth}
									></i>
								{/each}
							</div>
						</div>
						<div class="ship-vitals" class:critical={playerShields === 1}>
							<span>Your shields</span>
							<div aria-label={`${playerShields} of ${PLAYER_MAX_SHIELDS} ship shields left`}>
								{#each Array.from({ length: PLAYER_MAX_SHIELDS }, (_, index) => index) as shield (shield)}
									<Shield
										size={19}
										fill={shield < playerShields ? 'currentColor' : 'none'}
										class={shield < playerShields ? 'active' : challengeAction === 'counter' && shield === playerShields ? 'breaking' : undefined}
									/>
								{/each}
							</div>
						</div>
					</div>
					<AlienBattleScene
						{alienHealth}
						{playerShields}
						action={challengeAction}
						actionId={challengeActionId}
						outcome={challengeOutcome}
					/>
				</div>

				{#key battleDialogue.id}
					<BattleDialogue
						speaker={battleDialogue.speaker}
						text={battleDialogue.text}
						oncharacter={playDialogueTick}
						oncomplete={completeBattleDialogue}
					/>
				{/key}

				{#if challengePhase === 'intro'}
					<div class="battle-intro-controls">
						<div>
							<span>{sessionDifficulty === 'hard' ? 'Hard mode · Type every attack' : 'Easy mode · Choose your attacks'}</span>
							<strong>{activeStoryBoss?.tables.map((table) => `×${table}`).join(' · ')}</strong>
						</div>
						<Button class="begin-battle" onclick={beginChallengeBattle} disabled={!battleDialogueComplete}>
							Begin encounter <ArrowRight size={18} />
						</Button>
					</div>
				{:else}
					<div class="jrpg-command-deck">
						<div class="jrpg-equation-panel">
							<div class="jrpg-command-label">
								<span>Attack calculation</span>
								<strong><Star size={14} fill="currentColor" /> {score} first try</strong>
							</div>
							<div
								class="jrpg-equation"
								class:celebrate={feedback === 'correct'}
								role="group"
								aria-label={`${currentQuestion.table} times ${currentQuestion.multiplier} equals ${feedback === 'correct' ? correctAnswer : 'unknown'}`}
							>
								<span>{currentQuestion.table}</span><i>×</i><span>{currentQuestion.multiplier}</span><i>=</i><strong aria-live="polite" aria-atomic="true">{feedback === 'correct' ? correctAnswer : '?'}</strong>
							</div>
						</div>

						{#if sessionDifficulty === 'easy'}
							<div class="jrpg-answer-grid" aria-label="Battle commands">
								{#each answerOptions as answer, index (answer)}
									<button
										class:correct-answer={feedback === 'correct' && answer === correctAnswer}
										class:wrong-answer={wrongAnswers.includes(answer)}
										class="answer-button jrpg-answer"
										disabled={!battleDialogueComplete || challengeAnimating || feedback === 'correct' || wrongAnswers.includes(answer) || challengeEnding}
										onclick={() => chooseAnswer(answer)}
										aria-label={`Answer ${answer}`}
									>
										<span class="answer-key">{index + 1}</span>
										<strong>{answer}</strong>
										<span class="answer-icon">
											{#if feedback === 'correct' && answer === correctAnswer}<Check size={21} strokeWidth={3} />{:else if wrongAnswers.includes(answer)}<X size={21} strokeWidth={3} />{/if}
										</span>
									</button>
								{/each}
							</div>
						{:else}
							<form class="jrpg-hard-answer-form" onsubmit={(event) => { event.preventDefault(); submitHardAnswer(); }}>
								<div class="jrpg-hard-heading">
									<span><Keyboard size={19} strokeWidth={2.5} /></span>
									<div><small>Hard mode</small><strong>Manual targeting</strong></div>
								</div>
								{#key questionIndex}
									<div class="jrpg-hard-controls">
										<div class:wrong={hardInputStatus === 'wrong'} class:correct={hardInputStatus === 'correct'} class="hard-input-wrap">
											<input
												type="number"
												inputmode="numeric"
												bind:value={typedAnswer}
												{@attach captureHardInput}
												oninput={handleHardInput}
												onkeydown={handleHardKeydown}
												disabled={!battleDialogueComplete || challengeAnimating || feedback === 'correct' || challengeEnding}
												autocomplete="off"
												aria-label="Type your attack answer"
												placeholder="?"
											/>
											<span>{#if hardInputStatus === 'correct'}<Check size={24} strokeWidth={3} />{:else if hardInputStatus === 'wrong'}<X size={24} strokeWidth={3} />{/if}</span>
										</div>
										<Button
											type="submit"
											disabled={!battleDialogueComplete || challengeAnimating || feedback === 'correct' || challengeEnding || typedAnswer === undefined}
										>
											Fire <Target size={18} />
										</Button>
									</div>
								{/key}
								<p>Type the product, then press Enter to fire.</p>
							</form>
						{/if}
					</div>
				{/if}
			</section>
		{:else}
		<section class="quiz-stage">
			<div class="quiz-status">
				<span class="question-tag">Question {questionIndex + 1}</span>
				<span class="score-readout"><Star size={16} fill="currentColor" /> {score} first try</span>
			</div>

			<div
				class="equation"
				class:celebrate={feedback === 'correct'}
				class:hard-equation={sessionDifficulty === 'hard'}
				role="group"
				tabindex="-1"
				aria-label={`${currentQuestion.table} times ${currentQuestion.multiplier} equals ${feedback === 'correct' ? correctAnswer : 'unknown'}`}
			>
				<span>{currentQuestion.table}</span><i>×</i><span>{currentQuestion.multiplier}</span><i>=</i><strong aria-live="polite" aria-atomic="true">{feedback === 'correct' ? correctAnswer : '?'}</strong>
			</div>
			<p class="quiz-prompt">{sessionDifficulty === 'hard' ? 'Type the answer' : 'Pick the answer'}</p>

			{#if sessionDifficulty === 'easy'}
				<div class="answer-grid">
					{#each answerOptions as answer, index (answer)}
						<button
							class:correct-answer={feedback === 'correct' && answer === correctAnswer}
							class:wrong-answer={wrongAnswers.includes(answer)}
							class="answer-button"
							disabled={feedback === 'correct' || wrongAnswers.includes(answer)}
							onclick={() => chooseAnswer(answer)}
							aria-label={`Answer ${answer}`}
						>
							<span class="answer-key">{index + 1}</span>
							<strong>{answer}</strong>
							<span class="answer-icon">
								{#if feedback === 'correct' && answer === correctAnswer}<Check size={21} strokeWidth={3} />{:else if wrongAnswers.includes(answer)}<X size={21} strokeWidth={3} />{/if}
							</span>
						</button>
					{/each}
				</div>
			{:else}
				<form class="hard-answer-form" onsubmit={(event) => { event.preventDefault(); submitHardAnswer(); }}>
					{#key questionIndex}
						<div class:wrong={hardInputStatus === 'wrong'} class:correct={hardInputStatus === 'correct'} class="hard-input-wrap">
							<input
								type="number"
								inputmode="numeric"
								bind:value={typedAnswer}
								{@attach captureHardInput}
								oninput={handleHardInput}
								onkeydown={handleHardKeydown}
								disabled={feedback === 'correct'}
								autocomplete="off"
								aria-label="Type your answer"
								placeholder="?"
							/>
							<span>{#if hardInputStatus === 'correct'}<Check size={27} strokeWidth={3} />{:else if hardInputStatus === 'wrong'}<X size={27} strokeWidth={3} />{/if}</span>
						</div>
					{/key}
					<Button type="submit" disabled={feedback === 'correct' || typedAnswer === undefined}>Check answer <ArrowRight size={19} /></Button>
				</form>
			{/if}

			<div class="feedback-line" aria-live="polite">
				{#if feedback === 'correct'}
					<span class="yes"><Sparkles size={18} /> Nailed it!</span>
				{:else if feedback === 'wrong'}
					<span class="nope">{wrongAttemptCount === 1 ? 'Not that one. Try once more!' : 'Not yet. Use the shortcut, then try again!'}</span>
				{:else}
					<span>{sessionDifficulty === 'hard' ? 'Press Enter to check' : 'Press 1–4 on your keyboard'}</span>
				{/if}
			</div>
		</section>
		{/if}

		{#if coachOpen && coachExample}
			<div class="coach-layer">
				<div class="coach-panel" role="dialog" aria-modal="true" aria-labelledby="coach-title" aria-describedby="coach-description">
					<div class="coach-heading">
						<span class="coach-mark"><Lightbulb size={22} strokeWidth={2.4} /></span>
						<div>
							<span>Mission Coach · ×{coachExample.table}</span>
							<h2 id="coach-title">{coachExample.strategyName}</h2>
						</div>
					</div>
					<p id="coach-description">{coachExample.strategySummary}</p>

					{#key `${coachExample.table}-${coachExample.multiplier}`}
						<div class="coach-example">
							<div class="coach-example-top">
								<span>Practice a different one</span>
								<strong>{coachExample.table} × {coachExample.multiplier}</strong>
							</div>
							<ol class="coach-steps">
								{#each coachExample.steps as step, index (step)}
									<li style:--step={index}><span>{index + 1}</span><p>{step}</p></li>
								{/each}
							</ol>
							<div class="coach-result"><span>That gives</span><strong>{coachExample.table} × {coachExample.multiplier} = {coachExample.answer}</strong></div>
						</div>
					{/key}

					<div class="coach-actions">
						<Button class="coach-primary" onclick={closeCoach}>Try my problem again <ArrowRight size={18} /></Button>
						<Button variant="secondary" onclick={refreshCoachExample}><RefreshCw size={17} /> Another example</Button>
					</div>
				</div>
			</div>
		{/if}
	</main>
{:else if mode === 'result'}
	<main class="result-page">
		<div class="result-stars" aria-hidden="true"></div>
		<section class="result-card">
			<div class="result-burst" aria-hidden="true"></div>
			<div class="earned-badge" class:locked={earnedStars === 0} class:master-badge={sessionOrigin === 'free-play' && sessionDifficulty === 'hard' && earnedStars > 0}>
				{#if earnedStars === 0}
					<RotateCcw size={42} />
				{:else if isSingleTable}
					{#if sessionOrigin === 'free-play' && sessionDifficulty === 'hard'}
						<Crown size={48} strokeWidth={1.9} /><strong>{sessionTables[0]}</strong>
					{:else}
						<NumberedMedal number={sessionTables[0]} size={48} strokeWidth={1.8} />
					{/if}
				{:else}
					<Target size={44} strokeWidth={2} />
				{/if}
			</div>
			<span class="result-kicker">{sessionOrigin === 'story' ? `Story ${sessionDifficulty} planet report` : `${sessionDifficulty} mission complete`}</span>
			<h1 id="mission-result-title" tabindex="-1">{resultTitle}</h1>
			<p>{resultDescription}</p>

			<div class="stars-earned" aria-label={`${earnedStars} out of 3 stars`}>
				{#each [1, 2, 3] as star (star)}
					<Star size={34} fill={star <= earnedStars ? 'currentColor' : 'none'} class={star <= earnedStars ? 'active' : ''} />
				{/each}
			</div>

			<div class="result-stats">
				<div><strong>{score}<small>/10</small></strong><span>Score</span></div>
				<div><strong>{accuracy}%</strong><span>Accuracy</span></div>
				<div><strong>{bestStreak}</strong><span>Best streak</span></div>
			</div>

			<div class="result-actions">
				{#if sessionOrigin === 'story'}
					{#if earnedStars > 0}
						<Button data-compact-label="Continue" onclick={goHome}>Continue journey <ArrowRight size={18} /></Button>
						<Button data-compact-label="Replay" variant="secondary" onclick={() => activeStoryNode && startStoryNode(activeStoryNode)}><RotateCcw size={18} /> Replay planet</Button>
					{:else}
						<Button data-compact-label="Retry" onclick={() => activeStoryNode && startStoryNode(activeStoryNode)}><RotateCcw size={18} /> Try planet again</Button>
						<Button data-compact-label="Map" variant="secondary" onclick={goHome}><MapIcon size={18} /> Story map</Button>
					{/if}
				{:else}
					<Button data-compact-label="Retry" onclick={() => startCustomQuiz(sessionTables, sessionDifficulty)}><RotateCcw size={18} /> Try again</Button>
					<Button data-compact-label="Map" variant="secondary" onclick={goHome}><Home size={18} /> Mission map</Button>
				{/if}
			</div>
		</section>
	</main>
{:else}
	<main class="result-page challenge-result-page">
		<div class="result-stars" aria-hidden="true"></div>
		<section class="result-card challenge-result-card">
			<div class="challenge-result-scene">
				<AlienBattleScene
					{alienHealth}
					{playerShields}
					outcome={challengeOutcome}
					compact
				/>
			</div>
			<span class="result-kicker">Story boss report · {sessionDifficulty} mode · Gate {activeStoryBoss?.bossNumber ?? 1}</span>
			<h1 id="challenge-result-title" tabindex="-1">{challengeResultTitle}</h1>
			<p>{challengeResultDescription}</p>

			{#if challengeOutcome === 'victory'}
				<div class="challenge-reward">
					<span><Trophy size={24} /></span>
					<div><small>Route unlocked</small><strong>Sector {activeStoryBoss?.bossNumber ?? 1} cleared</strong></div>
				</div>
			{/if}

			<div class="result-stats challenge-result-stats">
				<div><strong>{alienHits}<small>/{ALIEN_MAX_HEALTH}</small></strong><span>Hits landed</span></div>
				<div><strong>{playerShields}<small>/{PLAYER_MAX_SHIELDS}</small></strong><span>Shields left</span></div>
				<div><strong>{progress.challengeWins}</strong><span>Total wins</span></div>
			</div>

			<div class="result-actions">
				{#if challengeOutcome === 'victory'}
					<Button data-compact-label="Continue" onclick={goHome}>Continue journey <ArrowRight size={18} /></Button>
					<Button data-compact-label="Rematch" variant="secondary" onclick={() => activeStoryBoss && startChallenge(activeStoryBoss)}><RotateCcw size={18} /> Battle again</Button>
				{:else}
					<Button data-compact-label="Rematch" onclick={() => activeStoryBoss && startChallenge(activeStoryBoss)}><RotateCcw size={18} /> Battle again</Button>
					<Button data-compact-label="Map" variant="secondary" onclick={goHome}><MapIcon size={18} /> Story map</Button>
				{/if}
			</div>
		</section>
	</main>
{/if}
