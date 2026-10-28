import { PDFArray, PDFDict, PDFName, PDFNumber, type PDFPage } from "pdf-lib";
import { visiblePageBox } from "../page-box";
import {
	intersects,
	type PageLayout,
	type ReflowPage,
	unionBoxes,
} from "./types";
/** Keep link actions/destinations while moving their hit boxes with translated units. */
export function relocateReflowLinks(
	page: PDFPage,
	source: ReflowPage,
	layout: PageLayout,
): void {
	const annotations = page.node.Annots();
	if (!annotations) return;
	const crop = visiblePageBox(page);
	const additions: PDFDict[] = [];
	for (let index = annotations.size() - 1; index >= 0; index--) {
		const annotation = annotations.lookup(index, PDFDict);
		if (annotation.get(PDFName.of("Subtype"))?.toString() !== "/Link") continue;
		const rect = annotation.lookupMaybe(PDFName.of("Rect"), PDFArray);
		if (rect?.size() !== 4) continue;
		const [x, y, x2, y2] = Array.from({ length: 4 }, (_, i) =>
			rect.lookup(i, PDFNumber).asNumber(),
		);
		const box = {
			x: x - crop.x,
			y: crop.y + crop.height - y2,
			w: x2 - x,
			h: y2 - y,
		};
		const paragraph = source.paragraphs.find((p) => intersects(p.box, box));
		const placed = layout.paragraphs.find((p) => p.id === paragraph?.id);
		if (!paragraph || !placed) continue;
		const original = paragraph.characters
			.filter((c) => {
				const midX = c.visualBox.x + c.visualBox.w / 2,
					midY = c.visualBox.y + c.visualBox.h / 2;
				return (
					midX >= box.x &&
					midX <= box.x + box.w &&
					midY >= box.y &&
					midY <= box.y + box.h
				);
			})
			.map((c) => c.text)
			.join("")
			.replace(/\s/g, "");
		const chars = placed.units
			.flatMap((u, index) => Array.from(u.text).map((ch) => ({ ch, index })))
			.filter((c) => !/\s/u.test(c.ch));
		const translated = chars.map((c) => c.ch).join("");
		const start = original ? translated.indexOf(original) : -1;
		if (start < 0) continue;
		const covered = new Set(
			chars
				.slice(
					Array.from(translated.slice(0, start)).length,
					Array.from(translated.slice(0, start)).length +
						Array.from(original).length,
				)
				.map((c) => c.index),
		);
		const rows = new Map<number, typeof placed.units>();
		placed.units.forEach((unit, i) => {
			if (covered.has(i)) {
				const row = rows.get(unit.y) ?? [];
				row.push(unit);
				rows.set(unit.y, row);
			}
		});
		for (const units of rows.values()) {
			const hit = unionBoxes(
				units.map((u) => ({
					x: u.x,
					y: u.y - u.height,
					w: u.width,
					h: u.height,
				})),
			);
			const moved = annotation.clone();
			moved.set(
				PDFName.of("Rect"),
				page.doc.context.obj([
					crop.x + hit.x,
					crop.y + crop.height - hit.y - hit.h,
					crop.x + hit.x + hit.w,
					crop.y + crop.height - hit.y,
				]),
			);
			additions.push(moved);
		}
		annotations.remove(index);
	}
	for (const annotation of additions)
		page.node.addAnnot(page.doc.context.register(annotation));
}
