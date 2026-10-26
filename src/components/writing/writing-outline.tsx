/**
 * Document structure for the open writing project. The outline merges every
 * included file into one heading tree, so it mirrors the compiled PDF rather
 * than the source layout: no file, label, figure or table rows.
 */

import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { normalizePath } from "@/lib/core/path";
import { cn } from "@/lib/core/utils";
import { trackTexProject } from "@/lib/tex/auto-build";
import { ensureTexBuildEvents } from "@/lib/tex/build-state";
import { navigateTexSource } from "@/lib/tex/editor-navigation";
import { activeOutlineSectionId } from "@/lib/tex/outline";
import { normalizeTabPath } from "@/lib/workspace/tabs";
import { texOutlineStore } from "@/lib/workspace/tex-outline-bridge";

const INDENT_STEP_REM = 0.75;

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

	// Heading rank, not include nesting: sections from every file share one
	// tree, normalized so the shallowest heading in the project sits at 0.
	const sections = useMemo(() => {
		const headings = items
			.filter((item) => item.kind === "section")
			.map((item) => ({ item, level: item.level ?? 1 }));
		if (headings.length === 0) return [];
		const base = Math.min(...headings.map(({ level }) => level));
		return headings.map(({ item, level }) => ({
			item,
			depth: Math.max(0, level - base),
		}));
	}, [items]);

	useEffect(() => {
		void ensureTexBuildEvents();
		void trackTexProject(rootPath);
	}, [rootPath]);

	return (
		<nav
			aria-label={t("latexPanel.structure")}
			className="flex min-h-0 flex-1 flex-col border-t border-border/70"
		>
			<p className="text-muted-foreground shrink-0 px-3 pt-2.5 pb-1 text-[11px] font-medium tracking-wide">
				{t("latexPanel.structure")}
			</p>
			<div className="agentero-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-3">
				{outline == null ? null : sections.length === 0 ? (
					<p className="text-muted-foreground px-2 py-1 text-xs">
						{t("latexPanel.emptyStructure")}
					</p>
				) : (
					<ul className="flex flex-col">
						{sections.map(({ item, depth }, index) => {
							const current = item.id === activeId;
							return (
								<li key={item.id}>
									<button
										type="button"
										aria-current={current ? "location" : undefined}
										title={item.title}
										onClick={() =>
											navigateTexSource(item.path ?? texPath, item.line)
										}
										className={cn(
											"flex h-6 w-full items-center rounded-md pr-2 text-left text-xs outline-none",
											"transition-colors duration-[var(--motion-duration-micro)] motion-reduce:transition-none",
											"hover:bg-sidebar-accent/60 active:bg-sidebar-accent/80",
											"focus-visible:ring-1 focus-visible:ring-ring/60",
											depth === 0
												? "font-medium text-foreground/90"
												: "font-normal text-muted-foreground",
											depth === 0 && index > 0 && "mt-1.5",
											current &&
												"bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent",
										)}
										style={{
											paddingLeft: `${0.5 + depth * INDENT_STEP_REM}rem`,
										}}
									>
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
		</nav>
	);
}
