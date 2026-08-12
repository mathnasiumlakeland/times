import { describe, expect, it } from 'bun:test';
import { createRaceState, getRaceEvents, getTrackPose, kartTracks, updateRace, type RaceInput } from './kart-race';
import { isRoadEntityProjectable } from './kart-renderer';

const idle: RaceInput = { steer: 0, throttle: 0, brake: 0, drift: false, useItem: false };
const accelerate: RaceInput = { ...idle, throttle: 1 };

function advance(state: ReturnType<typeof createRaceState>, seconds: number, input: RaceInput = idle) {
	for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 60) updateRace(state, input, 1 / 60);
}

describe('kart race', () => {
	it('counts down, announces go, and starts racing', () => {
		const race = createRaceState('prism-circuit', { seed: 12 });
		advance(race, 3.1);
		expect(race.phase).toBe('racing');
		const events = getRaceEvents(race);
		expect(events.filter((event) => event.type === 'countdown')).toHaveLength(3);
		expect(events.some((event) => event.type === 'go')).toBe(true);
		expect(getRaceEvents(race)).toEqual([]);
	});

	it('does not move without throttle after the countdown', () => {
		const race = createRaceState('sunset-galleria');
		advance(race, 5);
		expect(race.player.distance).toBe(0);
		expect(race.player.speed).toBe(0);
	});

	it('completes a full three-lap race', () => {
		const race = createRaceState('prism-circuit', { seed: 44, laps: 3 });
		advance(race, 3.1);
		advance(race, 70, accelerate);
		expect(race.finished).toBe(true);
		expect(race.result).not.toBeNull();
		expect(race.player.distance).toBe(3);
		expect(race.result!.totalTime).toBeGreaterThan(30);
	});

	it('charges a drift and releases a boost', () => {
		const race = createRaceState('prism-circuit', { seed: 71 });
		advance(race, 3.1);
		for (const [index, rival] of race.rivals.entries()) {
			rival.distance = -0.2 - index * 0.02;
			rival.progress = ((rival.distance % 1) + 1) % 1;
		}
		advance(race, 8, accelerate);
		advance(race, 1.2, { ...accelerate, steer: 1, drift: true });
		expect(race.player.drift.charge).toBeGreaterThan(0.2);
		updateRace(race, accelerate, 1 / 30);
		expect(race.player.boost.remaining).toBeGreaterThan(0);
		expect(getRaceEvents(race).some((event) => event.type === 'boost')).toBe(true);
	});

	it('creates deterministic rival grids from a seed', () => {
		const first = createRaceState('sunset-galleria', { seed: 99 });
		const second = createRaceState('sunset-galleria', { seed: 99 });
		expect(first.rivals.map((rival) => [rival.skill, rival.phaseOffset])).toEqual(
			second.rivals.map((rival) => [rival.skill, rival.phaseOffset])
		);
	});

	it('returns a stable pose for wrapped track progress', () => {
		const first = getTrackPose('prism-circuit', 0.25, 0.4);
		const wrapped = getTrackPose('prism-circuit', 1.25, 0.4);
		expect(wrapped.x).toBeCloseTo(first.x, 8);
		expect(wrapped.y).toBeCloseTo(first.y, 8);
	});

	it('creates an eight-driver field with varied difficulty', () => {
		const race = createRaceState('prism-circuit', { seed: 18 });
		expect(race.rivals).toHaveLength(7);
		expect(race.rivals.filter((rival) => rival.difficulty === 'easy')).toHaveLength(2);
		expect(race.rivals.filter((rival) => rival.difficulty === 'medium')).toHaveLength(3);
		expect(race.rivals.filter((rival) => rival.difficulty === 'hard')).toHaveLength(2);
	});

	it('uses the public course names', () => {
		expect(kartTracks['prism-circuit'].name).toBe('Rainbow Road');
		expect(kartTracks['sunset-galleria'].name).toBe('Coconut Mall');
	});

	it('does not create collision hazards that have no rendered source', () => {
		expect('hazards' in createRaceState('prism-circuit')).toBe(false);
		expect('hazards' in createRaceState('sunset-galleria')).toBe(false);
	});

	it('keeps rivals and rear shells projectable throughout their collision bands', () => {
		expect(isRoadEntityProjectable(0.0029)).toBe(true);
		expect(isRoadEntityProjectable(-0.0029)).toBe(true);
		expect(isRoadEntityProjectable(-0.0067)).toBe(true);
	});

	it('places deterministic mall furniture only inside Coconut Mall', () => {
		const coconut = createRaceState('sunset-galleria', { seed: 19 });
		const repeated = createRaceState('sunset-galleria', { seed: 999 });
		const rainbow = createRaceState('prism-circuit', { seed: 19 });

		expect(coconut.mallObstacles).toHaveLength(8);
		expect(coconut.mallObstacles.map(({ type, progress, lane, radius }) => ({ type, progress, lane, radius }))).toEqual(
			repeated.mallObstacles.map(({ type, progress, lane, radius }) => ({ type, progress, lane, radius }))
		);
		expect(new Set(coconut.mallObstacles.map((obstacle) => obstacle.type))).toEqual(
			new Set(['kiosk', 'planter', 'bench'])
		);
		expect(rainbow.mallObstacles).toEqual([]);
	});

	it('leaves a wide passable lane around every mall obstacle', () => {
		const race = createRaceState('sunset-galleria');
		for (const [index, obstacle] of race.mallObstacles.entries()) {
			const clearLeft = obstacle.lane - obstacle.radius - -0.94;
			const clearRight = 0.94 - (obstacle.lane + obstacle.radius);
			expect(Math.max(clearLeft, clearRight)).toBeGreaterThan(0.9);
			if (index > 0) {
				expect(Math.sign(obstacle.lane)).not.toBe(Math.sign(race.mallObstacles[index - 1].lane));
				expect(obstacle.progress - race.mallObstacles[index - 1].progress).toBeGreaterThan(0.08);
			}
		}
	});

	it('applies one obstacle impact and protects the kart with a collision cooldown', () => {
		const race = createRaceState('sunset-galleria', { seed: 31 });
		advance(race, 3.1);
		for (const [index, rival] of race.rivals.entries()) {
			rival.distance = -0.2 - index * 0.02;
			rival.progress = ((rival.distance % 1) + 1) % 1;
			rival.collisionCooldown = 10;
		}
		const obstacle = race.mallObstacles[0];
		race.impacts = [];
		race.player.distance = obstacle.progress;
		race.player.progress = obstacle.progress;
		race.player.lane = obstacle.lane;
		getRaceEvents(race);

		updateRace(race, idle, 1 / 30);
		expect(race.player.stun.remaining).toBeGreaterThan(0);
		expect(race.player.collisionCooldown).toBeGreaterThan(0);
		expect(obstacle.cooldown).toBeGreaterThan(0);
		expect(race.impacts).toHaveLength(1);
		expect(getRaceEvents(race).filter((event) => event.type === 'hit' && event.source === 'obstacle')).toHaveLength(1);

		race.player.lane = obstacle.lane;
		updateRace(race, idle, 1 / 30);
		expect(race.impacts).toHaveLength(1);
		expect(getRaceEvents(race).some((event) => event.type === 'hit')).toBe(false);
	});

	it('steers rivals toward the open lane before mall furniture', () => {
		const race = createRaceState('sunset-galleria', { seed: 41 });
		advance(race, 3.1);
		const obstacle = race.mallObstacles[0];
		const rival = race.rivals[0];
		rival.distance = obstacle.progress - 0.02;
		rival.progress = rival.distance;
		rival.lane = obstacle.lane;
		rival.targetLane = obstacle.lane;
		rival.speed = 0.05;

		updateRace(race, idle, 1 / 30);
		expect(rival.targetLane).toBeGreaterThan(0.3);
		expect(Math.abs(rival.lane - obstacle.lane)).toBeGreaterThan(0);
		advance(race, 0.55);
		expect(rival.progress).toBeGreaterThan(obstacle.progress);
		expect(rival.collisionCooldown).toBe(0);
	});

	it('runs an item roulette before awarding an item', () => {
		const race = createRaceState('prism-circuit', { seed: 28 });
		advance(race, 3.1);
		const box = race.pickups[0];
		race.player.distance = box.progress;
		race.player.progress = box.progress;
		race.player.lane = box.lane;
		updateRace(race, idle, 1 / 30);
		expect(race.player.roulette.active).toBe(true);
		expect(race.player.item).toBeNull();
		expect(getRaceEvents(race).some((event) => event.type === 'roulette-start')).toBe(true);
		advance(race, 1.7);
		expect(race.player.roulette.active).toBe(false);
		expect(race.player.item).not.toBeNull();
		const events = getRaceEvents(race);
		expect(events.some((event) => event.type === 'roulette-tick')).toBe(true);
		expect(events.some((event) => event.type === 'roulette-award')).toBe(true);
	});

	it('launches a green shell forward and bounces it off the road edge', () => {
		const race = createRaceState('sunset-galleria', { seed: 36 });
		advance(race, 3.1);
		race.player.item = 'green-shell';
		race.player.lane = 0.92;
		updateRace(race, { ...idle, steer: 1, useItem: true }, 1 / 30);
		expect(race.projectiles).toHaveLength(1);
		const launchedAt = race.projectiles[0].distance;
		advance(race, 0.4);
		expect(race.projectiles[0].distance).toBeGreaterThan(launchedAt);
		expect(race.projectiles[0].bounces).toBeGreaterThan(0);
		expect(getRaceEvents(race).some((event) => event.type === 'projectile-bounce')).toBe(true);
	});

	it('launches a red shell toward the nearest driver ahead', () => {
		const race = createRaceState('prism-circuit', { seed: 46 });
		advance(race, 3.1);
		race.player.item = 'red-shell';
		race.rivals[0].distance = 0.04;
		race.rivals[0].progress = 0.04;
		race.rivals[0].lane = 0.65;
		for (let index = 1; index < race.rivals.length; index++) {
			race.rivals[index].distance = 0.12 + index * 0.01;
			race.rivals[index].progress = race.rivals[index].distance;
		}
		updateRace(race, { ...idle, useItem: true }, 1 / 30);
		expect(race.projectiles[0].targetId).toBe(race.rivals[0].id);
		const initialLane = race.projectiles[0].lane;
		advance(race, 0.15);
		expect(race.projectiles[0].lane).toBeGreaterThan(initialLane);
	});

	it('drops a banana behind the driver and consumes the item once', () => {
		const race = createRaceState('sunset-galleria', { seed: 52 });
		advance(race, 3.1);
		race.player.distance = 0.4;
		race.player.progress = 0.4;
		race.player.item = 'banana';
		updateRace(race, { ...idle, useItem: true }, 1 / 30);
		updateRace(race, { ...idle, useItem: true }, 1 / 30);
		expect(race.bananas).toHaveLength(1);
		expect(race.bananas[0].distance).toBeLessThan(race.player.distance);
		expect(race.player.item).toBeNull();
	});

	it('makes direct kart collisions affect both drivers', () => {
		const race = createRaceState('prism-circuit', { seed: 63 });
		advance(race, 3.1);
		const rival = race.rivals[0];
		race.player.distance = 0.2;
		race.player.progress = 0.2;
		race.player.lane = 0;
		rival.distance = 0.2;
		rival.progress = 0.2;
		rival.lane = 0;
		updateRace(race, idle, 1 / 30);
		expect(race.player.stun.remaining).toBeGreaterThan(0);
		expect(rival.stun.remaining).toBeGreaterThan(0);
	});

	it('does not retrigger one sustained rival contact after the stun cooldown', () => {
		const race = createRaceState('prism-circuit', { seed: 64 });
		advance(race, 3.1);
		const rival = race.rivals[0];
		for (const [index, other] of race.rivals.slice(1).entries()) {
			other.distance = -0.2 - index * 0.02;
			other.progress = ((other.distance % 1) + 1) % 1;
			other.collisionCooldown = 10;
		}
		const holdContact = () => {
			race.player.distance = 0.2;
			race.player.progress = 0.2;
			race.player.lane = 0;
			rival.distance = 0.2;
			rival.progress = 0.2;
			rival.lane = 0;
			rival.targetLane = 0;
		};
		holdContact();
		updateRace(race, idle, 1 / 30);
		expect(getRaceEvents(race).filter((event) => event.type === 'hit' && event.source === 'rival')).toHaveLength(1);

		for (let frame = 0; frame < 75; frame++) {
			holdContact();
			updateRace(race, idle, 1 / 60);
		}
		expect(getRaceEvents(race).filter((event) => event.type === 'hit' && event.source === 'rival')).toHaveLength(0);

		race.player.distance = 0.2;
		race.player.progress = 0.2;
		race.player.lane = -0.8;
		rival.distance = 0.22;
		rival.progress = 0.22;
		rival.lane = 0.8;
		rival.targetLane = 0.8;
		updateRace(race, idle, 1 / 30);
		expect(race.rivalContacts).toEqual([]);

		holdContact();
		updateRace(race, idle, 1 / 30);
		expect(getRaceEvents(race).filter((event) => event.type === 'hit' && event.source === 'rival')).toHaveLength(1);
	});

	it('lets rivals collect boxes without taking the player opportunity away', () => {
		const race = createRaceState('prism-circuit', { seed: 72 });
		advance(race, 3.1);
		const box = race.pickups[0];
		for (const [index, rival] of race.rivals.entries()) {
			rival.distance = -0.2 - index * 0.02;
			rival.progress = ((rival.distance % 1) + 1) % 1;
		}
		const rival = race.rivals[0];
		rival.distance = box.progress;
		rival.progress = box.progress;
		rival.lane = box.lane;
		race.player.distance = -0.4;
		race.player.progress = 0.6;
		updateRace(race, idle, 1 / 30);
		expect(rival.roulette.active).toBe(true);
		expect(box.active).toBe(true);

		race.player.distance = box.progress;
		race.player.progress = box.progress;
		race.player.lane = box.lane;
		updateRace(race, idle, 1 / 30);
		expect(race.player.roulette.active).toBe(true);
		expect(box.active).toBe(false);
	});

	it('lets a dropped banana hit a non-owner', () => {
		const race = createRaceState('sunset-galleria', { seed: 83 });
		advance(race, 3.1);
		for (const [index, rival] of race.rivals.entries()) {
			rival.distance = -0.2 - index * 0.02;
			rival.progress = ((rival.distance % 1) + 1) % 1;
		}
		race.player.distance = 0.5;
		race.player.progress = 0.5;
		race.player.lane = 0.3;
		race.player.item = 'banana';
		updateRace(race, { ...idle, useItem: true }, 1 / 30);
		const banana = race.bananas[0];
		banana.age = 0.23;
		const rival = race.rivals[0];
		rival.distance = banana.distance;
		rival.progress = banana.progress;
		rival.lane = banana.lane;
		rival.targetLane = banana.lane;
		rival.speed = 0;
		getRaceEvents(race);
		updateRace(race, idle, 1 / 30);
		expect(race.bananas).toHaveLength(0);
		expect(rival.stun.remaining).toBeGreaterThan(0);
		expect(getRaceEvents(race).some((event) => event.type === 'item-hit' && event.item === 'banana')).toBe(true);
	});
});
