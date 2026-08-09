import { ALIEN_MAX_HEALTH } from './challenge';
import { EMPTY_STORY_PROGRESS, normalizeStoryProgress, type StoryProgress } from './story';

export type GameProgress = {
	completed: number[];
	hardCompleted: number[];
	bestScores: Record<number, number>;
	hardBestScores: Record<number, number>;
	totalStars: number;
	challengeWins: number;
	challengeBestScore: number;
	story: StoryProgress;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNonnegativeInteger(value: unknown, maximum = Number.POSITIVE_INFINITY) {
	return typeof value === 'number' && Number.isFinite(value)
		? Math.min(maximum, Math.max(0, Math.floor(value)))
		: 0;
}

function normalizeCompletedTables(value: unknown) {
	if (!Array.isArray(value)) return [];
	return [...new Set(value.filter((table): table is number => Number.isInteger(table) && table >= 1 && table <= 12))]
		.sort((a, b) => a - b);
}

function normalizeScores(value: unknown) {
	if (!isRecord(value)) return {};
	const scores: Record<number, number> = {};
	for (let table = 1; table <= 12; table += 1) {
		const score = value[table];
		if (typeof score !== 'number' || !Number.isFinite(score)) continue;
		scores[table] = toNonnegativeInteger(score, 10);
	}
	return scores;
}

export function makeEmptyGameProgress(): GameProgress {
	return {
		completed: [],
		hardCompleted: [],
		bestScores: {},
		hardBestScores: {},
		totalStars: 0,
		challengeWins: 0,
		challengeBestScore: 0,
		story: { ...EMPTY_STORY_PROGRESS, completedNodeIds: [], bestScores: {} }
	};
}

export function normalizeGameProgress(value: unknown): GameProgress {
	if (!isRecord(value)) return makeEmptyGameProgress();
	return {
		completed: normalizeCompletedTables(value.completed),
		hardCompleted: normalizeCompletedTables(value.hardCompleted),
		bestScores: normalizeScores(value.bestScores),
		hardBestScores: normalizeScores(value.hardBestScores),
		totalStars: toNonnegativeInteger(value.totalStars, 72),
		challengeWins: toNonnegativeInteger(value.challengeWins),
		challengeBestScore: toNonnegativeInteger(value.challengeBestScore, ALIEN_MAX_HEALTH),
		// Story is intentionally independent: legacy Free Play badges do not skip campaign stages.
		story: normalizeStoryProgress(value.story)
	};
}
