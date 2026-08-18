type AudioContextWithWebkit = typeof window & {
	webkitAudioContext?: typeof AudioContext;
};

/** Lightweight synthesized arcade-racing sound effects. */
export class KartAudio {
	private context?: AudioContext;
	private master?: GainNode;
	private compressor?: DynamicsCompressorNode;
	private engine?: OscillatorNode;
	private engineGain?: GainNode;
	private engineFilter?: BiquadFilterNode;
	private noise?: AudioBuffer;

	async unlock() {
		const context = this.ensureGraph();
		await context.resume();
	}

	startEngine() {
		const context = this.ensureGraph();
		if (this.engine) return;
		const engine = context.createOscillator();
		const filter = context.createBiquadFilter();
		const gain = context.createGain();
		engine.type = 'sawtooth';
		engine.frequency.value = 58;
		filter.type = 'lowpass';
		filter.frequency.value = 220;
		filter.Q.value = 5.5;
		gain.gain.value = 0.0001;
		engine.connect(filter).connect(gain).connect(this.master!);
		engine.start();
		gain.gain.exponentialRampToValueAtTime(0.035, context.currentTime + 0.18);
		this.engine = engine;
		this.engineGain = gain;
		this.engineFilter = filter;
	}

	setEngine(speed: number, accelerating: boolean) {
		if (!this.context || !this.engine || !this.engineGain || !this.engineFilter) return;
		const now = this.context.currentTime;
		const normalized = Math.max(0, Math.min(1.2, speed));
		this.engine.frequency.cancelScheduledValues(now);
		this.engine.frequency.linearRampToValueAtTime(55 + normalized * 105 + (accelerating ? 8 : 0), now + 0.08);
		this.engineFilter.frequency.cancelScheduledValues(now);
		this.engineFilter.frequency.linearRampToValueAtTime(190 + normalized * 440, now + 0.08);
		this.engineGain.gain.cancelScheduledValues(now);
		this.engineGain.gain.linearRampToValueAtTime(0.018 + normalized * 0.035, now + 0.08);
	}

	stopEngine() {
		if (!this.context || !this.engine || !this.engineGain) return;
		const now = this.context.currentTime;
		const engine = this.engine;
		this.engineGain.gain.cancelScheduledValues(now);
		this.engineGain.gain.setValueAtTime(Math.max(0.0001, this.engineGain.gain.value), now);
		this.engineGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
		engine.stop(now + 0.14);
		this.engine = undefined;
		this.engineGain = undefined;
		this.engineFilter = undefined;
	}

	playCountdown(final = false) {
		const context = this.ensureGraph();
		const now = context.currentTime;
		if (final) {
			this.tone(523.25, now, 0.09, 0.12, 'square');
			this.tone(659.25, now + 0.08, 0.1, 0.13, 'square');
			this.tone(783.99, now + 0.16, 0.28, 0.15, 'square');
			return;
		}
		this.tone(392, now, 0.13, 0.11, 'square');
	}

	playDriftSpark(level: number) {
		const context = this.ensureGraph();
		const now = context.currentTime;
		this.noiseBurst(now, 0.08, 0.04 + level * 0.012, 1800 + level * 450);
		this.tone(520 + level * 130, now, 0.07, 0.045, 'triangle');
	}

	playBoost() {
		const context = this.ensureGraph();
		const now = context.currentTime;
		this.noiseBurst(now, 0.34, 0.14, 1400);
		this.slide(130, 520, now, 0.32, 0.11, 'sawtooth');
	}

	playPickup() {
		const now = this.ensureGraph().currentTime;
		[659.25, 783.99, 987.77].forEach((frequency, index) => this.tone(frequency, now + index * 0.055, 0.12, 0.08, 'triangle'));
	}

	playRouletteTick(index: number) {
		const now = this.ensureGraph().currentTime;
		const notes = [659.25, 783.99, 880, 987.77];
		this.tone(notes[Math.abs(index) % notes.length], now, 0.055, 0.045, 'square');
	}

	playItemReady(item: 'green-shell' | 'red-shell' | 'banana') {
		const now = this.ensureGraph().currentTime;
		const root = item === 'red-shell' ? 587.33 : item === 'banana' ? 493.88 : 523.25;
		this.tone(root, now, 0.11, 0.075, 'triangle');
		this.tone(root * 1.25, now + 0.065, 0.18, 0.09, 'triangle');
	}

	playDefenseArm(item: 'green-shell' | 'red-shell' | 'banana') {
		const now = this.ensureGraph().currentTime;
		const root = item === 'red-shell' ? 440 : item === 'banana' ? 370 : 415;
		this.tone(root, now, 0.09, 0.055, 'triangle');
		this.tone(root * 1.5, now + 0.045, 0.14, 0.065, 'triangle');
	}

	playDefenseBlock() {
		const context = this.ensureGraph();
		const now = context.currentTime;
		this.noiseBurst(now, 0.16, 0.12, 2100);
		this.tone(880, now, 0.1, 0.1, 'square');
		this.tone(1174.66, now + 0.055, 0.22, 0.09, 'triangle');
	}

	playShellLaunch(homing: boolean) {
		const context = this.ensureGraph();
		const now = context.currentTime;
		this.noiseBurst(now, 0.1, 0.075, 1300);
		this.slide(homing ? 250 : 190, homing ? 690 : 520, now, 0.19, 0.09, 'sawtooth');
	}

	playShellBounce() {
		const now = this.ensureGraph().currentTime;
		this.tone(340, now, 0.06, 0.045, 'square');
	}

	playBananaDrop() {
		const context = this.ensureGraph();
		const now = context.currentTime;
		this.slide(330, 165, now, 0.16, 0.07, 'triangle');
		this.noiseBurst(now + 0.1, 0.08, 0.045, 520);
	}

	playHit() {
		const context = this.ensureGraph();
		const now = context.currentTime;
		this.noiseBurst(now, 0.24, 0.18, 420);
		this.slide(150, 48, now, 0.3, 0.16, 'square');
	}

	playLap() {
		const now = this.ensureGraph().currentTime;
		[523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => this.tone(frequency, now + index * 0.065, 0.17, 0.095, 'square'));
	}

	playFinish(won: boolean) {
		const now = this.ensureGraph().currentTime;
		const notes = won ? [523.25, 659.25, 783.99, 1046.5] : [523.25, 466.16, 392, 349.23];
		notes.forEach((frequency, index) => this.tone(frequency, now + index * 0.11, index === notes.length - 1 ? 0.55 : 0.2, 0.13, 'square'));
	}

	destroy() {
		this.stopEngine();
		void this.context?.close();
		this.context = undefined;
		this.master = undefined;
		this.compressor = undefined;
		this.noise = undefined;
	}

	private ensureGraph() {
		if (this.context && this.master) return this.context;
		const AudioContextClass = window.AudioContext ?? (window as AudioContextWithWebkit).webkitAudioContext;
		if (!AudioContextClass) throw new Error('Web Audio is unavailable.');
		const context = new AudioContextClass();
		const compressor = context.createDynamicsCompressor();
		compressor.threshold.value = -18;
		compressor.knee.value = 16;
		compressor.ratio.value = 5;
		compressor.attack.value = 0.006;
		compressor.release.value = 0.18;
		const master = context.createGain();
		master.gain.value = 0.72;
		master.connect(compressor).connect(context.destination);
		this.context = context;
		this.master = master;
		this.compressor = compressor;
		return context;
	}

	private tone(frequency: number, startsAt: number, duration: number, volume: number, type: OscillatorType) {
		const context = this.ensureGraph();
		const oscillator = context.createOscillator();
		const gain = context.createGain();
		oscillator.type = type;
		oscillator.frequency.value = frequency;
		gain.gain.setValueAtTime(0.0001, startsAt);
		gain.gain.exponentialRampToValueAtTime(volume, startsAt + 0.012);
		gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration);
		oscillator.connect(gain).connect(this.master!);
		oscillator.start(startsAt);
		oscillator.stop(startsAt + duration + 0.02);
	}

	private slide(from: number, to: number, startsAt: number, duration: number, volume: number, type: OscillatorType) {
		const context = this.ensureGraph();
		const oscillator = context.createOscillator();
		const gain = context.createGain();
		oscillator.type = type;
		oscillator.frequency.setValueAtTime(from, startsAt);
		oscillator.frequency.exponentialRampToValueAtTime(to, startsAt + duration);
		gain.gain.setValueAtTime(0.0001, startsAt);
		gain.gain.exponentialRampToValueAtTime(volume, startsAt + 0.018);
		gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration);
		oscillator.connect(gain).connect(this.master!);
		oscillator.start(startsAt);
		oscillator.stop(startsAt + duration + 0.02);
	}

	private noiseBurst(startsAt: number, duration: number, volume: number, cutoff: number) {
		const context = this.ensureGraph();
		if (!this.noise) {
			const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
			const data = buffer.getChannelData(0);
			for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1;
			this.noise = buffer;
		}
		const source = context.createBufferSource();
		const filter = context.createBiquadFilter();
		const gain = context.createGain();
		source.buffer = this.noise;
		filter.type = 'lowpass';
		filter.frequency.value = cutoff;
		gain.gain.setValueAtTime(volume, startsAt);
		gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration);
		source.connect(filter).connect(gain).connect(this.master!);
		source.start(startsAt);
		source.stop(startsAt + duration + 0.02);
	}
}
