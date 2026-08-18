import * as THREE from 'three';
import type {
	KartRenderState,
	KartTrackId,
	RenderMallObstacleType
} from '$lib/kart-renderer';
import { COURSE_CONTROL_POINTS } from '$lib/kart-course-layout';

const TAU = Math.PI * 2;
const ROAD_HALF_WIDTH = 6.2;
const ROAD_SEGMENTS = 288;
const MAX_RIVALS = 7;
const MAX_ITEM_BOXES = 24;
const MAX_PROJECTILES = 16;
const MAX_BANANAS = 16;
const MAX_IMPACTS = 24;
const MAX_MALL_OBSTACLES = 12;
const MALL_OBSTACLE_TYPES = ['kiosk', 'planter', 'bench'] as const;
const MALL_JUMP_START = 0.244;
const MALL_JUMP_GAP_START = 0.262;
const MALL_JUMP_GAP_END = 0.281;
const MALL_JUMP_END = 0.304;
const MALL_ESCALATOR_START = 0.354;
const MALL_ESCALATOR_END = 0.432;

type CourseWorld = {
	id: KartTrackId;
	root: THREE.Group;
	curve: THREE.CatmullRomCurve3;
	background: THREE.Color;
	fog: THREE.Fog;
};

type WheelRig = {
	pivot: THREE.Group;
	wheel: THREE.Mesh;
};

type KartRig = {
	root: THREE.Group;
	body: THREE.Group;
	wheels: WheelRig[];
	frontWheels: THREE.Group[];
	flames: THREE.Mesh[];
	hitRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
	style: number;
};

type ItemBoxRig = {
	root: THREE.Group;
	box: THREE.Mesh;
	wire: THREE.Mesh;
	ring: THREE.Mesh;
};

type ProjectileRig = {
	root: THREE.Group;
	green: THREE.Group;
	red: THREE.Group;
};

type ImpactRig = {
	root: THREE.Group;
	burst: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshBasicMaterial>;
	ring: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
};

type MallObstacleRig = {
	root: THREE.Group;
	variants: Record<RenderMallObstacleType, THREE.Group>;
	hitRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
};

/**
 * A retained-mode Three.js renderer for the existing deterministic kart simulation.
 * All meshes are created once and reused so the frame loop only updates transforms.
 */
export class KartScene3D {
	private readonly renderer: THREE.WebGLRenderer;
	private readonly scene = new THREE.Scene();
	private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.1, 260);
	private readonly geometries = new Set<THREE.BufferGeometry>();
	private readonly materials = new Set<THREE.Material>();
	private readonly textures = new Set<THREE.Texture>();
	private readonly geometryCache = new Map<string, THREE.BufferGeometry>();
	private readonly materialCache = new Map<string, THREE.Material>();
	private readonly courses: Record<KartTrackId, CourseWorld>;
	private readonly player: KartRig;
	private readonly rivals: KartRig[] = [];
	private readonly itemBoxes: ItemBoxRig[] = [];
	private readonly projectiles: ProjectileRig[] = [];
	private readonly bananas: THREE.Group[] = [];
	private readonly impacts: ImpactRig[] = [];
	private readonly mallObstacles: MallObstacleRig[] = [];

	private readonly point = new THREE.Vector3();
	private readonly tangent = new THREE.Vector3();
	private readonly right = new THREE.Vector3();
	private readonly target = new THREE.Vector3();
	private readonly desiredCamera = new THREE.Vector3();
	private readonly cameraTarget = new THREE.Vector3();
	private readonly color = new THREE.Color();
	private readonly dummy = new THREE.Object3D();
	private questionTexture: THREE.CanvasTexture | undefined;
	private activeCourseId: KartTrackId | undefined;
	private width = 0;
	private height = 0;
	private pixelRatio = 0;
	private lastTime = 0;
	private disposed = false;

	constructor(canvas: HTMLCanvasElement) {
		this.renderer = new THREE.WebGLRenderer({
			canvas,
			antialias: true,
			alpha: false,
			powerPreference: 'high-performance'
		});
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 1.16;
		this.renderer.shadowMap.enabled = false;

		const hemi = new THREE.HemisphereLight(0xbdeaff, 0x24183d, 2.35);
		const key = new THREE.DirectionalLight(0xfff3cf, 3.1);
		key.position.set(-14, 24, 9);
		const rim = new THREE.DirectionalLight(0x9d7dff, 1.65);
		rim.position.set(18, 11, -20);
		this.scene.add(hemi, key, rim);

		this.courses = {
			'prism-circuit': this.createRainbowRoad(),
			'sunset-galleria': this.createCoconutMall()
		};
		this.scene.add(this.courses['prism-circuit'].root, this.courses['sunset-galleria'].root);

		this.player = this.createKart(0, '#d6f247', true);
		this.scene.add(this.player.root);
		const rivalColors = ['#49d2a7', '#9d7dff', '#66dfff', '#ffd45a', '#ff718d', '#ff9c62', '#e8efff'];
		for (let index = 0; index < MAX_RIVALS; index += 1) {
			const rig = this.createKart(index + 1, rivalColors[index], false);
			this.rivals.push(rig);
			this.scene.add(rig.root);
		}

		for (let index = 0; index < MAX_ITEM_BOXES; index += 1) {
			const rig = this.createItemBox();
			this.itemBoxes.push(rig);
			this.scene.add(rig.root);
		}
		for (let index = 0; index < MAX_PROJECTILES; index += 1) {
			const rig = this.createProjectile();
			this.projectiles.push(rig);
			this.scene.add(rig.root);
		}
		for (let index = 0; index < MAX_BANANAS; index += 1) {
			const rig = this.createBanana();
			this.bananas.push(rig);
			this.scene.add(rig);
		}
		for (let index = 0; index < MAX_IMPACTS; index += 1) {
			const rig = this.createImpact();
			this.impacts.push(rig);
			this.scene.add(rig.root);
		}
		for (let index = 0; index < MAX_MALL_OBSTACLES; index += 1) {
			const rig = this.createMallObstacle();
			this.mallObstacles.push(rig);
			this.scene.add(rig.root);
		}

		this.camera.position.set(0, 8, 11);
		this.camera.lookAt(0, 0, 0);
	}

	resize(width: number, height: number, pixelRatio: number) {
		if (this.disposed || width < 2 || height < 2) return;
		if (this.pixelRatio !== pixelRatio) {
			this.pixelRatio = pixelRatio;
			this.renderer.setPixelRatio(pixelRatio);
		}
		if (this.width !== width || this.height !== height) {
			this.width = width;
			this.height = height;
			this.camera.aspect = width / height;
			this.camera.fov = width < height ? 62 : height < 500 ? 60 : 56;
			this.camera.updateProjectionMatrix();
			this.renderer.setSize(width, height, false);
		}
	}

	render(state: KartRenderState) {
		if (this.disposed) return;
		const courseChanged = this.activateCourse(state.trackId);
		const course = this.courses[state.trackId];
		const delta = Math.min(0.05, Math.max(0, state.time - this.lastTime));
		this.lastTime = state.time;

		this.updateKart(this.player, course, state.progress, state.lane, state.steer, state.speed, state.time, state.boosting, state.playerHit ?? state.spin, state.reducedMotion);
		this.updateRivals(course, state);
		this.updateItemBoxes(course, state);
		this.updateProjectiles(course, state);
		this.updateBananas(course, state);
		this.updateImpacts(course, state);
		this.updateMallObstacles(course, state);
		this.updateCamera(course, state, delta, courseChanged);
		this.renderer.render(this.scene, this.camera);
	}

	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		for (const texture of this.textures) texture.dispose();
		for (const material of this.materials) material.dispose();
		for (const geometry of this.geometries) geometry.dispose();
		this.renderer.dispose();
		this.renderer.forceContextLoss();
		this.scene.clear();
		this.geometryCache.clear();
		this.materialCache.clear();
		this.textures.clear();
		this.materials.clear();
		this.geometries.clear();
	}

	private activateCourse(id: KartTrackId) {
		if (this.activeCourseId === id) return false;
		this.activeCourseId = id;
		const rainbow = this.courses['prism-circuit'];
		const mall = this.courses['sunset-galleria'];
		rainbow.root.visible = id === 'prism-circuit';
		mall.root.visible = id === 'sunset-galleria';
		const course = this.courses[id];
		this.scene.background = course.background;
		this.scene.fog = course.fog;
		this.renderer.setClearColor(course.background, 1);
		return true;
	}

	private createRainbowRoad(): CourseWorld {
		const root = new THREE.Group();
		root.name = 'Rainbow Road world';
		const curve = this.createCourseCurve('prism-circuit', 0.55);
		root.add(this.createRoad(curve, 'prism-circuit'));
		this.addTrackFurniture(root, curve, 'prism-circuit');
		this.addRainbowEnvironment(root, curve);
		return {
			id: 'prism-circuit',
			root,
			curve,
			background: new THREE.Color(0x030617),
			fog: new THREE.Fog(0x030617, 48, 145)
		};
	}

	private createCoconutMall(): CourseWorld {
		const root = new THREE.Group();
		root.name = 'Coconut Mall world';
		const curve = this.createCourseCurve('sunset-galleria', 0.52);
		root.add(this.createRoad(curve, 'sunset-galleria'));
		this.addTrackFurniture(root, curve, 'sunset-galleria');
		this.addMallEnvironment(root, curve);
		this.addMallCourseFeatures(root, curve);
		return {
			id: 'sunset-galleria',
			root,
			curve,
			background: new THREE.Color(0x8ccfd9),
			fog: new THREE.Fog(0xc7e8e1, 52, 125)
		};
	}

	private createCourseCurve(trackId: KartTrackId, tension: number) {
		return new THREE.CatmullRomCurve3(
			COURSE_CONTROL_POINTS[trackId].map(([x, y, z]) => new THREE.Vector3(x, y, z)),
			true,
			'centripetal',
			tension
		);
	}

	private createRoad(curve: THREE.CatmullRomCurve3, trackId: KartTrackId) {
		const positions: number[] = [];
		const colors: number[] = [];
		const indices: number[] = [];
		const columns = trackId === 'prism-circuit' ? 8 : 6;
		const point = new THREE.Vector3();
		const tangent = new THREE.Vector3();
		const right = new THREE.Vector3();
		const color = new THREE.Color();
		for (let index = 0; index <= ROAD_SEGMENTS; index += 1) {
			const progress = index / ROAD_SEGMENTS;
			curve.getPointAt(progress, point);
			curve.getTangentAt(progress, tangent);
			right.set(-tangent.z, 0, tangent.x).normalize();
			for (let column = 0; column < columns; column += 1) {
				const across = column / (columns - 1);
				const offset = -ROAD_HALF_WIDTH + across * ROAD_HALF_WIDTH * 2;
				positions.push(point.x + right.x * offset, point.y, point.z + right.z * offset);
				if (trackId === 'prism-circuit') {
					color.setHSL((0.98 - across * 0.77 + Math.sin(progress * TAU * 2) * 0.025 + 1) % 1, 0.82, index % 2 === 0 ? 0.29 : 0.25);
				} else {
					const checker = (Math.floor(index / 3) + column) % 2 === 0;
					color.set(checker ? 0xf0e5d3 : column === 0 || column === columns - 1 ? 0xe7b9aa : 0xd9d3c6);
				}
				colors.push(color.r, color.g, color.b);
			}
			const crossesMallJump =
				trackId === 'sunset-galleria' &&
				progress >= MALL_JUMP_GAP_START &&
				progress < MALL_JUMP_GAP_END;
			if (index < ROAD_SEGMENTS && !crossesMallJump) {
				for (let column = 0; column < columns - 1; column += 1) {
					const base = index * columns + column;
					indices.push(base, base + 1, base + columns, base + 1, base + columns + 1, base + columns);
				}
			}
		}
		const geometry = this.trackGeometry(new THREE.BufferGeometry());
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
		geometry.setIndex(indices);
		geometry.computeVertexNormals();
		const material = this.trackMaterial(
			new THREE.MeshStandardMaterial({
				vertexColors: true,
				emissive: trackId === 'prism-circuit' ? 0x170b3c : 0x000000,
				emissiveIntensity: trackId === 'prism-circuit' ? 0.42 : 0,
				roughness: trackId === 'prism-circuit' ? 0.5 : 0.72,
				metalness: trackId === 'prism-circuit' ? 0.22 : 0.02,
				side: THREE.DoubleSide
			})
		);
		const road = new THREE.Mesh(geometry, material);
		road.name = `${trackId} road ribbon`;
		return road;
	}

	private addTrackFurniture(root: THREE.Group, curve: THREE.CatmullRomCurve3, trackId: KartTrackId) {
		const railGeometry = this.getGeometry('rail', () => new THREE.BoxGeometry(0.18, 0.22, 1.05));
		const railMaterial = this.trackMaterial(
			new THREE.MeshStandardMaterial({
				color: trackId === 'prism-circuit' ? 0xffffff : 0xf6d45f,
				emissive: trackId === 'prism-circuit' ? 0x5d3fd3 : 0x215e65,
				emissiveIntensity: trackId === 'prism-circuit' ? 2.1 : 0.55,
				roughness: 0.46
			})
		);
		const railStops: Array<{ progress: number; side: number }> = [];
		for (let index = 0; index < 96; index += 1) {
			const progress = index / 96;
			if (trackId === 'sunset-galleria' && progress >= MALL_JUMP_START && progress <= MALL_JUMP_END) continue;
			for (const side of [-1, 1]) railStops.push({ progress, side });
		}
		const rails = new THREE.InstancedMesh(railGeometry, railMaterial, railStops.length);
		let railIndex = 0;
		for (const { progress, side } of railStops) {
			this.setDummyOnCurve(curve, progress, side * (ROAD_HALF_WIDTH + 0.17), 0.2);
			rails.setMatrixAt(railIndex, this.dummy.matrix);
			if (trackId === 'prism-circuit') {
				this.color.setHSL((progress * 3.2 + (side > 0 ? 0.12 : 0.58)) % 1, 0.92, 0.67);
				rails.setColorAt(railIndex, this.color);
			}
			railIndex += 1;
		}
		rails.instanceMatrix.needsUpdate = true;
		if (rails.instanceColor) rails.instanceColor.needsUpdate = true;
		root.add(rails);

		if (trackId === 'prism-circuit') {
			const markerGeometry = this.getGeometry('lane-marker', () => new THREE.BoxGeometry(0.075, 0.025, 0.68));
			const markerMaterial = this.trackMaterial(
				new THREE.MeshBasicMaterial({ color: 0xbdeaff, toneMapped: false })
			);
			const markers = new THREE.InstancedMesh(markerGeometry, markerMaterial, 128);
			let markerIndex = 0;
			for (let index = 0; index < 64; index += 1) {
				const progress = index / 64;
				for (const lane of [-ROAD_HALF_WIDTH / 3, ROAD_HALF_WIDTH / 3]) {
					this.setDummyOnCurve(curve, progress, lane, 0.04);
					markers.setMatrixAt(markerIndex, this.dummy.matrix);
					markerIndex += 1;
				}
			}
			markers.instanceMatrix.needsUpdate = true;
			root.add(markers);
		}

		const boostProgress = trackId === 'prism-circuit' ? [0.074, 0.296, 0.53, 0.786] : [0.075, 0.238, 0.535, 0.675, 0.91];
		const boostMaterial = this.trackMaterial(
			new THREE.MeshBasicMaterial({ color: trackId === 'prism-circuit' ? 0x65e7ff : 0xffc95b, toneMapped: false })
		);
		for (const progress of boostProgress) {
			const pad = new THREE.Group();
			for (let index = -2; index <= 2; index += 1) {
				const strip = new THREE.Mesh(this.getGeometry('boost-strip', () => new THREE.BoxGeometry(1.15, 0.04, 0.42)), boostMaterial);
				strip.position.x = index * 1.28;
				pad.add(strip);
			}
			this.placeStaticOnCurve(curve, pad, progress, 0, 0.065);
			root.add(pad);
		}
		this.addFinishLine(root, curve, trackId);
	}

	private addFinishLine(root: THREE.Group, curve: THREE.CatmullRomCurve3, trackId: KartTrackId) {
		const finish = new THREE.Group();
		const white = this.trackMaterial(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
		const dark = this.trackMaterial(new THREE.MeshBasicMaterial({ color: trackId === 'prism-circuit' ? 0x28185a : 0x18243c }));
		for (let index = 0; index < 12; index += 1) {
			const tile = new THREE.Mesh(this.getGeometry('finish-tile', () => new THREE.BoxGeometry(0.78, 0.035, 0.48)), index % 2 === 0 ? white : dark);
			tile.position.x = (index - 5.5) * 0.78;
			finish.add(tile);
		}
		this.placeStaticOnCurve(curve, finish, 0.002, 0, 0.075);
		root.add(finish);
	}

	private addRainbowEnvironment(root: THREE.Group, curve: THREE.CatmullRomCurve3) {
		const starGeometry = this.getGeometry('star', () => new THREE.IcosahedronGeometry(0.09, 0));
		const starMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({ color: 0xc9efff, toneMapped: false }));
		const stars = new THREE.InstancedMesh(starGeometry, starMaterial, 240);
		for (let index = 0; index < 240; index += 1) {
			const a = this.hash(index + 5) * TAU;
			const radius = 58 + this.hash(index + 87) * 66;
			this.dummy.position.set(Math.cos(a) * radius, -8 + this.hash(index + 13) * 72, Math.sin(a) * radius);
			const size = 0.45 + this.hash(index + 211) * 1.8;
			this.dummy.scale.setScalar(size);
			this.dummy.rotation.set(0, a, 0);
			this.dummy.updateMatrix();
			stars.setMatrixAt(index, this.dummy.matrix);
			this.color.setHSL(index % 9 === 0 ? 0.77 : index % 13 === 0 ? 0.16 : 0.53, 0.72, 0.72);
			stars.setColorAt(index, this.color);
		}
		stars.instanceMatrix.needsUpdate = true;
		if (stars.instanceColor) stars.instanceColor.needsUpdate = true;
		root.add(stars);

		const planetMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x7456e8, emissive: 0x2e1c84, emissiveIntensity: 1.1, roughness: 0.66 }));
		const planet = new THREE.Mesh(this.getGeometry('planet-large', () => new THREE.SphereGeometry(10, 28, 18)), planetMaterial);
		planet.position.set(55, 30, 43);
		root.add(planet);
		const ringMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({ color: 0xd2b7ff, transparent: true, opacity: 0.72, side: THREE.DoubleSide, toneMapped: false }));
		const ring = new THREE.Mesh(this.getGeometry('planet-ring', () => new THREE.TorusGeometry(14, 0.48, 8, 64)), ringMaterial);
		ring.position.copy(planet.position);
		ring.rotation.x = 1.18;
		ring.rotation.z = 0.32;
		root.add(ring);

		const moon = new THREE.Mesh(
			this.getGeometry('moon', () => new THREE.SphereGeometry(5.5, 22, 15)),
			this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x9ce6ec, emissive: 0x174d72, emissiveIntensity: 0.65, roughness: 0.8 }))
		);
		moon.position.set(-54, 23, -32);
		root.add(moon);

		const prismMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0xa887ff, emissive: 0x5831cf, emissiveIntensity: 1.8, roughness: 0.32, metalness: 0.28 }));
		for (const progress of [0.14, 0.38, 0.64, 0.88]) {
			const gate = new THREE.Group();
			for (const side of [-1, 1]) {
				const crystal = new THREE.Mesh(this.getGeometry('gate-crystal', () => new THREE.OctahedronGeometry(0.72, 0)), prismMaterial);
				crystal.position.set(side * 5.5, 2.3, 0);
				crystal.scale.y = 3.4;
				gate.add(crystal);
			}
			const beam = new THREE.Mesh(this.getGeometry('gate-beam', () => new THREE.BoxGeometry(11, 0.18, 0.18)), prismMaterial);
			beam.position.y = 4.4;
			gate.add(beam);
			this.placeStaticOnCurve(curve, gate, progress, 0, 0);
			root.add(gate);
		}
	}

	private addMallEnvironment(root: THREE.Group, curve: THREE.CatmullRomCurve3) {
		const floorMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0xeadfce, roughness: 0.76, metalness: 0.02 }));
		const floor = new THREE.Mesh(this.getGeometry('mall-floor', () => new THREE.BoxGeometry(116, 0.6, 108)), floorMaterial);
		floor.position.y = -0.42;
		root.add(floor);

		const glassMaterial = this.trackMaterial(new THREE.MeshPhysicalMaterial({ color: 0xc7f4ff, transparent: true, opacity: 0.24, roughness: 0.12, metalness: 0.05, side: THREE.DoubleSide, depthWrite: false }));
		const roof = new THREE.Mesh(this.getGeometry('mall-roof', () => new THREE.BoxGeometry(114, 0.18, 106)), glassMaterial);
		roof.position.y = 18.2;
		root.add(roof);

		const beamMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0xf7f2e7, roughness: 0.42, metalness: 0.22 }));
		const longBeam = this.getGeometry('roof-beam-long', () => new THREE.BoxGeometry(0.32, 0.34, 104));
		const crossBeam = this.getGeometry('roof-beam-cross', () => new THREE.BoxGeometry(112, 0.34, 0.32));
		for (let index = -8; index <= 8; index += 1) {
			const northSouth = new THREE.Mesh(longBeam, beamMaterial);
			northSouth.position.set(index * 6.4, 17.95, 0);
			root.add(northSouth);
		}
		for (let index = -7; index <= 7; index += 1) {
			const eastWest = new THREE.Mesh(crossBeam, beamMaterial);
			eastWest.position.set(0, 17.91, index * 6.8);
			root.add(eastWest);
		}

		const lightMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({ color: 0xfff4c7, toneMapped: false }));
		for (let x = -42; x <= 42; x += 14) {
			for (let z = -36; z <= 36; z += 18) {
				const light = new THREE.Mesh(this.getGeometry('mall-ceiling-light', () => new THREE.BoxGeometry(3.8, 0.08, 0.42)), lightMaterial);
				light.position.set(x, 17.7, z);
				root.add(light);
			}
		}

		const storeColors = [0xff7d91, 0x66dfff, 0xffd45a, 0x8d75ff, 0x49d2a7, 0xff9c62];
		const stores = [
			[-42, -49, 0, 'KART MART'], [-27, -49, 0, 'SUN SHOP'], [-12, -49, 0, 'JUICE LAB'],
			[12, -49, 0, 'ARCADE'], [27, -49, 0, 'PIT STOP'], [42, -49, 0, 'BOOK NOOK'],
			[-42, 49, Math.PI, 'PALM STYLE'], [-27, 49, Math.PI, 'LEVEL TWO'], [-12, 49, Math.PI, 'SNACK LAB'],
			[12, 49, Math.PI, 'TOY ORBIT'], [27, 49, Math.PI, 'CLOUD CAFE'], [42, 49, Math.PI, 'STAR GOODS'],
			[-55, -30, Math.PI / 2, 'MARKET'], [-55, -12, Math.PI / 2, 'FLOWER BAR'], [-55, 12, Math.PI / 2, 'COCO BOOKS'], [-55, 30, Math.PI / 2, 'FOOD COURT'],
			[55, -30, -Math.PI / 2, 'RACE GEAR'], [55, -12, -Math.PI / 2, 'MUSIC LAB'], [55, 12, -Math.PI / 2, 'PARK SHOP'], [55, 30, -Math.PI / 2, 'SUN CAFE']
		] as const;
		for (let index = 0; index < stores.length; index += 1) {
			const [x, z, rotation, name] = stores[index];
			const store = new THREE.Group();
			store.position.set(x, 0, z);
			store.rotation.y = rotation;
			const facadeMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({ color: index % 2 === 0 ? 0xf7eee2 : 0xe6efe9, roughness: 0.72 }));
			this.box(store, facadeMaterial, 13.2, 13.9, 4, 0, 6.45, 0);
			const accent = storeColors[index % storeColors.length];
			const windowMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x183653, emissive: accent, emissiveIntensity: 0.3, roughness: 0.19, metalness: 0.16 }));
			for (const level of [2.1, 8.4]) this.box(store, windowMaterial, 10.8, 3.25, 0.16, 0, level, 2.08);
			this.box(store, this.trackMaterial(new THREE.MeshStandardMaterial({ color: accent, roughness: 0.52 })), 11.5, 0.32, 0.7, 0, 4.18, 2.33);
			const sign = new THREE.Mesh(
				this.getGeometry('store-sign-wide', () => new THREE.PlaneGeometry(7.4, 1.4)),
				this.trackMaterial(new THREE.MeshBasicMaterial({ map: this.createTextTexture(name, accent), transparent: true, toneMapped: false }))
			);
			sign.position.set(0, 11.7, 2.11);
			store.add(sign);
			root.add(store);
		}

		const balconyMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0xf4eadb, roughness: 0.66, metalness: 0.05 }));
		const railMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.5, roughness: 0.24 }));
		for (const z of [-43, 43]) {
			this.box(root, balconyMaterial, 100, 0.55, 8, 0, 6.35, z);
			this.box(root, railMaterial, 100, 0.2, 0.22, 0, 7.35, z + (z < 0 ? 4.15 : -4.15));
		}
		for (const x of [-49, 49]) {
			this.box(root, balconyMaterial, 8, 0.55, 78, x, 6.35, 0);
			this.box(root, railMaterial, 0.22, 0.2, 78, x + (x < 0 ? 4.15 : -4.15), 7.35, 0);
		}

		const columnMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0xf8f1e6, roughness: 0.63, metalness: 0.08 }));
		for (const x of [-46, -23, 23, 46]) {
			for (const z of [-40, 40]) this.box(root, columnMaterial, 0.85, 17.4, 0.85, x, 8.3, z);
		}

		const fountain = new THREE.Group();
		const fountainMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0xeaf5ef, roughness: 0.34, metalness: 0.2 }));
		const waterMaterial = this.trackMaterial(new THREE.MeshPhysicalMaterial({ color: 0x66dfff, transparent: true, opacity: 0.72, roughness: 0.06, depthWrite: false }));
		const basin = new THREE.Mesh(this.getGeometry('fountain-basin', () => new THREE.CylinderGeometry(6.8, 7.4, 0.9, 32)), fountainMaterial);
		basin.position.y = 0.05;
		const water = new THREE.Mesh(this.getGeometry('fountain-water', () => new THREE.CylinderGeometry(6.25, 6.25, 0.14, 32)), waterMaterial);
		water.position.y = 0.57;
		const center = new THREE.Mesh(this.getGeometry('fountain-column', () => new THREE.CylinderGeometry(0.72, 1.05, 3.7, 16)), fountainMaterial);
		center.position.y = 1.95;
		fountain.add(basin, water, center);
		for (let index = 0; index < 7; index += 1) {
			const jet = new THREE.Mesh(this.getGeometry('fountain-jet', () => new THREE.CylinderGeometry(0.07, 0.13, 3.2, 8)), waterMaterial);
			const angle = (index / 7) * TAU;
			jet.position.set(Math.cos(angle) * 3.5, 2.15, Math.sin(angle) * 3.5);
			jet.rotation.z = Math.cos(angle) * 0.2;
			jet.rotation.x = Math.sin(angle) * 0.2;
			fountain.add(jet);
		}
		curve.getPointAt(0.271, this.point);
		fountain.position.set(this.point.x, -0.18, this.point.z);
		root.add(fountain);

		const palmMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x277a58, roughness: 0.82 }));
		const trunkMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0xa96b42, roughness: 0.9 }));
		const palmPositions = [[-18, -24], [15, -20], [-14, 27], [16, 26], [-38, 2], [39, 23]] as const;
		for (const [x, z] of palmPositions) {
			const palm = new THREE.Group();
			palm.position.set(x, 0, z);
			const trunk = new THREE.Mesh(this.getGeometry('palm-trunk', () => new THREE.CylinderGeometry(0.24, 0.42, 5.6, 8)), trunkMaterial);
			trunk.position.y = 2.8;
			palm.add(trunk);
			for (let leaf = 0; leaf < 6; leaf += 1) {
				const frond = new THREE.Mesh(this.getGeometry('palm-frond', () => new THREE.ConeGeometry(0.55, 4.4, 5)), palmMaterial);
				frond.position.y = 5.7;
				frond.rotation.z = Math.PI / 2.8;
				frond.rotation.y = (leaf / 6) * TAU;
				palm.add(frond);
			}
			root.add(palm);
		}
	}

	private addMallCourseFeatures(root: THREE.Group, curve: THREE.CatmullRomCurve3) {
		const stepMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x263f58, emissive: 0x27566b, emissiveIntensity: 0.28, roughness: 0.58, metalness: 0.36 }));
		const stepAccent = this.trackMaterial(new THREE.MeshBasicMaterial({ color: 0x6ff0d2, toneMapped: false }));
		const railMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0xf8f6ec, roughness: 0.22, metalness: 0.62 }));
		const escalatorSteps = 34;
		for (let index = 0; index < escalatorSteps; index += 1) {
			const progress = THREE.MathUtils.lerp(MALL_ESCALATOR_START, MALL_ESCALATOR_END, (index + 0.5) / escalatorSteps);
			const strip = new THREE.Mesh(this.getGeometry('escalator-step', () => new THREE.BoxGeometry(10.4, 0.09, 0.48)), index % 4 === 0 ? stepAccent : stepMaterial);
			this.placeStaticOnCurve(curve, strip, progress, 0, 0.09);
			root.add(strip);
			for (const side of [-1, 1]) {
				const rail = new THREE.Mesh(this.getGeometry('escalator-rail-segment', () => new THREE.BoxGeometry(0.17, 0.2, 1.05)), railMaterial);
				this.placeStaticOnCurve(curve, rail, progress, side * 5.45, 1.05);
				root.add(rail);
			}
		}

		const upperSlabMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0xd6c5b2, roughness: 0.74, metalness: 0.04 }));
		for (let index = 0; index < 30; index += 1) {
			const progress = THREE.MathUtils.lerp(0.425, 0.715, (index + 0.5) / 30);
			const slab = new THREE.Mesh(this.getGeometry('upper-route-slab', () => new THREE.BoxGeometry(14.2, 0.5, 4.25)), upperSlabMaterial);
			this.placeStaticOnCurve(curve, slab, progress, 0, -0.34);
			root.add(slab);
		}

		const rampEdgeMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({ color: 0xffd45a, toneMapped: false }));
		for (const progress of [MALL_JUMP_GAP_START - 0.005, MALL_JUMP_GAP_END + 0.005]) {
			for (const side of [-1, 1]) {
				const marker = new THREE.Mesh(this.getGeometry('jump-edge', () => new THREE.BoxGeometry(0.22, 0.12, 3.4)), rampEdgeMaterial);
				this.placeStaticOnCurve(curve, marker, progress, side * 5.65, 0.12);
				root.add(marker);
			}
		}

		const zones = [
			[0.035, 'GRAND ATRIUM', 0xff7d91],
			[0.334, 'ESCALATOR  ·  LEVEL 2', 0x66dfff],
			[0.485, 'UPPER GALLERY', 0xd6f247],
			[0.724, 'LOWER ARCADE', 0x8d75ff]
		] as const;
		for (const [progress, label, accent] of zones) {
			const portal = new THREE.Group();
			this.box(portal, railMaterial, 0.26, 4.8, 0.26, -5.6, 2.4, 0);
			this.box(portal, railMaterial, 0.26, 4.8, 0.26, 5.6, 2.4, 0);
			const sign = new THREE.Mesh(
				this.getGeometry('mall-zone-sign', () => new THREE.PlaneGeometry(7.5, 1.25)),
				this.trackMaterial(new THREE.MeshBasicMaterial({ map: this.createTextTexture(label, accent), transparent: true, toneMapped: false }))
			);
			sign.position.y = 4.55;
			sign.rotation.y = Math.PI;
			portal.add(sign);
			this.placeStaticOnCurve(curve, portal, progress, 0, 0);
			root.add(portal);
		}
	}

	private createKart(style: number, bodyColor: string, player: boolean): KartRig {
		const root = new THREE.Group();
		const body = new THREE.Group();
		root.add(body);
		const bodyMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.38, metalness: 0.16 }));
		const trimMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({ color: style % 3 === 0 ? 0x18203b : 0xf6f1de, roughness: 0.42, metalness: 0.2 }));
		const glassMaterial = this.trackMaterial(new THREE.MeshPhysicalMaterial({ color: 0xbceaff, transparent: true, opacity: 0.74, roughness: 0.08, metalness: 0.2 }));
		const tireMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0x111423, roughness: 0.9 }));
		const wheelHubMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({ color: 0xd8e2ec, roughness: 0.28, metalness: 0.7 }));

		const chassis = this.box(body, bodyMaterial, 1.42 + (style % 2) * 0.12, 0.34, 2.05 - (style % 3) * 0.08, 0, 0.42, 0);
		chassis.rotation.x = style === 2 ? -0.05 : 0;
		const nose = this.box(body, bodyMaterial, style === 2 ? 0.74 : 1.15, 0.28, style === 2 ? 1.06 : 0.74, 0, 0.61, 1.03);
		nose.rotation.x = -0.08;
		const bumper = this.box(body, trimMaterial, style === 2 ? 1.55 : 1.72, 0.15, 0.22, 0, 0.29, 1.33);
		const seat = new THREE.Mesh(this.getGeometry('kart-cabin', () => new THREE.SphereGeometry(0.58, 16, 10)), glassMaterial);
		seat.scale.set(style === 3 ? 1.05 : 0.86, style === 3 ? 1.05 : 0.78, style === 3 ? 1.02 : 0.74);
		seat.position.set(0, 0.86, -0.17);
		body.add(seat);

		if (style % 4 === 1) {
			const rollBar = new THREE.Mesh(this.getGeometry('roll-bar', () => new THREE.TorusGeometry(0.57, 0.075, 7, 18, Math.PI)), trimMaterial);
			rollBar.position.set(0, 1.03, -0.15);
			rollBar.rotation.z = Math.PI;
			body.add(rollBar);
		}
		if (style % 4 === 2) {
			const wing = this.box(body, trimMaterial, 1.75, 0.12, 0.34, 0, 0.83, -1.05);
			this.box(body, trimMaterial, 0.1, 0.44, 0.1, -0.55, 0.62, -0.97);
			this.box(body, trimMaterial, 0.1, 0.44, 0.1, 0.55, 0.62, -0.97);
			wing.rotation.x = 0.05;
		}
		if (style % 4 === 3) {
			const engine = this.box(body, trimMaterial, 0.92, 0.48, 0.66, 0, 0.7, -0.92);
			engine.rotation.x = 0.05;
			for (const x of [-0.3, 0, 0.3]) this.box(body, wheelHubMaterial, 0.12, 0.28, 0.12, x, 1.02, -0.95);
		}

		const driverSuit = this.trackMaterial(new THREE.MeshStandardMaterial({ color: player ? 0x8d75ff : 0x34445f, roughness: 0.68 }));
		const helmetMaterial = this.trackMaterial(new THREE.MeshStandardMaterial({ color: player ? 0xffffff : bodyColor, roughness: 0.46 }));
		const torso = new THREE.Mesh(this.getGeometry('driver-torso', () => new THREE.CylinderGeometry(0.3, 0.39, 0.62, 10)), driverSuit);
		torso.position.set(0, 1.08, -0.18);
		const helmet = new THREE.Mesh(this.getGeometry('driver-head', () => new THREE.SphereGeometry(0.33, 14, 10)), helmetMaterial);
		helmet.position.set(0, 1.52, -0.12);
		const visor = this.box(body, glassMaterial, 0.45, 0.12, 0.08, 0, 1.55, 0.17);
		body.add(torso, helmet);

		const wheels: WheelRig[] = [];
		const frontWheels: THREE.Group[] = [];
		for (const z of [-0.72, 0.75]) {
			for (const x of [-0.84, 0.84]) {
				const pivot = new THREE.Group();
				pivot.position.set(x, 0.36, z);
				const wheel = new THREE.Mesh(this.getGeometry('kart-wheel', () => new THREE.CylinderGeometry(0.31, 0.31, 0.22, 14)), tireMaterial);
				wheel.rotation.z = Math.PI / 2;
				const hub = new THREE.Mesh(this.getGeometry('kart-hub', () => new THREE.CylinderGeometry(0.15, 0.15, 0.235, 12)), wheelHubMaterial);
				hub.rotation.z = Math.PI / 2;
				pivot.add(wheel, hub);
				body.add(pivot);
				wheels.push({ pivot, wheel });
				if (z > 0) frontWheels.push(pivot);
			}
		}

		const shadowMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({ color: 0x02040b, transparent: true, opacity: 0.38, depthWrite: false }));
		const shadow = new THREE.Mesh(this.getGeometry('kart-shadow', () => new THREE.CircleGeometry(1.12, 20)), shadowMaterial);
		shadow.rotation.x = -Math.PI / 2;
		shadow.scale.set(1, 1.45, 1);
		shadow.position.y = 0.035;
		root.add(shadow);

		const flameMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({ color: 0x69e7ff, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false }));
		const flames: THREE.Mesh[] = [];
		for (const x of [-0.43, 0.43]) {
			const flame = new THREE.Mesh(this.getGeometry('boost-flame', () => new THREE.ConeGeometry(0.2, 1.05, 8)), flameMaterial);
			flame.rotation.x = -Math.PI / 2;
			flame.position.set(x, 0.39, -1.55);
			flame.visible = false;
			flames.push(flame);
			body.add(flame);
		}

		const hitMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({ color: 0xfff275, transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
		const hitRing = new THREE.Mesh(this.getGeometry('kart-hit-ring', () => new THREE.TorusGeometry(1.18, 0.075, 8, 28)), hitMaterial);
		hitRing.rotation.x = Math.PI / 2;
		hitRing.position.y = 0.78;
		root.add(hitRing);
		root.visible = false;
		return { root, body, wheels, frontWheels, flames, hitRing, style };
	}

	private createItemBox(): ItemBoxRig {
		const root = new THREE.Group();
		const questionTexture = this.createQuestionTexture();
		const boxMaterial = this.getMaterial('item-box-material', () => new THREE.MeshStandardMaterial({ color: 0xffffff, map: questionTexture, emissive: 0x7458d9, emissiveIntensity: 1.55, transparent: true, opacity: 0.86, roughness: 0.2, metalness: 0.12 }));
		const wireMaterial = this.getMaterial('item-wire-material', () => new THREE.MeshBasicMaterial({ color: 0x77e8ff, wireframe: true, transparent: true, opacity: 0.9, toneMapped: false }));
		const box = new THREE.Mesh(this.getGeometry('item-box', () => new THREE.BoxGeometry(0.78, 0.78, 0.78)), boxMaterial);
		const wire = new THREE.Mesh(this.getGeometry('item-wire', () => new THREE.BoxGeometry(0.9, 0.9, 0.9)), wireMaterial);
		const ring = new THREE.Mesh(this.getGeometry('item-respawn-ring', () => new THREE.TorusGeometry(0.48, 0.045, 7, 24)), wireMaterial);
		ring.rotation.x = Math.PI / 2;
		root.add(box, wire, ring);
		root.visible = false;
		return { root, box, wire, ring };
	}

	private createProjectile(): ProjectileRig {
		const root = new THREE.Group();
		const green = this.createShell(0x44d27d);
		const red = this.createShell(0xff5574);
		root.add(green, red);
		root.visible = false;
		return { root, green, red };
	}

	private createShell(shellColor: number) {
		const group = new THREE.Group();
		const shellMaterial = this.getMaterial(`shell-${shellColor}`, () => new THREE.MeshStandardMaterial({ color: shellColor, emissive: shellColor, emissiveIntensity: 0.32, roughness: 0.42 }));
		const creamMaterial = this.getMaterial('shell-cream', () => new THREE.MeshStandardMaterial({ color: 0xfff7d8, roughness: 0.72 }));
		const darkMaterial = this.getMaterial('shell-dark', () => new THREE.MeshStandardMaterial({ color: 0x18203b, roughness: 0.8 }));
		const dome = new THREE.Mesh(this.getGeometry('shell-dome', () => new THREE.SphereGeometry(0.42, 18, 12, 0, TAU, 0, Math.PI * 0.72)), shellMaterial);
		dome.rotation.x = Math.PI;
		dome.position.y = 0.16;
		const rim = new THREE.Mesh(this.getGeometry('shell-rim', () => new THREE.TorusGeometry(0.4, 0.085, 8, 24)), creamMaterial);
		rim.rotation.x = Math.PI / 2;
		const base = new THREE.Mesh(this.getGeometry('shell-base', () => new THREE.CylinderGeometry(0.31, 0.38, 0.12, 18)), darkMaterial);
		base.position.y = -0.07;
		group.add(dome, rim, base);
		for (let index = 0; index < 5; index += 1) {
			const panel = new THREE.Mesh(this.getGeometry('shell-panel', () => new THREE.CylinderGeometry(0.035, 0.075, 0.2, 6)), creamMaterial);
			const angle = (index / 5) * TAU;
			panel.position.set(Math.cos(angle) * 0.25, 0.43, Math.sin(angle) * 0.25);
			panel.rotation.z = Math.cos(angle) * 0.32;
			panel.rotation.x = Math.sin(angle) * 0.32;
			group.add(panel);
		}
		for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
			const foot = new THREE.Mesh(this.getGeometry('shell-foot', () => new THREE.ConeGeometry(0.11, 0.28, 6)), creamMaterial);
			foot.position.set(Math.cos(angle) * 0.46, -0.02, Math.sin(angle) * 0.46);
			foot.rotation.z = Math.PI / 2;
			foot.rotation.y = -angle;
			group.add(foot);
		}
		return group;
	}

	private createBanana() {
		const root = new THREE.Group();
		const yellow = this.getMaterial('banana-yellow', () => new THREE.MeshStandardMaterial({ color: 0xffd347, emissive: 0x6f3b00, emissiveIntensity: 0.18, roughness: 0.62 }));
		const inner = this.getMaterial('banana-inner', () => new THREE.MeshStandardMaterial({ color: 0xfff1a6, roughness: 0.72 }));
		const tip = this.getMaterial('banana-tip', () => new THREE.MeshStandardMaterial({ color: 0x4e321d, roughness: 0.9 }));
		const core = new THREE.Mesh(this.getGeometry('banana-core', () => new THREE.SphereGeometry(0.2, 12, 9)), inner);
		core.scale.set(0.92, 1.36, 0.92);
		core.position.y = 0.43;
		root.add(core);

		for (let index = 0; index < 3; index += 1) {
			const peel = new THREE.Group();
			peel.rotation.y = (index / 3) * TAU;
			const upper = new THREE.Mesh(this.getGeometry('banana-peel-upper', () => new THREE.CapsuleGeometry(0.115, 0.38, 5, 9)), yellow);
			upper.position.set(0, 0.25, 0.25);
			upper.rotation.x = Math.PI * 0.34;
			upper.scale.set(1.08, 1, 0.82);
			const lower = new THREE.Mesh(this.getGeometry('banana-peel-lower', () => new THREE.CapsuleGeometry(0.095, 0.36, 5, 9)), yellow);
			lower.position.set(0, -0.04, 0.55);
			lower.rotation.x = Math.PI * 0.43;
			lower.scale.set(1.05, 1, 0.8);
			const end = new THREE.Mesh(this.getGeometry('banana-peel-tip', () => new THREE.SphereGeometry(0.085, 9, 7)), tip);
			end.position.set(0, -0.28, 0.78);
			end.scale.set(0.82, 0.62, 1.25);
			peel.add(upper, lower, end);
			root.add(peel);
		}
		const stem = new THREE.Mesh(this.getGeometry('banana-stem', () => new THREE.CapsuleGeometry(0.075, 0.48, 5, 9)), yellow);
		stem.position.set(0.07, 0.82, 0);
		stem.rotation.z = -0.22;
		const stemTip = new THREE.Mesh(this.getGeometry('banana-stem-tip', () => new THREE.SphereGeometry(0.09, 9, 7)), tip);
		stemTip.position.set(0.15, 1.12, 0);
		stemTip.scale.set(0.8, 0.65, 0.8);
		root.add(stem, stemTip);
		root.scale.setScalar(1.12);
		root.visible = false;
		return root;
	}

	private createImpact(): ImpactRig {
		const root = new THREE.Group();
		const burstMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({ color: 0xfff275, transparent: true, opacity: 0, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
		const ringMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
		const burst = new THREE.Mesh(this.getGeometry('impact-burst', () => new THREE.IcosahedronGeometry(0.7, 0)), burstMaterial);
		const ring = new THREE.Mesh(this.getGeometry('impact-ring', () => new THREE.TorusGeometry(0.8, 0.08, 8, 24)), ringMaterial);
		ring.rotation.x = Math.PI / 2;
		root.add(burst, ring);
		root.visible = false;
		return { root, burst, ring };
	}

	private createMallObstacle(): MallObstacleRig {
		const root = new THREE.Group();
		const kiosk = new THREE.Group();
		const planter = new THREE.Group();
		const bench = new THREE.Group();
		const cream = this.getMaterial('obstacle-cream', () => new THREE.MeshStandardMaterial({ color: 0xfff1d3, roughness: 0.68 }));
		const coral = this.getMaterial('obstacle-coral', () => new THREE.MeshStandardMaterial({ color: 0xff7d91, roughness: 0.54 }));
		const teal = this.getMaterial('obstacle-teal', () => new THREE.MeshStandardMaterial({ color: 0x3db8a9, roughness: 0.58 }));
		const green = this.getMaterial('obstacle-green', () => new THREE.MeshStandardMaterial({ color: 0x3f9a64, roughness: 0.86 }));
		const wood = this.getMaterial('obstacle-wood', () => new THREE.MeshStandardMaterial({ color: 0xb66f46, roughness: 0.82 }));
		this.box(kiosk, coral, 1.45, 0.75, 1.05, 0, 0.42, 0);
		this.box(kiosk, cream, 1.72, 0.12, 1.32, 0, 0.88, 0);
		for (const x of [-0.62, 0.62]) this.box(kiosk, teal, 0.11, 1.25, 0.11, x, 1.52, 0);
		this.box(kiosk, coral, 1.66, 0.13, 1.22, 0, 2.12, 0);

		const pot = new THREE.Mesh(this.getGeometry('planter-pot', () => new THREE.CylinderGeometry(0.72, 0.92, 0.72, 12)), cream);
		pot.position.y = 0.36;
		planter.add(pot);
		for (let index = 0; index < 7; index += 1) {
			const leaf = new THREE.Mesh(this.getGeometry('planter-leaf', () => new THREE.ConeGeometry(0.2, 1.15, 6)), green);
			const angle = (index / 7) * TAU;
			leaf.position.set(Math.cos(angle) * 0.34, 1.15, Math.sin(angle) * 0.34);
			leaf.rotation.z = Math.cos(angle) * 0.46;
			leaf.rotation.x = Math.sin(angle) * 0.46;
			planter.add(leaf);
		}

		this.box(bench, wood, 1.85, 0.22, 0.72, 0, 0.58, 0);
		this.box(bench, wood, 1.85, 0.83, 0.17, 0, 1.03, -0.28);
		for (const x of [-0.68, 0.68]) this.box(bench, teal, 0.16, 0.62, 0.16, x, 0.28, 0);

		const hitMaterial = this.trackMaterial(new THREE.MeshBasicMaterial({ color: 0xfff275, transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
		const hitRing = new THREE.Mesh(this.getGeometry('obstacle-hit-ring', () => new THREE.TorusGeometry(1.28, 0.09, 8, 24)), hitMaterial);
		hitRing.rotation.x = Math.PI / 2;
		hitRing.position.y = 0.16;
		root.add(kiosk, planter, bench, hitRing);
		root.visible = false;
		return { root, variants: { kiosk, planter, bench }, hitRing };
	}

	private updateKart(
		rig: KartRig,
		course: CourseWorld,
		progress: number,
		lane: number,
		steer: number,
		speed: number,
		time: number,
		boosting: boolean,
		hit: number,
		reducedMotion: boolean
	) {
		rig.root.visible = true;
		this.placeDynamicOnCurve(course.curve, rig.root, progress, lane * ROAD_HALF_WIDTH * 0.78, 0.08 + (reducedMotion ? 0 : Math.sin(time * 12 + rig.style) * 0.025));
		rig.body.position.y = course.id === 'sunset-galleria' ? this.mallJumpLift(progress) : 0;
		rig.body.rotation.z = -steer * 0.11 - (hit > 0.05 && !reducedMotion ? Math.sin(time * 45) * hit * 0.17 : 0);
		rig.body.rotation.y = steer * 0.08;
		for (const pivot of rig.frontWheels) pivot.rotation.y = steer * 0.38;
		for (const wheel of rig.wheels) wheel.pivot.rotation.x = time * speed * 96;
		for (let index = 0; index < rig.flames.length; index += 1) {
			const flame = rig.flames[index];
			flame.visible = boosting;
			if (boosting) flame.scale.set(1, 0.85 + Math.sin(time * 48 + index) * 0.18, 1);
		}
		rig.hitRing.visible = hit > 0.02;
		rig.hitRing.material.opacity = Math.min(0.9, hit * 0.9);
		rig.hitRing.scale.setScalar(1 + (1 - hit) * 0.55);
		rig.hitRing.rotation.z = time * 5;
	}

	private updateRivals(course: CourseWorld, state: KartRenderState) {
		for (let index = 0; index < this.rivals.length; index += 1) {
			const rig = this.rivals[index];
			const rival = state.rivals[index];
			if (!rival || rival.distance < -0.045 || rival.distance > 0.28) {
				rig.root.visible = false;
				continue;
			}
			const progress = this.wrap(state.progress + rival.distance);
			this.updateKart(rig, course, progress, rival.lane, 0, state.speed * 0.96, state.time + index * 0.19, false, rival.hit ?? 0, state.reducedMotion);
		}
	}

	private updateItemBoxes(course: CourseWorld, state: KartRenderState) {
		const boxes = state.itemBoxes;
		for (let index = 0; index < this.itemBoxes.length; index += 1) {
			const rig = this.itemBoxes[index];
			const box = boxes?.[index];
			if (!box || box.distance < -0.025 || box.distance > 0.24) {
				rig.root.visible = false;
				continue;
			}
			rig.root.visible = true;
			this.placeDynamicOnCurve(course.curve, rig.root, this.wrap(state.progress + box.distance), box.lane * ROAD_HALF_WIDTH * 0.78, 0.88 + Math.sin(state.time * 3.2 + index) * 0.12);
			rig.root.rotation.y += state.time * 1.8 + index * 0.4;
			const active = box.active !== false;
			rig.box.visible = active;
			rig.wire.visible = active;
			rig.ring.visible = !active;
			rig.ring.scale.setScalar(0.7 + Math.sin(state.time * 3 + index) * 0.12);
		}
	}

	private updateProjectiles(course: CourseWorld, state: KartRenderState) {
		const projectiles = state.projectiles;
		for (let index = 0; index < this.projectiles.length; index += 1) {
			const rig = this.projectiles[index];
			const projectile = projectiles?.[index];
			if (!projectile || projectile.distance < -0.04 || projectile.distance > 0.3) {
				rig.root.visible = false;
				continue;
			}
			rig.root.visible = true;
			rig.green.visible = projectile.type === 'green-shell';
			rig.red.visible = projectile.type === 'red-shell';
			this.placeDynamicOnCurve(course.curve, rig.root, this.wrap(state.progress + projectile.distance), projectile.lane * ROAD_HALF_WIDTH * 0.78, 0.44);
			rig.root.rotateZ((projectile.heading ?? 0) * 0.18);
			const active = projectile.type === 'red-shell' ? rig.red : rig.green;
			active.rotation.y = state.time * 8 + index;
			active.rotation.z = state.time * 11 + index * 0.4;
		}
	}

	private updateBananas(course: CourseWorld, state: KartRenderState) {
		const bananas = state.bananas;
		for (let index = 0; index < this.bananas.length; index += 1) {
			const rig = this.bananas[index];
			const banana = bananas?.[index];
			if (!banana || banana.distance < -0.03 || banana.distance > 0.25) {
				rig.visible = false;
				continue;
			}
			rig.visible = true;
			this.placeDynamicOnCurve(course.curve, rig, this.wrap(state.progress + banana.distance), banana.lane * ROAD_HALF_WIDTH * 0.78, 0.08);
			rig.rotation.y += Math.sin(state.time * 2.8 + index) * 0.15;
		}
	}

	private updateImpacts(course: CourseWorld, state: KartRenderState) {
		const impacts = state.impacts;
		for (let index = 0; index < this.impacts.length; index += 1) {
			const rig = this.impacts[index];
			const impact = impacts?.[index];
			if (!impact || impact.progress >= 1 || impact.distance < -0.04 || impact.distance > 0.28) {
				rig.root.visible = false;
				continue;
			}
			rig.root.visible = true;
			this.placeDynamicOnCurve(course.curve, rig.root, this.wrap(state.progress + impact.distance), impact.lane * ROAD_HALF_WIDTH * 0.78, 0.7);
			const fade = 1 - impact.progress;
			rig.root.scale.setScalar(0.65 + impact.progress * 2.25);
			rig.root.rotation.y = state.time * 6 + index;
			rig.burst.material.opacity = fade * 0.9;
			rig.ring.material.opacity = fade * 0.82;
			if (impact.color) {
				rig.burst.material.color.set(impact.color);
				rig.ring.material.color.set(impact.color);
			}
		}
	}

	private updateMallObstacles(course: CourseWorld, state: KartRenderState) {
		const obstacles = state.trackId === 'sunset-galleria' ? state.mallObstacles : undefined;
		for (let index = 0; index < this.mallObstacles.length; index += 1) {
			const rig = this.mallObstacles[index];
			const obstacle = obstacles?.[index];
			if (!obstacle || obstacle.distance < -0.025 || obstacle.distance > 0.25) {
				rig.root.visible = false;
				continue;
			}
			rig.root.visible = true;
			for (const type of MALL_OBSTACLE_TYPES) rig.variants[type].visible = obstacle.type === type;
			this.placeDynamicOnCurve(course.curve, rig.root, this.wrap(state.progress + obstacle.distance), obstacle.lane * ROAD_HALF_WIDTH * 0.78, 0.02);
			const hit = obstacle.hit ?? 0;
			rig.hitRing.visible = hit > 0.02;
			rig.hitRing.material.opacity = hit * 0.9;
			rig.hitRing.scale.setScalar(1 + (1 - hit) * 0.6);
		}
	}

	private updateCamera(course: CourseWorld, state: KartRenderState, delta: number, snap: boolean) {
		course.curve.getPointAt(this.wrap(state.progress), this.point);
		course.curve.getTangentAt(this.wrap(state.progress), this.tangent);
		this.right.set(-this.tangent.z, 0, this.tangent.x).normalize();
		this.desiredCamera.copy(this.point);
		this.desiredCamera.addScaledVector(this.right, state.lane * ROAD_HALF_WIDTH * 0.78);
		this.desiredCamera.addScaledVector(this.tangent, -6.6 - state.speed * 1.8);
		this.desiredCamera.y += state.trackId === 'prism-circuit' ? 3.85 : 3.55;
		if (!state.reducedMotion && (state.playerHit ?? state.spin) > 0.02) {
			const shake = Math.max(state.spin, state.playerHit ?? 0) * 0.13;
			this.desiredCamera.x += Math.sin(state.time * 55) * shake;
			this.desiredCamera.y += Math.cos(state.time * 47) * shake * 0.55;
		}
		this.cameraTarget.copy(this.point);
		this.cameraTarget.addScaledVector(this.right, state.lane * ROAD_HALF_WIDTH * 0.78);
		this.cameraTarget.addScaledVector(this.tangent, 6.8 + state.speed * 2.4);
		this.cameraTarget.y += 0.7;
		const smoothing = snap || state.reducedMotion ? 1 : 1 - Math.exp(-Math.max(delta, 1 / 120) * 8.5);
		this.camera.position.lerp(this.desiredCamera, smoothing);
		this.camera.lookAt(this.cameraTarget);
		this.camera.rotateZ(state.reducedMotion ? 0 : -state.steer * 0.018);
	}

	private mallJumpLift(progress: number) {
		const wrapped = this.wrap(progress);
		if (wrapped < MALL_JUMP_START || wrapped > MALL_JUMP_END) return 0;
		const amount = (wrapped - MALL_JUMP_START) / (MALL_JUMP_END - MALL_JUMP_START);
		return Math.sin(amount * Math.PI) * 1.35;
	}

	private placeStaticOnCurve(curve: THREE.CatmullRomCurve3, object: THREE.Object3D, progress: number, lane: number, height: number) {
		curve.getPointAt(this.wrap(progress), this.point);
		curve.getTangentAt(this.wrap(progress), this.tangent);
		this.right.set(-this.tangent.z, 0, this.tangent.x).normalize();
		object.position.copy(this.point).addScaledVector(this.right, lane);
		object.position.y += height;
		this.target.copy(object.position).add(this.tangent);
		object.lookAt(this.target);
	}

	private placeDynamicOnCurve(curve: THREE.CatmullRomCurve3, object: THREE.Object3D, progress: number, lane: number, height: number) {
		this.placeStaticOnCurve(curve, object, progress, lane, height);
	}

	private setDummyOnCurve(curve: THREE.CatmullRomCurve3, progress: number, lane: number, height: number) {
		curve.getPointAt(this.wrap(progress), this.point);
		curve.getTangentAt(this.wrap(progress), this.tangent);
		this.right.set(-this.tangent.z, 0, this.tangent.x).normalize();
		this.dummy.position.copy(this.point).addScaledVector(this.right, lane);
		this.dummy.position.y += height;
		this.target.copy(this.dummy.position).add(this.tangent);
		this.dummy.lookAt(this.target);
		this.dummy.scale.set(1, 1, 1);
		this.dummy.updateMatrix();
	}

	private box(parent: THREE.Object3D, material: THREE.Material, width: number, height: number, depth: number, x: number, y: number, z: number) {
		const mesh = new THREE.Mesh(this.getGeometry('unit-box', () => new THREE.BoxGeometry(1, 1, 1)), material);
		mesh.scale.set(width, height, depth);
		mesh.position.set(x, y, z);
		parent.add(mesh);
		return mesh;
	}

	private createQuestionTexture() {
		if (this.questionTexture) return this.questionTexture;
		const canvas = document.createElement('canvas');
		canvas.width = 192;
		canvas.height = 192;
		const context = canvas.getContext('2d');
		if (context) {
			const gradient = context.createLinearGradient(0, 0, 192, 192);
			gradient.addColorStop(0, '#66dfff');
			gradient.addColorStop(0.5, '#8d75ff');
			gradient.addColorStop(1, '#ff718d');
			context.fillStyle = gradient;
			context.fillRect(0, 0, 192, 192);
			context.strokeStyle = 'rgba(255,255,255,.72)';
			context.lineWidth = 9;
			context.strokeRect(9, 9, 174, 174);
			context.fillStyle = '#fffbe8';
			context.font = '900 132px system-ui';
			context.textAlign = 'center';
			context.textBaseline = 'middle';
			context.fillText('?', 96, 101);
		}
		const texture = this.trackTexture(new THREE.CanvasTexture(canvas));
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
		this.questionTexture = texture;
		return texture;
	}

	private createTextTexture(label: string, color: number) {
		const canvas = document.createElement('canvas');
		canvas.width = 512;
		canvas.height = 112;
		const context = canvas.getContext('2d');
		if (context) {
			context.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
			context.fillRect(0, 0, canvas.width, canvas.height);
			context.fillStyle = '#071126';
			context.font = '900 52px system-ui';
			context.textAlign = 'center';
			context.textBaseline = 'middle';
			context.fillText(label, 256, 60);
		}
		const texture = this.trackTexture(new THREE.CanvasTexture(canvas));
		texture.colorSpace = THREE.SRGBColorSpace;
		return texture;
	}

	private getGeometry<T extends THREE.BufferGeometry>(key: string, create: () => T): T {
		const existing = this.geometryCache.get(key);
		if (existing) return existing as T;
		const geometry = this.trackGeometry(create());
		this.geometryCache.set(key, geometry);
		return geometry;
	}

	private getMaterial<T extends THREE.Material>(key: string, create: () => T): T {
		const existing = this.materialCache.get(key);
		if (existing) return existing as T;
		const material = this.trackMaterial(create());
		this.materialCache.set(key, material);
		return material;
	}

	private trackGeometry<T extends THREE.BufferGeometry>(geometry: T) {
		this.geometries.add(geometry);
		return geometry;
	}

	private trackMaterial<T extends THREE.Material>(material: T) {
		this.materials.add(material);
		return material;
	}

	private trackTexture<T extends THREE.Texture>(texture: T) {
		this.textures.add(texture);
		return texture;
	}

	private wrap(value: number) {
		return ((value % 1) + 1) % 1;
	}

	private hash(seed: number) {
		const value = Math.sin(seed * 91.731 + 17.133) * 43758.5453;
		return value - Math.floor(value);
	}
}
