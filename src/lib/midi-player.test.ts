import { describe, expect, it } from 'bun:test';
import { createSilentWavBuffer } from './midi-player';

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
