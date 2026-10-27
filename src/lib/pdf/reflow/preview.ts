import type { PdfDocumentObject, PdfEngine } from "@embedpdf/models";
import { logOp } from "@/lib/core/logger";
import type {
	LayoutTranslateItem,
	PdfLayoutRegion,
} from "@/lib/pdf/layout/types";
import { buildReflowPage, buildReflowPdf, type ReflowOutput } from "./export";
import { loadReflowFonts } from "./fonts";
import { reflowDocumentFromItems } from "./service";
import type { PageLayout } from "./types";

type PageInput = { key: string; items: LayoutTranslateItem[]; ready: boolean };
type Preview = { key: string; url: string; layout: PageLayout };
type Job = { key: string; abort: AbortController };
const identities = new WeakMap<object, number>();
let nextIdentity = 0;
function identity(value: object | undefined): number {
	if (!value) return 0;
	let id = identities.get(value);
	if (id === undefined) {
		id = ++nextIdentity;
		identities.set(value, id);
	}
	return id;
}

/** Import from the caller so `regions ?? NO_REGIONS` keeps one array identity. */
export const NO_REGIONS: PdfLayoutRegion[] = [];
const EMPTY_PAGE_REGIONS: PdfLayoutRegion[] = [];
const regionsByPageCache = new WeakMap<
	PdfLayoutRegion[],
	Map<number, PdfLayoutRegion[]>
>();
/**
 * Group regions per page once per regions-array identity. Region objects are
 * immutable within one array, so their identity numbers form the page part of
 * the input key without re-serializing every region on every batch.
 */
function regionsByPageOf(
	regions: PdfLayoutRegion[],
): Map<number, PdfLayoutRegion[]> {
	let grouped = regionsByPageCache.get(regions);
	if (!grouped) {
		grouped = new Map();
		for (const region of regions) {
			const list = grouped.get(region.pageIndex) ?? [];
			list.push(region);
			grouped.set(region.pageIndex, list);
		}
		regionsByPageCache.set(regions, grouped);
	}
	return grouped;
}

/** One serial queue per open document; unrelated batches never cancel a ready page. */
export class ReflowPreviewSession {
	private inputs = new Map<number, PageInput>();
	private previews = new Map<number, Preview>();
	private jobs = new Map<number | "final", Job>();
	private attempted = new Map<number | "final", string>();
	private queue: Promise<void> = Promise.resolve();
	private finalKey = "";
	private disposed = false;
	/** Set when decorated state (previews, busy, output) changed since the last notify. */
	private dirty = false;
	output: Uint8Array | null = null;

	constructor(
		private engine: PdfEngine,
		readonly document: PdfDocumentObject,
		private changed: () => void,
		private failed: (error: unknown) => void,
	) {}

	get busy(): boolean {
		return this.jobs.size > 0;
	}

	/**
	 * `update()` runs on every coalesced translation batch. Notifying then would
	 * re-decorate all items while nothing preview-visible changed; only a
	 * preview publish/revoke, a busy transition, or a new export output does.
	 */
	private notify(): void {
		if (this.disposed || !this.dirty) return;
		this.dirty = false;
		this.changed();
	}

	decorate(items: LayoutTranslateItem[]): LayoutTranslateItem[] {
		return items.map((item) => {
			const preview = this.previews.get(item.pageIndex);
			return {
				...item,
				reflowPreview: preview?.url,
				reflowLayout: preview?.layout.paragraphs.find((p) => p.id === item.id),
			};
		});
	}

	update(
		items: LayoutTranslateItem[],
		regions: PdfLayoutRegion[],
		running: boolean,
	): void {
		if (this.disposed) return;
		const regionsByPage = regionsByPageOf(regions);
		const groups = new Map<number, LayoutTranslateItem[]>();
		for (const item of items) {
			const group = groups.get(item.pageIndex) ?? [];
			group.push(item);
			groups.set(item.pageIndex, group);
		}
		this.inputs = new Map(
			[...groups].map(([index, group]) => [
				index,
				{
					// IR is immutable. Identity avoids serializing every glyph on every batch.
					key: JSON.stringify([
						group.map((i) => [
							i.id,
							i.status,
							i.source,
							i.translated,
							identity(i.reflow),
						]),
						(regionsByPage.get(index) ?? EMPTY_PAGE_REGIONS).map(identity),
					]),
					items: group,
					ready:
						group.every(
							(i) => i.status !== "pending" && i.status !== "running",
						) &&
						group.some(
							(i) => i.reflow && i.status === "done" && i.translated?.trim(),
						),
				},
			]),
		);
		const selected = items.filter(
			(i) => i.reflow && i.status === "done" && i.translated?.trim(),
		);
		const finalKey =
			!running && selected.length
				? JSON.stringify(
						[...this.inputs].map(([index, input]) => [index, input.key]),
					)
				: "";
		if (finalKey !== this.finalKey) this.output = null;
		this.finalKey = finalKey;
		for (const [index, job] of this.jobs) {
			const key = index === "final" ? finalKey : this.inputs.get(index)?.key;
			if (key !== job.key) {
				job.abort.abort();
				this.jobs.delete(index);
				this.attempted.delete(index);
				this.dirty = true;
			}
		}
		for (const [index, preview] of this.previews) {
			if (this.inputs.get(index)?.key !== preview.key) {
				URL.revokeObjectURL(preview.url);
				this.previews.delete(index);
				this.dirty = true;
			}
		}
		for (const index of this.attempted.keys()) {
			if (index === "final" ? !finalKey : !this.inputs.has(index))
				this.attempted.delete(index);
		}
		if (running) {
			// The same promise is shared with builders; a failure is reported by the job.
			void loadReflowFonts().catch(() => {});
			for (const [index, input] of this.inputs) {
				if (!input.ready || this.previews.has(index)) continue;
				this.enqueue(index, input.key, async (signal) => {
					const fonts = await loadReflowFonts();
					signal.throwIfAborted();
					const ir = reflowDocumentFromItems(
						this.document,
						input.items,
						regions,
					);
					const translations = new Map(
						input.items
							.filter((i) => i.status === "done" && i.translated?.trim())
							.map((i) => [i.id, i.translated ?? ""]),
					);
					const built = await logOp("pdf.reflow.page", { page: index }, () =>
						buildReflowPage(
							this.engine,
							this.document,
							ir,
							translations,
							fonts,
							signal,
						),
					);
					await this.publish(built, signal, true);
				});
			}
		} else if (finalKey) {
			this.enqueue("final", finalKey, async (signal) => {
				const fonts = await loadReflowFonts();
				signal.throwIfAborted();
				// Retain untranslated IR paragraphs as obstacles (including fallback text).
				const ir = reflowDocumentFromItems(this.document, items, regions);
				const built = await logOp("pdf.reflow.final", undefined, () =>
					buildReflowPdf(
						this.engine,
						this.document,
						ir,
						new Map(selected.map((i) => [i.id, i.translated ?? ""])),
						fonts,
						signal,
					),
				);
				await this.publish(built, signal, false);
				signal.throwIfAborted();
				this.output = built.bytes;
			});
		}
		this.notify();
	}

	private enqueue(
		index: number | "final",
		key: string,
		run: (signal: AbortSignal) => Promise<void>,
	): void {
		if (this.attempted.get(index) === key) return;
		this.attempted.set(index, key);
		const job = { key, abort: new AbortController() };
		this.jobs.set(index, job);
		this.dirty = true;
		this.queue = this.queue.then(async () => {
			const signal = job.abort.signal;
			try {
				signal.throwIfAborted();
				await run(signal);
			} catch (error) {
				if (!signal.aborted) this.failed(error);
			} finally {
				if (this.jobs.get(index) === job) this.jobs.delete(index);
				if (!this.disposed) {
					// Busy / output may have transitioned even when the job aborted.
					this.dirty = true;
					this.notify();
				}
			}
		});
	}

	private async publish(
		built: ReflowOutput,
		signal: AbortSignal,
		single: boolean,
	): Promise<void> {
		signal.throwIfAborted();
		const changed = built.pages.filter(
			(page) =>
				page.paragraphs.length &&
				JSON.stringify(this.previews.get(page.index)?.layout) !==
					JSON.stringify(page),
		);
		if (!changed.length) return;
		const preview = await this.engine
			.openDocumentBuffer({
				id: `reflow-preview-${crypto.randomUUID()}`,
				content: built.bytes.slice().buffer,
			})
			.toPromise();
		try {
			for (const page of changed) {
				signal.throwIfAborted();
				const blob = await logOp(
					"pdf.reflow.render",
					{ page: page.index },
					() =>
						this.engine
							.renderPage(preview, preview.pages[single ? 0 : page.index], {
								scaleFactor: 2,
							})
							.toPromise(),
				);
				signal.throwIfAborted();
				const input = this.inputs.get(page.index);
				if (!input) continue;
				const previous = this.previews.get(page.index);
				this.previews.set(page.index, {
					key: input.key,
					url: URL.createObjectURL(blob),
					layout: page,
				});
				if (previous) URL.revokeObjectURL(previous.url);
				this.dirty = true;
				this.notify();
			}
		} finally {
			await this.engine.closeDocument(preview).toPromise();
		}
	}

	dispose(): void {
		this.disposed = true;
		for (const job of this.jobs.values()) job.abort.abort();
		this.jobs.clear();
		for (const preview of this.previews.values())
			URL.revokeObjectURL(preview.url);
		this.previews.clear();
		this.output = null;
	}
}
