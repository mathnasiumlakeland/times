type MidiEvent = {
	tick: number;
	type: 'note-on' | 'note-off' | 'tempo';
	note?: number;
	velocity?: number;
	channel?: number;
	tempo?: number;
};

type MidiNote = {
	start: number;
	duration: number;
	note: number;
	velocity: number;
	channel: number;
};

function readUint32(bytes: Uint8Array, offset: number) {
	return (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
}

function readVariableLength(bytes: Uint8Array, offset: number) {
	let value = 0;
	let byte = 0;
	do {
		byte = bytes[offset++];
		value = (value << 7) | (byte & 0x7f);
	} while (byte & 0x80);
	return { value, offset };
}

function parseMidi(data: ArrayBuffer) {
	const bytes = new Uint8Array(data);
	if (String.fromCharCode(...bytes.slice(0, 4)) !== 'MThd') throw new Error('This is not a MIDI file.');

	const trackCount = (bytes[10] << 8) | bytes[11];
	const ticksPerBeat = (bytes[12] << 8) | bytes[13];
	if (ticksPerBeat & 0x8000) throw new Error('SMPTE MIDI timing is not supported.');

	let offset = 8 + readUint32(bytes, 4);
	const events: MidiEvent[] = [];
	let finalTick = 0;

	for (let track = 0; track < trackCount; track++) {
		if (String.fromCharCode(...bytes.slice(offset, offset + 4)) !== 'MTrk') throw new Error('Invalid MIDI track.');
		const trackEnd = offset + 8 + readUint32(bytes, offset + 4);
		offset += 8;
		let tick = 0;
		let runningStatus = 0;

		while (offset < trackEnd) {
			const delta = readVariableLength(bytes, offset);
			tick += delta.value;
			offset = delta.offset;
			let status = bytes[offset++];
			if (status < 0x80) {
				offset--;
				status = runningStatus;
			} else {
				runningStatus = status < 0xf0 ? status : 0;
			}

			if (status === 0xff) {
				const metaType = bytes[offset++];
				const length = readVariableLength(bytes, offset);
				offset = length.offset;
				if (metaType === 0x51 && length.value === 3) {
					events.push({ tick, type: 'tempo', tempo: (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2] });
				}
				offset += length.value;
				continue;
			}
			if (status === 0xf0 || status === 0xf7) {
				const length = readVariableLength(bytes, offset);
				offset = length.offset + length.value;
				continue;
			}

			const command = status >> 4;
			const channel = status & 0x0f;
			const first = bytes[offset++];
			const second = command === 0xc || command === 0xd ? 0 : bytes[offset++];
			if (command === 0x9 && second > 0) events.push({ tick, type: 'note-on', note: first, velocity: second, channel });
			if (command === 0x8 || (command === 0x9 && second === 0)) events.push({ tick, type: 'note-off', note: first, channel });
		}
		finalTick = Math.max(finalTick, tick);
		offset = trackEnd;
	}

	events.sort((a, b) => a.tick - b.tick || (a.type === 'tempo' ? -1 : 1));
	let tempo = 500000;
	let lastTick = 0;
	let seconds = 0;
	const openNotes = new Map<string, { start: number; velocity: number }>();
	const notes: MidiNote[] = [];

	for (const event of events) {
		seconds += ((event.tick - lastTick) * tempo) / ticksPerBeat / 1_000_000;
		lastTick = event.tick;
		if (event.type === 'tempo') {
			tempo = event.tempo!;
			continue;
		}
		const key = `${event.channel}:${event.note}`;
		if (event.type === 'note-on') {
			openNotes.set(key, { start: seconds, velocity: event.velocity! });
		} else {
			const openNote = openNotes.get(key);
			if (openNote) {
				notes.push({ start: openNote.start, duration: Math.max(0.045, seconds - openNote.start), note: event.note!, velocity: openNote.velocity, channel: event.channel! });
				openNotes.delete(key);
			}
		}
	}
	seconds += ((finalTick - lastTick) * tempo) / ticksPerBeat / 1_000_000;
	notes.sort((a, b) => a.start - b.start || a.note - b.note);
	return { notes, duration: Math.max(seconds, 1) };
}

export class MidiPlayer {
	private context?: AudioContext;
	private output?: GainNode;
	private compressor?: DynamicsCompressorNode;
	private music?: ReturnType<typeof parseMidi>;
	private timer?: number;
	private sources = new Set<AudioScheduledSourceNode>();
	private drumNoiseBuffer?: AudioBuffer;
	private iosMediaBridge?: HTMLAudioElement;
	private playbackStartedAt = 0;
	private loopNumber = 0;
	private nextNoteIndex = 0;

	constructor(private readonly volume = 1) {}

	async load(url: string) {
		const response = await fetch(url);
		if (!response.ok) throw new Error('Could not load the background music.');
		this.music = parseMidi(await response.arrayBuffer());
	}

	async unlock() {
		this.requestPlaybackAudioSession();
		const context = this.ensureAudioGraph();
		await context.resume();
		this.startIosMediaBridge();
	}

	async play() {
		if (!this.music) throw new Error('Music has not loaded yet.');
		this.stop();
		await this.unlock();
		this.scheduleLoop();
	}

	stop() {
		if (this.timer !== undefined) window.clearInterval(this.timer);
		this.timer = undefined;
		for (const source of this.sources) {
			try {
				source.stop();
			} catch {
				// A source can finish between the set iteration and the stop call.
			}
		}
		this.sources.clear();
		this.iosMediaBridge?.pause();
		this.playbackStartedAt = 0;
		this.loopNumber = 0;
		this.nextNoteIndex = 0;
	}

	destroy() {
		this.stop();
		void this.context?.close();
		this.context = undefined;
		this.output = undefined;
		this.compressor = undefined;
		this.drumNoiseBuffer = undefined;
	}

	private ensureAudioGraph() {
		if (this.context) return this.context;
		this.context = new AudioContext();
		this.output = this.context.createGain();
		this.compressor = this.context.createDynamicsCompressor();
		this.output.gain.value = this.volume;
		this.compressor.threshold.value = -18;
		this.compressor.knee.value = 16;
		this.compressor.ratio.value = 4;
		this.compressor.attack.value = 0.004;
		this.compressor.release.value = 0.16;
		this.output.connect(this.compressor);
		this.compressor.connect(this.context.destination);
		return this.context;
	}

	private scheduleLoop() {
		if (!this.context || !this.music) return;
		this.playbackStartedAt = this.context.currentTime + 0.06;
		this.loopNumber = 0;
		this.nextNoteIndex = 0;
		this.scheduleUpcomingNotes();
		this.timer = window.setInterval(() => this.scheduleUpcomingNotes(), 100);
	}

	private scheduleUpcomingNotes() {
		if (!this.context || !this.music || this.music.notes.length === 0) return;
		const now = this.context.currentTime;
		const scheduleThrough = now + 1.5;
		const currentLoop = Math.floor(Math.max(0, now - this.playbackStartedAt) / this.music.duration);
		if (currentLoop > this.loopNumber) {
			this.loopNumber = currentLoop;
			this.nextNoteIndex = 0;
		}

		while (true) {
			if (this.nextNoteIndex >= this.music.notes.length) {
				this.loopNumber += 1;
				this.nextNoteIndex = 0;
			}

			const note = this.music.notes[this.nextNoteIndex];
			const startsAt = this.playbackStartedAt + this.loopNumber * this.music.duration + note.start;
			if (startsAt > scheduleThrough) return;
			this.nextNoteIndex += 1;
			if (startsAt < now - 0.04) continue;
			this.playNote(note, Math.max(startsAt, now + 0.005));
		}
	}

	private playNote(note: MidiNote, startAt: number) {
		if (!this.context) return;
		const gain = this.context.createGain();
		gain.gain.setValueAtTime(0.0001, startAt);
		gain.gain.exponentialRampToValueAtTime(Math.max(0.012, (note.velocity / 127) * 0.055), startAt + 0.012);
		gain.gain.exponentialRampToValueAtTime(0.0001, startAt + note.duration);
		gain.connect(this.output ?? this.context.destination);

		if (note.channel === 9) {
			const noise = this.context.createBufferSource();
			noise.buffer = this.getDrumNoiseBuffer();
			noise.connect(gain);
			this.trackSource(noise);
			noise.start(startAt);
			noise.stop(startAt + Math.min(note.duration, 0.13));
			return;
		}

		const oscillator = this.context.createOscillator();
		oscillator.type = note.channel === 2 ? 'square' : 'triangle';
		oscillator.frequency.setValueAtTime(440 * Math.pow(2, (note.note - 69) / 12), startAt);
		oscillator.connect(gain);
		this.trackSource(oscillator);
		oscillator.start(startAt);
		oscillator.stop(startAt + note.duration + 0.02);
	}

	private getDrumNoiseBuffer() {
		if (!this.context) throw new Error('Audio context is not ready.');
		if (this.drumNoiseBuffer) return this.drumNoiseBuffer;
		const buffer = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * 0.13), this.context.sampleRate);
		const samples = buffer.getChannelData(0);
		for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
		this.drumNoiseBuffer = buffer;
		return buffer;
	}

	private trackSource(source: AudioScheduledSourceNode) {
		this.sources.add(source);
		source.onended = () => this.sources.delete(source);
	}

	private requestPlaybackAudioSession() {
		const navigatorWithAudioSession = navigator as Navigator & {
			audioSession?: { type: 'auto' | 'playback' | 'transient' | 'transient-solo' | 'ambient' | 'play-and-record' };
		};
		if (navigatorWithAudioSession.audioSession) navigatorWithAudioSession.audioSession.type = 'playback';
	}

	private startIosMediaBridge() {
		const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
		if (!isIos) return;
		this.iosMediaBridge ??= new Audio('/audio/duolingo-correct.mp3');
		this.iosMediaBridge.loop = true;
		this.iosMediaBridge.volume = 0;
		void this.iosMediaBridge.play().catch(() => {
			// The Audio Session API above is the primary path on current Safari.
		});
	}
}
