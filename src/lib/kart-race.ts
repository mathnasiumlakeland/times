import { getCourseMapPoint } from './kart-course-layout';

export type KartTrackId = 'prism-circuit' | 'sunset-galleria';
export type RacePhase = 'countdown' | 'racing' | 'finished';
export type KartItem = 'green-shell' | 'red-shell' | 'banana';
export type RivalDifficulty = 'easy' | 'medium' | 'hard';

export type RaceInput = {
	steer: number;
	throttle: number;
	brake: number;
	drift: boolean;
	useItem: boolean;
};

export type TrackDefinition = {
	id: KartTrackId;
	name: string;
	length: number;
	maxSpeed: number;
	acceleration: number;
	braking: number;
	rollingDrag: number;
	steering: number;
	boostPads: readonly number[];
};

export type RouletteState = {
	active: boolean;
	elapsed: number;
	duration: number;
	tick: number;
	preview: KartItem;
};

export type KartState = {
	id: string;
	progress: number;
	distance: number;
	lane: number;
	speed: number;
	lap: number;
	rank: number;
	item: KartItem | null;
	heldItem: KartItem | null;
	roulette: RouletteState;
	drift: {
		active: boolean;
		side: -1 | 0 | 1;
		charge: number;
		tier: number;
	};
	boost: {
		remaining: number;
		duration: number;
	};
	stun: {
		remaining: number;
		spin: number;
	};
	collisionCooldown: number;
};

export type RivalState = KartState & {
	name: string;
	color: string;
	skill: number;
	difficulty: RivalDifficulty;
	targetLane: number;
	phaseOffset: number;
	itemUseDelay: number;
};

export type PickupState = {
	id: string;
	progress: number;
	lane: number;
	active: boolean;
	respawn: number;
};

export type MallObstacleType = 'kiosk' | 'planter' | 'bench';

export type MallObstacleState = {
	id: string;
	type: MallObstacleType;
	progress: number;
	lane: number;
	/** Half-width of the obstacle in normalized road-lane coordinates. */
	radius: number;
	/** Remaining visual impact pulse time in seconds. */
	cooldown: number;
};

export type ShellState = {
	id: string;
	type: 'green-shell' | 'red-shell';
	ownerId: string;
	distance: number;
	progress: number;
	lane: number;
	laneVelocity: number;
	speed: number;
	targetId: string | null;
	age: number;
	bounces: number;
};

export type BananaState = {
	id: string;
	ownerId: string;
	distance: number;
	progress: number;
	lane: number;
	age: number;
};

export type ImpactState = {
	id: string;
	distance: number;
	progress: number;
	lane: number;
	elapsed: number;
	duration: number;
	color: string;
};

export type RaceResult = {
	rank: number;
	totalTime: number;
	bestLap: number;
};

export type RacePosition = {
	id: string;
	rank: number;
	distance: number;
};

export type RaceEvent =
	| { type: 'countdown'; value: number }
	| { type: 'go' }
	| { type: 'drift'; tier: number }
	| { type: 'boost'; source: 'drift' | 'pad' }
	| { type: 'pickup'; item: KartItem; racerId: string }
	| { type: 'roulette-start'; racerId: string }
	| { type: 'roulette-tick'; racerId: string; item: KartItem; index: number }
	| { type: 'roulette-award'; racerId: string; item: KartItem }
	| { type: 'item'; item: KartItem; racerId: string }
	| { type: 'item-hold'; item: KartItem; racerId: string }
	| { type: 'item-block'; defenseItem: KartItem; incomingItem: 'green-shell' | 'red-shell' }
	| { type: 'item-use'; item: KartItem; racerId: string }
	| { type: 'projectile-bounce'; id: string; ownerId: string }
	| { type: 'item-hit'; item: KartItem; targetId: string; ownerId: string }
	| { type: 'hit'; source: 'rival' | 'obstacle' | 'item'; item?: KartItem }
	| { type: 'pickup-respawn'; id: string }
	| { type: 'lap'; lap: number }
	| { type: 'finish'; rank: number };

export type RaceState = {
	track: TrackDefinition;
	phase: RacePhase;
	countdown: number;
	elapsed: number;
	raceTime: number;
	laps: number;
	lap: number;
	checkpoint: number;
	progress: number;
	player: KartState;
	rivals: RivalState[];
	pickups: PickupState[];
	mallObstacles: MallObstacleState[];
	projectiles: ShellState[];
	bananas: BananaState[];
	impacts: ImpactState[];
	positions: RacePosition[];
	finished: boolean;
	result: RaceResult | null;
	seed: number;
	randomState: number;
	accumulator: number;
	events: RaceEvent[];
	lastCountdownValue: number;
	lastUseItem: boolean;
	boostPadCooldown: number;
	lapStartedAt: number;
	lapTimes: number[];
	nextWorldItemId: number;
	/** Rivals currently touching the player, used to keep one bump from retriggering. */
	rivalContacts: string[];
};

export type TrackPose = {
	progress: number;
	lane: number;
	x: number;
	y: number;
	heading: number;
	curve: number;
};

const fixedStep = 1 / 60;
const rouletteItems: readonly KartItem[] = ['green-shell', 'red-shell', 'banana'];
const kartContactLength = 0.0105;
const kartContactWidth = 0.36;
const kartContactReleaseLength = 0.015;
const kartContactReleaseWidth = 0.48;
const kartBumpCooldown = 0.28;
const bananaDropDistance = 0.014;
const heldItemDistance = 0.0062;
const mallObstacleHitPulse = 0.46;
const mallObstaclePattern = [
	{ type: 'kiosk', progress: 0.1, lane: -0.58, radius: 0.26 },
	{ type: 'planter', progress: 0.19, lane: 0.52, radius: 0.22 },
	{ type: 'bench', progress: 0.32, lane: -0.48, radius: 0.25 },
	{ type: 'kiosk', progress: 0.46, lane: 0.58, radius: 0.26 },
	{ type: 'planter', progress: 0.55, lane: -0.56, radius: 0.22 },
	{ type: 'bench', progress: 0.64, lane: 0.48, radius: 0.25 },
	{ type: 'kiosk', progress: 0.76, lane: -0.5, radius: 0.26 },
	{ type: 'planter', progress: 0.87, lane: 0.56, radius: 0.22 }
] as const satisfies readonly Omit<MallObstacleState, 'id' | 'cooldown'>[];
const rivalProfiles = [
	{ name: 'Mochi', color: '#49d2a7', skill: 0.72, difficulty: 'easy' },
	{ name: 'Pixel', color: '#9d7dff', skill: 0.77, difficulty: 'easy' },
	{ name: 'Comet', color: '#66dfff', skill: 0.81, difficulty: 'medium' },
	{ name: 'Zing', color: '#ffd45a', skill: 0.85, difficulty: 'medium' },
	{ name: 'Nova', color: '#ff718d', skill: 0.89, difficulty: 'medium' },
	{ name: 'Orbit', color: '#ff9c62', skill: 0.93, difficulty: 'hard' },
	{ name: 'Vanta', color: '#e8efff', skill: 0.97, difficulty: 'hard' }
] as const satisfies readonly { name: string; color: string; skill: number; difficulty: RivalDifficulty }[];

export const kartTracks: Record<KartTrackId, TrackDefinition> = {
	'prism-circuit': {
		id: 'prism-circuit',
		name: 'Rainbow Road',
		length: 1,
		maxSpeed: 0.084,
		acceleration: 0.052,
		braking: 0.095,
		rollingDrag: 0.017,
		steering: 1.24,
		boostPads: [0.074, 0.296, 0.53, 0.786]
	},
	'sunset-galleria': {
		id: 'sunset-galleria',
		name: 'Coconut Mall',
		length: 1,
		maxSpeed: 0.079,
		acceleration: 0.055,
		braking: 0.1,
		rollingDrag: 0.018,
		steering: 1.31,
		boostPads: [0.075, 0.238, 0.535, 0.675, 0.91]
	}
};

export function createRaceState(
	trackId: KartTrackId,
	options: { seed?: number; laps?: number } = {}
): RaceState {
	const track = kartTracks[trackId];
	const seed = normalizeSeed(options.seed ?? 1977);
	const initialRandom = seededRandom(seed);
	const player = createKart('player', 0, 0);
	player.rank = 8;
	const rivals = rivalProfiles.map((profile, index): RivalState => {
		const row = Math.floor(index / 2);
		const isFinalSoloRow = index === rivalProfiles.length - 1;
		const lane = isFinalSoloRow ? 0 : index % 2 === 0 ? -0.35 : 0.35;
		const kart = createKart(`rival-${index + 1}`, 0.014 + row * 0.014, lane);
		return {
			...kart,
			...profile,
			skill: profile.skill + initialRandom() * 0.012,
			targetLane: kart.lane,
			phaseOffset: initialRandom() * Math.PI * 2,
			itemUseDelay: 1 + initialRandom() * 1.6
		};
	});

	const rowProgress = trackId === 'prism-circuit' ? [0.16, 0.37, 0.59, 0.81] : [0.08, 0.32, 0.5, 0.74, 0.9];
	const pickupLanes = [-0.55, 0, 0.55];
	const state: RaceState = {
		track,
		phase: 'countdown',
		countdown: 3,
		elapsed: 0,
		raceTime: 0,
		laps: Math.max(1, Math.min(9, Math.floor(options.laps ?? 3))),
		lap: 0,
		checkpoint: 0,
		progress: 0,
		player,
		rivals,
		pickups: rowProgress.flatMap((progress, rowIndex) => pickupLanes.map((lane, laneIndex) => ({
			id: `box-${rowIndex + 1}-${laneIndex + 1}`,
			progress,
			lane,
			active: true,
			respawn: 0
		}))),
		mallObstacles: trackId === 'sunset-galleria'
			? mallObstaclePattern.map((obstacle, index) => ({
					...obstacle,
					id: `mall-${obstacle.type}-${index + 1}`,
					cooldown: 0
				}))
			: [],
		projectiles: [],
		bananas: [],
		impacts: [],
		positions: [],
		finished: false,
		result: null,
		seed,
		randomState: seed,
		accumulator: 0,
		events: [],
		lastCountdownValue: 4,
		lastUseItem: false,
		boostPadCooldown: 0,
		lapStartedAt: 0,
		lapTimes: [],
		nextWorldItemId: 1,
		rivalContacts: []
	};
	updatePositions(state);
	return state;
}

export function updateRace(state: RaceState, input: RaceInput, deltaSeconds: number) {
	if (state.finished || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return state;
	state.accumulator += Math.min(0.1, deltaSeconds);
	while (state.accumulator >= fixedStep) {
		stepRace(state, input, fixedStep);
		state.accumulator -= fixedStep;
		if (state.finished) {
			state.accumulator = 0;
			break;
		}
	}
	return state;
}

export function getRaceEvents(state: RaceState) {
	return state.events.splice(0, state.events.length);
}

export function getTrackPose(trackOrId: TrackDefinition | KartTrackId, progress: number, lane = 0): TrackPose {
	const track = typeof trackOrId === 'string' ? kartTracks[trackOrId] : trackOrId;
	const wrapped = wrapUnit(progress);
	const point = getCourseMapPoint(track.id, wrapped);
	const normalizedX = (point.x - 50) / 43;
	const normalizedY = (point.y - 37) / 30;
	const lateralHeading = point.heading + Math.PI / 2;
	return {
		progress: wrapped,
		lane,
		x: normalizedX + Math.cos(lateralHeading) * lane * 0.12,
		y: normalizedY + Math.sin(lateralHeading) * lane * 0.12,
		heading: point.heading,
		curve: point.curve
	};
}

function stepRace(state: RaceState, input: RaceInput, delta: number) {
	state.elapsed += delta;
	stepImpacts(state, delta);
	if (state.phase === 'countdown') {
		state.countdown = Math.max(0, state.countdown - delta);
		const countdownValue = Math.ceil(state.countdown);
		if (countdownValue > 0 && countdownValue !== state.lastCountdownValue) {
			state.lastCountdownValue = countdownValue;
			state.events.push({ type: 'countdown', value: countdownValue });
		}
		if (state.countdown <= 0) {
			state.phase = 'racing';
			state.lastCountdownValue = 0;
			state.events.push({ type: 'go' });
		}
		return;
	}

	state.raceTime += delta;
	state.boostPadCooldown = Math.max(0, state.boostPadCooldown - delta);
	stepPlayer(state, input, delta);
	stepRivals(state, delta);
	stepRoulettes(state, delta);
	stepPickupsAndHazards(state, delta);
	stepWorldItems(state, delta);
	stepMallObstacles(state, delta);
	updatePositions(state);
	state.progress = state.player.progress;
	state.lap = state.player.lap;
	state.checkpoint = Math.floor(state.player.progress * 4);

	if (state.player.distance >= state.laps) {
		state.player.distance = state.laps;
		state.player.progress = 0;
		state.player.lap = state.laps;
		state.finished = true;
		state.phase = 'finished';
		state.player.speed = 0;
		state.result = {
			rank: state.player.rank,
			totalTime: state.raceTime,
			bestLap: state.lapTimes.length > 0 ? Math.min(...state.lapTimes) : state.raceTime
		};
		state.events.push({ type: 'finish', rank: state.player.rank });
	}
}

function stepPlayer(state: RaceState, input: RaceInput, delta: number) {
	const player = state.player;
	const track = state.track;
	stepKartTimers(player, delta);
	const throttle = clamp(input.throttle, 0, 1);
	const brake = clamp(input.brake, 0, 1);
	const steer = clamp(input.steer, -1, 1);
	const speedRatio = player.speed / track.maxSpeed;
	const stunned = player.stun.remaining > 0;
	const boosting = player.boost.remaining > 0;
	const maxSpeed = track.maxSpeed * (boosting ? 1.19 : 1);

	if (!stunned) {
		player.speed += throttle * track.acceleration * delta * (boosting ? 1.34 : 1);
		player.speed -= brake * track.braking * delta;
		player.speed -= track.rollingDrag * delta * (0.28 + Math.max(0, speedRatio) * 0.72);
	} else {
		player.speed -= track.braking * 0.35 * delta;
	}
	if (Math.abs(player.lane) > 1) player.speed -= track.braking * 0.52 * delta * Math.min(1.4, Math.abs(player.lane) - 0.8);
	player.speed = clamp(player.speed, 0, maxSpeed);

	if (!stunned) {
		const steeringStrength = track.steering * (0.46 + Math.min(1, speedRatio) * 0.58);
		player.lane += steer * steeringStrength * delta * (player.drift.active ? 1.2 : 1);
		player.lane -= courseCurve(track.id, player.progress) * player.speed * delta * 0.74;
	} else {
		player.lane += Math.sin(state.elapsed * 29) * delta * 0.45;
	}
	player.lane = clamp(player.lane, -1.38, 1.38);

	updateDrift(state, input.drift, steer, delta);
	const previousLap = player.lap;
	player.distance += player.speed * delta;
	player.progress = wrapUnit(player.distance);
	player.lap = Math.max(0, Math.floor(player.distance));
	if (player.lap > previousLap && player.lap < state.laps) {
		const lapTime = state.raceTime - state.lapStartedAt;
		state.lapTimes.push(lapTime);
		state.lapStartedAt = state.raceTime;
		state.events.push({ type: 'lap', lap: player.lap + 1 });
	}

	if (state.boostPadCooldown <= 0 && track.boostPads.some((pad) => forwardDistance(player.progress, pad) < 0.0038)) {
		activateBoost(state, 0.68, 'pad');
		state.boostPadCooldown = 1.2;
	}

	const heldItemPressed = input.useItem && !state.lastUseItem;
	const heldItemReleased = !input.useItem && state.lastUseItem;
	state.lastUseItem = input.useItem;
	if (heldItemPressed && player.item && !player.roulette.active) holdItem(state, player);
	if (heldItemReleased && player.heldItem) releaseHeldItem(state, player, steer);
}

function stepKartTimers(kart: KartState, delta: number) {
	kart.collisionCooldown = Math.max(0, kart.collisionCooldown - delta);
	kart.stun.remaining = Math.max(0, kart.stun.remaining - delta);
	kart.stun.spin = kart.stun.remaining > 0 ? Math.min(1, kart.stun.remaining * 2.4) : 0;
	kart.boost.remaining = Math.max(0, kart.boost.remaining - delta);
}

function updateDrift(state: RaceState, holding: boolean, steer: number, delta: number) {
	const player = state.player;
	const canDrift = player.speed > state.track.maxSpeed * 0.34 && Math.abs(steer) > 0.18 && player.stun.remaining <= 0;
	if (holding && canDrift) {
		const side = Math.sign(steer) as -1 | 1;
		if (!player.drift.active || (player.drift.side !== 0 && player.drift.side !== side)) {
			player.drift.active = true;
			player.drift.side = side;
			player.drift.charge *= 0.45;
			player.drift.tier = 0;
		}
		player.drift.charge = Math.min(1, player.drift.charge + delta * (0.34 + (player.speed / state.track.maxSpeed) * 0.43));
		const tier = player.drift.charge >= 0.78 ? 3 : player.drift.charge >= 0.47 ? 2 : player.drift.charge >= 0.2 ? 1 : 0;
		if (tier > player.drift.tier) {
			player.drift.tier = tier;
			state.events.push({ type: 'drift', tier });
		}
		return;
	}
	if (player.drift.active) {
		const charge = player.drift.charge;
		if (charge >= 0.18) activateBoost(state, 0.26 + charge * 0.86, 'drift');
		player.drift.active = false;
		player.drift.side = 0;
		player.drift.charge = 0;
		player.drift.tier = 0;
	}
}

function activateBoost(state: RaceState, duration: number, source: 'drift' | 'pad') {
	state.player.boost.duration = Math.max(state.player.boost.duration, duration);
	state.player.boost.remaining = Math.max(state.player.boost.remaining, duration);
	state.player.speed = Math.max(state.player.speed, state.track.maxSpeed * 0.74);
	state.events.push({ type: 'boost', source });
}

function stepRivals(state: RaceState, delta: number) {
	for (let index = 0; index < state.rivals.length; index++) {
		const rival = state.rivals[index];
		stepKartTimers(rival, delta);
		rival.itemUseDelay = Math.max(0, rival.itemUseDelay - delta);
		const playerLead = state.player.distance - rival.distance;
		const rubberBand = clamp(playerLead * 0.035, -0.007, 0.009);
		const targetSpeed = state.track.maxSpeed * rival.skill + rubberBand + Math.sin(state.raceTime * 0.31 + rival.phaseOffset) * 0.0015;
		rival.speed += (targetSpeed - rival.speed) * Math.min(1, delta * (1.45 + rival.skill * 0.45));
		if (rival.stun.remaining > 0) rival.speed *= 0.975;

		const newTarget = Math.sin(state.raceTime * (0.18 + index * 0.017) + rival.phaseOffset) * 0.72;
		rival.targetLane += (newTarget - rival.targetLane) * Math.min(1, delta * 0.4);
		const obstacle = nearestMallObstacleAhead(state, rival);
		if (obstacle && Math.abs(obstacle.lane - rival.targetLane) < obstacle.radius + 0.3) {
			// Slalom toward the wider side of the road. Higher-skill drivers read the
			// obstacle sooner, while every route retains a generous passable lane.
			const clearance = obstacle.radius + 0.4;
			rival.targetLane = obstacle.lane < 0
				? clamp(obstacle.lane + clearance, 0.34, 0.9)
				: clamp(obstacle.lane - clearance, -0.9, -0.34);
		}
		rival.lane += (rival.targetLane - rival.lane) * Math.min(1, delta * (0.9 + rival.skill));
		rival.distance += Math.max(0, rival.speed) * delta;
		rival.progress = wrapUnit(rival.distance);
		rival.lap = Math.max(0, Math.floor(rival.distance));
		if (rival.item && !rival.roulette.active && rival.itemUseDelay <= 0) {
			useItem(state, rival, clamp(rival.targetLane - rival.lane, -1, 1));
			rival.itemUseDelay = 2.2 + nextRandom(state) * 2.4;
		}
	}
}

function nearestMallObstacleAhead(state: RaceState, rival: RivalState) {
	if (state.mallObstacles.length === 0) return undefined;
	const lookAhead = 0.025 + rival.skill * 0.021;
	let nearest: MallObstacleState | undefined;
	let nearestDistance = Number.POSITIVE_INFINITY;
	for (const obstacle of state.mallObstacles) {
		const ahead = forwardDistance(rival.progress, obstacle.progress);
		if (ahead < lookAhead && ahead < nearestDistance) {
			nearest = obstacle;
			nearestDistance = ahead;
		}
	}
	return nearest;
}

function stepRoulettes(state: RaceState, delta: number) {
	for (const kart of allKarts(state)) {
		const roulette = kart.roulette;
		if (!roulette.active) continue;
		roulette.elapsed += delta;
		const nextTick = Math.floor(roulette.elapsed / 0.11);
		while (roulette.tick < nextTick && roulette.elapsed < roulette.duration) {
			roulette.tick += 1;
			roulette.preview = rouletteItems[roulette.tick % rouletteItems.length];
			state.events.push({ type: 'roulette-tick', racerId: kart.id, item: roulette.preview, index: roulette.tick });
		}
		if (roulette.elapsed < roulette.duration) continue;
		roulette.active = false;
		const item = chooseItem(state, kart.rank);
		kart.item = item;
		roulette.preview = item;
		if (kart.id !== 'player') (kart as RivalState).itemUseDelay = 0.7 + nextRandom(state) * 1.5;
		state.events.push({ type: 'pickup', item, racerId: kart.id });
		state.events.push({ type: 'roulette-award', racerId: kart.id, item });
	}
}

function chooseItem(state: RaceState, rank: number): KartItem {
	const roll = nextRandom(state);
	if (rank >= 6) return roll < 0.58 ? 'red-shell' : roll < 0.83 ? 'green-shell' : 'banana';
	if (rank <= 2) return roll < 0.23 ? 'red-shell' : roll < 0.55 ? 'green-shell' : 'banana';
	return roll < 0.4 ? 'red-shell' : roll < 0.74 ? 'green-shell' : 'banana';
}

function startRoulette(state: RaceState, kart: KartState) {
	kart.item = null;
	kart.roulette = {
		active: true,
		elapsed: 0,
		duration: 1.18 + nextRandom(state) * 0.25,
		tick: 0,
		preview: rouletteItems[Math.floor(nextRandom(state) * rouletteItems.length)]
	};
	state.events.push({ type: 'roulette-start', racerId: kart.id });
}

function stepPickupsAndHazards(state: RaceState, delta: number) {
	for (const pickup of state.pickups) {
		if (!pickup.active) {
			pickup.respawn -= delta;
			if (pickup.respawn <= 0) {
				pickup.active = true;
				pickup.respawn = 0;
				state.events.push({ type: 'pickup-respawn', id: pickup.id });
			}
			continue;
		}
		for (const kart of allKarts(state)) {
			if (kart.item || kart.heldItem || kart.roulette.active || kart.stun.remaining > 0) continue;
			if (Math.abs(signedDistance(kart.progress, pickup.progress)) < 0.0047 && Math.abs(kart.lane - pickup.lane) < 0.27) {
				if (kart.id === 'player') {
					pickup.active = false;
					pickup.respawn = 3.2;
				}
				startRoulette(state, kart);
				break;
			}
		}
	}

	for (const rival of state.rivals) {
		const longitudinalGap = Math.abs(state.player.distance - rival.distance);
		const lateralGap = Math.abs(state.player.lane - rival.lane);
		const contactIndex = state.rivalContacts.indexOf(rival.id);
		if (contactIndex >= 0) {
			// Re-arm only after the kart bodies have visibly separated.
			if (longitudinalGap > kartContactReleaseLength || lateralGap > kartContactReleaseWidth) {
				state.rivalContacts.splice(contactIndex, 1);
			}
			continue;
		}
		if (state.player.collisionCooldown > 0 || rival.collisionCooldown > 0) continue;
		if (longitudinalGap < kartContactLength && lateralGap < kartContactWidth) {
			applyKartBump(state, rival);
			state.rivalContacts.push(rival.id);
		}
	}
}

function useItem(state: RaceState, owner: KartState, steer: number) {
	const item = owner.item;
	if (!item) return;
	owner.item = null;
	state.events.push({ type: 'item', item, racerId: owner.id });
	state.events.push({ type: 'item-use', item, racerId: owner.id });
	if (item === 'banana') {
		state.bananas.push({
			id: `banana-${state.nextWorldItemId++}`,
			ownerId: owner.id,
			distance: owner.distance - bananaDropDistance,
			progress: wrapUnit(owner.distance - bananaDropDistance),
			lane: clamp(owner.lane, -0.92, 0.92),
			age: 0
		});
		return;
	}
	const target = item === 'red-shell' ? findTargetAhead(state, owner) : undefined;
	state.projectiles.push({
		id: `shell-${state.nextWorldItemId++}`,
		type: item,
		ownerId: owner.id,
		distance: owner.distance + 0.006,
		progress: wrapUnit(owner.distance + 0.006),
		lane: clamp(owner.lane, -0.9, 0.9),
		laneVelocity: item === 'green-shell' ? (Math.abs(steer) > 0.08 ? steer * 0.58 : courseCurve(state.track.id, owner.progress) * 0.16) : 0,
		speed: item === 'red-shell' ? 0.155 : 0.168,
		targetId: target?.id ?? null,
		age: 0,
		bounces: 0
	});
}

function holdItem(state: RaceState, owner: KartState) {
	const item = owner.item;
	if (!item || owner.heldItem) return;
	owner.item = null;
	owner.heldItem = item;
	state.events.push({ type: 'item-hold', item, racerId: owner.id });
}

function releaseHeldItem(state: RaceState, owner: KartState, steer: number) {
	const item = owner.heldItem;
	if (!item) return;
	owner.heldItem = null;
	owner.item = item;
	useItem(state, owner, steer);
}

function stepWorldItems(state: RaceState, delta: number) {
	for (const shell of state.projectiles) {
		shell.age += delta;
		if (shell.type === 'red-shell') {
			let target = shell.targetId ? findKart(state, shell.targetId) : undefined;
			if (!target || target.distance < shell.distance - 0.02) {
				target = findTargetAheadFromDistance(state, shell.ownerId, shell.distance);
				shell.targetId = target?.id ?? null;
			}
			if (target) shell.lane += clamp(target.lane - shell.lane, -1, 1) * delta * 3.25;
		} else {
			shell.lane += shell.laneVelocity * delta;
			if (shell.lane > 0.94 || shell.lane < -0.94) {
				shell.lane = clamp(shell.lane, -0.94, 0.94);
				shell.laneVelocity *= -1;
				shell.bounces += 1;
				state.events.push({ type: 'projectile-bounce', id: shell.id, ownerId: shell.ownerId });
			}
		}
		shell.distance += shell.speed * delta;
		shell.progress = wrapUnit(shell.distance);
	}

	const liveProjectiles: ShellState[] = [];
	for (const shell of state.projectiles) {
		let hit = false;
		if (shell.age > 0.1) {
			for (const kart of allKarts(state)) {
				if (kart.id === shell.ownerId) continue;
				if (Math.abs(kart.distance - shell.distance) < 0.0067 && Math.abs(kart.lane - shell.lane) < 0.22) {
					if (
						kart.id === 'player' &&
						kart.heldItem &&
						shell.distance <= kart.distance + 0.002
					) {
						blockShellWithHeldItem(state, kart, shell.type);
					} else if (kart.collisionCooldown <= 0) {
						applyItemHit(state, kart, shell.type, shell.ownerId, shell.lane);
					} else {
						continue;
					}
					hit = true;
					break;
				}
			}
		}
		if (!hit && shell.age < 6 && shell.bounces < 9) liveProjectiles.push(shell);
	}
	state.projectiles = liveProjectiles;

	for (const banana of state.bananas) banana.age += delta;
	const liveBananas: BananaState[] = [];
	for (const banana of state.bananas) {
		let hit = false;
		if (banana.age > 0.22) {
			for (const kart of allKarts(state)) {
				if (kart.id === banana.ownerId || kart.collisionCooldown > 0) continue;
				if (Math.abs(kart.distance - banana.distance) < 0.0048 && Math.abs(kart.lane - banana.lane) < 0.22) {
					applyItemHit(state, kart, 'banana', banana.ownerId, banana.lane);
					hit = true;
					break;
				}
			}
		}
		if (!hit && banana.age < 32) liveBananas.push(banana);
	}
	state.bananas = liveBananas;
}

function stepMallObstacles(state: RaceState, delta: number) {
	if (state.mallObstacles.length === 0) return;
	for (const obstacle of state.mallObstacles) {
		obstacle.cooldown = Math.max(0, obstacle.cooldown - delta);
		for (const kart of allKarts(state)) {
			if (kart.collisionCooldown > 0) continue;
			if (
				Math.abs(signedDistance(kart.progress, obstacle.progress)) < 0.0058 &&
				Math.abs(kart.lane - obstacle.lane) < obstacle.radius
			) {
				applyKartHit(state, kart, 'obstacle', obstacle.lane);
				obstacle.cooldown = mallObstacleHitPulse;
			}
		}
	}
}

function applyItemHit(state: RaceState, target: KartState, item: KartItem, ownerId: string, lane: number) {
	applyKartHit(state, target, 'item', lane, item);
	state.events.push({ type: 'item-hit', item, targetId: target.id, ownerId });
}

function blockShellWithHeldItem(
	state: RaceState,
	target: KartState,
	incomingItem: 'green-shell' | 'red-shell'
) {
	const defenseItem = target.heldItem;
	if (!defenseItem) return;
	target.heldItem = null;
	addImpact(state, target.distance - heldItemDistance, target.lane, '#baf5ff', 0.38);
	state.events.push({ type: 'item-block', defenseItem, incomingItem });
}

function applyKartHit(
	state: RaceState,
	target: KartState,
	source: 'obstacle' | 'item',
	obstacleLane: number,
	item?: KartItem
) {
	target.speed *= 0.4;
	target.boost.remaining = 0;
	target.drift.active = false;
	target.drift.charge = 0;
	target.drift.tier = 0;
	target.stun.remaining = item === 'banana' ? 0.72 : 0.58;
	target.stun.spin = 1;
	target.collisionCooldown = 0.92;
	target.lane += target.lane <= obstacleLane ? -0.16 : 0.16;
	addImpact(state, target.distance, target.lane, item === 'red-shell' ? '#ff526f' : item === 'green-shell' ? '#4de48b' : '#ffd84a');
	if (target.id === 'player') state.events.push({ type: 'hit', source, ...(item ? { item } : {}) });
}

function applyKartBump(state: RaceState, rival: RivalState) {
	const player = state.player;
	const lateralDelta = rival.lane - player.lane;
	const direction = Math.abs(lateralDelta) > 0.01 ? Math.sign(lateralDelta) : 1;
	const separation = Math.max(0.05, (kartContactWidth - Math.abs(lateralDelta)) / 2 + 0.018);
	player.lane = clamp(player.lane - direction * separation, -1.2, 1.2);
	rival.lane = clamp(rival.lane + direction * separation, -1.2, 1.2);
	player.speed *= 0.94;
	rival.speed *= 0.94;
	player.collisionCooldown = kartBumpCooldown;
	rival.collisionCooldown = kartBumpCooldown;
	addImpact(
		state,
		(player.distance + rival.distance) / 2,
		(player.lane + rival.lane) / 2,
		'#9defff',
		0.28
	);
	state.events.push({ type: 'hit', source: 'rival' });
}

function addImpact(state: RaceState, distance: number, lane: number, color: string, duration = 0.55) {
	state.impacts.push({
		id: `impact-${state.nextWorldItemId++}`,
		distance,
		progress: wrapUnit(distance),
		lane,
		elapsed: 0,
		duration,
		color
	});
}

function stepImpacts(state: RaceState, delta: number) {
	for (const impact of state.impacts) impact.elapsed += delta;
	state.impacts = state.impacts.filter((impact) => impact.elapsed < impact.duration);
}

function findTargetAhead(state: RaceState, owner: KartState) {
	return findTargetAheadFromDistance(state, owner.id, owner.distance);
}

function findTargetAheadFromDistance(state: RaceState, ownerId: string, distance: number) {
	let target: KartState | undefined;
	let nearest = Number.POSITIVE_INFINITY;
	for (const kart of allKarts(state)) {
		if (kart.id === ownerId) continue;
		const ahead = kart.distance - distance;
		if (ahead > 0.002 && ahead < nearest) {
			nearest = ahead;
			target = kart;
		}
	}
	return target;
}

function findKart(state: RaceState, id: string) {
	return id === 'player' ? state.player : state.rivals.find((rival) => rival.id === id);
}

function allKarts(state: RaceState): KartState[] {
	return [state.player, ...state.rivals];
}

function updatePositions(state: RaceState) {
	const racers = allKarts(state).sort((a, b) => b.distance - a.distance);
	state.positions = racers.map((racer, index) => ({ id: racer.id, rank: index + 1, distance: racer.distance }));
	for (const [index, racer] of racers.entries()) racer.rank = index + 1;
}

function createKart(id: string, distance: number, lane: number): KartState {
	return {
		id,
		progress: wrapUnit(distance),
		distance,
		lane,
		speed: 0,
		lap: 0,
		rank: 1,
		item: null,
		heldItem: null,
		roulette: { active: false, elapsed: 0, duration: 0, tick: 0, preview: 'green-shell' },
		drift: { active: false, side: 0, charge: 0, tier: 0 },
		boost: { remaining: 0, duration: 1 },
		stun: { remaining: 0, spin: 0 },
		collisionCooldown: 0
	};
}

function courseCurve(trackId: KartTrackId, progress: number) {
	return getCourseMapPoint(trackId, progress).curve;
}

function normalizeSeed(seed: number) {
	const normalized = Math.floor(Math.abs(Number.isFinite(seed) ? seed : 1977)) >>> 0;
	return normalized || 1977;
}

function seededRandom(initialSeed: number) {
	let seed = initialSeed >>> 0;
	return () => {
		seed ^= seed << 13;
		seed ^= seed >>> 17;
		seed ^= seed << 5;
		return (seed >>> 0) / 4_294_967_296;
	};
}

function nextRandom(state: RaceState) {
	let seed = state.randomState >>> 0;
	seed ^= seed << 13;
	seed ^= seed >>> 17;
	seed ^= seed << 5;
	state.randomState = seed >>> 0;
	return state.randomState / 4_294_967_296;
}

function forwardDistance(from: number, to: number) {
	return wrapUnit(to - from);
}

function signedDistance(from: number, to: number) {
	let distance = wrapUnit(to) - wrapUnit(from);
	if (distance > 0.5) distance -= 1;
	if (distance < -0.5) distance += 1;
	return distance;
}

function wrapUnit(value: number) {
	return ((value % 1) + 1) % 1;
}

function clamp(value: number, minimum: number, maximum: number) {
	return Math.min(maximum, Math.max(minimum, value));
}
