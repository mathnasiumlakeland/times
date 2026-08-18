export type CourseTrackId = 'prism-circuit' | 'sunset-galleria';

export type CoursePoint3 = readonly [x: number, y: number, z: number];

export type CourseMapPoint = {
	x: number;
	y: number;
	height: number;
	heading: number;
	curve: number;
};

export type CourseMinimap = {
	path: string;
	points: readonly CourseMapPoint[];
};

const MAP_WIDTH = 100;
const MAP_HEIGHT = 74;
const MAP_PADDING = 7;
const COURSE_SAMPLE_COUNT = 192;
const DENSE_SAMPLES_PER_SEGMENT = 30;

/**
 * Shared course centerlines. The Three.js road and DOM minimap both consume
 * these points so route changes remain visually synchronized.
 */
export const COURSE_CONTROL_POINTS: Record<CourseTrackId, readonly CoursePoint3[]> = {
	'prism-circuit': [
		[0, 5, 0],
		[22, 8, -24],
		[43, 3, -4],
		[34, 12, 29],
		[4, 7, 45],
		[-29, 2, 34],
		[-45, 10, 5],
		[-31, 4, -32],
		[0, 6, -44]
	],
	'sunset-galleria': [
		[0, 0, -40],
		[24, 0, -39],
		[40, 0, -29],
		[43, 0, -11],
		[33, 0.2, 2],
		[18, 2.5, 8],
		[2, 3.9, 10],
		[-13, 1.1, 11],
		[-28, 0.6, 18],
		[-39, 5.5, 29],
		[-31, 8.2, 42],
		[-10, 8.5, 44],
		[12, 8.4, 37],
		[30, 8, 23],
		[38, 5.2, 8],
		[25, 2.2, -4],
		[7, 0, -7],
		[-10, 0, -14],
		[-30, 0, -8],
		[-42, 0, -22],
		[-27, 0, -38]
	]
};

type RawPoint = { x: number; y: number; z: number };

const rawCourseSamples = new Map<CourseTrackId, readonly RawPoint[]>();
const minimaps = new Map<CourseTrackId, CourseMinimap>();

export function getCourseSamples(trackId: CourseTrackId) {
	let samples = rawCourseSamples.get(trackId);
	if (!samples) {
		samples = resampleByDistance(sampleClosedCatmullRom(COURSE_CONTROL_POINTS[trackId]));
		rawCourseSamples.set(trackId, samples);
	}
	return samples;
}

export function getCourseMinimap(trackId: CourseTrackId) {
	let minimap = minimaps.get(trackId);
	if (minimap) return minimap;

	const raw = getCourseSamples(trackId);
	let minX = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let minZ = Number.POSITIVE_INFINITY;
	let maxZ = Number.NEGATIVE_INFINITY;
	for (const point of raw) {
		minX = Math.min(minX, point.x);
		maxX = Math.max(maxX, point.x);
		minZ = Math.min(minZ, point.z);
		maxZ = Math.max(maxZ, point.z);
	}
	const centerX = (minX + maxX) / 2;
	const centerZ = (minZ + maxZ) / 2;
	const scale = Math.min(
		(MAP_WIDTH - MAP_PADDING * 2) / Math.max(1, maxX - minX),
		(MAP_HEIGHT - MAP_PADDING * 2) / Math.max(1, maxZ - minZ)
	);
	const points = raw.map((point, index): CourseMapPoint => {
		const previous = raw[(index - 1 + raw.length) % raw.length];
		const next = raw[(index + 1) % raw.length];
		const before = raw[(index - 3 + raw.length) % raw.length];
		const after = raw[(index + 3) % raw.length];
		const heading = Math.atan2(next.z - previous.z, next.x - previous.x);
		const beforeHeading = Math.atan2(point.z - before.z, point.x - before.x);
		const afterHeading = Math.atan2(after.z - point.z, after.x - point.x);
		return {
			x: MAP_WIDTH / 2 + (point.x - centerX) * scale,
			y: MAP_HEIGHT / 2 + (point.z - centerZ) * scale,
			height: point.y,
			heading,
			curve: clamp(normalizeAngle(afterHeading - beforeHeading) / 0.36, -1, 1)
		};
	});
	const path = `${points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')} Z`;
	minimap = { path, points };
	minimaps.set(trackId, minimap);
	return minimap;
}

export function getCourseMapPoint(trackId: CourseTrackId, progress: number): CourseMapPoint {
	const points = getCourseMinimap(trackId).points;
	const position = wrapUnit(progress) * points.length;
	const index = Math.floor(position) % points.length;
	const nextIndex = (index + 1) % points.length;
	const amount = position - Math.floor(position);
	const current = points[index];
	const next = points[nextIndex];
	return {
		x: lerp(current.x, next.x, amount),
		y: lerp(current.y, next.y, amount),
		height: lerp(current.height, next.height, amount),
		heading: current.heading + normalizeAngle(next.heading - current.heading) * amount,
		curve: lerp(current.curve, next.curve, amount)
	};
}

function sampleClosedCatmullRom(controlPoints: readonly CoursePoint3[]) {
	const dense: RawPoint[] = [];
	for (let index = 0; index < controlPoints.length; index += 1) {
		const p0 = controlPoints[(index - 1 + controlPoints.length) % controlPoints.length];
		const p1 = controlPoints[index];
		const p2 = controlPoints[(index + 1) % controlPoints.length];
		const p3 = controlPoints[(index + 2) % controlPoints.length];
		for (let step = 0; step < DENSE_SAMPLES_PER_SEGMENT; step += 1) {
			const t = step / DENSE_SAMPLES_PER_SEGMENT;
			dense.push({
				x: catmull(p0[0], p1[0], p2[0], p3[0], t),
				y: catmull(p0[1], p1[1], p2[1], p3[1], t),
				z: catmull(p0[2], p1[2], p2[2], p3[2], t)
			});
		}
	}
	return dense;
}

function resampleByDistance(dense: readonly RawPoint[]) {
	const cumulative = [0];
	let total = 0;
	for (let index = 1; index <= dense.length; index += 1) {
		const previous = dense[index - 1];
		const current = dense[index % dense.length];
		total += Math.hypot(current.x - previous.x, current.y - previous.y, current.z - previous.z);
		cumulative.push(total);
	}

	const samples: RawPoint[] = [];
	let sourceIndex = 1;
	for (let index = 0; index < COURSE_SAMPLE_COUNT; index += 1) {
		const targetDistance = (index / COURSE_SAMPLE_COUNT) * total;
		while (sourceIndex < cumulative.length - 1 && cumulative[sourceIndex] < targetDistance) sourceIndex += 1;
		const startDistance = cumulative[sourceIndex - 1];
		const endDistance = cumulative[sourceIndex];
		const amount = (targetDistance - startDistance) / Math.max(0.000001, endDistance - startDistance);
		const start = dense[sourceIndex - 1];
		const end = dense[sourceIndex % dense.length];
		samples.push({
			x: lerp(start.x, end.x, amount),
			y: lerp(start.y, end.y, amount),
			z: lerp(start.z, end.z, amount)
		});
	}
	return samples;
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number) {
	const t2 = t * t;
	const t3 = t2 * t;
	return 0.5 * (
		2 * p1 +
		(-p0 + p2) * t +
		(2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
		(-p0 + 3 * p1 - 3 * p2 + p3) * t3
	);
}

function normalizeAngle(value: number) {
	let angle = value;
	while (angle > Math.PI) angle -= Math.PI * 2;
	while (angle < -Math.PI) angle += Math.PI * 2;
	return angle;
}

function wrapUnit(value: number) {
	return ((value % 1) + 1) % 1;
}

function lerp(from: number, to: number, amount: number) {
	return from + (to - from) * amount;
}

function clamp(value: number, minimum: number, maximum: number) {
	return Math.min(maximum, Math.max(minimum, value));
}
