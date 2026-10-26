import type { PdfTextRun } from "@embedpdf/models";

/** Page-relative em size remains stable across zoom and different page sizes. */
export type LayoutSourceStyle = {
	fontSize: number;
	bold: boolean;
	italic: boolean;
};

export function sourceStyleFromRuns(
	runs: readonly PdfTextRun[],
	pageHeight: number,
): LayoutSourceStyle | undefined {
	if (!Number.isFinite(pageHeight) || pageHeight <= 0) return undefined;
	const sizes = new Map<number, number>();
	let total = 0,
		bold = 0,
		italic = 0;
	for (const run of runs) {
		if (!Number.isFinite(run.fontSize) || run.fontSize <= 0) continue;
		const weight = Array.from(run.text.replace(/\s/g, "")).length;
		if (!weight) continue;
		const size = Math.round(run.fontSize * 100) / 100;
		sizes.set(size, (sizes.get(size) ?? 0) + weight);
		total += weight;
		if (run.font?.weight >= 600) bold += weight;
		if (run.font?.italic) italic += weight;
	}
	if (!total) return undefined;
	const mode = [...sizes].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
	if (!mode) return undefined;
	return {
		fontSize: mode[0] / pageHeight,
		bold: bold > total / 2,
		italic: italic > total / 2,
	};
}

export function parseLayoutSourceStyle(
	value: unknown,
): LayoutSourceStyle | undefined {
	if (!value || typeof value !== "object") return undefined;
	const style = value as Record<string, unknown>;
	if (
		typeof style.fontSize !== "number" ||
		!Number.isFinite(style.fontSize) ||
		style.fontSize <= 0 ||
		style.fontSize > 1 ||
		typeof style.bold !== "boolean" ||
		typeof style.italic !== "boolean"
	)
		return undefined;
	return { fontSize: style.fontSize, bold: style.bold, italic: style.italic };
}
