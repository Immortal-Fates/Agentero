import type { PdfBookmarkObject } from "@embedpdf/models";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { commands } from "@/lib/core/bindings";
import { callApi } from "@/lib/core/ipc";
import { notifyError } from "@/lib/core/notify";
import { isMobileApp } from "@/lib/core/tauri";
import {
	type EditableBookmark,
	editableBookmarks,
} from "@/lib/pdf/bookmark-edit";
import { setTabs } from "@/lib/workspace/store";
import { refreshPdfTab } from "@/lib/workspace/tabs";

type Draft = {
	nodes: EditableBookmark[];
	bytes: ArrayBuffer;
	saving: boolean;
	failed?: boolean;
};
// Keep unsaved drafts across the viewer LRU, external reloads and closing /
// reopening a tab. A successful automatic write discards them.
const drafts = createStore<Record<string, Draft>>(() => ({}));
function discard(path: string) {
	drafts.setState((state) => {
		const next = { ...state };
		delete next[path];
		return next;
	}, true);
}
function buildPdf(
	bytes: ArrayBuffer,
	nodes: EditableBookmark[],
): Promise<Uint8Array> {
	return new Promise((resolve, reject) => {
		const worker = new Worker(
			new URL("../../../../lib/pdf/bookmark-write.worker.ts", import.meta.url),
			{ type: "module" },
		);
		worker.onmessage = (
			event: MessageEvent<{ bytes?: Uint8Array; error?: string }>,
		) => {
			worker.terminate();
			if (event.data.bytes) resolve(event.data.bytes);
			else reject(new Error(event.data.error ?? "failed"));
		};
		worker.onerror = () => {
			worker.terminate();
			reject(new Error("failed"));
		};
		const copy = bytes.slice(0);
		worker.postMessage({ bytes: copy, nodes }, [copy]);
	});
}
function base64(bytes: Uint8Array): string {
	const chunks: string[] = [];
	for (let i = 0; i < bytes.length; i += 8192)
		chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
	return btoa(chunks.join(""));
}

export function usePdfBookmarkEditor({
	path,
	bytes,
	outline,
	ready,
}: {
	path: string | null;
	bytes: ArrayBuffer | null;
	outline: PdfBookmarkObject[];
	ready: boolean;
}) {
	const { t } = useTranslation("viewer");
	const draft = useStore(drafts, (state) => (path ? state[path] : undefined));
	const available = Boolean(
		!isMobileApp() &&
			path &&
			bytes &&
			ready &&
			!/^(remote:|https?:|agentero:)/i.test(path),
	);
	const [markers, setMarkers] = useState<{
		bytes: ArrayBuffer;
		origins: string[];
	} | null>(null);
	useEffect(() => {
		if (!available || !bytes) return;
		const worker = new Worker(
			new URL("../../../../lib/pdf/bookmark-write.worker.ts", import.meta.url),
			{ type: "module" },
		);
		worker.onmessage = (event: MessageEvent<{ origins?: string[] }>) => {
			setMarkers({ bytes, origins: event.data.origins ?? [] });
			worker.terminate();
		};
		worker.onerror = () => {
			setMarkers({ bytes, origins: [] });
			worker.terminate();
		};
		const copy = bytes.slice(0);
		worker.postMessage({ bytes: copy }, [copy]);
		return () => worker.terminate();
	}, [available, bytes]);
	const initialNodes = useMemo(() => {
		const origins = new Set(markers?.bytes === bytes ? markers.origins : []);
		const visit = (nodes: EditableBookmark[]): EditableBookmark[] =>
			nodes.map((node) => ({
				...node,
				pageBookmark: origins.has(node.origin ?? ""),
				children: visit(node.children),
			}));
		return visit(editableBookmarks(outline));
	}, [outline, markers, bytes]);
	const canEdit = available && (Boolean(draft) || markers?.bytes === bytes);
	const nodes = draft?.nodes ?? initialNodes;
	const begin = useCallback(() => {
		if (!path || !bytes || !canEdit || drafts.getState()[path]) return;
		drafts.setState({
			[path]: {
				nodes: initialNodes,
				bytes: bytes.slice(0),
				saving: false,
			},
		});
	}, [path, bytes, canEdit, initialNodes]);
	const save = useCallback(async () => {
		if (!path) return;
		const current = drafts.getState()[path];
		if (!current || current.saving) return;
		drafts.setState({ [path]: { ...current, saving: true, failed: false } });
		try {
			const hash = Array.from(
				new Uint8Array(await crypto.subtle.digest("SHA-256", current.bytes)),
				(byte) => byte.toString(16).padStart(2, "0"),
			).join("");
			const saved = await buildPdf(current.bytes, current.nodes);
			await callApi(() => commands.pdfSaveBookmarks(path, hash, base64(saved)));
			discard(path);
			setTabs((tabs) =>
				refreshPdfTab(
					tabs,
					path,
					saved.buffer.slice(
						saved.byteOffset,
						saved.byteOffset + saved.byteLength,
					) as ArrayBuffer,
				),
			);
		} catch (error) {
			drafts.setState({ [path]: { ...current, saving: false, failed: true } });
			const code = error instanceof Error ? error.message : "failed";
			const key =
				code === "conflict"
					? "conflict"
					: code === "protected"
						? "protected"
						: code === "unsupported"
							? "unsupported"
							: "failed";
			notifyError(t(`pdf.bookmarks.${key}`), {
				action: {
					label: t("pdf.bookmarks.discard"),
					onClick: () => {
						if (!drafts.getState()[path]?.saving) discard(path);
					},
				},
			});
		}
	}, [path, t]);
	const change = useCallback(
		(nodes: EditableBookmark[]) => {
			if (!path || !canEdit) return;
			begin();
			const current = drafts.getState()[path];
			if (!current || current.saving) return;
			drafts.setState({ [path]: { ...current, nodes } });
			void save();
		},
		[path, canEdit, begin, save],
	);
	return { draft, nodes, canEdit, begin, change, save };
}
export type PdfBookmarkEditor = ReturnType<typeof usePdfBookmarkEditor>;
