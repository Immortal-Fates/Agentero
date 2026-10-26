import type { PdfDocumentObject, PdfEngine } from "@embedpdf/models";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorText } from "@/lib/core/error";
import { notifyError } from "@/lib/core/notify";
import type {
	LayoutTranslateItem,
	PdfLayoutRegion,
} from "@/lib/pdf/layout/types";
import { buildReflowPdf, interleaveReflowPdf } from "@/lib/pdf/reflow/export";
import { loadReflowFonts } from "@/lib/pdf/reflow/fonts";
import {
	prepareReflowItems,
	reflowDocumentFromItems,
} from "@/lib/pdf/reflow/service";
import { writeVaultBytes } from "@/lib/vault/fs";
export type ReflowContext = () => {
	engine: PdfEngine;
	document: PdfDocumentObject;
} | null;
export function usePdfReflow(
	context: ReflowContext | undefined,
	regions: PdfLayoutRegion[] | null,
	items: LayoutTranslateItem[],
	running: boolean,
	update: (items: LayoutTranslateItem[]) => void,
) {
	const { t } = useTranslation("viewer");
	const current = useRef({ context, regions, items, update });
	current.current = { context, regions, items, update };
	const [busy, setBusy] = useState(false),
		[ready, setReady] = useState(false);
	const output = useRef<Uint8Array | null>(null),
		urls = useRef<string[]>([]),
		last = useRef("");
	const prepare = useCallback(
		async (seed: LayoutTranslateItem[], signal?: AbortSignal) => {
			const ctx = current.current.context?.();
			if (!ctx) return seed;
			return prepareReflowItems(
				ctx.engine,
				ctx.document,
				seed,
				current.current.regions ?? [],
				signal,
			);
		},
		[],
	);
	const signature = JSON.stringify(
		items.map((i) => [
			i.id,
			i.status,
			i.source,
			i.translated,
			Boolean(i.reflow),
		]),
	);
	useEffect(() => {
		if (running) {
			last.current = "";
			setBusy(false);
			setReady(false);
			return;
		}
		if (signature === last.current) return;
		const ctx = current.current.context?.();
		if (!ctx) return;
		const selected = current.current.items.filter(
			(i) => i.status === "done" && i.reflow && i.translated,
		);
		if (!selected.length) {
			setBusy(false);
			output.current = null;
			setReady(false);
			last.current = "";
			return;
		}
		const ac = new AbortController();
		setBusy(true);
		setReady(false);
		const created: string[] = [];
		void (async () => {
			const ir = reflowDocumentFromItems(
				ctx.document,
				selected,
				current.current.regions ?? [],
			);
			const built = await buildReflowPdf(
				ctx.engine,
				ctx.document,
				ir,
				new Map(selected.map((i) => [i.id, i.translated ?? ""])),
				await loadReflowFonts(),
				ac.signal,
			);
			ac.signal.throwIfAborted();
			const preview = await ctx.engine
				.openDocumentBuffer({
					id: `reflow-preview-${crypto.randomUUID()}`,
					content: built.bytes.slice().buffer,
				})
				.toPromise();
			const pageUrls = new Map<number, string>();
			try {
				for (const page of built.pages) {
					ac.signal.throwIfAborted();
					const blob = await ctx.engine
						.renderPage(preview, preview.pages[page.index], { scaleFactor: 2 })
						.toPromise();
					const url = URL.createObjectURL(blob);
					created.push(url);
					pageUrls.set(page.index, url);
				}
			} finally {
				await ctx.engine.closeDocument(preview).toPromise();
			}
			ac.signal.throwIfAborted();
			for (const url of urls.current) URL.revokeObjectURL(url);
			urls.current = created;
			output.current = built.bytes;
			last.current = signature;
			setReady(true);
			current.current.update(
				current.current.items.map((i) => ({
					...i,
					reflowPreview: pageUrls.get(i.pageIndex),
					reflowLayout: built.pages
						.find((p) => p.index === i.pageIndex)
						?.paragraphs.find((p) => p.id === i.id),
				})),
			);
		})()
			.catch((error) => {
				for (const url of created) URL.revokeObjectURL(url);
				if (!ac.signal.aborted)
					notifyError(t("pdf.layoutTranslate.reflowFailed"), {
						description: errorText(error),
					});
			})
			.finally(() => {
				if (!ac.signal.aborted) setBusy(false);
			});
		return () => ac.abort();
	}, [signature, running, t]);
	useEffect(
		() => () => {
			for (const url of urls.current) URL.revokeObjectURL(url);
		},
		[],
	);
	const exportPdf = useCallback(
		async (dual = false) => {
			if (!output.current) return;
			try {
				const { save } = await import("@tauri-apps/plugin-dialog");
				const path = await save({
					defaultPath: dual ? "bilingual.pdf" : "translated.pdf",
					filters: [{ name: "PDF", extensions: ["pdf"] }],
				});
				if (path) {
					const ctx = current.current.context?.();
					const bytes =
						dual && ctx
							? await interleaveReflowPdf(
									new Uint8Array(
										await ctx.engine.saveAsCopy(ctx.document).toPromise(),
									),
									output.current,
								)
							: output.current;
					await writeVaultBytes(path, bytes);
				}
			} catch (error) {
				notifyError(t("pdf.layoutTranslate.reflowFailed"), {
					description: errorText(error),
				});
			}
		},
		[t],
	);
	return {
		prepare,
		reflowBusy: busy,
		reflowReady: ready,
		exportTranslatedPdf: exportPdf,
	};
}
