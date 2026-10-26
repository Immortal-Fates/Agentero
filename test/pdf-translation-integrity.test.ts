import type { PdfTextRun } from "@embedpdf/models";
import { describe, expect, it } from "vitest";
import {
	listTranslatableLayoutRegions,
	parseNumberedTranslation,
} from "@/lib/pdf/layout/layout-translate";
import {
	parseLayoutSourceStyle,
	sourceStyleFromRuns,
} from "@/lib/pdf/layout/source-style";
import { splitTranslationChunks } from "@/lib/pdf/layout/translation-chunks";
import type { PdfLayoutRegion } from "@/lib/pdf/layout/types";
import { restoreInlineTokens } from "@/lib/translate/mask";

describe("PDF translation integrity", () => {
	it("splits without losing code points or splitting placeholders", () => {
		const text = `${"😀".repeat(31)}⟦123⟧ ${"继续，".repeat(80)}`;
		const chunks = splitTranslationChunks(text, 64);
		expect(chunks.join("")).toBe(text);
		for (const chunk of chunks) {
			expect(chunk.length).toBeLessThanOrEqual(64);
			expect(chunk.isWellFormed()).toBe(true);
			expect((chunk.match(/⟦/g) ?? []).length).toBe(
				(chunk.match(/⟧/g) ?? []).length,
			);
		}
	});
	it("retains the full source as cache identity", () => {
		const text = `${"word ".repeat(1000)}important ending`;
		const region = {
			id: "body",
			kind: "text",
			label: "text",
			score: 1,
			readingOrder: 0,
			pageIndex: 0,
			bbox: { x: 0, y: 0, w: 1, h: 1 },
			text,
		} as PdfLayoutRegion;
		expect(listTranslatableLayoutRegions([region])[0]?.source).toBe(text);
	});
	it("rejects extra batch records and invented or duplicated formula tokens", () => {
		expect(parseNumberedTranslation("[[1]] A\n[[2]] B\n[[3]] C", 2)).toBeNull();
		expect(
			parseNumberedTranslation("Explanation\n[[1]] A\n[[2]] B", 2),
		).toBeNull();
		for (const text of ["⟦0⟧ ⟦0⟧", "⟦0⟧ ⟦9⟧"]) {
			expect(
				restoreInlineTokens(text, [{ placeholder: "⟦0⟧", original: "$x$" }])
					.invalid,
			).toBe(true);
		}
	});
	it("weights source font size by text coverage rather than number of runs", () => {
		const runs = [
			{
				text: "a".repeat(60),
				fontSize: 10,
				font: { weight: 400, italic: false },
			},
			...Array.from({ length: 8 }, () => ({
				text: "2",
				fontSize: 6,
				font: { weight: 700, italic: true },
			})),
		] as PdfTextRun[];
		expect(sourceStyleFromRuns(runs, 800)).toEqual({
			fontSize: 10 / 800,
			bold: false,
			italic: false,
		});
		expect(
			parseLayoutSourceStyle({
				fontSize: Infinity,
				bold: false,
				italic: false,
			}),
		).toBeUndefined();
	});
});
