/**
 * Section outline for the open writing project. Always expanded.
 */

import { File } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { notifyError } from "@/lib/core/notify";
import { basenameOf, normalizePath } from "@/lib/core/path";
import { cn } from "@/lib/core/utils";
import { trackTexProject } from "@/lib/tex/auto-build";
import { ensureTexBuildEvents } from "@/lib/tex/build-state";
import { navigateTexSource } from "@/lib/tex/editor-navigation";
import { activeOutlineSectionId, resolveTexInputPath } from "@/lib/tex/outline";
import { vaultPathExists } from "@/lib/vault/fs";
import { normalizeTabPath } from "@/lib/workspace/tabs";
import { texOutlineStore } from "@/lib/workspace/tex-outline-bridge";
import { setWritingFile } from "@/lib/writing/store";

export function WritingOutline({ texPath }: { texPath: string }) {
	const { t } = useTranslation("sidebar");
	const snapshot = useStore(texOutlineStore, (state) => state.snapshot);
	const rootPath =
		snapshot &&
		(snapshot.path === normalizeTabPath(texPath) ||
			normalizePath(snapshot.rootPath ?? "") === normalizePath(texPath))
			? (snapshot.rootPath ?? texPath)
			: texPath;
	const outline =
		snapshot &&
		(snapshot.path === normalizeTabPath(texPath) ||
			normalizePath(snapshot.rootPath ?? "") === normalizePath(rootPath))
			? snapshot
			: null;
	const items = outline?.items ?? [];
	const activeId = outline
		? activeOutlineSectionId(items, outline.cursorLine, outline.path)
		: null;

	useEffect(() => {
		void ensureTexBuildEvents();
		void trackTexProject(rootPath);
	}, [rootPath]);

	const openIncluded = async (fileArg: string, sourcePath: string) => {
		const candidates = [
			...new Set([
				resolveTexInputPath(rootPath, fileArg),
				resolveTexInputPath(sourcePath, fileArg),
			]),
		].filter(Boolean);
		for (const target of candidates) {
			try {
				if (await vaultPathExists(target)) {
					setWritingFile(target);
					return;
				}
			} catch {
				/* Try the next candidate. */
			}
		}
		notifyError(t("latexPanel.fileMissing", { name: basenameOf(fileArg) }));
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col border-t border-border">
			<p className="text-muted-foreground shrink-0 px-3 pt-2 pb-0.5 text-xs">
				{t("latexPanel.structure")}
			</p>
			<div className="min-h-0 flex-1 overflow-y-auto pb-2">
				{outline == null ? null : items.length === 0 ? (
					<p className="text-muted-foreground px-3 py-1 text-xs">
						{t("latexPanel.emptyStructure")}
					</p>
				) : (
					<ul className="flex flex-col px-1">
						{items.map((item) => {
							const current = item.kind === "section" && item.id === activeId;
							return (
								<li key={item.id}>
									<button
										type="button"
										aria-current={current ? "true" : undefined}
										title={item.title}
										onClick={() => {
											if (item.kind === "file" && item.fileArg) {
												void openIncluded(item.fileArg, item.path ?? texPath);
												return;
											}
											navigateTexSource(item.path ?? texPath, item.line);
										}}
										className={cn(
											"flex w-full items-center gap-1.5 rounded-sm py-0.5 pr-2 text-left text-sm",
											"hover:bg-muted/70",
											"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
											current && "bg-muted/80 text-foreground",
										)}
										style={{
											paddingLeft: `${0.5 + item.indent * 0.75}rem`,
										}}
									>
										{item.kind === "file" ? (
											<File
												className="size-3.5 shrink-0 text-muted-foreground"
												aria-hidden
											/>
										) : null}
										<span className="min-w-0 flex-1 truncate">
											{item.title}
										</span>
									</button>
								</li>
							);
						})}
					</ul>
				)}
			</div>
		</div>
	);
}
