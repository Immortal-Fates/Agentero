import type { PdfDocumentObject, PdfEngine } from "@embedpdf/models";
import { errorText } from "@/lib/core/error";
import { logger } from "@/lib/core/logger";
import { createPdfEngine, disposePdfEngine } from "@/lib/pdf/engine";

export type ReflowBuildTarget = {
	engine: PdfEngine;
	document: PdfDocumentObject;
};

export interface ReflowBuildProvider {
	get(signal?: AbortSignal): Promise<ReflowBuildTarget>;
	idle(): void;
	dispose(): void;
}

/** The worker factory patch exposes its initialization handshake. */
type WorkerPdfEngine = PdfEngine & { whenReady?: unknown };

/**
 * Reflow builds issue dozens of serial PDFium RPCs per page (extract, redact,
 * save, render). On the shared viewer engine those RPCs sit in one FIFO with
 * scroll tiles, so streaming previews starve scrolling (#798, #838). Builds
 * run on a dedicated engine that owns a private copy of the source document;
 * the shared pair stays as fallback and is never disposed here.
 */
export class ReflowBuildEngine implements ReflowBuildProvider {
	private target: ReflowBuildTarget | null = null;
	private spawning: Promise<ReflowBuildTarget> | null = null;
	private fallback = false;
	private disposed = false;

	constructor(private readonly shared: ReflowBuildTarget) {}

	/**
	 * Only aborts propagate; a dedicated-engine failure falls back to the
	 * shared pair (previous behavior) instead of failing the translation.
	 */
	async get(signal?: AbortSignal): Promise<ReflowBuildTarget> {
		if (this.target) return this.target;
		if (this.fallback || this.disposed) return this.shared;
		signal?.throwIfAborted();
		if (!this.spawning)
			this.spawning = this.spawn().catch((error) => {
				this.spawning = null;
				throw error;
			});
		try {
			return await this.spawning;
		} catch (error) {
			signal?.throwIfAborted();
			this.fallback = true;
			this.spawning = null;
			logger.warn(
				"Reflow build engine unavailable, sharing the viewer engine",
				{
					error: errorText(error),
				},
			);
			return this.shared;
		}
	}

	private async spawn(): Promise<ReflowBuildTarget> {
		const bytes = new Uint8Array(
			await this.shared.engine.saveAsCopy(this.shared.document).toPromise(),
		);
		const engine = await createPdfEngine();
		try {
			// A direct engine would run builds synchronously on the main thread,
			// which janks more than sharing the viewer queue. Keep the worker only.
			if (typeof (engine as WorkerPdfEngine).whenReady !== "function")
				throw new Error("Dedicated engine requires worker support");
			const document = await engine
				.openDocumentBuffer({
					id: `reflow-source-${crypto.randomUUID()}`,
					content: bytes.slice().buffer,
				})
				.toPromise();
			if (this.disposed) {
				await engine.closeDocument(document).toPromise();
				throw new Error("Reflow build engine disposed");
			}
			this.target = { engine, document };
			return this.target;
		} catch (error) {
			disposePdfEngine(engine);
			throw error;
		}
	}

	/** Drop the dedicated engine once builds settle; the next build respawns it. */
	idle(): void {
		const target = this.target;
		if (!target) return;
		this.target = null;
		this.spawning = null;
		this.release(target);
	}

	dispose(): void {
		this.disposed = true;
		this.idle();
	}

	private release(target: ReflowBuildTarget): void {
		target.engine.closeDocument(target.document).wait(
			() => disposePdfEngine(target.engine),
			() => disposePdfEngine(target.engine),
		);
	}
}
