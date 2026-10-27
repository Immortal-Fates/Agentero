/**
 * PDFium RPC host for test/pdf-reflow-engine-bench.test.ts.
 * Mirrors the app's pdfium worker engine: one engine, one serial FIFO queue,
 * reachable only via async messages. Documents are projected to plain data
 * (`{ id, pages }`) for the parent; ops resolve the authoritative object by id.
 */

import { readFileSync } from "node:fs";
import { parentPort, workerData } from "node:worker_threads";
import { PdfiumNative } from "@embedpdf/engines/pdfium";
import { init } from "@embedpdf/pdfium";

const engine = new PdfiumNative(
	await init({ wasmBinary: readFileSync(workerData.wasmPath) }),
	{ fontFallback: null },
);
const docs = new Map();
const project = (doc) => ({
	id: doc.id,
	pages: doc.pages.map((page) => ({ index: page.index, size: page.size })),
});
const ops = {
	openDocumentBuffer: async ({ id, content }) => {
		const doc = await engine.openDocumentBuffer({ id, content }).toPromise();
		docs.set(doc.id, doc);
		return project(doc);
	},
	saveAsCopy: async ({ document }) =>
		engine.saveAsCopy(docs.get(document.id)).toPromise(),
	extractPages: async ({ document, indices }) =>
		engine.extractPages(docs.get(document.id), indices).toPromise(),
	redactTextInRects: async ({ document, page, rects, options }) => {
		const doc = docs.get(document.id);
		return engine
			.redactTextInRects(doc, doc.pages[page.index], rects, options)
			.toPromise();
	},
	renderPageRaw: async ({ document, page, options }) => {
		const doc = docs.get(document.id);
		return engine
			.renderPageRaw(doc, doc.pages[page.index], options)
			.toPromise();
	},
	closeDocument: async ({ document }) => {
		const doc = docs.get(document.id);
		docs.delete(document.id);
		return engine.closeDocument(doc).toPromise();
	},
};
let queue = Promise.resolve();
parentPort.on("message", (message) => {
	queue = queue.then(async () => {
		try {
			parentPort.postMessage({
				id: message.id,
				ok: true,
				result: await ops[message.op](message.args),
			});
		} catch (error) {
			parentPort.postMessage({
				id: message.id,
				ok: false,
				error: String(error),
			});
		}
	});
});
parentPort.postMessage({ type: "ready" });
