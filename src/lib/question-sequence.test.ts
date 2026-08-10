import { describe, expect, it } from 'bun:test';
import { makeQuestionSequence } from './question-sequence';

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
