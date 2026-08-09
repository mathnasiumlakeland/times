export const ALIEN_MAX_HEALTH = 6;
export const PLAYER_MAX_SHIELDS = 3;

export type ChallengeOutcome = 'victory' | 'defeat' | null;
export type BattleAction = 'idle' | 'hit' | 'counter';

export type ChallengeBattleSnapshot = {
	alienHealth: number;
	playerShields: number;
	outcome: ChallengeOutcome;
};

function shuffleWith<T>(items: T[], random: () => number) {
	const shuffled = [...items];
	for (let index = shuffled.length - 1; index > 0; index -= 1) {
		const randomIndex = Math.floor(Math.min(0.999999, Math.max(0, random())) * (index + 1));
		[shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
	}
	return shuffled;
}

export function makeChallengeTableSequence(
	tables: number[],
	count = ALIEN_MAX_HEALTH,
	random: () => number = Math.random
) {
	const eligibleTables = [...new Set(tables)]
		.filter((table) => Number.isInteger(table) && table >= 1 && table <= 12)
		.sort((a, b) => a - b);
	if (eligibleTables.length === 0 || count <= 0) return [];

	const sequence: number[] = [];
	while (sequence.length < count) sequence.push(...shuffleWith(eligibleTables, random));
	return sequence.slice(0, count);
}

export function resolveChallengeAttempt(
	state: ChallengeBattleSnapshot,
	options: { correct: boolean; firstWrongAttempt: boolean }
): ChallengeBattleSnapshot {
	if (state.outcome) return state;

	if (options.correct) {
		const alienHealth = Math.max(0, state.alienHealth - 1);
		return {
			...state,
			alienHealth,
			outcome: alienHealth === 0 ? 'victory' : null
		};
	}

	if (!options.firstWrongAttempt) return state;
	const playerShields = Math.max(0, state.playerShields - 1);
	return {
		...state,
		playerShields,
		outcome: playerShields === 0 ? 'defeat' : null
	};
}
