import type { PdfDocumentObject, PdfEngine } from "@embedpdf/models";
import { LAYOUT_SIDEBAR_MIN_SCORE } from "@/lib/pdf/layout/constants";
import type {
	LayoutTranslateItem,
	PdfLayoutRegion,
} from "@/lib/pdf/layout/types";
import { extractReflowDocument } from "./extract";
import type { ReflowDocument } from "./types";

export async function prepareReflowItems(
	engine: PdfEngine,
	doc: PdfDocumentObject,
	items: readonly LayoutTranslateItem[],
	regions: readonly PdfLayoutRegion[],
	signal?: AbortSignal,
): Promise<LayoutTranslateItem[]> {
	const ir = await extractReflowDocument(engine, doc, items, regions, signal);
	const byId = new Map(
		ir.pages.flatMap((p) => p.paragraphs.map((q) => [q.id, q] as const)),
	);
	const prepared: LayoutTranslateItem[] = items.flatMap(
		(item): LayoutTranslateItem[] => {
			const reflow = byId.get(item.id);
			if (!reflow) return [];
			const source = reflow.protectedText;
			const page = doc.pages[item.pageIndex];
			return [
				{
					...item,
					source,
					bbox: {
						x: reflow.box.x / page.size.width,
						y: reflow.box.y / page.size.height,
						w: reflow.box.w / page.size.width,
						h: reflow.box.h / page.size.height,
					},
					raw: reflow.source,
					reflow,
					...(source !== item.source
						? {
								status: "pending" as const,
								translated: undefined,
								sentences: undefined,
							}
						: {}),
				},
			];
		},
	);
	for (const page of ir.pages)
		for (const p of page.paragraphs) {
			if (items.some((i) => i.id === p.id)) continue;
			prepared.push({
				id: p.id,
				pageIndex: page.index,
				kind: "text",
				readingOrder: 10000 + p.box.y,
				source: p.protectedText,
				raw: p.source,
				status: "pending",
				reflow: p,
				bbox: {
					x: p.box.x / page.width,
					y: p.box.y / page.height,
					w: p.box.w / page.width,
					h: p.box.h / page.height,
				},
			});
		}
	return prepared;
}
export function reflowDocumentFromItems(
	doc: PdfDocumentObject,
	items: readonly LayoutTranslateItem[],
	regions: readonly PdfLayoutRegion[],
): ReflowDocument {
	return {
		version: 1,
		pages: doc.pages
			.map((page) => ({
				index: page.index,
				width: page.size.width,
				height: page.size.height,
				paragraphs: items
					.filter((i) => i.pageIndex === page.index && i.reflow)
					.flatMap((i) => (i.reflow ? [i.reflow] : [])),
				obstacles: regions
					.filter(
						(r) =>
							r.pageIndex === page.index &&
							r.score >= LAYOUT_SIDEBAR_MIN_SCORE &&
							!items.some((i) => i.id === r.id && i.reflow),
					)
					.map((r) => r.rect),
			}))
			.filter((page) => page.paragraphs.length > 0),
	};
}
