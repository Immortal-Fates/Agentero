import { describe, expect, it } from "vitest";
import {
	chooseTexEngine,
	inferRequiredEngine,
	parseTexProgram,
} from "@/lib/tex/engine";

const ALL = ["pdflatex", "xelatex", "lualatex"];

describe("parseTexProgram", () => {
	it("reads program and TS-program magic comments", () => {
		expect(
			parseTexProgram("% !TEX program = xelatex\n\\documentclass{ctex}"),
		).toBe("xelatex");
		expect(parseTexProgram("%!TeX TS-program = lualatex")).toBe("lualatex");
		expect(parseTexProgram("% !TEX program = PDFLaTeX")).toBe("pdflatex");
	});

	it("ignores non-engine programs and commented-out lines that are not directives", () => {
		expect(parseTexProgram("% !TEX program = latexmk")).toBeNull();
		expect(parseTexProgram("code % !TEX program = xelatex")).toBeNull();
		expect(parseTexProgram("% !TEX root = main.tex")).toBeNull();
	});
});

describe("chooseTexEngine", () => {
	it("prefers the root file, then a saved choice, then what the template requires", () => {
		expect(
			chooseTexEngine({
				magic: "lualatex",
				remembered: "pdflatex",
				required: "pdflatex",
				available: ALL,
			}),
		).toBe("lualatex");
		expect(
			chooseTexEngine({
				magic: null,
				remembered: "pdflatex",
				required: "xelatex",
				available: ALL,
			}),
		).toBe("pdflatex");
		expect(
			chooseTexEngine({
				magic: null,
				remembered: null,
				required: "pdflatex",
				available: ALL,
			}),
		).toBe("pdflatex");
		expect(
			chooseTexEngine({
				magic: null,
				remembered: null,
				required: null,
				available: ALL,
			}),
		).toBe("xelatex");
	});

	it("skips an engine the machine does not have", () => {
		expect(
			chooseTexEngine({
				magic: "xelatex",
				remembered: null,
				required: null,
				available: ["pdflatex", "lualatex"],
			}),
		).toBe("pdflatex");
		expect(
			chooseTexEngine({
				magic: null,
				remembered: null,
				required: null,
				available: ["pdflatex"],
			}),
		).toBe("pdflatex");
		expect(
			chooseTexEngine({
				magic: null,
				remembered: null,
				required: null,
				available: [],
			}),
		).toBeNull();
	});
});

describe("inferRequiredEngine", () => {
	it("uses pdfLaTeX for conference kits and not for a commented package", () => {
		expect(
			inferRequiredEngine(
				"% \\usepackage{cvpr}\n\\usepackage[review]{cvpr}\n\\begin{document}",
			),
		).toBe("pdflatex");
		expect(inferRequiredEngine("\\usepackage{iclr2027_conference,times}")).toBe(
			"pdflatex",
		);
		expect(inferRequiredEngine("\\documentclass[runningheads]{llncs}")).toBe(
			"pdflatex",
		);
		expect(inferRequiredEngine("\\usepackage{neurips_2026}")).toBe("pdflatex");
		expect(inferRequiredEngine("\\usepackage{icml2026}")).toBe("pdflatex");
		expect(
			inferRequiredEngine("% \\usepackage{cvpr}\n\\documentclass{article}"),
		).toBeNull();
	});

	it("uses LuaLaTeX or XeLaTeX when the preamble needs those fonts", () => {
		expect(inferRequiredEngine("\\babelfont{rm}{TeXGyreTermesX}")).toBe(
			"lualatex",
		);
		expect(inferRequiredEngine("\\usepackage{fontspec}")).toBe("xelatex");
		expect(inferRequiredEngine("\\documentclass{ctexart}")).toBe("xelatex");
	});
});
