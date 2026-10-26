/** Lossless transport splitting. Geometry and sentence anchors stay upstream. */
export function splitTranslationChunks(text: string, limit: number): string[] {
	if (!Number.isInteger(limit) || limit < 32)
		throw new Error("Invalid chunk limit");
	const chunks: string[] = [];
	let start = 0;
	while (start < text.length) {
		let end = Math.min(text.length, start + limit);
		if (end < text.length) {
			// Prefer a word/clause boundary in the latter half of the budget.
			const floor = start + Math.floor(limit / 2);
			for (let i = end; i > floor; i--) {
				if (/[\s，。；！？]/u.test(text[i - 1] ?? "")) {
					end = i;
					break;
				}
			}
			// Never tear an opaque placeholder or UTF-16 surrogate pair apart.
			const open = text.lastIndexOf("⟦", end - 1);
			const close = text.indexOf("⟧", open);
			if (open >= start && open < end && close >= end) {
				if (open === start)
					throw new Error("Translation token exceeds request budget");
				end = open;
			}
			const code = text.charCodeAt(end - 1);
			if (code >= 0xd800 && code <= 0xdbff) end--;
		}
		chunks.push(text.slice(start, end));
		start = end;
	}
	return chunks;
}
