import { describe, expect, it } from "vitest";
import {
	WRITING_TEMPLATE_IDS,
	writingTemplateFiles,
} from "@/lib/writing/templates";

describe("writing templates", () => {
	it("escapes the project title in every starter", () => {
		for (const id of WRITING_TEMPLATE_IDS) {
			const files = writingTemplateFiles(id, "A & B_1");
			const main = files.find((file) => file.name === "main.tex");
			expect(main?.contents).toContain("A \\& B\\_1");
			expect(files.every((file) => !/[\\/]/.test(file.name))).toBe(true);
		}
	});

	it("keeps a blank project to the main file", () => {
		expect(
			writingTemplateFiles("blank", "Notes").map((file) => file.name),
		).toEqual(["main.tex"]);
	});

	it("copies the official style next to the main file", () => {
		const cvpr = writingTemplateFiles("cvpr", "Paper");
		expect(cvpr.some((file) => file.name === "cvpr.sty")).toBe(true);
		expect(cvpr.find((file) => file.name === "main.tex")?.contents).toContain(
			"\\usepackage[review]{cvpr}",
		);
		expect(
			writingTemplateFiles("icml", "Paper").some(
				(file) => file.name === "icml2026.sty",
			),
		).toBe(true);
		expect(
			writingTemplateFiles("iclr", "Paper").some(
				(file) => file.name === "iclr2026_conference.sty",
			),
		).toBe(true);
		expect(
			writingTemplateFiles("neurips", "Paper").some(
				(file) => file.name === "neurips_2026.sty",
			),
		).toBe(true);
		expect(
			writingTemplateFiles("acl", "Paper").some(
				(file) => file.name === "acl.sty",
			),
		).toBe(true);
	});
});
