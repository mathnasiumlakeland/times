export type MultiplicationQuestion = {
	table: number;
	multiplier: number;
};

export function getQuestionProgressPercent(
	questionIndex: number,
	totalQuestions: number,
	currentQuestionComplete: boolean
) {
	if (!Number.isFinite(totalQuestions) || totalQuestions <= 0) return 0;
	const completedQuestions = questionIndex + (currentQuestionComplete ? 1 : 0);
	return Math.max(0, Math.min(100, (completedQuestions / totalQuestions) * 100));
}

export function makeQuestionSequence(
	tableSequence: number[],
	random: () => number = Math.random
): MultiplicationQuestion[] {
	let previousQuestion: MultiplicationQuestion | undefined;

	return tableSequence.map((table) => {
		const excludedMultiplier = previousQuestion?.table === table
			? previousQuestion.multiplier
			: undefined;
		const availableMultiplierCount = excludedMultiplier === undefined ? 12 : 11;
		const randomMultiplier = Math.floor(random() * availableMultiplierCount) + 1;
		const multiplier = excludedMultiplier !== undefined && randomMultiplier >= excludedMultiplier
			? randomMultiplier + 1
			: randomMultiplier;
		const question = { table, multiplier };

		previousQuestion = question;
		return question;
	});
}
