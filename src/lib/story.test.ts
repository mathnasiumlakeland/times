import { describe, expect, it } from 'bun:test';
import {
	EMPTY_STORY_PROGRESS,
	STORY_NODES,
	getStoryNodeStatus,
	getStoryProgress,
	normalizeStoryProgress,
	recordStoryResult
} from './story';

describe('story route', () => {
	it('places one boss after every three table planets', () => {
		expect(STORY_NODES.filter((node) => node.kind === 'planet').map((node) => node.table)).toEqual(
		Array.from({ length: 12 }, (_, index) => index + 1)
		);
		expect(STORY_NODES.filter((node) => node.kind === 'boss').map((node) => node.tables)).toEqual([
		[1, 2, 3],
		[4, 5, 6],
		[7, 8, 9],
		[10, 11, 12]
		]);
	});

	it('unlocks only the first incomplete node', () => {
		const progress = recordStoryResult(EMPTY_STORY_PROGRESS, 'planet-1', 8, true);
		expect(getStoryNodeStatus(0, progress)).toBe('completed');
		expect(getStoryNodeStatus(1, progress)).toBe('current');
		expect(getStoryNodeStatus(2, progress)).toBe('locked');
	});

	it('does not allow free play or a future node to skip the route', () => {
		const skipped = recordStoryResult(EMPTY_STORY_PROGRESS, 'planet-3', 10, true);
		expect(skipped.completedNodeIds).toEqual([]);
		expect(skipped.bestScores['planet-3']).toBe(10);
	});

	it('requires a passed result before advancing', () => {
		const failed = recordStoryResult(EMPTY_STORY_PROGRESS, 'planet-1', 4, false);
		expect(failed.completedNodeIds).toEqual([]);
		expect(failed.bestScores['planet-1']).toBe(4);

		const passed = recordStoryResult(failed, 'planet-1', 7, true);
		expect(passed.completedNodeIds).toEqual(['planet-1']);
		expect(passed.bestScores['planet-1']).toBe(7);
	});

	it('keeps the next sector locked until its boss is defeated', () => {
		const atBoss = ['planet-1', 'planet-2', 'planet-3'].reduce(
			(current, nodeId) => recordStoryResult(current, nodeId, 10, true),
			EMPTY_STORY_PROGRESS
		);
		expect(getStoryNodeStatus(3, atBoss)).toBe('current');
		expect(getStoryNodeStatus(4, atBoss)).toBe('locked');

		const failedBoss = recordStoryResult(atBoss, 'boss-1', 4, false);
		expect(getStoryNodeStatus(4, failedBoss)).toBe('locked');

		const defeatedBoss = recordStoryResult(failedBoss, 'boss-1', 6, true);
		expect(getStoryNodeStatus(4, defeatedBoss)).toBe('current');
	});

	it('makes completed-node replays idempotent and preserves the best score', () => {
		const cleared = recordStoryResult(EMPTY_STORY_PROGRESS, 'planet-1', 9, true);
		const replayed = recordStoryResult(cleared, 'planet-1', 5, true);
		expect(replayed.completedNodeIds).toEqual(['planet-1']);
		expect(replayed.bestScores['planet-1']).toBe(9);
	});

	it('sanitizes saved progress to a valid contiguous prefix', () => {
		const progress = normalizeStoryProgress({
			version: 99,
			completedNodeIds: ['planet-1', 'planet-3', 'boss-4'],
			bestScores: { 'planet-1': 99, 'boss-1': -2, unknown: 8 }
		});
		expect(progress).toEqual({
			version: 1,
			completedNodeIds: ['planet-1'],
			bestScores: { 'planet-1': 10, 'boss-1': 0 }
		});
	});

	it('handles duplicate and malformed completion lists', () => {
		expect(normalizeStoryProgress({ completedNodeIds: ['planet-1', 'planet-1', 'planet-2'] }).completedNodeIds)
			.toEqual(['planet-1', 'planet-2']);
		expect(normalizeStoryProgress({ completedNodeIds: 42 }).completedNodeIds).toEqual([]);
	});

	it('reports a complete route after all nodes are cleared in order', () => {
		const progress = STORY_NODES.reduce(
			(current, node) => recordStoryResult(current, node.id, node.kind === 'planet' ? 10 : 6, true),
			EMPTY_STORY_PROGRESS
		);
		expect(getStoryProgress(progress)).toMatchObject({
			completedCount: STORY_NODES.length,
			isComplete: true,
			percent: 100
		});
	});
});
