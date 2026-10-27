import type { EditableBookmark } from "./bookmark-edit";
import { readPdfPageBookmarks, writePdfBookmarks } from "./bookmark-write";

self.onmessage = async (
	event: MessageEvent<{ bytes: ArrayBuffer; nodes?: EditableBookmark[] }>,
) => {
	try {
		if (!event.data.nodes) {
			self.postMessage({
				origins: await readPdfPageBookmarks(event.data.bytes),
			});
			return;
		}
		const bytes = await writePdfBookmarks(event.data.bytes, event.data.nodes);
		self.postMessage({ bytes }, { transfer: [bytes.buffer] });
	} catch (error) {
		const message = error instanceof Error ? error.message : "failed";
		self.postMessage({
			error: /encrypt/i.test(message) ? "protected" : message,
		});
	}
};
