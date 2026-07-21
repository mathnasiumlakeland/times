export type PracticeExample = {
	table: number;
	multiplier: number;
	answer: number;
	strategyName: string;
	strategySummary: string;
	steps: string[];
};

const lastPracticeMultiplier = new Map<number, number>();

function choosePracticeMultiplier(table: number, problemMultiplier: number) {
	const previous = lastPracticeMultiplier.get(table);
	const choices = Array.from({ length: 11 }, (_, index) => index + 2).filter(
		(multiplier) => multiplier !== problemMultiplier && multiplier !== previous
	);
	const multiplier = choices[Math.floor(Math.random() * choices.length)] ?? (problemMultiplier === 2 ? 3 : 2);
	lastPracticeMultiplier.set(table, multiplier);
	return multiplier;
}

export function makePracticeExample(table: number, problemMultiplier: number): PracticeExample {
	const multiplier = choosePracticeMultiplier(table, problemMultiplier);
	const answer = table * multiplier;
	const double = 2 * multiplier;
	const fiveGroups = 5 * multiplier;
	const tenGroups = 10 * multiplier;

	switch (table) {
		case 1:
			return {
				table,
				multiplier,
				answer,
				strategyName: 'Keep the number the same',
				strategySummary: 'Multiplying by 1 means there is one group, so the number does not change.',
				steps: [`Start with ${multiplier}.`, `One group of ${multiplier} is still ${multiplier}.`]
			};
		case 2:
			return {
				table,
				multiplier,
				answer,
				strategyName: 'Double it',
				strategySummary: 'The 2s table is the same as adding a number to itself once.',
				steps: [`Start with ${multiplier}.`, `Double it: ${multiplier} + ${multiplier} = ${answer}.`]
			};
		case 3:
			return {
				table,
				multiplier,
				answer,
				strategyName: 'Double, then add one',
				strategySummary: 'Build three groups by making two groups first, then adding one more.',
				steps: [`Double ${multiplier}: 2 × ${multiplier} = ${double}.`, `Add one more ${multiplier}: ${double} + ${multiplier} = ${answer}.`]
			};
		case 4:
			return {
				table,
				multiplier,
				answer,
				strategyName: 'Double it twice',
				strategySummary: 'Four groups are a double of a double.',
				steps: [`First double: ${multiplier} + ${multiplier} = ${double}.`, `Double again: ${double} + ${double} = ${answer}.`]
			};
		case 5:
			return {
				table,
				multiplier,
				answer,
				strategyName: 'Find half of ×10',
				strategySummary: 'Five is half of ten, so find the easy ×10 fact and cut it in half.',
				steps: [`Make ten groups: 10 × ${multiplier} = ${tenGroups}.`, `Take half of ${tenGroups}: ${tenGroups} ÷ 2 = ${answer}.`]
			};
		case 6:
			return {
				table,
				multiplier,
				answer,
				strategyName: 'Build from ×5',
				strategySummary: 'Six groups are five friendly groups plus one more group.',
				steps: [`Find ×5: 5 × ${multiplier} = ${fiveGroups}.`, `Add one more ${multiplier}: ${fiveGroups} + ${multiplier} = ${answer}.`]
			};
		case 7:
			return {
				table,
				multiplier,
				answer,
				strategyName: 'Split into ×5 and ×2',
				strategySummary: 'Seven groups can be split into an easy five groups and two groups.',
				steps: [`Find ×5: 5 × ${multiplier} = ${fiveGroups}.`, `Find ×2: 2 × ${multiplier} = ${double}.`, `Join them: ${fiveGroups} + ${double} = ${answer}.`]
			};
		case 8:
			return {
				table,
				multiplier,
				answer,
				strategyName: 'Use ×10, subtract ×2',
				strategySummary: 'Eight groups are two fewer than ten groups.',
				steps: [`Find ×10: 10 × ${multiplier} = ${tenGroups}.`, `Find the two extra groups: 2 × ${multiplier} = ${double}.`, `Subtract: ${tenGroups} − ${double} = ${answer}.`]
			};
		case 9:
			return {
				table,
				multiplier,
				answer,
				strategyName: 'Use ×10, subtract one group',
				strategySummary: 'Nine groups are exactly one group fewer than ten groups.',
				steps: [`Find ×10: 10 × ${multiplier} = ${tenGroups}.`, `Take away one ${multiplier}: ${tenGroups} − ${multiplier} = ${answer}.`]
			};
		case 10:
			return {
				table,
				multiplier,
				answer,
				strategyName: 'Think in tens',
				strategySummary: 'Multiplying by 10 turns the number into that many tens.',
				steps: [`Think “${multiplier} tens.”`, `${multiplier} tens = ${answer}.`]
			};
		case 11:
			return {
				table,
				multiplier,
				answer,
				strategyName: 'Use ×10, add one group',
				strategySummary: 'Eleven groups are ten friendly groups plus one more.',
				steps: [`Find ×10: 10 × ${multiplier} = ${tenGroups}.`, `Add one more ${multiplier}: ${tenGroups} + ${multiplier} = ${answer}.`]
			};
		case 12:
			return {
				table,
				multiplier,
				answer,
				strategyName: 'Use ×10, add ×2',
				strategySummary: 'Twelve groups are ten friendly groups plus two more groups.',
				steps: [`Find ×10: 10 × ${multiplier} = ${tenGroups}.`, `Find ×2: 2 × ${multiplier} = ${double}.`, `Join them: ${tenGroups} + ${double} = ${answer}.`]
			};
		default:
			throw new RangeError(`Times table must be between 1 and 12; received ${table}.`);
	}
}
