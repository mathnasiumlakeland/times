import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createSilentWavBuffer, getPausedPlaybackPosition, MidiPlayer } from './midi-player';

function readAscii(view: DataView, offset: number, length: number) {
	return Array.from({ length }, (_, index) => String.fromCharCode(view.getUint8(offset + index))).join('');
}

describe('iOS silent media bridge', () => {
	it('builds a valid silent PCM WAV instead of reusing an audible sound effect', () => {
		const buffer = createSilentWavBuffer();
		const view = new DataView(buffer);

		expect(readAscii(view, 0, 4)).toBe('RIFF');
		expect(readAscii(view, 8, 4)).toBe('WAVE');
		expect(readAscii(view, 12, 4)).toBe('fmt ');
		expect(readAscii(view, 36, 4)).toBe('data');
		expect(view.getUint16(20, true)).toBe(1);
		expect(view.getUint16(22, true)).toBe(1);
		expect(view.getUint32(24, true)).toBe(8000);
		expect(view.getUint16(34, true)).toBe(16);
		expect(view.getUint32(40, true)).toBe(buffer.byteLength - 44);

		const samples = new Int16Array(buffer, 44);
		expect(samples.every((sample) => sample === 0)).toBe(true);
	});
});

describe('MIDI playback position', () => {
	it('keeps the same position when playback is paused before its scheduled start', () => {
		expect(getPausedPlaybackPosition(42, 10.06, 10, 120)).toBe(42);
	});

	it('advances from the saved position while playback is active', () => {
		expect(getPausedPlaybackPosition(42, 10, 15.5, 120)).toBe(47.5);
	});

	it('wraps a resumed theme at the end of its loop', () => {
		expect(getPausedPlaybackPosition(118, 10, 15, 120)).toBe(3);
	});
});

const simpleMidi = new Uint8Array([
	0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x01, 0xe0,
	0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, 0x1e,
	0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20,
	0x00, 0x90, 0x3c, 0x64,
	0x83, 0x60, 0x80, 0x3c, 0x00,
	0x83, 0x60, 0x90, 0x3e, 0x64,
	0x83, 0x60, 0x80, 0x3e, 0x00,
	0x00, 0xff, 0x2f, 0x00
]);

class FakeAudioContext {
	currentTime = 0;
	destination = {} as AudioDestinationNode;
	oscillatorStarts: number[] = [];

	resume() { return Promise.resolve(); }
	close() { return Promise.resolve(); }
	createGain() {
		return {
			gain: {
				value: 0,
				setValueAtTime() {},
				exponentialRampToValueAtTime() {}
			},
			connect() {}
		} as unknown as GainNode;
	}
	createDynamicsCompressor() {
		const parameter = { value: 0 };
		return {
			threshold: { ...parameter },
			knee: { ...parameter },
			ratio: { ...parameter },
			attack: { ...parameter },
			release: { ...parameter },
			connect() {}
		} as unknown as DynamicsCompressorNode;
	}
	createOscillator() {
		return {
			type: 'sine',
			frequency: { setValueAtTime() {} },
			connect() {},
			start: (time: number) => this.oscillatorStarts.push(time),
			stop() {},
			onended: null
		} as unknown as OscillatorNode;
	}
	createBufferSource() {
		return { connect() {}, start() {}, stop() {}, onended: null } as unknown as AudioBufferSourceNode;
	}
	createBuffer(_channels: number, length: number) {
		return { getChannelData: () => new Float32Array(length) } as unknown as AudioBuffer;
	}
}

describe('MIDI pause and resume', () => {
	const originalAudioContext = globalThis.AudioContext;
	const originalFetch = globalThis.fetch;
	const originalWindow = globalThis.window;
	let context: FakeAudioContext;

	beforeEach(() => {
		context = new FakeAudioContext();
		Object.defineProperty(globalThis, 'AudioContext', {
			configurable: true,
			value: class {
				constructor() { return context; }
			}
		});
		Object.defineProperty(globalThis, 'window', {
			configurable: true,
			value: {
				setInterval: () => 1,
				clearInterval() {}
			}
		});
		globalThis.fetch = (() => Promise.resolve(new Response(simpleMidi))) as typeof fetch;
	});

	afterEach(() => {
		Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: originalAudioContext });
		Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
		globalThis.fetch = originalFetch;
	});

	it('does not restart a theme when play is requested while it is already playing', async () => {
		const player = new MidiPlayer();
		await player.load('/theme.mid');
		await player.play();
		const scheduledNotes = context.oscillatorStarts.length;

		await player.play();

		expect(context.oscillatorStarts).toHaveLength(scheduledNotes);
		player.destroy();
	});

	it('resumes from its paused position instead of scheduling from the beginning', async () => {
		const player = new MidiPlayer();
		await player.load('/theme.mid');
		await player.play();
		context.currentTime = 0.56;
		player.pause();
		context.oscillatorStarts = [];
		context.currentTime = 2;

		await player.play();

		expect(context.oscillatorStarts[0]).toBe(2.56);
		expect(context.oscillatorStarts).not.toContain(2.06);
		player.destroy();
	});
});
