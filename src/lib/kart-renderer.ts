export type KartTrackId = 'prism-circuit' | 'sunset-galleria';

export type RenderRival = {
	id: string;
	name: string;
	color: string;
	lane: number;
	/** Normalized distance ahead of the player around the current lap. */
	distance: number;
	/** Normalized 0..1 impact strength, where 1 is a fresh hit. */
	hit?: number;
};

export type KartItemVisualType = 'green-shell' | 'red-shell';

export type RenderItemBox = {
	id: string;
	lane: number;
	/** Signed track distance relative to the player. Positive values are ahead. */
	distance: number;
	active?: boolean;
};

export type RenderProjectile = {
	id: string;
	type: KartItemVisualType;
	lane: number;
	/** Signed track distance relative to the player. Positive values are ahead. */
	distance: number;
	heading?: number;
	spin?: number;
};

export type RenderBanana = {
	id: string;
	lane: number;
	/** Signed track distance relative to the player. Positive values are ahead. */
	distance: number;
};

export type RenderImpact = {
	id: string;
	lane: number;
	/** Signed track distance relative to the player. Positive values are ahead. */
	distance: number;
	/** Normalized 0..1 lifetime progress, where 0 is a fresh impact. */
	progress: number;
	color?: string;
};

export type RenderMallObstacleType = 'kiosk' | 'planter' | 'bench';

export type RenderMallObstacle = {
	id: string;
	type: RenderMallObstacleType;
	lane: number;
	/** Signed track distance relative to the player. Positive values are ahead. */
	distance: number;
	/** Normalized 0..1 impact strength, where 1 is a fresh collision. */
	hit?: number;
};

export type KartRenderState = {
	trackId: KartTrackId;
	progress: number;
	speed: number;
	lane: number;
	steer: number;
	drifting: boolean;
	driftCharge: number;
	boosting: boolean;
	spin: number;
	time: number;
	reducedMotion: boolean;
	rivals: RenderRival[];
	itemBoxes?: RenderItemBox[];
	projectiles?: RenderProjectile[];
	bananas?: RenderBanana[];
	impacts?: RenderImpact[];
	/** Visible course furniture used by the Coconut Mall course. */
	mallObstacles?: RenderMallObstacle[];
	/** Normalized 0..1 impact strength, where 1 is a fresh hit. */
	playerHit?: number;
};

type RoadSlice = {
	y: number;
	center: number;
	halfWidth: number;
	world: number;
	perspective: number;
};

type Star = { x: number; y: number; size: number; alpha: number; hue: number };

const TAU = Math.PI * 2;
const VIEW_DISTANCE = 0.155;
const REAR_VIEW_DISTANCE = 0.008;
const ROAD_SLICES = 112;

const stars: Star[] = Array.from({ length: 150 }, (_, index) => {
	const value = Math.sin((index + 11) * 1249.238) * 43758.5453;
	const next = Math.sin((index + 47) * 731.934) * 19371.143;
	return {
		x: value - Math.floor(value),
		y: (next - Math.floor(next)) * 0.69,
		size: 0.55 + ((index * 37) % 17) / 10,
		alpha: 0.28 + ((index * 53) % 61) / 100,
		hue: index % 7 === 0 ? 190 : index % 11 === 0 ? 285 : 0
	};
});

export function wrapUnit(value: number) {
	return ((value % 1) + 1) % 1;
}

export function signedTrackDistance(from: number, to: number) {
	let distance = wrapUnit(to) - wrapUnit(from);
	if (distance > 0.5) distance -= 1;
	if (distance < -0.5) distance += 1;
	return distance;
}

export function trackCurve(trackId: KartTrackId, progress: number) {
	const t = wrapUnit(progress) * TAU;
	if (trackId === 'prism-circuit') {
		return Math.sin(t * 1.04) * 0.72 + Math.sin(t * 2.7 + 0.9) * 0.24 + Math.sin(t * 5.1) * 0.09;
	}
	return Math.sin(t * 1.45 + 0.4) * 0.56 + Math.sin(t * 3.1 - 0.8) * 0.2 + Math.sin(t * 6.2) * 0.055;
}

export function trackElevation(trackId: KartTrackId, progress: number) {
	const t = wrapUnit(progress) * TAU;
	return trackId === 'prism-circuit'
		? Math.sin(t * 1.9 - 0.4) * 0.76 + Math.sin(t * 4.2) * 0.17
		: Math.sin(t * 1.2 + 1.3) * 0.28 + Math.sin(t * 3.6) * 0.08;
}

export function renderKartRace(
	context: CanvasRenderingContext2D,
	width: number,
	height: number,
	state: KartRenderState
) {
	context.save();
	context.clearRect(0, 0, width, height);
	const shake = state.reducedMotion ? 0 : Math.max(0, state.spin, (state.playerHit ?? 0) * 0.45) * 8;
	if (shake > 0.2) context.translate(Math.sin(state.time * 53) * shake, Math.cos(state.time * 41) * shake * 0.46);

	if (state.trackId === 'prism-circuit') drawPrismSky(context, width, height, state);
	else drawGalleriaSky(context, width, height, state);

	const road = buildRoad(width, height, state);
	drawRoad(context, width, height, state, road);
	drawCourseObjects(context, width, height, state, road);
	drawRaceEntities(context, state, road);
	drawSpeedLines(context, width, height, state);
	drawPlayerKart(context, width, height, state);
	context.restore();
}

function buildRoad(width: number, height: number, state: KartRenderState) {
	const horizon = height * (state.trackId === 'prism-circuit' ? 0.32 : 0.35);
	const slices: RoadSlice[] = [];
	const currentCurve = trackCurve(state.trackId, state.progress);
	const currentElevation = trackElevation(state.trackId, state.progress);

	for (let index = 0; index <= ROAD_SLICES; index++) {
		const normalized = index / ROAD_SLICES;
		const perspective = Math.pow(normalized, 1.43);
		const forward = VIEW_DISTANCE * Math.pow(1 - normalized, 2.18);
		const world = wrapUnit(state.progress + forward);
		const curveDelta = trackCurve(state.trackId, world) - currentCurve;
		const elevationDelta = trackElevation(state.trackId, world) - currentElevation;
		const cameraLane = state.lane * width * (0.055 + perspective * 0.25);
		const bend = curveDelta * width * (0.06 + (1 - perspective) * 0.44);
		const y = horizon + perspective * (height - horizon) + elevationDelta * height * (1 - perspective) * 0.055;
		const halfWidth = width * (0.018 + perspective * 0.455);
		slices.push({ y, center: width * 0.5 + bend - cameraLane, halfWidth, world, perspective });
	}
	return slices;
}

function drawRoad(
	context: CanvasRenderingContext2D,
	width: number,
	height: number,
	state: KartRenderState,
	slices: RoadSlice[]
) {
	const floorGradient = context.createLinearGradient(0, height * 0.3, 0, height);
	if (state.trackId === 'prism-circuit') {
		floorGradient.addColorStop(0, '#080b23');
		floorGradient.addColorStop(1, '#140f35');
	} else {
		floorGradient.addColorStop(0, '#e9e0c9');
		floorGradient.addColorStop(1, '#d9ad72');
	}
	context.fillStyle = floorGradient;
	context.fillRect(0, height * 0.3, width, height * 0.7);

	for (let index = 0; index < slices.length - 1; index++) {
		const far = slices[index];
		const near = slices[index + 1];
		const stripe = Math.floor(far.world * (state.trackId === 'prism-circuit' ? 300 : 230));
		const alternating = stripe % 2 === 0;

		if (state.trackId === 'prism-circuit') {
			drawQuad(context, far, near, 1.095, alternating ? '#311a69' : '#251454');
			drawQuad(context, far, near, 1, alternating ? '#171437' : '#1d1744');
			drawPrismRails(context, far, near, stripe);
		} else {
			drawQuad(context, far, near, 1.11, alternating ? '#f9d84f' : '#32b8ad');
			drawQuad(context, far, near, 1, alternating ? '#b7aa9d' : '#c8bbab');
			drawGalleriaCurbs(context, far, near, stripe);
			if (stripe % 7 === 0) drawMallTileSeam(context, far, '#867e77');
		}

		if (stripe % 9 < 4) {
			const laneColor = state.trackId === 'prism-circuit' ? 'rgba(177, 239, 255, .72)' : 'rgba(255,255,255,.62)';
			drawLaneMarker(context, far, near, -0.33, laneColor);
			drawLaneMarker(context, far, near, 0.33, laneColor);
		}
	}

	const finishDistance = wrapUnit(1 - state.progress);
	if (finishDistance < VIEW_DISTANCE) {
		const p = distanceToPerspective(finishDistance);
		const slice = slices[Math.max(0, Math.min(ROAD_SLICES, Math.round(p * ROAD_SLICES)))];
		if (slice && slice.perspective > 0.025) drawFinishLine(context, slice, state.trackId);
	}
}

function drawMallTileSeam(context: CanvasRenderingContext2D, slice: RoadSlice, color: string) {
	context.save();
	context.globalAlpha = 0.28;
	context.strokeStyle = color;
	context.lineWidth = Math.max(0.5, slice.perspective * 1.8);
	context.beginPath();
	context.moveTo(slice.center - slice.halfWidth, slice.y);
	context.lineTo(slice.center + slice.halfWidth, slice.y);
	context.stroke();
	context.restore();
}

function drawQuad(context: CanvasRenderingContext2D, far: RoadSlice, near: RoadSlice, widthScale: number, fill: string) {
	context.beginPath();
	context.moveTo(far.center - far.halfWidth * widthScale, far.y);
	context.lineTo(far.center + far.halfWidth * widthScale, far.y);
	context.lineTo(near.center + near.halfWidth * widthScale, near.y);
	context.lineTo(near.center - near.halfWidth * widthScale, near.y);
	context.closePath();
	context.fillStyle = fill;
	context.fill();
}

function drawPrismRails(context: CanvasRenderingContext2D, far: RoadSlice, near: RoadSlice, stripe: number) {
	const palette = ['#ff5c8a', '#ffb44a', '#d6f247', '#55e2c2', '#62c8ff', '#9b7bff'];
	context.fillStyle = palette[Math.abs(stripe) % palette.length];
	for (const side of [-1, 1]) {
		context.beginPath();
		context.moveTo(far.center + side * far.halfWidth * 0.985, far.y);
		context.lineTo(far.center + side * far.halfWidth * 1.075, far.y);
		context.lineTo(near.center + side * near.halfWidth * 1.075, near.y);
		context.lineTo(near.center + side * near.halfWidth * 0.985, near.y);
		context.closePath();
		context.fill();
	}
}

function drawGalleriaCurbs(context: CanvasRenderingContext2D, far: RoadSlice, near: RoadSlice, stripe: number) {
	context.fillStyle = stripe % 4 < 2 ? '#fff8dc' : '#ff708a';
	for (const side of [-1, 1]) {
		context.beginPath();
		context.moveTo(far.center + side * far.halfWidth * 0.965, far.y);
		context.lineTo(far.center + side * far.halfWidth * 1.09, far.y);
		context.lineTo(near.center + side * near.halfWidth * 1.09, near.y);
		context.lineTo(near.center + side * near.halfWidth * 0.965, near.y);
		context.closePath();
		context.fill();
	}
}

function drawLaneMarker(context: CanvasRenderingContext2D, far: RoadSlice, near: RoadSlice, lane: number, color: string) {
	const farWidth = Math.max(0.45, far.halfWidth * 0.008);
	const nearWidth = Math.max(0.8, near.halfWidth * 0.008);
	context.beginPath();
	context.moveTo(far.center + far.halfWidth * lane - farWidth, far.y);
	context.lineTo(far.center + far.halfWidth * lane + farWidth, far.y);
	context.lineTo(near.center + near.halfWidth * lane + nearWidth, near.y);
	context.lineTo(near.center + near.halfWidth * lane - nearWidth, near.y);
	context.closePath();
	context.fillStyle = color;
	context.fill();
}

function drawFinishLine(context: CanvasRenderingContext2D, slice: RoadSlice, trackId: KartTrackId) {
	const cell = Math.max(2, slice.halfWidth / 9);
	const height = Math.max(2, cell * 0.52);
	for (let column = 0; column < 18; column++) {
		context.fillStyle = (column + (trackId === 'prism-circuit' ? 0 : 1)) % 2 === 0 ? '#ffffff' : '#11152c';
		context.fillRect(slice.center - slice.halfWidth + column * cell, slice.y - height / 2, cell + 0.5, height);
	}
}

function drawPrismSky(context: CanvasRenderingContext2D, width: number, height: number, state: KartRenderState) {
	const gradient = context.createLinearGradient(0, 0, 0, height * 0.72);
	gradient.addColorStop(0, '#030615');
	gradient.addColorStop(0.54, '#110d34');
	gradient.addColorStop(1, '#3a1753');
	context.fillStyle = gradient;
	context.fillRect(0, 0, width, height);

	for (const star of stars) {
		const x = wrapUnit(star.x - state.progress * (0.18 + star.size * 0.015)) * width;
		const y = star.y * height;
		context.globalAlpha = star.alpha;
		context.fillStyle = star.hue ? `hsl(${star.hue} 90% 80%)` : '#ffffff';
		context.beginPath();
		context.arc(x, y, star.size, 0, TAU);
		context.fill();
	}
	context.globalAlpha = 1;

	const planetX = width * (0.79 + Math.sin(state.progress * TAU) * 0.035);
	const planetY = height * 0.18;
	const radius = Math.min(width, height) * 0.105;
	const halo = context.createRadialGradient(planetX, planetY, radius * 0.4, planetX, planetY, radius * 1.8);
	halo.addColorStop(0, 'rgba(159,111,255,.42)');
	halo.addColorStop(1, 'rgba(159,111,255,0)');
	context.fillStyle = halo;
	context.beginPath();
	context.arc(planetX, planetY, radius * 1.8, 0, TAU);
	context.fill();
	context.fillStyle = '#7a58e8';
	context.beginPath();
	context.arc(planetX, planetY, radius, 0, TAU);
	context.fill();
	context.strokeStyle = 'rgba(193, 174, 255, .78)';
	context.lineWidth = radius * 0.18;
	context.beginPath();
	context.ellipse(planetX, planetY + radius * 0.05, radius * 1.7, radius * 0.42, -0.16, 0, TAU);
	context.stroke();

	context.strokeStyle = 'rgba(92, 223, 255, .16)';
	context.lineWidth = Math.max(1, width * 0.0015);
	for (let index = 0; index < 3; index++) {
		context.beginPath();
		context.arc(width * 0.18, height * 0.33, width * (0.05 + index * 0.025), Math.PI * 1.04, Math.PI * 1.88);
		context.stroke();
	}
}

function drawGalleriaSky(context: CanvasRenderingContext2D, width: number, height: number, state: KartRenderState) {
	const gradient = context.createLinearGradient(0, 0, 0, height * 0.8);
	gradient.addColorStop(0, '#8ed9df');
	gradient.addColorStop(0.36, '#d7f1e8');
	gradient.addColorStop(1, '#f2d6ad');
	context.fillStyle = gradient;
	context.fillRect(0, 0, width, height);

	// A broad glass canopy and two occupied floors make this read as an indoor
	// atrium before any trackside props enter the frame.
	drawMallSkylight(context, width, height, state);
	drawMallWing(context, width, height, -1, state);
	drawMallWing(context, width, height, 1, state);
	drawMallEscalator(context, width, height, -1);
	drawMallEscalator(context, width, height, 1);
	drawAtriumBanner(context, width, height);
}

function drawMallSkylight(context: CanvasRenderingContext2D, width: number, height: number, state: KartRenderState) {
	const roofBottom = height * 0.175;
	const roofGradient = context.createLinearGradient(0, 0, 0, roofBottom);
	roofGradient.addColorStop(0, 'rgba(231, 253, 249, .96)');
	roofGradient.addColorStop(0.56, 'rgba(159, 225, 228, .82)');
	roofGradient.addColorStop(1, 'rgba(101, 184, 192, .55)');
	context.fillStyle = roofGradient;
	context.beginPath();
	context.moveTo(width * 0.14, 0);
	context.lineTo(width * 0.86, 0);
	context.lineTo(width * 0.71, roofBottom);
	context.lineTo(width * 0.29, roofBottom);
	context.closePath();
	context.fill();

	context.save();
	context.strokeStyle = 'rgba(28, 83, 96, .42)';
	context.lineWidth = Math.max(1.5, width * 0.0024);
	for (let index = 0; index <= 8; index++) {
		const topX = width * (0.14 + index * 0.09);
		const bottomX = width * (0.29 + index * 0.0525);
		context.beginPath();
		context.moveTo(topX, 0);
		context.lineTo(bottomX, roofBottom);
		context.stroke();
	}
	for (let row = 1; row < 4; row++) {
		const ratio = row / 4;
		const inset = width * (0.14 + ratio * 0.15);
		const y = roofBottom * ratio;
		context.beginPath();
		context.moveTo(inset, y);
		context.lineTo(width - inset, y);
		context.stroke();
	}
	context.restore();

	const beamOffset = Math.sin(state.progress * TAU * 2) * width * 0.004;
	context.strokeStyle = '#f8f0d8';
	context.lineWidth = Math.max(4, width * 0.011);
	context.lineCap = 'round';
	context.beginPath();
	context.moveTo(width * 0.08 + beamOffset, height * 0.02);
	context.quadraticCurveTo(width * 0.5, height * 0.22, width * 0.92 + beamOffset, height * 0.02);
	context.stroke();
	context.lineCap = 'butt';

	context.fillStyle = 'rgba(255, 248, 209, .92)';
	for (const x of [0.32, 0.5, 0.68]) {
		context.fillRect(width * x - 1, 0, 2, height * 0.075);
		context.beginPath();
		context.ellipse(width * x, height * 0.083, width * 0.015, height * 0.009, 0, 0, TAU);
		context.fill();
	}
}

function drawMallWing(
	context: CanvasRenderingContext2D,
	width: number,
	height: number,
	side: -1 | 1,
	state: KartRenderState
) {
	const wingWidth = width * 0.31;
	const x = side < 0 ? 0 : width - wingWidth;
	const labels = side < 0 ? ['SUNDAE', 'PALM GOODS', 'PIXEL POP'] : ['STARCADE', 'SURF SHOP', 'SODA STOP'];
	const accents = side < 0 ? ['#ff6f8d', '#16b99a', '#ffb437'] : ['#7b61ef', '#38a8de', '#ef5e73'];

	context.fillStyle = side < 0 ? '#f9e8cb' : '#f4dfc6';
	context.fillRect(x, height * 0.105, wingWidth, height * 0.255);
	context.fillStyle = 'rgba(79, 58, 57, .11)';
	context.fillRect(x, height * 0.19, wingWidth, height * 0.012);

	for (let floor = 0; floor < 2; floor++) {
		const y = height * (floor === 0 ? 0.122 : 0.232);
		const shopHeight = height * 0.067;
		for (let index = 0; index < 3; index++) {
			const shopX = x + wingWidth * (0.025 + index * 0.325);
			const shopWidth = wingWidth * 0.3;
			const labelIndex = (index + floor + (side > 0 ? 1 : 0)) % labels.length;
			drawMallStorefront(
				context,
				shopX,
				y,
				shopWidth,
				shopHeight,
				accents[labelIndex],
				labels[labelIndex],
				width
			);
		}

		const railY = y + shopHeight + height * 0.011;
		context.strokeStyle = '#f7faf5';
		context.lineWidth = Math.max(2, width * 0.004);
		context.beginPath();
		context.moveTo(x, railY);
		context.lineTo(x + wingWidth, railY);
		context.stroke();
		context.strokeStyle = 'rgba(32, 83, 91, .38)';
		context.lineWidth = Math.max(1, width * 0.0014);
		for (let index = 0; index <= 8; index++) {
			const railX = x + (wingWidth * index) / 8;
			context.beginPath();
			context.moveTo(railX, railY - height * 0.018);
			context.lineTo(railX, railY + height * 0.017);
			context.stroke();
		}
	}

	const columnDrift = Math.sin(state.progress * TAU) * width * 0.003;
	context.fillStyle = '#fff2d8';
	context.strokeStyle = 'rgba(87, 60, 48, .14)';
	context.lineWidth = Math.max(1, width * 0.0014);
	for (let index = 0; index < 3; index++) {
		const columnX = x + wingWidth * (0.14 + index * 0.36) + columnDrift;
		context.fillRect(columnX - width * 0.007, height * 0.105, width * 0.014, height * 0.255);
		context.strokeRect(columnX - width * 0.007, height * 0.105, width * 0.014, height * 0.255);
	}
}

function drawMallStorefront(
	context: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	accent: string,
	label: string,
	canvasWidth: number
) {
	context.fillStyle = '#324758';
	roundRect(context, x, y, width, height, Math.max(2, canvasWidth * 0.003));
	context.fill();
	context.fillStyle = 'rgba(175, 236, 233, .34)';
	context.fillRect(x + width * 0.08, y + height * 0.32, width * 0.84, height * 0.62);
	context.fillStyle = accent;
	roundRect(context, x + width * 0.06, y - height * 0.06, width * 0.88, height * 0.37, height * 0.12);
	context.fill();
	context.fillStyle = '#fffdf3';
	context.font = `900 ${Math.max(4, canvasWidth * 0.0072)}px Space Grotesk, sans-serif`;
	context.textAlign = 'center';
	context.textBaseline = 'middle';
	context.fillText(label, x + width * 0.5, y + height * 0.12, width * 0.78);
	context.fillStyle = 'rgba(255,255,255,.3)';
	context.fillRect(x + width * 0.13, y + height * 0.4, width * 0.16, height * 0.47);
}

function drawMallEscalator(context: CanvasRenderingContext2D, width: number, height: number, side: -1 | 1) {
	const bottomX = width * (side < 0 ? 0.35 : 0.65);
	const topX = width * (side < 0 ? 0.26 : 0.74);
	const bottomY = height * 0.34;
	const topY = height * 0.205;
	context.save();
	context.lineCap = 'round';
	context.strokeStyle = '#274b55';
	context.lineWidth = Math.max(5, width * 0.014);
	context.beginPath();
	context.moveTo(bottomX, bottomY);
	context.lineTo(topX, topY);
	context.stroke();
	context.strokeStyle = '#bde4dc';
	context.lineWidth = Math.max(2, width * 0.006);
	context.beginPath();
	context.moveTo(bottomX, bottomY);
	context.lineTo(topX, topY);
	context.stroke();
	context.strokeStyle = 'rgba(22, 51, 59, .68)';
	context.lineWidth = Math.max(1, width * 0.0015);
	for (let index = 1; index < 8; index++) {
		const ratio = index / 8;
		const stepX = bottomX + (topX - bottomX) * ratio;
		const stepY = bottomY + (topY - bottomY) * ratio;
		context.beginPath();
		context.moveTo(stepX - side * width * 0.018, stepY);
		context.lineTo(stepX + side * width * 0.006, stepY);
		context.stroke();
	}
	context.strokeStyle = '#f8fbf0';
	context.lineWidth = Math.max(2, width * 0.0035);
	context.beginPath();
	context.moveTo(bottomX - side * width * 0.018, bottomY - height * 0.025);
	context.lineTo(topX - side * width * 0.018, topY - height * 0.025);
	context.stroke();
	context.restore();
}

function drawAtriumBanner(context: CanvasRenderingContext2D, width: number, height: number) {
	const bannerWidth = width * 0.18;
	const bannerHeight = height * 0.05;
	const x = width * 0.5 - bannerWidth / 2;
	const y = height * 0.152;
	context.fillStyle = '#fff7df';
	context.shadowColor = 'rgba(40, 42, 45, .18)';
	context.shadowBlur = Math.max(3, width * 0.008);
	roundRect(context, x, y, bannerWidth, bannerHeight, bannerHeight * 0.48);
	context.fill();
	context.shadowBlur = 0;
	context.fillStyle = '#156f72';
	context.font = `900 ${Math.max(6, width * 0.0105)}px Space Grotesk, sans-serif`;
	context.textAlign = 'center';
	context.textBaseline = 'middle';
	context.fillText('PALM COURT', width * 0.5, y + bannerHeight * 0.52, bannerWidth * 0.82);
}

function drawCourseObjects(
	context: CanvasRenderingContext2D,
	width: number,
	height: number,
	state: KartRenderState,
	road: RoadSlice[]
) {
	if (state.trackId === 'sunset-galleria') {
		drawGalleriaCourseObjects(context, width, height, state, road);
		return;
	}

	const count = 34;
	for (let index = 0; index < count; index++) {
		const world = wrapUnit(index / count + (index % 3) * 0.009);
		const distance = wrapUnit(world - state.progress);
		if (distance <= 0.003 || distance >= VIEW_DISTANCE) continue;
		const perspective = distanceToPerspective(distance);
		const slice = road[Math.max(0, Math.min(ROAD_SLICES, Math.round(perspective * ROAD_SLICES)))];
		if (!slice || slice.perspective < 0.01) continue;
		const side = index % 2 === 0 ? -1 : 1;
		const x = slice.center + side * slice.halfWidth * (1.22 + (index % 4) * 0.1);
		const scale = 0.1 + slice.perspective * 1.15;
		if (index % 5 === 0) drawHologramGate(context, slice.center, slice.y, slice.halfWidth, scale, index);
		else drawPrismBeacon(context, x, slice.y, scale, index);
	}
}

type GalleriaCourseObject = {
	index: number;
	distance: number;
	x: number;
	y: number;
	scale: number;
	side: -1 | 1;
};

function drawGalleriaCourseObjects(
	context: CanvasRenderingContext2D,
	width: number,
	height: number,
	state: KartRenderState,
	road: RoadSlice[]
) {
	const count = 48;
	const visible: GalleriaCourseObject[] = [];
	for (let index = 0; index < count; index++) {
		const world = wrapUnit(index / count + (index % 5) * 0.0065);
		const distance = wrapUnit(world - state.progress);
		if (distance <= 0.003 || distance >= VIEW_DISTANCE) continue;
		const perspective = distanceToPerspective(distance);
		const slice = road[Math.max(0, Math.min(ROAD_SLICES, Math.round(perspective * ROAD_SLICES)))];
		if (!slice || slice.perspective < 0.01) continue;
		const side: -1 | 1 = index % 2 === 0 ? -1 : 1;
		const spread = index % 6 === 0 ? 1.55 : 1.24 + (index % 4) * 0.085;
		visible.push({
			index,
			distance,
			x: slice.center + side * slice.halfWidth * spread,
			y: slice.y,
			scale: 0.1 + slice.perspective * 1.15,
			side
		});
	}

	// Far objects paint first so large nearby kiosks and planters naturally
	// occlude their distant counterparts without breaking the road view.
	visible.sort((a, b) => b.distance - a.distance);
	for (const object of visible) {
		const variant = object.index % 12;
		if (variant === 0) drawMallFountain(context, object.x, object.y, object.scale, state, object.index);
		else if (variant === 1 || variant === 7) drawPottedPalm(context, object.x, object.y, object.scale, object.side);
		else if (variant === 2 || variant === 9) drawTracksideKiosk(context, object.x, object.y, object.scale, object.index);
		else if (variant === 3 || variant === 10) drawMallBench(context, object.x, object.y, object.scale, object.side);
		else if (variant === 4 || variant === 8) drawRockPlanter(context, object.x, object.y, object.scale, object.index);
		else drawMallSign(context, object.x, object.y, object.scale, object.index);
	}
	drawFountainMist(context, width, height, state);
}

function drawHologramGate(context: CanvasRenderingContext2D, x: number, y: number, halfWidth: number, scale: number, index: number) {
	const palette = ['#ff5c8a', '#d6f247', '#62c8ff', '#a98cff'];
	context.save();
	context.globalAlpha = Math.min(0.78, 0.18 + scale * 0.66);
	context.strokeStyle = palette[index % palette.length];
	context.lineWidth = Math.max(1, 5 * scale);
	context.shadowColor = context.strokeStyle;
	context.shadowBlur = 18 * scale;
	context.beginPath();
	context.ellipse(x, y - halfWidth * 0.52, halfWidth * 0.76, halfWidth * 0.58, 0, Math.PI, TAU);
	context.stroke();
	context.restore();
}

function drawPrismBeacon(context: CanvasRenderingContext2D, x: number, y: number, scale: number, index: number) {
	const size = 29 * scale;
	context.save();
	context.translate(x, y);
	context.fillStyle = index % 3 === 0 ? '#d6f247' : index % 3 === 1 ? '#66dfff' : '#ff628c';
	context.shadowColor = context.fillStyle;
	context.shadowBlur = size;
	context.beginPath();
	context.moveTo(0, -size * 1.9);
	context.lineTo(size * 0.62, -size * 0.7);
	context.lineTo(0, 0);
	context.lineTo(-size * 0.62, -size * 0.7);
	context.closePath();
	context.fill();
	context.restore();
}

function drawPalm(context: CanvasRenderingContext2D, x: number, y: number, scale: number, side: number) {
	const height = 72 * scale;
	context.save();
	context.translate(x, y);
	context.rotate(side * 0.035);
	context.strokeStyle = '#8c6336';
	context.lineWidth = Math.max(1, 7 * scale);
	context.lineCap = 'round';
	context.beginPath();
	context.moveTo(0, 0);
	context.quadraticCurveTo(side * -5 * scale, -height * 0.56, side * 5 * scale, -height);
	context.stroke();
	context.strokeStyle = '#1c9b73';
	context.lineWidth = Math.max(1, 9 * scale);
	for (let index = 0; index < 5; index++) {
		const angle = -Math.PI + index * (Math.PI / 4);
		context.beginPath();
		context.moveTo(side * 5 * scale, -height);
		context.quadraticCurveTo(Math.cos(angle) * 26 * scale, -height - 16 * scale, Math.cos(angle) * 43 * scale, -height + Math.sin(angle) * 22 * scale);
		context.stroke();
	}
	context.restore();
}

function drawPottedPalm(context: CanvasRenderingContext2D, x: number, y: number, scale: number, side: -1 | 1) {
	drawPalm(context, x, y - 5 * scale, scale * 0.92, side);
	const potWidth = 35 * scale;
	const potHeight = 24 * scale;
	context.save();
	context.translate(x, y);
	context.fillStyle = 'rgba(40, 39, 35, .18)';
	context.beginPath();
	context.ellipse(0, 3 * scale, potWidth * 0.72, potHeight * 0.22, 0, 0, TAU);
	context.fill();
	context.fillStyle = '#e1784f';
	context.beginPath();
	context.moveTo(-potWidth * 0.46, -potHeight);
	context.lineTo(potWidth * 0.46, -potHeight);
	context.lineTo(potWidth * 0.33, 0);
	context.lineTo(-potWidth * 0.33, 0);
	context.closePath();
	context.fill();
	context.fillStyle = '#f29a63';
	roundRect(context, -potWidth * 0.54, -potHeight * 1.08, potWidth * 1.08, potHeight * 0.32, 4 * scale);
	context.fill();
	context.fillStyle = 'rgba(255,255,255,.22)';
	context.fillRect(-potWidth * 0.34, -potHeight * 0.66, potWidth * 0.16, potHeight * 0.45);
	context.restore();
}

function drawTracksideKiosk(context: CanvasRenderingContext2D, x: number, y: number, scale: number, index: number) {
	const width = 69 * scale;
	const height = 66 * scale;
	const accent = index % 3 === 0 ? '#ff647f' : index % 3 === 1 ? '#22b49d' : '#785ee9';
	context.save();
	context.translate(x, y);
	context.fillStyle = 'rgba(44, 35, 30, .2)';
	context.beginPath();
	context.ellipse(0, 2 * scale, width * 0.56, height * 0.13, 0, 0, TAU);
	context.fill();
	context.fillStyle = '#fff0d0';
	roundRect(context, -width * 0.43, -height * 0.64, width * 0.86, height * 0.64, 6 * scale);
	context.fill();
	context.fillStyle = '#754d35';
	roundRect(context, -width * 0.5, -height * 0.46, width, height * 0.18, 5 * scale);
	context.fill();
	context.fillStyle = accent;
	context.beginPath();
	context.moveTo(-width * 0.57, -height * 0.68);
	context.lineTo(width * 0.57, -height * 0.68);
	context.lineTo(width * 0.43, -height * 0.92);
	context.lineTo(-width * 0.43, -height * 0.92);
	context.closePath();
	context.fill();
	context.strokeStyle = '#fff7dc';
	context.lineWidth = Math.max(1, 4 * scale);
	for (let stripe = -2; stripe <= 2; stripe++) {
		context.beginPath();
		context.moveTo(stripe * width * 0.19, -height * 0.7);
		context.lineTo(stripe * width * 0.16, -height * 0.9);
		context.stroke();
	}
	context.fillStyle = '#1d2940';
	context.font = `900 ${Math.max(3, 8.5 * scale)}px Space Grotesk, sans-serif`;
	context.textAlign = 'center';
	context.textBaseline = 'middle';
	context.fillText(index % 2 === 0 ? 'SNACKS' : 'SPLASH', 0, -height * 0.37, width * 0.76);
	context.fillStyle = '#21283d';
	for (const side of [-1, 1]) {
		context.beginPath();
		context.arc(side * width * 0.32, 0, 5 * scale, 0, TAU);
		context.fill();
	}
	context.restore();
}

function drawMallBench(context: CanvasRenderingContext2D, x: number, y: number, scale: number, side: -1 | 1) {
	const width = 70 * scale;
	const height = 33 * scale;
	context.save();
	context.translate(x, y);
	context.scale(side, 1);
	context.fillStyle = 'rgba(43, 36, 31, .2)';
	context.beginPath();
	context.ellipse(0, 2 * scale, width * 0.57, height * 0.15, 0, 0, TAU);
	context.fill();
	context.fillStyle = '#c87949';
	roundRect(context, -width * 0.5, -height * 0.7, width, height * 0.26, 5 * scale);
	context.fill();
	roundRect(context, -width * 0.53, -height * 0.38, width * 1.06, height * 0.24, 5 * scale);
	context.fill();
	context.fillStyle = '#384958';
	for (const legX of [-0.35, 0.35]) {
		context.fillRect(width * legX - 2 * scale, -height * 0.17, 4 * scale, height * 0.23);
	}
	context.fillStyle = 'rgba(255,255,255,.2)';
	context.fillRect(-width * 0.39, -height * 0.64, width * 0.5, 3 * scale);
	context.restore();
}

function drawRockPlanter(context: CanvasRenderingContext2D, x: number, y: number, scale: number, index: number) {
	const width = 63 * scale;
	const height = 30 * scale;
	context.save();
	context.translate(x, y);
	context.fillStyle = 'rgba(34, 41, 37, .2)';
	context.beginPath();
	context.ellipse(0, 3 * scale, width * 0.58, height * 0.18, 0, 0, TAU);
	context.fill();
	context.fillStyle = index % 2 === 0 ? '#d9b58f' : '#b7d1be';
	roundRect(context, -width * 0.5, -height * 0.65, width, height * 0.68, 9 * scale);
	context.fill();
	context.fillStyle = '#6c5948';
	context.beginPath();
	context.ellipse(0, -height * 0.62, width * 0.41, height * 0.2, 0, 0, TAU);
	context.fill();
	for (let leaf = 0; leaf < 6; leaf++) {
		const angle = -Math.PI + (leaf / 5) * Math.PI;
		context.save();
		context.rotate(angle * 0.32);
		context.fillStyle = leaf % 2 === 0 ? '#1e9c70' : '#64ba6c';
		context.beginPath();
		context.ellipse((leaf - 2.5) * 4 * scale, -height * (0.83 + (leaf % 2) * 0.22), 7 * scale, 18 * scale, angle * 0.18, 0, TAU);
		context.fill();
		context.restore();
	}
	context.fillStyle = '#e8d8c8';
	for (let rock = 0; rock < 4; rock++) {
		context.beginPath();
		context.arc((rock - 1.5) * 8 * scale, -height * 0.63 + (rock % 2) * 2 * scale, (3 + (rock % 2)) * scale, 0, TAU);
		context.fill();
	}
	context.restore();
}

function drawMallFountain(
	context: CanvasRenderingContext2D,
	x: number,
	y: number,
	scale: number,
	state: KartRenderState,
	index: number
) {
	const width = 82 * scale;
	const basinHeight = 22 * scale;
	context.save();
	context.translate(x, y);
	context.fillStyle = 'rgba(31, 57, 57, .2)';
	context.beginPath();
	context.ellipse(0, 3 * scale, width * 0.58, basinHeight * 0.34, 0, 0, TAU);
	context.fill();
	context.fillStyle = '#e9e2cb';
	context.beginPath();
	context.ellipse(0, -basinHeight * 0.4, width * 0.55, basinHeight * 0.48, 0, 0, TAU);
	context.fill();
	context.fillStyle = '#61cbd2';
	context.beginPath();
	context.ellipse(0, -basinHeight * 0.48, width * 0.44, basinHeight * 0.31, 0, 0, TAU);
	context.fill();
	context.strokeStyle = '#7de5ed';
	context.lineWidth = Math.max(1, 3 * scale);
	context.lineCap = 'round';
	for (let jet = -1; jet <= 1; jet++) {
		const pulse = state.reducedMotion ? 0 : Math.sin(state.time * 5.4 + index + jet) * 3 * scale;
		context.beginPath();
		context.moveTo(jet * width * 0.18, -basinHeight * 0.58);
		context.quadraticCurveTo(jet * width * 0.1, -basinHeight * 2.1 - pulse, 0, -basinHeight * 0.78);
		context.stroke();
	}
	context.fillStyle = '#fff8dc';
	context.beginPath();
	context.arc(0, -basinHeight * 0.88, 5 * scale, 0, TAU);
	context.fill();
	context.restore();
}

function drawMallSign(context: CanvasRenderingContext2D, x: number, y: number, scale: number, index: number) {
	const width = 58 * scale;
	const height = 34 * scale;
	context.save();
	context.translate(x, y - height * 1.65);
	context.fillStyle = index % 8 === 0 ? '#ff718d' : '#785eea';
	roundRect(context, -width / 2, -height / 2, width, height, 7 * scale);
	context.fill();
	context.fillStyle = '#fff';
	context.font = `800 ${Math.max(3, 9 * scale)}px Space Grotesk, sans-serif`;
	context.textAlign = 'center';
	context.textBaseline = 'middle';
	context.fillText(index % 8 === 0 ? 'TROPIC' : 'PLAY', 0, 0);
	context.restore();
}

function drawFountainMist(context: CanvasRenderingContext2D, width: number, height: number, state: KartRenderState) {
	const x = width * (0.5 + Math.sin(state.progress * TAU * 2) * 0.08);
	const y = height * 0.35;
	const gradient = context.createRadialGradient(x, y, 0, x, y, width * 0.14);
	gradient.addColorStop(0, 'rgba(255,255,255,.2)');
	gradient.addColorStop(1, 'rgba(255,255,255,0)');
	context.fillStyle = gradient;
	context.fillRect(x - width * 0.16, y - height * 0.1, width * 0.32, height * 0.2);
}

type ProjectedRoadEntity = {
	x: number;
	y: number;
	scale: number;
	perspective: number;
};

type RoadEntityVisual =
	| { kind: 'box'; value: RenderItemBox }
	| { kind: 'projectile'; value: RenderProjectile }
	| { kind: 'banana'; value: RenderBanana }
	| { kind: 'mall-obstacle'; value: RenderMallObstacle }
	| { kind: 'rival'; value: RenderRival }
	| { kind: 'impact'; value: RenderImpact };

function drawRaceEntities(context: CanvasRenderingContext2D, state: KartRenderState, road: RoadSlice[]) {
	const visuals: RoadEntityVisual[] = [
		...(state.itemBoxes ?? []).map((value): RoadEntityVisual => ({ kind: 'box', value })),
		...(state.projectiles ?? []).map((value): RoadEntityVisual => ({ kind: 'projectile', value })),
		...(state.bananas ?? []).map((value): RoadEntityVisual => ({ kind: 'banana', value })),
		...(state.trackId === 'sunset-galleria' ? (state.mallObstacles ?? []).map((value): RoadEntityVisual => ({ kind: 'mall-obstacle', value })) : []),
		...state.rivals.map((value): RoadEntityVisual => ({ kind: 'rival', value })),
		...(state.impacts ?? []).map((value): RoadEntityVisual => ({ kind: 'impact', value }))
	].sort((a, b) => b.value.distance - a.value.distance);

	for (const visual of visuals) {
		const projected = projectRoadEntity(visual.value.distance, visual.value.lane, road);
		if (!projected) continue;
		if (visual.kind === 'box') {
			drawQuestionBox(context, projected, visual.value, state);
		} else if (visual.kind === 'projectile') {
			drawTurtleShell(context, projected, visual.value, state);
		} else if (visual.kind === 'banana') {
			drawBananaPeel(context, projected, visual.value, state);
		} else if (visual.kind === 'mall-obstacle') {
			drawMallObstacle(context, projected, visual.value, state);
		} else if (visual.kind === 'rival') {
			drawProjectedRival(context, projected, visual.value, state);
		} else {
			drawImpactBurst(
				context,
				projected.x,
				projected.y - projected.scale * 23,
				projected.scale * 42,
				visual.value.progress,
				visual.value.color ?? '#ffd45a',
				state.reducedMotion,
				state.time,
				hashId(visual.value.id)
			);
		}
	}
}

function drawMallObstacle(
	context: CanvasRenderingContext2D,
	projected: ProjectedRoadEntity,
	obstacle: RenderMallObstacle,
	state: KartRenderState
) {
	const scale = projected.scale * 1.08;
	if (obstacle.type === 'kiosk') {
		drawTracksideKiosk(context, projected.x, projected.y, scale, hashId(obstacle.id));
	} else if (obstacle.type === 'planter') {
		drawRockPlanter(context, projected.x, projected.y, scale, hashId(obstacle.id));
	} else {
		drawMallBench(context, projected.x, projected.y, scale, obstacle.lane < 0 ? -1 : 1);
	}
	const hit = Math.max(0, Math.min(1, obstacle.hit ?? 0));
	if (hit > 0.01) {
		drawImpactBurst(
			context,
			projected.x,
			projected.y - scale * 32,
			scale * 48,
			1 - hit,
			'#ffd05b',
			state.reducedMotion,
			state.time,
			hashId(obstacle.id)
		);
	}
}

export function isRoadEntityProjectable(distance: number) {
	return Number.isFinite(distance) && distance < VIEW_DISTANCE && distance >= -REAR_VIEW_DISTANCE;
}

function projectRoadEntity(distance: number, lane: number, road: RoadSlice[]): ProjectedRoadEntity | undefined {
	if (!isRoadEntityProjectable(distance) || !Number.isFinite(lane)) return;
	const perspective = distance <= 0 ? 1 : distanceToPerspective(distance);
	const slice = road[Math.max(0, Math.min(ROAD_SLICES, Math.round(perspective * ROAD_SLICES)))];
	if (!slice || slice.perspective < 0.01) return;
	return {
		x: slice.center + lane * slice.halfWidth * 0.68,
		y: slice.y - Math.max(0, -distance) * slice.halfWidth * 28,
		scale: 0.08 + slice.perspective * 0.94,
		perspective: slice.perspective
	};
}

function drawQuestionBox(
	context: CanvasRenderingContext2D,
	projected: ProjectedRoadEntity,
	box: RenderItemBox,
	state: KartRenderState
) {
	const seed = hashId(box.id);
	const scale = projected.scale;
	const active = box.active !== false;
	const rotation = state.reducedMotion ? seed * 0.00014 : state.time * 2.55 + seed * 0.00031;
	const faceScale = 0.42 + Math.abs(Math.cos(rotation)) * 0.58;
	const sideDirection = Math.sin(rotation) >= 0 ? 1 : -1;
	const size = 42 * scale;
	const hover = state.reducedMotion ? -size * 0.72 : -size * (0.72 + Math.sin(state.time * 4.2 + seed) * 0.1);

	context.save();
	context.translate(projected.x, projected.y);
	context.globalAlpha = active ? 1 : 0.24;
	context.fillStyle = 'rgba(4, 7, 23, .34)';
	context.beginPath();
	context.ellipse(0, 1, size * 0.72, size * 0.2, 0, 0, TAU);
	context.fill();

	if (!active) {
		const pulse = state.reducedMotion ? 0.55 : 0.48 + Math.sin(state.time * 3 + seed) * 0.12;
		context.strokeStyle = `rgba(111, 225, 255, ${pulse})`;
		context.lineWidth = Math.max(1, 2.2 * scale);
		context.beginPath();
		context.ellipse(0, hover, size * 0.7, size * 0.28, 0, 0, TAU);
		context.stroke();
		context.restore();
		return;
	}

	context.translate(0, hover);
	context.shadowColor = '#69e6ff';
	context.shadowBlur = state.reducedMotion ? 6 * scale : 15 * scale;
	context.fillStyle = 'rgba(89, 224, 255, .18)';
	context.beginPath();
	context.arc(0, 0, size * 0.82, 0, TAU);
	context.fill();

	context.shadowBlur = 0;
	context.save();
	context.scale(faceScale, 1);
	const face = context.createLinearGradient(-size / 2, -size / 2, size / 2, size / 2);
	face.addColorStop(0, '#72efff');
	face.addColorStop(0.48, '#8a75ff');
	face.addColorStop(1, '#ff7db7');
	context.fillStyle = face;
	roundRect(context, -size / 2, -size / 2, size, size, size * 0.16);
	context.fill();
	context.strokeStyle = 'rgba(255,255,255,.84)';
	context.lineWidth = Math.max(1, 2.1 * scale / Math.max(0.42, faceScale));
	context.stroke();
	context.fillStyle = 'rgba(255,255,255,.23)';
	roundRect(context, -size * 0.34, -size * 0.36, size * 0.54, size * 0.12, size * 0.06);
	context.fill();
	context.restore();

	const sideWidth = size * (1 - faceScale) * 0.42;
	if (sideWidth > 1) {
		context.fillStyle = sideDirection > 0 ? '#5146bd' : '#c357a0';
		context.beginPath();
		context.moveTo(sideDirection * size * faceScale * 0.5, -size * 0.48);
		context.lineTo(sideDirection * (size * faceScale * 0.5 + sideWidth), -size * 0.34);
		context.lineTo(sideDirection * (size * faceScale * 0.5 + sideWidth), size * 0.34);
		context.lineTo(sideDirection * size * faceScale * 0.5, size * 0.48);
		context.closePath();
		context.fill();
	}

	context.save();
	context.scale(faceScale, 1);
	context.fillStyle = '#ffffff';
	context.font = `900 ${Math.max(3, size * 0.72)}px Space Grotesk, sans-serif`;
	context.textAlign = 'center';
	context.textBaseline = 'middle';
	context.shadowColor = 'rgba(26, 17, 83, .72)';
	context.shadowBlur = Math.max(1, 2 * scale);
	context.fillText('?', 0, size * 0.02, size * 0.66);
	context.restore();
	context.restore();
}

function drawTurtleShell(
	context: CanvasRenderingContext2D,
	projected: ProjectedRoadEntity,
	projectile: RenderProjectile,
	state: KartRenderState
) {
	const seed = hashId(projectile.id);
	const scale = projected.scale;
	const red = projectile.type === 'red-shell';
	const size = 49 * scale;
	const motion = state.reducedMotion ? 0 : state.time;
	const spin = projectile.spin ?? motion * (red ? 7.4 : 9.3) + seed * 0.0008;
	const hop = state.reducedMotion ? 0 : Math.abs(Math.sin(motion * 9.5 + seed)) * size * 0.08;
	const heading = Math.max(-1, Math.min(1, projectile.heading ?? 0));
	const shellColor = red ? '#f0445d' : '#2fc873';
	const shellLight = red ? '#ff7b83' : '#66e59a';
	const shellDark = red ? '#7f2035' : '#12643c';

	context.save();
	context.translate(projected.x, projected.y - size * 0.44 - hop);
	context.rotate(heading * 0.13);

	context.fillStyle = 'rgba(3, 7, 20, .35)';
	context.beginPath();
	context.ellipse(0, size * 0.5 + hop, size * 0.61, size * 0.16, 0, 0, TAU);
	context.fill();

	if (!state.reducedMotion) {
		context.globalAlpha = 0.24;
		context.fillStyle = red ? '#ff7387' : '#73ffac';
		for (let index = 0; index < 2; index++) {
			context.beginPath();
			context.ellipse(heading * size * 0.08, size * (0.48 + index * 0.18), size * (0.34 - index * 0.1), size * 0.08, 0, 0, TAU);
			context.fill();
		}
		context.globalAlpha = 1;
	}

	if (red) {
		const pulse = state.reducedMotion ? 0.34 : 0.24 + Math.sin(motion * 8 + seed) * 0.08;
		context.strokeStyle = `rgba(255, 90, 112, ${pulse})`;
		context.lineWidth = Math.max(1, 2.4 * scale);
		context.beginPath();
		context.ellipse(0, 0, size * 0.78, size * 0.62, 0, 0, TAU);
		context.stroke();
	}

	// The pale peripheral tabs and thick rim carry the turtle-shell silhouette
	// even when the item is only a few pixels wide in the distance.
	context.fillStyle = '#fff3d1';
	context.strokeStyle = '#151c31';
	context.lineWidth = Math.max(1, 2.8 * scale);
	for (const detail of [
		{ x: -0.5, y: -0.03, angle: -0.24 },
		{ x: 0.5, y: -0.03, angle: 0.24 },
		{ x: -0.27, y: 0.39, angle: -0.12 },
		{ x: 0.27, y: 0.39, angle: 0.12 }
	]) {
		context.save();
		context.translate(detail.x * size, detail.y * size);
		context.rotate(detail.angle);
		context.beginPath();
		context.moveTo(-size * 0.17, -size * 0.1);
		context.quadraticCurveTo(0, -size * 0.2, size * 0.17, -size * 0.1);
		context.lineTo(size * 0.12, size * 0.13);
		context.quadraticCurveTo(0, size * 0.2, -size * 0.12, size * 0.13);
		context.closePath();
		context.fill();
		context.stroke();
		context.restore();
	}

	const rimGradient = context.createLinearGradient(0, -size * 0.5, 0, size * 0.48);
	rimGradient.addColorStop(0, '#fff9df');
	rimGradient.addColorStop(1, '#d9c79b');
	context.fillStyle = rimGradient;
	context.beginPath();
	context.ellipse(0, 0, size * 0.58, size * 0.48, 0, 0, TAU);
	context.fill();
	context.stroke();

	context.save();
	context.beginPath();
	context.ellipse(0, -size * 0.025, size * 0.47, size * 0.385, 0, 0, TAU);
	context.clip();
	const dome = context.createRadialGradient(-size * 0.18, -size * 0.2, size * 0.02, 0, 0, size * 0.52);
	dome.addColorStop(0, shellLight);
	dome.addColorStop(0.58, shellColor);
	dome.addColorStop(1, shellDark);
	context.fillStyle = dome;
	context.fillRect(-size * 0.5, -size * 0.45, size, size * 0.9);
	context.rotate(spin);
	context.strokeStyle = shellDark;
	context.lineWidth = Math.max(1, 2.6 * scale);
	context.lineJoin = 'round';
	const plateRadius = size * 0.19;
	context.beginPath();
	for (let index = 0; index < 5; index++) {
		const angle = (index / 5) * TAU - Math.PI / 2;
		const pointX = Math.cos(angle) * plateRadius;
		const pointY = Math.sin(angle) * plateRadius;
		if (index === 0) context.moveTo(pointX, pointY);
		else context.lineTo(pointX, pointY);
	}
	context.closePath();
	context.stroke();
	for (let index = 0; index < 5; index++) {
		const angle = (index / 5) * TAU - Math.PI / 2;
		context.beginPath();
		context.moveTo(Math.cos(angle) * plateRadius, Math.sin(angle) * plateRadius);
		context.lineTo(Math.cos(angle) * size * 0.5, Math.sin(angle) * size * 0.42);
		context.stroke();
	}
	context.restore();
	context.strokeStyle = 'rgba(255,255,255,.8)';
	context.lineWidth = Math.max(1, 1.7 * scale);
	context.beginPath();
	context.arc(-size * 0.015, -size * 0.015, size * 0.47, Math.PI * 1.08, Math.PI * 1.73);
	context.stroke();

	context.fillStyle = 'rgba(255,255,255,.64)';
	context.beginPath();
	context.ellipse(-size * 0.19, -size * 0.18, size * 0.13, size * 0.065, -0.45, 0, TAU);
	context.fill();
	context.restore();
}

function drawBananaPeel(
	context: CanvasRenderingContext2D,
	projected: ProjectedRoadEntity,
	banana: RenderBanana,
	state: KartRenderState
) {
	const seed = hashId(banana.id);
	const scale = projected.scale;
	const size = 48 * scale;
	const sway = state.reducedMotion ? 0 : Math.sin(state.time * 3.2 + seed) * 0.07;

	context.save();
	context.translate(projected.x, projected.y - size * 0.32);
	context.rotate(sway);
	context.fillStyle = 'rgba(3, 7, 20, .34)';
	context.beginPath();
	context.ellipse(0, size * 0.38, size * 0.63, size * 0.14, 0, 0, TAU);
	context.fill();

	context.strokeStyle = '#5e4315';
	context.lineWidth = Math.max(1, 2.7 * scale);
	context.lineCap = 'round';
	context.lineJoin = 'round';

	// Three separated flaps form one high-contrast tripod instead of merging
	// into a yellow blob once perspective makes the item small.
	for (const flap of [
		{ side: -1, color: '#ffc82f', inner: -0.05 },
		{ side: 1, color: '#ffe04a', inner: 0.05 }
	]) {
		const side = flap.side;
		context.fillStyle = flap.color;
		context.beginPath();
		context.moveTo(flap.inner * size, -size * 0.13);
		context.quadraticCurveTo(side * size * 0.12, size * 0.08, side * size * 0.57, size * 0.25);
		context.quadraticCurveTo(side * size * 0.45, size * 0.42, side * size * 0.17, size * 0.34);
		context.quadraticCurveTo(side * size * 0.04, size * 0.21, flap.inner * size, -size * 0.13);
		context.closePath();
		context.fill();
		context.stroke();
		context.fillStyle = '#6e4814';
		context.beginPath();
		context.ellipse(side * size * 0.55, size * 0.26, size * 0.07, size * 0.045, side * 0.28, 0, TAU);
		context.fill();
	}

	context.fillStyle = '#f4b91f';
	context.beginPath();
	context.moveTo(0, -size * 0.14);
	context.quadraticCurveTo(size * 0.12, size * 0.06, size * 0.08, size * 0.48);
	context.quadraticCurveTo(-size * 0.04, size * 0.55, -size * 0.15, size * 0.38);
	context.quadraticCurveTo(-size * 0.12, size * 0.1, 0, -size * 0.14);
	context.closePath();
	context.fill();
	context.stroke();
	context.fillStyle = '#674516';
	context.beginPath();
	context.ellipse(size * 0.06, size * 0.47, size * 0.07, size * 0.045, 0.12, 0, TAU);
	context.fill();

	context.fillStyle = '#fff0a7';
	context.strokeStyle = '#7b561a';
	context.lineWidth = Math.max(1, 2.2 * scale);
	context.beginPath();
	context.ellipse(0, -size * 0.105, size * 0.16, size * 0.12, 0, 0, TAU);
	context.fill();
	context.stroke();

	context.strokeStyle = '#ffdc3d';
	context.lineWidth = Math.max(1, 6.5 * scale);
	context.beginPath();
	context.moveTo(0, -size * 0.14);
	context.quadraticCurveTo(-size * 0.04, -size * 0.34, size * 0.04, -size * 0.49);
	context.stroke();
	context.strokeStyle = '#3a2a21';
	context.lineWidth = Math.max(1, 3 * scale);
	context.beginPath();
	context.moveTo(size * 0.025, -size * 0.47);
	context.lineTo(size * 0.085, -size * 0.54);
	context.stroke();

	context.strokeStyle = 'rgba(255,255,255,.58)';
	context.lineWidth = Math.max(1, 1.3 * scale);
	context.beginPath();
	context.moveTo(-size * 0.04, -size * 0.06);
	context.quadraticCurveTo(-size * 0.22, size * 0.12, -size * 0.47, size * 0.23);
	context.stroke();
	context.restore();
}

function drawImpactBurst(
	context: CanvasRenderingContext2D,
	x: number,
	y: number,
	radius: number,
	progress: number,
	color: string,
	reducedMotion: boolean,
	time: number,
	seed: number
) {
	const life = 1 - Math.max(0, Math.min(1, progress));
	if (life <= 0.01 || radius <= 0.5) return;
	const expansion = reducedMotion ? 0.76 : 0.45 + progress * 0.9;
	const sparkCount = reducedMotion ? 4 : 8;
	context.save();
	context.translate(x, y);
	context.globalAlpha = Math.min(1, life * 1.35);
	context.strokeStyle = color;
	context.lineWidth = Math.max(1, radius * 0.09 * life);
	context.shadowColor = color;
	context.shadowBlur = reducedMotion ? 3 : radius * 0.4 * life;
	context.beginPath();
	context.arc(0, 0, radius * expansion, 0, TAU);
	context.stroke();

	context.fillStyle = '#ffffff';
	context.beginPath();
	for (let index = 0; index < 12; index++) {
		const angle = (index / 12) * TAU - Math.PI / 2;
		const alternatingRadius = radius * (index % 2 === 0 ? 0.48 : 0.19) * (0.72 + life * 0.28);
		const pointX = Math.cos(angle) * alternatingRadius;
		const pointY = Math.sin(angle) * alternatingRadius;
		if (index === 0) context.moveTo(pointX, pointY);
		else context.lineTo(pointX, pointY);
	}
	context.closePath();
	context.fill();

	context.lineCap = 'round';
	for (let index = 0; index < sparkCount; index++) {
		const phase = (seed % 97) * 0.01 + (index / sparkCount) * TAU + (reducedMotion ? 0 : time * 0.35);
		const inner = radius * (0.44 + progress * 0.25);
		const outer = radius * (0.74 + progress * 0.7 + (index % 3) * 0.06);
		context.strokeStyle = index % 2 === 0 ? color : '#ffffff';
		context.lineWidth = Math.max(1, radius * 0.08 * life);
		context.beginPath();
		context.moveTo(Math.cos(phase) * inner, Math.sin(phase) * inner);
		context.lineTo(Math.cos(phase) * outer, Math.sin(phase) * outer);
		context.stroke();
	}
	context.restore();
}

function drawProjectedRival(
	context: CanvasRenderingContext2D,
	projected: ProjectedRoadEntity,
	rival: RenderRival,
	state: KartRenderState
) {
	const scale = 0.08 + projected.perspective * 0.86;
	const hit = Math.max(0, Math.min(1, rival.hit ?? 0));
	drawKart(
		context,
		projected.x,
		projected.y,
		scale,
		rival.color,
		rival.name.slice(0, 1).toUpperCase(),
		0,
		false,
		0,
		state.time,
		hit,
		state.reducedMotion
	);
	if (hit > 0.01) {
		drawImpactBurst(
			context,
			projected.x,
			projected.y - 27 * scale,
			42 * scale,
			1 - hit,
			'#ffd45a',
			state.reducedMotion,
			state.time,
			hashId(rival.id)
		);
	}
}

function drawPlayerKart(context: CanvasRenderingContext2D, width: number, height: number, state: KartRenderState) {
	const x = width * 0.5 + state.steer * width * 0.015;
	const bob = state.reducedMotion ? 0 : Math.sin(state.time * 22) * Math.min(2.5, state.speed * 2.5);
	const y = height * 0.91 + bob;
	const scale = Math.max(0.8, Math.min(width / 980, height / 640)) * 1.15;
	const hit = Math.max(0, Math.min(1, state.playerHit ?? Math.min(1, state.spin * 1.8)));
	drawKart(context, x, y, scale, '#d6f247', 'J', state.steer, state.boosting, state.driftCharge, state.time, hit, state.reducedMotion);
	if (hit > 0.01) {
		drawImpactBurst(context, x, y - 27 * scale, 51 * scale, 1 - hit, '#ffcf4a', state.reducedMotion, state.time, 1977);
	}
}

function drawKart(
	context: CanvasRenderingContext2D,
	x: number,
	y: number,
	scale: number,
	color: string,
	mark: string,
	steer: number,
	boosting: boolean,
	driftCharge: number,
	time: number,
	hit: number,
	reducedMotion: boolean
) {
	context.save();
	context.translate(x, y);
	const hitKick = reducedMotion ? 0 : Math.sin(time * 45) * hit * 0.045;
	context.rotate(-steer * 0.055 + hitKick);
	context.scale(scale, scale);

	context.fillStyle = 'rgba(0,0,0,.28)';
	context.beginPath();
	context.ellipse(0, 3, 49, 15, 0, 0, TAU);
	context.fill();

	if (boosting) {
		const flame = context.createLinearGradient(0, 12, 0, 58);
		flame.addColorStop(0, '#ffffff');
		flame.addColorStop(0.3, '#70eaff');
		flame.addColorStop(1, 'rgba(132,88,255,0)');
		context.fillStyle = flame;
		for (const side of [-1, 1]) {
			const flicker = reducedMotion ? 0 : Math.sin(time * 30 + side) * 7;
			context.beginPath();
			context.moveTo(side * 20, 10);
			context.lineTo(side * 10, 55 + flicker);
			context.lineTo(side * 29, 15);
			context.closePath();
			context.fill();
		}
	}

	context.fillStyle = '#11162f';
	for (const side of [-1, 1]) {
		roundRect(context, side * 31 - 8, -20, 16, 35, 6);
		context.fill();
	}

	context.fillStyle = darken(color, 0.42);
	roundRect(context, -43, -15, 86, 26, 11);
	context.fill();
	context.fillStyle = color;
	roundRect(context, -37, -26, 74, 34, 13);
	context.fill();
	context.fillStyle = 'rgba(255,255,255,.34)';
	roundRect(context, -27, -22, 39, 8, 4);
	context.fill();

	context.fillStyle = '#fbca9a';
	context.beginPath();
	context.arc(0, -35, 15, 0, TAU);
	context.fill();
	context.fillStyle = '#785ef0';
	context.beginPath();
	context.arc(0, -41, 17, Math.PI, TAU);
	context.lineTo(17, -35);
	context.lineTo(-17, -35);
	context.closePath();
	context.fill();
	context.fillStyle = '#fff';
	context.font = '800 11px Space Grotesk, sans-serif';
	context.textAlign = 'center';
	context.textBaseline = 'middle';
	context.fillText(mark, 0, -43);

	context.fillStyle = '#11162f';
	roundRect(context, -51, -13, 102, 8, 4);
	context.fill();
	context.fillStyle = color;
	roundRect(context, -45, -17, 90, 7, 3.5);
	context.fill();

	if (driftCharge > 0.12) {
		const sparkColor = driftCharge > 0.72 ? '#ff6ea8' : driftCharge > 0.4 ? '#ffdb59' : '#67dcff';
		context.fillStyle = sparkColor;
		context.shadowColor = sparkColor;
		context.shadowBlur = 10;
		for (const side of [-1, 1]) {
			for (let index = 0; index < 3; index++) {
				context.beginPath();
				context.arc(side * (37 + index * 5), 13 + index * 4, 2.6 - index * 0.5, 0, TAU);
				context.fill();
			}
		}
	}

	if (hit > 0.01) {
		context.globalAlpha = reducedMotion ? Math.min(0.52, hit * 0.52) : (0.24 + Math.abs(Math.sin(time * 36)) * 0.42) * hit;
		context.strokeStyle = '#ffffff';
		context.lineWidth = 4;
		roundRect(context, -45, -27, 90, 39, 14);
		context.stroke();
		context.beginPath();
		context.arc(0, -35, 19, 0, TAU);
		context.stroke();
		context.globalAlpha = 1;
	}
	context.restore();
}

function drawSpeedLines(context: CanvasRenderingContext2D, width: number, height: number, state: KartRenderState) {
	if (state.reducedMotion || state.speed < 0.72) return;
	const intensity = Math.min(1, (state.speed - 0.72) / 0.38 + (state.boosting ? 0.5 : 0));
	context.save();
	context.globalAlpha = 0.12 + intensity * 0.3;
	context.strokeStyle = state.trackId === 'prism-circuit' ? '#c8f5ff' : '#fff9d7';
	context.lineWidth = 1.5 + intensity * 2;
	for (let index = 0; index < 18; index++) {
		const angle = (index / 18) * TAU + state.time * 0.04;
		const inner = Math.min(width, height) * (0.23 + (index % 4) * 0.02);
		const outer = inner + (60 + (index % 5) * 18) * intensity;
		const centerX = width * 0.5;
		const centerY = height * 0.46;
		context.beginPath();
		context.moveTo(centerX + Math.cos(angle) * inner, centerY + Math.sin(angle) * inner * 0.66);
		context.lineTo(centerX + Math.cos(angle) * outer, centerY + Math.sin(angle) * outer * 0.66);
		context.stroke();
	}
	context.restore();
}

function distanceToPerspective(distance: number) {
	const normalized = Math.max(0, Math.min(1, distance / VIEW_DISTANCE));
	return 1 - Math.pow(normalized, 1 / 2.18);
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
	const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
	context.beginPath();
	context.moveTo(x + r, y);
	context.arcTo(x + width, y, x + width, y + height, r);
	context.arcTo(x + width, y + height, x, y + height, r);
	context.arcTo(x, y + height, x, y, r);
	context.arcTo(x, y, x + width, y, r);
	context.closePath();
}

function hashId(value: string) {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function darken(hex: string, amount: number) {
	const normalized = hex.replace('#', '');
	if (normalized.length !== 6) return '#161a32';
	const value = Number.parseInt(normalized, 16);
	const factor = Math.max(0, 1 - amount);
	const red = Math.round(((value >> 16) & 255) * factor);
	const green = Math.round(((value >> 8) & 255) * factor);
	const blue = Math.round((value & 255) * factor);
	return `rgb(${red}, ${green}, ${blue})`;
}
