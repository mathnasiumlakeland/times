import { describe, expect, it } from 'bun:test';
import {
	EMPTY_STORY_PROGRESS,
	STORY_NODES,
	STORY_TRAVEL_TIMING,
	getStoryNodeStatus,
	getStoryProgress,
	getStoryTravelFlightMs,
	getStoryTravelPath,
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
		expect(STORY_NODES.filter((node) => node.kind === 'boss').every((node) => node.hitTaunts.length >= 5)).toBe(true);
	});

	it('routes travel through every intermediate story stop in either direction', () => {
		const forwardPath = getStoryTravelPath(0, 3);
		const reversePath = getStoryTravelPath(3, 0);

		expect(forwardPath.startsWith(`M ${STORY_NODES[0].x} ${STORY_NODES[0].y}`)).toBe(true);
		expect(forwardPath.endsWith(`${STORY_NODES[3].x} ${STORY_NODES[3].y}`)).toBe(true);
		expect(forwardPath.match(/ C /g)).toHaveLength(3);
		expect(reversePath.startsWith(`M ${STORY_NODES[3].x} ${STORY_NODES[3].y}`)).toBe(true);
		expect(reversePath.endsWith(`${STORY_NODES[0].x} ${STORY_NODES[0].y}`)).toBe(true);
		expect(reversePath.match(/ C /g)).toHaveLength(3);
	});

	it('keeps the planet four to planet two trip on every intervening route segment', () => {
		const planetFourIndex = STORY_NODES.findIndex((node) => node.kind === 'planet' && node.table === 4);
		const planetTwoIndex = STORY_NODES.findIndex((node) => node.kind === 'planet' && node.table === 2);
		const planetThree = STORY_NODES.find((node) => node.kind === 'planet' && node.table === 3);
		const firstBoss = STORY_NODES.find((node) => node.kind === 'boss' && node.bossNumber === 1);
		const path = getStoryTravelPath(planetFourIndex, planetTwoIndex);

		expect(path.startsWith(`M ${STORY_NODES[planetFourIndex].x} ${STORY_NODES[planetFourIndex].y}`)).toBe(true);
		expect(path).toContain(`${firstBoss?.x} ${firstBoss?.y}`);
		expect(path).toContain(`${planetThree?.x} ${planetThree?.y}`);
		expect(path.endsWith(`${STORY_NODES[planetTwoIndex].x} ${STORY_NODES[planetTwoIndex].y}`)).toBe(true);
		expect(path.match(/ C /g)).toHaveLength(3);
	});

	it('gives multi-stop journeys more flight time without making them unbounded', () => {
		expect(getStoryTravelFlightMs(0, 1)).toBe(STORY_TRAVEL_TIMING.flightMs);
		expect(getStoryTravelFlightMs(0, 4)).toBeGreaterThan(STORY_TRAVEL_TIMING.flightMs);
		expect(getStoryTravelFlightMs(0, STORY_NODES.length - 1)).toBe(STORY_TRAVEL_TIMING.maxFlightMs);
		expect(getStoryTravelFlightMs(2, 2)).toBe(0);
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
