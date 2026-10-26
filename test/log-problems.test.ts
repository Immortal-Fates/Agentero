import { describe, expect, it } from "vitest";
import { parseLatexLog } from "@/lib/tex/log-problems";

describe("latex log problems", () => {
	it("reads file warnings and bang errors as the same list the log shows", () => {
		const problems = parseLatexLog(
			[
				"(./main.tex",
				"LaTeX Warning: Citation `smith' on page 1 undefined on input line 12.",
				"! Undefined control sequence.",
				"l.20 \\foo",
				"./sections/a.tex:4: Package error.",
			].join("\n"),
		);
		expect(problems.map((problem) => problem.severity)).toEqual([
			"warning",
			"error",
			"error",
		]);
		expect(problems[0]).toMatchObject({
			file: "main.tex",
			line: 12,
			logLine: 1,
		});
		expect(problems[1]).toMatchObject({
			line: 20,
			message: "Undefined control sequence.",
		});
		expect(problems[2]).toMatchObject({
			file: "sections/a.tex",
			line: 4,
		});
	});
});
