/**
 * Section outline for the open writing project. Files read as quiet group
 * headers, headings carry their real rank, and labels stay tertiary metadata.
 */

import { FileCode2, Image, Table2 } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { notifyError } from "@/lib/core/notify";
import { basenameOf, normalizePath } from "@/lib/core/path";
import { cn } from "@/lib/core/utils";
import { trackTexProject } from "@/lib/tex/auto-build";
import { ensureTexBuildEvents } from "@/lib/tex/build-state";
import { navigateTexSource } from "@/lib/tex/editor-navigation";
import {
	activeOutlineSectionId,
	resolveTexInputPath,
	type TexOutlineItem,
} from "@/lib/tex/outline";
import { vaultPathExists } from "@/lib/vault/fs";
import { normalizeTabPath } from "@/lib/workspace/tabs";
import { texOutlineStore } from "@/lib/workspace/tex-outline-bridge";
import { setWritingFile } from "@/lib/writing/store";

const INDENT_STEP_REM = 0.875;

function rowHeight(item: TexOutlineItem): string {
	if (item.kind === "section") {
		const level = item.level ?? 1;
		return level <= 1 ? "h-7" : "h-6";
	}
	return item.kind === "file" ? "h-6" : "h-5";
}

function rowTypography(item: TexOutlineItem): string {
	if (item.kind === "section") {
		const level = item.level ?? 1;
		if (level <= 1)
			return "text-[13px] font-semibold tracking-[-0.01em] text-foreground";
		if (level === 2) return "text-xs font-medium text-foreground/85";
		return "text-xs text-muted-foreground";
	}
	if (item.kind === "file") return "font-mono text-[11px] tracking-tight";
	if (item.kind === "label")
		return "font-mono text-[10.5px] tracking-tight text-muted-foreground/60";
	return "text-[11px] text-muted-foreground";
}

function rowSpacing(
	item: TexOutlineItem,
	previous: TexOutlineItem | undefined,
): string {
	if (item.kind === "file") return previous ? "mt-2.5" : "";
	if (item.kind !== "section") return "";
	if (!previous) return "";
	if (previous.kind === "file")
		return item.indent > previous.indent ? "mt-0.5" : "mt-2";
	return (item.level ?? 1) <= 1 ? "mt-2" : "mt-0.5";
}

function FilePath({ path }: { path: string }) {
	const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
	const dir = slash < 0 ? "" : path.slice(0, slash + 1);
	const name = slash < 0 ? path : path.slice(slash + 1);
	return (
		<span className="min-w-0 flex-1 truncate">
			{dir ? <span className="text-muted-foreground/45">{dir}</span> : null}
			<span className="text-muted-foreground group-hover:text-foreground/85">
				{name}
			</span>
		</span>
	);
}

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
		<nav
			aria-label={t("latexPanel.structure")}
			className="flex min-h-0 flex-1 flex-col border-t border-border/70"
		>
			<p className="text-muted-foreground shrink-0 px-3 pt-2.5 pb-1 text-[11px] font-medium tracking-wide">
				{t("latexPanel.structure")}
			</p>
			<div className="agentero-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-3">
				{outline == null ? null : items.length === 0 ? (
					<p className="text-muted-foreground px-2 py-1 text-xs">
						{t("latexPanel.emptyStructure")}
					</p>
				) : (
					<ul className="flex flex-col">
						{items.map((item, index) => {
							const current = item.kind === "section" && item.id === activeId;
							const previous = items[index - 1];
							const Icon =
								item.kind === "figure"
									? Image
									: item.kind === "table"
										? Table2
										: null;
							return (
								<li key={item.id}>
									<button
										type="button"
										aria-current={current ? "location" : undefined}
										title={item.title}
										onClick={() => {
											if (item.kind === "file" && item.fileArg) {
												void openIncluded(item.fileArg, item.path ?? texPath);
												return;
											}
											navigateTexSource(item.path ?? texPath, item.line);
										}}
										className={cn(
											"group flex w-full items-center gap-1.5 rounded-md pr-2 text-left outline-none",
											"transition-colors duration-[var(--motion-duration-micro)] motion-reduce:transition-none",
											"focus-visible:ring-1 focus-visible:ring-ring/60",
											rowHeight(item),
											rowTypography(item),
											rowSpacing(item, previous),
											item.kind === "section" &&
												"hover:bg-sidebar-accent/60 active:bg-sidebar-accent/80",
											item.kind === "file" &&
												"hover:bg-sidebar-accent/40 active:bg-sidebar-accent/70",
											item.kind === "label" &&
												"hover:bg-muted/40 hover:text-muted-foreground active:bg-muted/60",
											current &&
												"bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent",
										)}
										style={{
											paddingLeft: `${0.5 + item.indent * INDENT_STEP_REM}rem`,
										}}
									>
										{item.kind === "file" ? (
											<FileCode2
												className="text-muted-foreground/70 size-3 shrink-0"
												aria-hidden
											/>
										) : null}
										{item.kind === "label" ? (
											<span
												className="text-muted-foreground/35 w-3 shrink-0 text-center font-mono text-[10px]"
												aria-hidden
											>
												#
											</span>
										) : null}
										{Icon ? (
											<Icon
												className="text-muted-foreground/70 size-3 shrink-0"
												aria-hidden
											/>
										) : null}
										{item.kind === "file" ? (
											<FilePath path={item.title} />
										) : (
											<span className="min-w-0 flex-1 truncate">
												{item.title}
											</span>
										)}
									</button>
								</li>
							);
						})}
					</ul>
				)}
			</div>
		</nav>
	);
}
