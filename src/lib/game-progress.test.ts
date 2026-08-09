import { describe, expect, it } from 'bun:test';
import { makeEmptyGameProgress, normalizeGameProgress } from './game-progress';

describe('saved game progress', () => {
	it('starts legacy saves at the beginning of the independent story route', () => {
		const progress = normalizeGameProgress({
			completed: [1, 2, 3],
			hardCompleted: [1],
			challengeWins: 4
		});

		expect(progress.completed).toEqual([1, 2, 3]);
		expect(progress.hardCompleted).toEqual([1]);
		expect(progress.challengeWins).toBe(4);
		expect(progress.story.completedNodeIds).toEqual([]);
	});

	it('sanitizes malformed values without discarding valid progress', () => {
		const progress = normalizeGameProgress({
			completed: [3, 1, 3, 0, 13, '2'],
			hardCompleted: 42,
			bestScores: { 1: 8.9, 2: 99, 3: -4, 4: '10' },
			hardBestScores: null,
			totalStars: Number.NaN,
			challengeWins: 2.8,
			challengeBestScore: 99,
			story: { completedNodeIds: ['planet-1'], bestScores: { 'planet-1': 7 } }
		});

		expect(progress).toMatchObject({
			completed: [1, 3],
			hardCompleted: [],
			bestScores: { 1: 8, 2: 10, 3: 0 },
			hardBestScores: {},
			totalStars: 0,
			challengeWins: 2,
			challengeBestScore: 6
		});
		expect(progress.story.completedNodeIds).toEqual(['planet-1']);
	});

	it('returns a fresh empty object for unusable data', () => {
		expect(normalizeGameProgress(null)).toEqual(makeEmptyGameProgress());
	});
});
