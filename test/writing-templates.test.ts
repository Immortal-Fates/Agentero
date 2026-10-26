import { describe, expect, it } from "vitest";
import {
	WRITING_TEMPLATE_IDS,
	writingTemplateFiles,
	writingTemplateRoot,
} from "@/lib/writing/templates";

describe("writing templates", () => {
	it("escapes the title only in the blank project", () => {
		const blank = writingTemplateFiles("blank", "A & B_1");
		expect(blank.map((file) => file.name)).toEqual(["main.tex"]);
		expect(blank[0]?.contents).toContain("A \\& B\\_1");
		expect(
			writingTemplateFiles("blank", "Paper").find(
				(file) => file.name === "main.tex",
			)?.contents,
		).not.toContain("!TEX program");
	});

	it("copies each official kit unchanged, including its real root file", () => {
		expect(WRITING_TEMPLATE_IDS).toContain("eccv");
		const cvpr = writingTemplateFiles("cvpr", "Paper");
		expect(cvpr.some((file) => file.name === "cvpr.sty")).toBe(true);
		expect(cvpr.some((file) => file.name === "sec/1_intro.tex")).toBe(true);
		expect(
			cvpr.find((file) => file.name === writingTemplateRoot("cvpr"))?.contents,
		).toContain("\\usepackage[review]{cvpr}");
		expect(
			writingTemplateFiles("icml", "Paper").some(
				(file) => file.name === "icml2026.sty",
			),
		).toBe(true);
		expect(writingTemplateRoot("icml")).toBe("example_paper.tex");
		expect(
			writingTemplateFiles("iclr", "Paper").some(
				(file) => file.name === "iclr2027_conference.sty",
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
		expect(writingTemplateRoot("acl")).toBe("acl_latex.tex");
		expect(
			writingTemplateFiles("eccv", "Paper").some(
				(file) => file.name === "llncs.cls",
			),
		).toBe(true);
	});
});
