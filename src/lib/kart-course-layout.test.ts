import { describe, expect, test } from 'bun:test';
import {
	COURSE_CONTROL_POINTS,
	getCourseMapPoint,
	getCourseMinimap,
	getCourseSamples
} from './kart-course-layout';

describe('shared kart course layout', () => {
	test('keeps every minimap point inside its compact view box', () => {
		for (const trackId of ['prism-circuit', 'sunset-galleria'] as const) {
			const minimap = getCourseMinimap(trackId);
			expect(minimap.path.startsWith('M')).toBe(true);
			expect(minimap.path.endsWith('Z')).toBe(true);
			expect(minimap.points).toHaveLength(192);
			for (const point of minimap.points) {
				expect(point.x).toBeGreaterThanOrEqual(6.9);
				expect(point.x).toBeLessThanOrEqual(93.1);
				expect(point.y).toBeGreaterThanOrEqual(6.9);
				expect(point.y).toBeLessThanOrEqual(67.1);
			}
		}
	});

	test('gives Coconut Mall a real upper floor and lower-floor return', () => {
		const heights = getCourseSamples('sunset-galleria').map((point) => point.y);
		expect(Math.max(...heights)).toBeGreaterThan(8);
		expect(Math.min(...heights)).toBeLessThan(0.05);
		expect(COURSE_CONTROL_POINTS['sunset-galleria'].length).toBeGreaterThan(16);
	});

	test('wraps racer positions continuously around the finish line', () => {
		const beforeFinish = getCourseMapPoint('sunset-galleria', 0.9999);
		const afterFinish = getCourseMapPoint('sunset-galleria', 0.0001);
		expect(Math.hypot(beforeFinish.x - afterFinish.x, beforeFinish.y - afterFinish.y)).toBeLessThan(1);
	});
});
