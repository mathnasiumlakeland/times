import { STORY_TRAVEL_TIMING } from './story';

type AudioContextWindow = Window & {
	webkitAudioContext?: typeof AudioContext;
};

type NoiseOptions = {
	duration: number;
	peak: number;
	filterType: BiquadFilterType;
	filterStart: number;
	filterEnd: number;
	attack?: number;
};

type ToneOptions = {
	duration: number;
	frequencyStart: number;
	frequencyEnd?: number;
	peak: number;
	type?: OscillatorType;
	attack?: number;
	detune?: number;
};

const SILENCE = 0.0001;
const IMPACT_DELAY_SECONDS = 0.32;

/**
 * Procedural Web Audio effects for Story Mode battles and map travel.
 *
 * Boss encounters call `unlock()` from their entry gesture. Story travel starts
 * from the Continue gesture, so every layered effect shares the same AudioContext.
 */
export class BattleAudio {
	private context?: AudioContext;
	private master?: GainNode;
	private compressor?: DynamicsCompressorNode;
	private noiseBuffer?: AudioBuffer;
	private destroyed = false;

	async unlock() {
		const context = this.ensureContext();
		if (!context) return false;

		try {
			if (context.state === 'suspended') await context.resume();
			return context.state === 'running';
		} catch {
			return false;
		}
	}

	playEncounter() {
		const startAt = this.startTime();
		if (startAt === undefined) return;

		this.tone(startAt, {
			duration: 0.7,
			frequencyStart: 84,
			frequencyEnd: 48,
			peak: 0.2,
			type: 'sawtooth',
			attack: 0.018
		});
		this.tone(startAt + 0.08, {
			duration: 0.18,
			frequencyStart: 420,
			frequencyEnd: 315,
			peak: 0.08,
			type: 'square'
		});
		this.tone(startAt + 0.34, {
			duration: 0.22,
			frequencyStart: 420,
			frequencyEnd: 260,
			peak: 0.09,
			type: 'square'
		});
		this.noise(startAt, {
			duration: 0.58,
			peak: 0.075,
			filterType: 'lowpass',
			filterStart: 720,
			filterEnd: 180,
			attack: 0.025
		});
	}

	playBattleReady() {
		const startAt = this.startTime();
		if (startAt === undefined) return;

		for (const [index, frequency] of [294, 440, 587].entries()) {
			this.tone(startAt + index * 0.075, {
				duration: 0.19,
				frequencyStart: frequency,
				frequencyEnd: frequency * 1.04,
				peak: 0.105,
				type: index === 2 ? 'square' : 'triangle'
			});
		}
	}

	playStoryTravel(reducedMotion = false) {
		const ignitionAt = this.startTime(STORY_TRAVEL_TIMING.ignitionDelayMs / 1000);
		if (ignitionAt === undefined) return;

		if (reducedMotion) {
			this.storyArrival(ignitionAt);
			return;
		}

		const flightAt = ignitionAt + STORY_TRAVEL_TIMING.ignitionMs / 1000;
		const arrivalAt = flightAt + STORY_TRAVEL_TIMING.flightMs / 1000;

		this.tone(ignitionAt, {
			duration: STORY_TRAVEL_TIMING.ignitionMs / 1000,
			frequencyStart: 54,
			frequencyEnd: 118,
			peak: 0.16,
			type: 'sawtooth',
			attack: 0.08
		});
		this.noise(ignitionAt, {
			duration: STORY_TRAVEL_TIMING.ignitionMs / 1000,
			peak: 0.075,
			filterType: 'lowpass',
			filterStart: 170,
			filterEnd: 920,
			attack: 0.09
		});
		this.tone(flightAt, {
			duration: 0.42,
			frequencyStart: 116,
			frequencyEnd: 740,
			peak: 0.13,
			type: 'sawtooth',
			attack: 0.01
		});
		this.noise(flightAt, {
			duration: 0.96,
			peak: 0.1,
			filterType: 'bandpass',
			filterStart: 520,
			filterEnd: 1650,
			attack: 0.025
		});
		this.noise(flightAt + 0.72, {
			duration: 0.73,
			peak: 0.07,
			filterType: 'highpass',
			filterStart: 520,
			filterEnd: 1420,
			attack: 0.03
		});
		for (const pulse of [0.2, 0.58, 0.96]) {
			this.tone(flightAt + pulse, {
				duration: 0.23,
				frequencyStart: 104,
				frequencyEnd: 126,
				peak: 0.052,
				type: 'triangle',
				attack: 0.025
			});
		}
		this.storyArrival(arrivalAt);
	}

	playPlayerAttack(finisher = false) {
		const startAt = this.startTime();
		if (startAt === undefined) return;

		this.tone(startAt, {
			duration: 0.27,
			frequencyStart: 190,
			frequencyEnd: 1480,
			peak: 0.15,
			type: 'sawtooth',
			attack: 0.006
		});
		this.tone(startAt + 0.012, {
			duration: 0.2,
			frequencyStart: 380,
			frequencyEnd: 920,
			peak: 0.075,
			type: 'square',
			detune: 9
		});
		this.playerImpact(startAt + IMPACT_DELAY_SECONDS, finisher);
		if (finisher) this.victoryStinger(startAt + 0.63);
	}

	playEnemyAttack(finisher = false) {
		const startAt = this.startTime();
		if (startAt === undefined) return;

		this.tone(startAt, {
			duration: 0.28,
			frequencyStart: 1180,
			frequencyEnd: 145,
			peak: 0.16,
			type: 'square',
			attack: 0.004
		});
		this.tone(startAt + 0.016, {
			duration: 0.24,
			frequencyStart: 610,
			frequencyEnd: 92,
			peak: 0.085,
			type: 'sawtooth',
			detune: -12
		});
		this.shieldImpact(startAt + IMPACT_DELAY_SECONDS, finisher);
		if (finisher) this.defeatStinger(startAt + 0.62);
	}

	playRejectedCommand() {
		const startAt = this.startTime();
		if (startAt === undefined) return;

		this.tone(startAt, {
			duration: 0.13,
			frequencyStart: 150,
			frequencyEnd: 112,
			peak: 0.09,
			type: 'square',
			attack: 0.003
		});
		this.tone(startAt + 0.075, {
			duration: 0.14,
			frequencyStart: 132,
			frequencyEnd: 88,
			peak: 0.08,
			type: 'square',
			attack: 0.003
		});
	}

	playDialogueTick(character: string, index: number) {
		if (!character.trim()) return;
		const startAt = this.startTime(0.002);
		if (startAt === undefined) return;
		const characterOffset = character.charCodeAt(0) % 5;

		this.tone(startAt, {
			duration: 0.029,
			frequencyStart: 500 + (index % 5) * 23 + characterOffset * 7,
			peak: 0.024,
			type: 'square',
			attack: 0.003
		});
	}

	destroy() {
		if (this.destroyed) return;
		this.destroyed = true;
		this.noiseBuffer = undefined;
		this.master?.disconnect();
		this.compressor?.disconnect();
		void this.context?.close();
		this.master = undefined;
		this.compressor = undefined;
		this.context = undefined;
	}

	private ensureContext() {
		if (this.destroyed || typeof window === 'undefined') return undefined;
		if (this.context) return this.context;

		const AudioContextConstructor = window.AudioContext
			?? (window as AudioContextWindow).webkitAudioContext;
		if (!AudioContextConstructor) return undefined;

		const context = new AudioContextConstructor();
		const master = context.createGain();
		const compressor = context.createDynamicsCompressor();
		master.gain.value = 0.62;
		compressor.threshold.value = -18;
		compressor.knee.value = 14;
		compressor.ratio.value = 5;
		compressor.attack.value = 0.003;
		compressor.release.value = 0.18;
		master.connect(compressor);
		compressor.connect(context.destination);

		this.context = context;
		this.master = master;
		this.compressor = compressor;
		return context;
	}

	private startTime(offset = 0.008) {
		const context = this.ensureContext();
		if (!context) return undefined;
		if (context.state === 'suspended') void context.resume();
		return context.currentTime + offset;
	}

	private playerImpact(startAt: number, finisher: boolean) {
		this.noise(startAt, {
			duration: finisher ? 0.72 : 0.42,
			peak: finisher ? 0.31 : 0.23,
			filterType: 'bandpass',
			filterStart: finisher ? 1900 : 1500,
			filterEnd: 210,
			attack: 0.004
		});
		this.tone(startAt, {
			duration: finisher ? 0.56 : 0.34,
			frequencyStart: finisher ? 122 : 104,
			frequencyEnd: 38,
			peak: finisher ? 0.28 : 0.19,
			type: 'sine',
			attack: 0.004
		});
		for (const [index, frequency] of [760, 1090, 1430].entries()) {
			this.tone(startAt + index * 0.012, {
				duration: 0.13 + index * 0.025,
				frequencyStart: frequency,
				frequencyEnd: frequency * 0.62,
				peak: finisher ? 0.075 : 0.052,
				type: 'triangle'
			});
		}
	}

	private shieldImpact(startAt: number, finisher: boolean) {
		this.noise(startAt, {
			duration: finisher ? 0.65 : 0.38,
			peak: finisher ? 0.28 : 0.2,
			filterType: 'highpass',
			filterStart: 420,
			filterEnd: 2100,
			attack: 0.003
		});
		this.tone(startAt, {
			duration: finisher ? 0.58 : 0.38,
			frequencyStart: 175,
			frequencyEnd: 46,
			peak: finisher ? 0.27 : 0.18,
			type: 'sine',
			attack: 0.003
		});
		this.tone(startAt + 0.015, {
			duration: 0.24,
			frequencyStart: 880,
			frequencyEnd: 260,
			peak: 0.075,
			type: 'square',
			attack: 0.002
		});
	}

	private victoryStinger(startAt: number) {
		for (const [index, frequency] of [392, 494, 659, 784].entries()) {
			this.tone(startAt + index * 0.09, {
				duration: index === 3 ? 0.58 : 0.22,
				frequencyStart: frequency,
				frequencyEnd: index === 3 ? frequency * 1.03 : frequency,
				peak: index === 3 ? 0.15 : 0.1,
				type: index % 2 === 0 ? 'triangle' : 'square'
			});
		}
	}

	private defeatStinger(startAt: number) {
		for (const [index, frequency] of [330, 247, 196, 123].entries()) {
			this.tone(startAt + index * 0.11, {
				duration: index === 3 ? 0.7 : 0.26,
				frequencyStart: frequency,
				frequencyEnd: index === 3 ? 62 : frequency * 0.88,
				peak: index === 3 ? 0.17 : 0.1,
				type: index === 3 ? 'sawtooth' : 'triangle'
			});
		}
	}

	private storyArrival(startAt: number) {
		this.noise(startAt, {
			duration: 0.2,
			peak: 0.12,
			filterType: 'lowpass',
			filterStart: 760,
			filterEnd: 120,
			attack: 0.004
		});
		this.tone(startAt, {
			duration: 0.3,
			frequencyStart: 122,
			frequencyEnd: 48,
			peak: 0.13,
			type: 'sine',
			attack: 0.004
		});
		for (const [index, frequency] of [523, 659, 784].entries()) {
			this.tone(startAt + 0.07 + index * 0.08, {
				duration: index === 2 ? 0.48 : 0.22,
				frequencyStart: frequency,
				frequencyEnd: frequency * 1.015,
				peak: index === 2 ? 0.11 : 0.075,
				type: 'triangle'
			});
		}
	}

	private tone(startAt: number, options: ToneOptions) {
		const context = this.context;
		const master = this.master;
		if (!context || !master) return;

		const oscillator = context.createOscillator();
		const gain = context.createGain();
		const endsAt = startAt + options.duration;
		const attackEndsAt = Math.min(endsAt - 0.001, startAt + (options.attack ?? 0.006));
		oscillator.type = options.type ?? 'triangle';
		oscillator.frequency.setValueAtTime(Math.max(1, options.frequencyStart), startAt);
		oscillator.frequency.exponentialRampToValueAtTime(
			Math.max(1, options.frequencyEnd ?? options.frequencyStart),
			endsAt
		);
		oscillator.detune.value = options.detune ?? 0;
		gain.gain.setValueAtTime(SILENCE, startAt);
		gain.gain.exponentialRampToValueAtTime(Math.max(SILENCE, options.peak), attackEndsAt);
		gain.gain.exponentialRampToValueAtTime(SILENCE, endsAt);
		oscillator.connect(gain);
		gain.connect(master);
		oscillator.onended = () => {
			oscillator.disconnect();
			gain.disconnect();
		};
		oscillator.start(startAt);
		oscillator.stop(endsAt + 0.012);
	}

	private noise(startAt: number, options: NoiseOptions) {
		const context = this.context;
		const master = this.master;
		if (!context || !master) return;

		const source = context.createBufferSource();
		const filter = context.createBiquadFilter();
		const gain = context.createGain();
		const endsAt = startAt + options.duration;
		const attackEndsAt = Math.min(endsAt - 0.001, startAt + (options.attack ?? 0.005));
		source.buffer = this.getNoiseBuffer(context);
		filter.type = options.filterType;
		filter.Q.value = options.filterType === 'bandpass' ? 1.2 : 0.72;
		filter.frequency.setValueAtTime(Math.max(20, options.filterStart), startAt);
		filter.frequency.exponentialRampToValueAtTime(Math.max(20, options.filterEnd), endsAt);
		gain.gain.setValueAtTime(SILENCE, startAt);
		gain.gain.exponentialRampToValueAtTime(Math.max(SILENCE, options.peak), attackEndsAt);
		gain.gain.exponentialRampToValueAtTime(SILENCE, endsAt);
		source.connect(filter);
		filter.connect(gain);
		gain.connect(master);
		source.onended = () => {
			source.disconnect();
			filter.disconnect();
			gain.disconnect();
		};
		source.start(startAt);
		source.stop(endsAt + 0.01);
	}

	private getNoiseBuffer(context: AudioContext) {
		if (this.noiseBuffer) return this.noiseBuffer;
		const frameCount = Math.ceil(context.sampleRate * 1.25);
		const buffer = context.createBuffer(1, frameCount, context.sampleRate);
		const samples = buffer.getChannelData(0);
		let previous = 0;
		for (let index = 0; index < samples.length; index += 1) {
			const white = Math.random() * 2 - 1;
			previous = previous * 0.28 + white * 0.72;
			samples[index] = previous;
		}
		this.noiseBuffer = buffer;
		return buffer;
	}
}
