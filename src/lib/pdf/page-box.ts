import type { PDFPage } from "pdf-lib";

/**
 * The box PDFium renders and EmbedPDF measures: CropBox clipped to MediaBox
 * (pdf-lib's `getCropBox` alone may report a CropBox larger than, and offset
 * from, the MediaBox).
 */
export function visiblePageBox(page: PDFPage): {
	x: number;
	y: number;
	width: number;
	height: number;
} {
	const media = page.getMediaBox();
	const crop = page.getCropBox();
	const x = Math.max(media.x, crop.x);
	const y = Math.max(media.y, crop.y);
	const right = Math.min(media.x + media.width, crop.x + crop.width);
	const top = Math.min(media.y + media.height, crop.y + crop.height);
	if (right <= x || top <= y) return media;
	return { x, y, width: right - x, height: top - y };
}
