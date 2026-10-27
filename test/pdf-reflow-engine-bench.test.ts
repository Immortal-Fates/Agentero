/**
 * Opt-in engine-isolation benchmark for reflow streaming builds (#838, #798).
 *
 *   AGENTERO_BENCH_PDF=/path/paper.pdf \
 *   AGENTERO_BENCH_LAYOUT=/path/source/layout.json \
 *   pnpm vitest run test/pdf-reflow-engine-bench.test.ts
 *
 * Models the app's architecture in miniature: PDFium engines live in
 * worker_threads behind a serial async FIFO (`test/scripts/reflow-bench-worker.mjs`),
 * pdf-lib work stays on the benchmark main thread like the renderer, and a
 * timer-driven scroll-tile stream measures request latency. Scenarios:
 *
 *   baseline — tiles only, no builds
 *   shared   — page builds share the tile engine's FIFO (behavior before the
 *              dedicated build engine: tiles queue behind build RPCs)
 *   dedicated— builds run on a second engine (behavior after; pdf-lib memcpy
 *              still lands on the main thread, exactly like the app)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { PdfiumNative } from "@embedpdf/engines/pdfium";
import type { PdfDocumentObject, PdfEngine } from "@embedpdf/models";
import { init } from "@embedpdf/pdfium";
import { describe, expect, it } from "vitest";
import {
	listTranslatableLayoutRegions,
	toLayoutTranslateItems,
} from "@/lib/pdf/layout/layout-translate";
import type { PdfLayoutRegion } from "@/lib/pdf/layout/types";
import { buildReflowPage, embedReflowFonts } from "@/lib/pdf/reflow/export";
import type { ReflowFontBytes } from "@/lib/pdf/reflow/fonts";
import {
	prepareReflowItems,
	reflowDocumentFromItems,
} from "@/lib/pdf/reflow/service";

const WORK_DIR = "/tmp/agentero-reflow-bench";
const TILE_INTERVAL_MS = 100;
const BASELINE_MS = 2000;
const CJK =
	"机器学习系统在多轮训练中通过梯度下降优化参数,同时需要权衡模型容量、数据分布偏移与正则化强度,才能在验证集上获得稳定的泛化性能。";

type TileSample = { at: number; ms: number };
type PageTiming = { page: number; ms: number; error?: string };
type Scenario = {
	label: string;
	tiles: { n: number; p50: number; p95: number; max: number };
	pages: PageTiming[];
	totalMs: number;
};

function percentile(values: number[], p: number): number {
	const sorted = [...values].sort((a, b) => a - b);
	return (
		sorted[
			Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
		] ?? 0
	);
}
function tileSummary(samples: TileSample[], from: number, to: number) {
	const ms = samples.filter((s) => s.at >= from && s.at <= to).map((s) => s.ms);
	return {
		n: ms.length,
		p50: Math.round(percentile(ms, 50)),
		p95: Math.round(percentile(ms, 95)),
		max: Math.round(Math.max(...ms, 0)),
	};
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function benchFonts(): ReflowFontBytes {
	const dir = process.env.AGENTERO_BENCH_FONTS_DIR;
	if (dir)
		return {
			regular: readFileSync(join(dir, "NotoSerif-Regular.ttf")),
			bold: readFileSync(join(dir, "NotoSerif-Bold.ttf")),
			italic: readFileSync(join(dir, "NotoSerif-Italic.ttf")),
			boldItalic: readFileSync(join(dir, "NotoSerif-BoldItalic.ttf")),
			cjk: readFileSync(join(dir, "SourceHanSerifCN-Regular.ttf")),
			cjkBold: readFileSync(join(dir, "SourceHanSerifCN-Bold.ttf")),
		};
	const supplement = "/System/Library/Fonts/Supplemental";
	return {
		regular: readFileSync(join(supplement, "Times New Roman.ttf")),
		bold: readFileSync(join(supplement, "Times New Roman Bold.ttf")),
		italic: readFileSync(join(supplement, "Times New Roman Italic.ttf")),
		boldItalic: readFileSync(
			join(supplement, "Times New Roman Bold Italic.ttf"),
		),
		// Same ~23 MB class as the production SourceHan pair; the embed cost is
		// what matters, not the exact typeface.
		cjk: readFileSync(join(supplement, "Arial Unicode.ttf")),
		cjkBold: readFileSync(join(supplement, "Arial Unicode.ttf")),
	};
}

function fakeTranslations(
	items: { id: string; source: string; reflow?: unknown }[],
) {
	const translations = new Map<string, string>();
	for (const item of items) {
		if (!item.reflow) continue;
		let text = "";
		let plain = false;
		// Formula/style placeholders must survive translation verbatim; only
		// human text turns into CJK of proportional length.
		for (const token of item.source.split(/(⟪(?:F|\/?S)\d+⟫)/u)) {
			if (!token) continue;
			if (/^⟪/u.test(token)) {
				text += token;
				continue;
			}
			plain = true;
			const length = Math.max(3, Math.round(token.length * 0.5));
			let part = "";
			while (part.length < length) part += CJK;
			text += part.slice(0, length);
		}
		if (plain) translations.set(item.id, text);
	}
	return translations;
}

/** A PDFium engine inside a worker thread, reachable through a serial FIFO. */
class PdfiumWorker {
	private worker: Worker;
	private pending = new Map<
		number,
		{ resolve: (value: unknown) => void; reject: (error: Error) => void }
	>();
	private seq = 0;
	readonly ready: Promise<void>;

	constructor(wasmPath: string) {
		this.worker = new Worker(
			new URL("./scripts/reflow-bench-worker.mjs", import.meta.url),
			{ workerData: { wasmPath } },
		);
		this.ready = new Promise((resolve, reject) => {
			const timeout = setTimeout(
				() => reject(new Error("bench worker startup timed out")),
				60_000,
			);
			this.worker.on("message", (message: Record<string, unknown>) => {
				if (message.type === "ready") {
					clearTimeout(timeout);
					resolve();
					return;
				}
				const entry = this.pending.get(message.id as number);
				if (!entry) return;
				this.pending.delete(message.id as number);
				if (message.ok) entry.resolve(message.result);
				else entry.reject(new Error(String(message.error)));
			});
			this.worker.on("error", (error) => {
				clearTimeout(timeout);
				reject(error);
			});
		});
	}

	private request(op: string, args: unknown) {
		const id = ++this.seq;
		const promise = new Promise<unknown>((resolve, reject) =>
			this.pending.set(id, { resolve, reject }),
		);
		void this.ready.then(() => this.worker.postMessage({ id, op, args }));
		return { toPromise: () => promise };
	}

	engine(): PdfEngine {
		return {
			openDocumentBuffer: ({ id, content }) =>
				this.request("openDocumentBuffer", { id, content }),
			saveAsCopy: (document) => this.request("saveAsCopy", { document }),
			extractPages: (document, indices) =>
				this.request("extractPages", { document, indices }),
			redactTextInRects: (document, page, rects, options) =>
				this.request("redactTextInRects", { document, page, rects, options }),
			renderPageRaw: (document, page, options) =>
				this.request("renderPageRaw", { document, page, options }),
			closeDocument: (document) => this.request("closeDocument", { document }),
		} as unknown as PdfEngine;
	}

	open(bytes: Buffer): Promise<PdfDocumentObject> {
		return this.request("openDocumentBuffer", {
			id: `bench-${crypto.randomUUID()}`,
			content: bytes.buffer.slice(
				bytes.byteOffset,
				bytes.byteOffset + bytes.byteLength,
			),
		}).toPromise() as Promise<PdfDocumentObject>;
	}

	terminate(): void {
		void this.worker.terminate();
	}
}

/** One production-shaped page job: build, then publish a 2x preview render. */
async function buildOne(
	engine: PdfEngine,
	doc: PdfDocumentObject,
	pageIndex: number,
	pageItems: Parameters<typeof reflowDocumentFromItems>[1],
	regions: PdfLayoutRegion[],
	translations: Map<string, string>,
	fonts: ReflowFontBytes,
): Promise<PageTiming> {
	const start = performance.now();
	try {
		const ir = reflowDocumentFromItems(doc, pageItems, regions);
		const built = await buildReflowPage(engine, doc, ir, translations, fonts);
		const preview = await engine
			.openDocumentBuffer({
				id: `bench-preview-${crypto.randomUUID()}`,
				content: built.bytes.slice().buffer,
			})
			.toPromise();
		try {
			await engine
				.renderPageRaw(preview, preview.pages[0], { scaleFactor: 2 })
				.toPromise();
		} finally {
			await engine.closeDocument(preview).toPromise();
		}
		return { page: pageIndex, ms: Math.round(performance.now() - start) };
	} catch (error) {
		return {
			page: pageIndex,
			ms: Math.round(performance.now() - start),
			error: String(error),
		};
	}
}

/** A continuous scroll-tile stream; windows are cut from it by wall clock. */
class TileLoop {
	samples: TileSample[] = [];
	private stopped = false;
	constructor(
		private engine: PdfEngine,
		private doc: PdfDocumentObject,
	) {}
	start() {
		void (async () => {
			let index = 0;
			while (!this.stopped) {
				const start = performance.now();
				try {
					await this.engine
						.renderPageRaw(
							this.doc,
							this.doc.pages[index % this.doc.pages.length],
							{ scaleFactor: 1 },
						)
						.toPromise();
				} catch {
					/* A tile failure still measures its latency. */
				}
				this.samples.push({ at: Date.now(), ms: performance.now() - start });
				index++;
				await sleep(TILE_INTERVAL_MS);
			}
		})();
	}
	window(from: number, to: number) {
		return tileSummary(this.samples, from, to);
	}
	stop() {
		this.stopped = true;
	}
}

const benchPdf = process.env.AGENTERO_BENCH_PDF;
const benchLayout = process.env.AGENTERO_BENCH_LAYOUT;

describe.skipIf(!benchPdf || !benchLayout)(
	"reflow engine isolation bench",
	() => {
		it("shared vs dedicated build engine", async () => {
			// skipIf guards the env; the throw only narrows types.
			if (!benchPdf || !benchLayout) throw new Error("missing bench env");
			const wasmPath = fileURLToPath(
				import.meta.resolve("@embedpdf/pdfium/pdfium.wasm"),
			);
			const bytes = readFileSync(benchPdf);
			const regions = JSON.parse(readFileSync(benchLayout, "utf8"))
				.regions as PdfLayoutRegion[];
			const items = toLayoutTranslateItems(
				listTranslatableLayoutRegions(regions),
			);
			const pageFilter = process.env.AGENTERO_BENCH_PAGES;
			const wanted = pageFilter ? pageFilter.split(",").map(Number) : null;

			// prepareReflowItems needs the full op surface; run it once,
			// in-process, outside every measurement window.
			const prepareEngine = new PdfiumNative(
				await init({ wasmBinary: readFileSync(wasmPath) }),
				{ fontFallback: null },
			);
			const prepareDoc = await prepareEngine
				.openDocumentBuffer({
					id: "bench-prepare",
					content: bytes.buffer.slice(
						bytes.byteOffset,
						bytes.byteOffset + bytes.byteLength,
					),
				})
				.toPromise();
			const prepareStart = performance.now();
			const prepared = await prepareReflowItems(
				prepareEngine,
				prepareDoc,
				items,
				regions,
			);
			const prepareMs = Math.round(performance.now() - prepareStart);
			await prepareEngine.closeDocument(prepareDoc).toPromise();
			prepareEngine.destroy?.();

			const fonts = benchFonts();
			// Warm the fontkit parse cache once so no scenario pays it on page 0.
			const { PDFDocument } = await import("pdf-lib");
			await embedReflowFonts(await PDFDocument.create(), fonts);
			const translations = fakeTranslations(prepared);
			const byPage = new Map<number, typeof prepared>();
			for (const item of prepared) {
				if (!item.reflow) continue;
				if (wanted && !wanted.includes(item.pageIndex)) continue;
				const group = byPage.get(item.pageIndex) ?? [];
				group.push(item);
				byPage.set(item.pageIndex, group);
			}
			const pages = [...byPage.entries()]
				.sort((a, b) => a[0] - b[0])
				.map(([index, group]) => ({ index, items: group }));
			expect(pages.length).toBeGreaterThan(0);
			console.log(
				`bench: ${pages.length} pages, ${prepared.length} items, prepare ${prepareMs}ms`,
			);

			const viewer = new PdfiumWorker(wasmPath);
			const builder = new PdfiumWorker(wasmPath);
			const tileDoc = await viewer.open(bytes);
			const tiles = new TileLoop(viewer.engine(), tileDoc);
			tiles.start();
			const scenarios: Scenario[] = [];

			await sleep(BASELINE_MS);
			scenarios.push({
				label: "baseline (tiles only)",
				tiles: tiles.window(Date.now() - BASELINE_MS - 500, Date.now()),
				pages: [],
				totalMs: 0,
			});

			async function runScenario(
				label: string,
				build: { engine: PdfEngine; doc: PdfDocumentObject },
			) {
				const from = Date.now();
				const pageTimings: PageTiming[] = [];
				for (const page of pages) {
					pageTimings.push(
						await buildOne(
							build.engine,
							build.doc,
							page.index,
							page.items,
							regions,
							translations,
							fonts,
						),
					);
				}
				const to = Date.now();
				scenarios.push({
					label,
					tiles: tiles.window(from, to),
					pages: pageTimings,
					totalMs: to - from,
				});
			}

			// Before: builds share the viewer engine's FIFO with scroll tiles.
			await runScenario("shared engine (before)", {
				engine: viewer.engine(),
				doc: tileDoc,
			});

			// After: builds get their own engine; pdf-lib stays on this thread.
			try {
				await runScenario("dedicated engine (after)", {
					engine: builder.engine(),
					doc: await builder.open(bytes),
				});
			} finally {
				tiles.stop();
				builder.terminate();
				viewer.terminate();
			}
			const report = {
				pdf: benchPdf,
				pages: pages.length,
				items: prepared.length,
				prepareMs,
				tileIntervalMs: TILE_INTERVAL_MS,
				scenarios,
			};
			writeFileSync(
				join(WORK_DIR, "results.json"),
				JSON.stringify(report, null, 2),
			);
			console.table(
				scenarios.map((s) => ({
					scenario: s.label,
					tiles: s.tiles.n,
					"tile p50 (ms)": s.tiles.p50,
					"tile p95 (ms)": s.tiles.p95,
					"tile max (ms)": s.tiles.max,
					"build total (s)": (s.totalMs / 1000).toFixed(1),
					"build avg/page (ms)": s.pages.length
						? Math.round(
								s.pages.reduce((sum, p) => sum + p.ms, 0) / s.pages.length,
							)
						: "",
				})),
			);
			const failures = scenarios.flatMap((s) =>
				s.pages
					.filter((p) => p.error)
					.map((p) => `${s.label}#${p.page}: ${p.error}`),
			);
			expect(failures).toEqual([]);
		}, 600_000);
	},
);
