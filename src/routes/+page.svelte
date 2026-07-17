<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import {
		ArrowLeft,
		ArrowRight,
		Check,
		Flame,
		Home,
		Keyboard,
		LockKeyhole,
		Medal,
		MousePointer2,
		Crown,
		Rocket,
		RotateCcw,
		Sparkles,
		Star,
		Target,
		Trophy,
		X
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/button/Button.svelte';

	type GameMode = 'home' | 'quiz' | 'result';
	type Difficulty = 'easy' | 'hard';
	type Question = { table: number; multiplier: number };
	type SoundName = 'correct' | 'incorrect' | 'complete';
	type Progress = {
		completed: number[];
		hardCompleted: number[];
		bestScores: Record<number, number>;
		hardBestScores: Record<number, number>;
		totalStars: number;
	};

	const totalQuestions = 10;
	const tables = Array.from({ length: 12 }, (_, index) => index + 1);
	const soundUrls: Record<SoundName, string> = {
		correct: '/audio/duolingo-correct.mp3',
		incorrect: '/audio/duolingo-incorrect.mp3',
		complete: '/audio/duolingo-complete.mp3'
	};
	const sounds: Partial<Record<SoundName, HTMLAudioElement>> = {};
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
	let selectedDifficulty = $state<Difficulty>('easy');
	let sessionDifficulty = $state<Difficulty>('easy');
	let activeTable = $state(1);
	let selectedTables = $state<number[]>([8]);
	let sessionTables = $state<number[]>([1]);
	let questions = $state<Question[]>([]);
	let questionIndex = $state(0);
	let score = $state(0);
	let streak = $state(0);
	let bestStreak = $state(0);
	let wrongAnswers = $state<number[]>([]);
	let typedAnswer = $state<number | undefined>(undefined);
	let hardInputStatus = $state<'idle' | 'wrong' | 'correct'>('idle');
	let hardInput = $state<HTMLInputElement>();
	let feedback = $state<'correct' | 'wrong' | null>(null);
	let orbitProblems = $state<[string, string]>(['7 × 8', '12 × 4']);
	let progress = $state<Progress>({ completed: [], hardCompleted: [], bestScores: {}, hardBestScores: {}, totalStars: 0 });
	let rocketBoostFrame: number | undefined;

	let currentQuestion = $derived(questions[questionIndex] ?? { table: activeTable, multiplier: 1 });
	let correctAnswer = $derived(currentQuestion.table * currentQuestion.multiplier);
	let progressPercent = $derived((questionIndex / totalQuestions) * 100);
	let answerOptions = $derived.by(() => makeOptions(correctAnswer, currentQuestion.table));
	let earnedStars = $derived(score >= 9 ? 3 : score >= 7 ? 2 : score >= 5 ? 1 : 0);
	let accuracy = $derived(Math.round((score / totalQuestions) * 100));
	let isSingleTable = $derived(sessionTables.length === 1);
	let sessionLabel = $derived(`${sessionDifficulty === 'hard' ? 'Hard' : 'Easy'} · ${isSingleTable ? `×${sessionTables[0]} mission` : `${sessionTables.length} tables mixed`}`);
	let resultTitle = $derived(
		earnedStars === 0
			? 'One more orbit!'
			: isSingleTable
				? sessionDifficulty === 'hard'
					? `Master ${badgeNames[sessionTables[0] - 1]}`
					: badgeNames[sessionTables[0] - 1]
				: sessionDifficulty === 'hard' ? 'Hard mix mastered' : 'Mixed mission mastered'
	);
	let resultDescription = $derived.by(() => {
		if (!isSingleTable) return `You practiced ${sessionTables.map((table) => `×${table}`).join(', ')} in ${sessionDifficulty} mode.`;
		if (earnedStars === 0) return `Score 5 or more to unlock the ${sessionDifficulty === 'hard' ? 'Master' : 'Easy'} ×${sessionTables[0]} badge.`;
		return sessionDifficulty === 'hard'
			? `You earned the Master ×${sessionTables[0]} badge by typing every answer.`
			: `You conquered the ${sessionTables[0]} times table in Easy mode.`;
	});

	onMount(() => {
		orbitProblems = makeOrbitProblems();

		for (const [name, url] of Object.entries(soundUrls) as [SoundName, string][]) {
			const audio = new Audio(url);
			audio.preload = 'auto';
			sounds[name] = audio;
		}

		const saved = localStorage.getItem('multiply-mission-progress');
		if (saved) {
			try {
				const stored = JSON.parse(saved) as Partial<Progress>;
				progress = {
					completed: stored.completed ?? [],
					hardCompleted: stored.hardCompleted ?? [],
					bestScores: stored.bestScores ?? {},
					hardBestScores: stored.hardBestScores ?? {},
					totalStars: stored.totalStars ?? 0
				};
			} catch {
				localStorage.removeItem('multiply-mission-progress');
			}
		}
	});

	function playSound(name: SoundName) {
		const audio = sounds[name];
		if (!audio) return;
		audio.currentTime = 0;
		void audio.play().catch(() => {
			// Audio can be blocked until the first user interaction; gameplay continues silently.
		});
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

	function startQuiz(table: number) {
		startCustomQuiz([table], selectedDifficulty);
	}

	function startCustomQuiz(selection = selectedTables, difficulty = selectedDifficulty) {
		if (selection.length === 0) return;
		const chosen = [...selection].sort((a, b) => a - b);
		const tablePool: number[] = [];
		while (tablePool.length < totalQuestions) tablePool.push(...shuffled(chosen));
		sessionTables = chosen;
		sessionDifficulty = difficulty;
		activeTable = chosen[0];
		questions = tablePool.slice(0, totalQuestions).map((table) => ({
			table,
			multiplier: Math.floor(Math.random() * 12) + 1
		}));
		questionIndex = 0;
		score = 0;
		streak = 0;
		bestStreak = 0;
		wrongAnswers = [];
		typedAnswer = undefined;
		hardInputStatus = 'idle';
		feedback = null;
		mode = 'quiz';
		window.scrollTo({ top: 0, behavior: 'smooth' });
		focusHardInput();
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

	function chooseAnswer(answer: number) {
		if (feedback === 'correct' || wrongAnswers.includes(answer)) return;
		if (answer === correctAnswer) {
			playSound('correct');
			feedback = 'correct';
			hardInputStatus = 'correct';
			if (wrongAnswers.length === 0) {
				score += 1;
				streak += 1;
				bestStreak = Math.max(bestStreak, streak);
			}
			setTimeout(nextQuestion, 700);
		} else {
			playSound('incorrect');
			feedback = 'wrong';
			hardInputStatus = 'wrong';
			wrongAnswers = [...wrongAnswers, answer];
			streak = 0;
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
		void tick().then(() => hardInput?.focus());
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
		focusHardInput();
	}

	function finishQuiz() {
		playSound('complete');
		const finalScore = score;
		const stars = finalScore >= 9 ? 3 : finalScore >= 7 ? 2 : finalScore >= 5 ? 1 : 0;
		const isCompleted = stars > 0;
		if (sessionTables.length === 1) {
			const table = sessionTables[0];
			if (sessionDifficulty === 'hard') {
				const wasCompleted = progress.hardCompleted.includes(table);
				progress = {
					...progress,
					hardCompleted: isCompleted && !wasCompleted ? [...progress.hardCompleted, table] : progress.hardCompleted,
					hardBestScores: { ...progress.hardBestScores, [table]: Math.max(progress.hardBestScores[table] ?? 0, finalScore) },
					totalStars: progress.totalStars + (isCompleted && !wasCompleted ? stars : 0)
				};
			} else {
				const wasCompleted = progress.completed.includes(table);
				progress = {
					...progress,
					completed: isCompleted && !wasCompleted ? [...progress.completed, table] : progress.completed,
					bestScores: { ...progress.bestScores, [table]: Math.max(progress.bestScores[table] ?? 0, finalScore) },
					totalStars: progress.totalStars + (isCompleted && !wasCompleted ? stars : 0)
				};
			}
			localStorage.setItem('multiply-mission-progress', JSON.stringify(progress));
		}
		mode = 'result';
	}

	function goHome() {
		mode = 'home';
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	function handleKeydown(event: KeyboardEvent) {
		if (mode !== 'quiz' || sessionDifficulty === 'hard' || feedback === 'correct') return;
		const number = Number(event.key);
		if (number >= 1 && number <= answerOptions.length) chooseAnswer(answerOptions[number - 1]);
	}
</script>

<svelte:head>
	<title>Multiply Mission — Master times tables 1–12</title>
	<meta
		name="description"
		content="A playful, gamified way to learn multiplication tables from 1 through 12."
	/>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

{#if mode === 'home'}
	<main class="home-page">
		<header class="site-header">
			<a class="brand" href="#top" aria-label="Multiply Mission home">
				<span class="brand-mark"><Rocket size={19} strokeWidth={2.6} /></span>
				<span>Multiply Mission</span>
			</a>
			<div class="header-stats">
				<div class="mini-stat" title="Tables completed">
					<Trophy size={17} />
					<strong>{progress.completed.length + progress.hardCompleted.length}</strong><span>/ 24</span>
				</div>
				<div class="mini-stat flame-stat" title="Mission stars">
					<Star size={17} fill="currentColor" />
					<strong>{progress.totalStars}</strong>
				</div>
			</div>
		</header>

		<section class="hero" id="top">
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

		<section class="mission-section" id="missions">
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
								<Medal size={30} strokeWidth={2.2} />
								<span>{table}</span>
							{:else}
								<LockKeyhole size={22} />
							{/if}
						</div>
						<span>{progress.hardCompleted.includes(table) ? `Master ${badgeNames[table - 1]}` : progress.completed.includes(table) ? badgeNames[table - 1] : `Table ${table}`}</span>
					</div>
				{/each}
			</div>
		</section>

		<footer>
			<a class="brand footer-brand" href="#top"><span class="brand-mark"><Rocket size={17} /></span>Multiply Mission</a>
			<p>Made for curious minds and future math legends.</p>
		</footer>
	</main>
{:else if mode === 'quiz'}
	<main class="game-page">
		<div class="game-stars" aria-hidden="true"></div>
		<header class="game-header">
			<Button variant="ghost" size="icon" onclick={goHome} aria-label="Leave mission"><ArrowLeft size={22} /></Button>
			<div class="game-progress-wrap">
				<div class="game-label"><span>{sessionLabel}</span><span>{questionIndex + 1} of {totalQuestions}</span></div>
				<div class="game-progress"><span style:width={`${progressPercent}%`}></span></div>
			</div>
			<div class="streak-meter" class:hot={streak >= 3}><Flame size={18} fill={streak >= 3 ? 'currentColor' : 'none'} /><strong>{streak}</strong></div>
		</header>

		<section class="quiz-stage">
			<div class="quiz-status">
				<span class="question-tag">Question {questionIndex + 1}</span>
				<span class="score-readout"><Star size={16} fill="currentColor" /> {score} first try</span>
			</div>

			<div class="equation" class:celebrate={feedback === 'correct'} class:hard-equation={sessionDifficulty === 'hard'}>
				<span>{currentQuestion.table}</span><i>×</i><span>{currentQuestion.multiplier}</span><i>=</i><strong>?</strong>
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
								bind:this={hardInput}
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
				{#if feedback === 'correct'}<span class="yes"><Sparkles size={18} /> Nailed it!</span>{:else if feedback === 'wrong'}<span class="nope">Not that one — try again!</span>{:else}<span>{sessionDifficulty === 'hard' ? 'Press Enter to check' : 'Press 1–4 on your keyboard'}</span>{/if}
			</div>
		</section>
	</main>
{:else}
	<main class="result-page">
		<div class="result-stars" aria-hidden="true"></div>
		<section class="result-card">
			<div class="result-burst" aria-hidden="true"></div>
			<div class="earned-badge" class:locked={earnedStars === 0} class:master-badge={sessionDifficulty === 'hard' && earnedStars > 0}>
				{#if earnedStars === 0}
					<RotateCcw size={42} />
				{:else if isSingleTable}
					{#if sessionDifficulty === 'hard'}<Crown size={48} strokeWidth={1.9} />{:else}<Medal size={48} strokeWidth={1.8} />{/if}<strong>{sessionTables[0]}</strong>
				{:else}
					<Target size={44} strokeWidth={2} />
				{/if}
			</div>
			<span class="result-kicker">{sessionDifficulty} mission complete</span>
			<h1>{resultTitle}</h1>
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
				<Button onclick={() => startCustomQuiz(sessionTables, sessionDifficulty)}><RotateCcw size={18} /> Try again</Button>
				<Button variant="secondary" onclick={goHome}><Home size={18} /> Mission map</Button>
			</div>
		</section>
	</main>
{/if}
