export const STORY_PROGRESS_VERSION = 1;
export const STORY_MAP_WIDTH = 1000;
export const STORY_MAP_HEIGHT = 1770;
export const STORY_TRAVEL_TIMING = {
	ignitionDelayMs: 120,
	ignitionMs: 560,
	flightMs: 1450,
	arrivalMs: 260
} as const;

export type StoryNodeStatus = 'completed' | 'current' | 'locked';

export type StoryTravel = {
	id: number;
	fromIndex: number;
	toIndex: number;
};

export type StoryPlanetNode = {
	id: string;
	kind: 'planet';
	table: number;
	title: string;
	chapter: string;
	color: string;
	x: number;
	y: number;
};

export type StoryBossNode = {
	id: string;
	kind: 'boss';
	bossNumber: number;
	bossName: string;
	rank: string;
	tables: readonly number[];
	intro: string;
	color: string;
	x: number;
	y: number;
};

export type StoryNode = StoryPlanetNode | StoryBossNode;

export type StoryProgress = {
	version: typeof STORY_PROGRESS_VERSION;
	completedNodeIds: string[];
	bestScores: Record<string, number>;
};

export const EMPTY_STORY_PROGRESS: StoryProgress = {
	version: STORY_PROGRESS_VERSION,
	completedNodeIds: [],
	bestScores: {}
};

export const STORY_NODES: StoryNode[] = [
	{ id: 'planet-1', kind: 'planet', table: 1, title: 'Pebble Prime', chapter: 'First launch', color: '#d6f247', x: 155, y: 120 },
	{ id: 'planet-2', kind: 'planet', table: 2, title: 'Twin Moon', chapter: 'Binary belt', color: '#a7dded', x: 465, y: 245 },
	{ id: 'planet-3', kind: 'planet', table: 3, title: 'Tri-Star', chapter: 'Triple system', color: '#ffd45a', x: 785, y: 140 },
	{
		id: 'boss-1', kind: 'boss', bossNumber: 1, bossName: 'Scout Zorp-9', rank: 'Sector gate', tables: [1, 2, 3],
		intro: 'You cleared three planets, cadet. Now solve all three tables while I return fire!', color: '#8d75ff', x: 855, y: 410
	},
	{ id: 'planet-4', kind: 'planet', table: 4, title: 'Quadrant Cove', chapter: 'Outer square', color: '#ff6262', x: 620, y: 550 },
	{ id: 'planet-5', kind: 'planet', table: 5, title: 'High-Five Haven', chapter: 'Five-star port', color: '#d6f247', x: 300, y: 480 },
	{ id: 'planet-6', kind: 'planet', table: 6, title: 'Hexa Harbor', chapter: 'Six-ring station', color: '#a7dded', x: 145, y: 710 },
	{
		id: 'boss-2', kind: 'boss', bossNumber: 2, bossName: 'Captain Vexa', rank: 'Nebula guard', tables: [4, 5, 6],
		intro: 'Zorp warned me about you. Let us see how well you can mix tables four, five, and six.', color: '#ff6262', x: 330, y: 875
	},
	{ id: 'planet-7', kind: 'planet', table: 7, title: 'Lucky Nova', chapter: 'Seven-star drift', color: '#ffd45a', x: 655, y: 805 },
	{ id: 'planet-8', kind: 'planet', table: 8, title: 'Octo Orbit', chapter: 'Eight moon loop', color: '#8d75ff', x: 850, y: 1030 },
	{ id: 'planet-9', kind: 'planet', table: 9, title: 'Cloud Nine', chapter: 'Nine-light cloud', color: '#d6f247', x: 595, y: 1165 },
	{
		id: 'boss-3', kind: 'boss', bossNumber: 3, bossName: 'Admiral Quasar', rank: 'Rift commander', tables: [7, 8, 9],
		intro: 'This rift opens only for a true navigator. Survive a mixed volley from tables seven through nine.', color: '#a7dded', x: 250, y: 1085
	},
	{ id: 'planet-10', kind: 'planet', table: 10, title: 'Deca Station', chapter: 'Ten-count relay', color: '#ff6262', x: 130, y: 1340 },
	{ id: 'planet-11', kind: 'planet', table: 11, title: 'Prime Rift', chapter: 'Twin-digit frontier', color: '#a7dded', x: 425, y: 1480 },
	{ id: 'planet-12', kind: 'planet', table: 12, title: 'Dozen Dawn', chapter: 'Final planet', color: '#ffd45a', x: 750, y: 1390 },
	{
		id: 'boss-4', kind: 'boss', bossNumber: 4, bossName: 'Emperor Null', rank: 'Final guardian', tables: [10, 11, 12],
		intro: 'No pilot has crossed the final gate. Combine tables ten, eleven, and twelve, or turn back now.', color: '#8d75ff', x: 835, y: 1650
	}
];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function maxScoreForNode(node: StoryNode) {
	return node.kind === 'planet' ? 10 : 6;
}

export function normalizeStoryProgress(value: unknown): StoryProgress {
	if (!isRecord(value)) return { ...EMPTY_STORY_PROGRESS, completedNodeIds: [], bestScores: {} };
	const requestedIds = new Set(
		Array.isArray(value.completedNodeIds)
			? value.completedNodeIds.filter((id): id is string => typeof id === 'string')
			: []
	);
	const completedNodeIds: string[] = [];
	for (const node of STORY_NODES) {
		if (!requestedIds.has(node.id)) break;
		completedNodeIds.push(node.id);
	}

	const rawBestScores = isRecord(value.bestScores) ? value.bestScores : {};
	const bestScores: Record<string, number> = {};
	for (const node of STORY_NODES) {
		const score = rawBestScores[node.id];
		if (typeof score !== 'number' || !Number.isFinite(score)) continue;
		bestScores[node.id] = Math.min(maxScoreForNode(node), Math.max(0, Math.floor(score)));
	}

	return { version: STORY_PROGRESS_VERSION, completedNodeIds, bestScores };
}

export function getStoryProgress(progress: StoryProgress) {
	const completedCount = Math.min(progress.completedNodeIds.length, STORY_NODES.length);
	return {
		completedCount,
		currentIndex: Math.min(completedCount, STORY_NODES.length - 1),
		isComplete: completedCount === STORY_NODES.length,
		percent: Math.round((completedCount / STORY_NODES.length) * 100)
	};
}

export function getStoryNodeStatus(index: number, progress: StoryProgress): StoryNodeStatus {
	const { completedCount, isComplete } = getStoryProgress(progress);
	if (isComplete || index < completedCount) return 'completed';
	return index === completedCount ? 'current' : 'locked';
}

export function recordStoryResult(progress: StoryProgress, nodeId: string, score: number, passed: boolean) {
	const normalized = normalizeStoryProgress(progress);
	const nodeIndex = STORY_NODES.findIndex((node) => node.id === nodeId);
	if (nodeIndex < 0) return normalized;

	const node = STORY_NODES[nodeIndex];
	const safeScore = Math.min(maxScoreForNode(node), Math.max(0, Math.floor(Number.isFinite(score) ? score : 0)));
	const bestScores = {
		...normalized.bestScores,
		[nodeId]: Math.max(normalized.bestScores[nodeId] ?? 0, safeScore)
	};
	const currentIndex = normalized.completedNodeIds.length;
	if (!passed || nodeIndex > currentIndex || normalized.completedNodeIds.includes(nodeId)) {
		return { ...normalized, bestScores };
	}

	if (nodeIndex !== currentIndex) return { ...normalized, bestScores };
	return {
		...normalized,
		completedNodeIds: [...normalized.completedNodeIds, nodeId],
		bestScores
	};
}

export function makeStoryPath(nodes: readonly StoryNode[] = STORY_NODES) {
	if (nodes.length === 0) return '';
	let path = `M ${nodes[0].x} ${nodes[0].y}`;
	for (let index = 1; index < nodes.length; index += 1) {
		const previous = nodes[index - 1];
		const node = nodes[index];
		const middleY = Math.round((previous.y + node.y) / 2);
		path += ` C ${previous.x} ${middleY}, ${node.x} ${middleY}, ${node.x} ${node.y}`;
	}
	return path;
}

export function getStoryTravelPath(fromIndex: number, toIndex: number) {
	const from = STORY_NODES[fromIndex];
	const to = STORY_NODES[toIndex];
	return from && to ? makeStoryPath([from, to]) : '';
}
