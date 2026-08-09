import { describe, expect, it } from 'bun:test';
import {
	ALIEN_MAX_HEALTH,
	PLAYER_MAX_SHIELDS,
	makeChallengeTableSequence,
	resolveChallengeAttempt
} from './challenge';

describe('challenge question sequence', () => {
	it('uses only unlocked tables and balances repeats by cycle', () => {
		const sequence = makeChallengeTableSequence([2, 5, 9], 6, () => 0.25);
		expect(sequence).toHaveLength(6);
		expect(sequence.every((table) => [2, 5, 9].includes(table))).toBe(true);
		expect(sequence.filter((table) => table === 2)).toHaveLength(2);
		expect(sequence.filter((table) => table === 5)).toHaveLength(2);
		expect(sequence.filter((table) => table === 9)).toHaveLength(2);
	});
});

describe('challenge battle resolution', () => {
	const freshBattle = {
		alienHealth: ALIEN_MAX_HEALTH,
		playerShields: PLAYER_MAX_SHIELDS,
		outcome: null
	} as const;

	it('damages the alien on every correct answer', () => {
		expect(resolveChallengeAttempt(freshBattle, { correct: true, firstWrongAttempt: false }))
			.toMatchObject({ alienHealth: ALIEN_MAX_HEALTH - 1, playerShields: PLAYER_MAX_SHIELDS, outcome: null });
	});

	it('allows only one counterattack per question', () => {
		const afterFirstMiss = resolveChallengeAttempt(freshBattle, { correct: false, firstWrongAttempt: true });
		const afterRepeatedMiss = resolveChallengeAttempt(afterFirstMiss, { correct: false, firstWrongAttempt: false });
		expect(afterFirstMiss.playerShields).toBe(PLAYER_MAX_SHIELDS - 1);
		expect(afterRepeatedMiss).toEqual(afterFirstMiss);
	});

	it('clamps health and shields and produces terminal outcomes', () => {
		expect(resolveChallengeAttempt(
			{ alienHealth: 1, playerShields: 2, outcome: null },
			{ correct: true, firstWrongAttempt: false }
		)).toEqual({ alienHealth: 0, playerShields: 2, outcome: 'victory' });

		expect(resolveChallengeAttempt(
			{ alienHealth: 4, playerShields: 1, outcome: null },
			{ correct: false, firstWrongAttempt: true }
		)).toEqual({ alienHealth: 4, playerShields: 0, outcome: 'defeat' });
	});

	it('does not resolve damage again after the battle ends', () => {
		const victory = { alienHealth: 0, playerShields: 2, outcome: 'victory' as const };
		expect(resolveChallengeAttempt(victory, { correct: false, firstWrongAttempt: true })).toBe(victory);
	});
});
