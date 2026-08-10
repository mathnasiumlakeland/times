import { describe, expect, it } from 'bun:test';
import { getQuestionProgressPercent, makeQuestionSequence } from './question-sequence';

describe('multiplication question sequence', () => {
	it('never puts the same multiplication fact back-to-back', () => {
		const questions = makeQuestionSequence(Array.from({ length: 20 }, () => 3), () => 0.25);

		for (let index = 1; index < questions.length; index += 1) {
			expect(questions[index]).not.toEqual(questions[index - 1]);
		}
	});

	it('can revisit a fact after a different question', () => {
		expect(makeQuestionSequence([3, 3, 3], () => 0.25)).toEqual([
			{ table: 3, multiplier: 4 },
			{ table: 3, multiplier: 3 },
			{ table: 3, multiplier: 4 }
		]);
	});

	it('keeps every generated multiplier in the 1 through 12 range', () => {
		const questions = makeQuestionSequence([1, 1, 2, 2, 12, 12], () => 0.999999);
		expect(questions.every(({ multiplier }) => multiplier >= 1 && multiplier <= 12)).toBe(true);
	});
});

describe('question progress', () => {
	it('starts empty before the first answer is accepted', () => {
		expect(getQuestionProgressPercent(0, 10, false)).toBe(0);
	});

	it('holds completed progress while the next question is active', () => {
		expect(getQuestionProgressPercent(4, 10, false)).toBe(40);
		expect(getQuestionProgressPercent(4, 10, true)).toBe(50);
	});

	it('fills completely as soon as the tenth answer is accepted', () => {
		expect(getQuestionProgressPercent(9, 10, true)).toBe(100);
	});
});
