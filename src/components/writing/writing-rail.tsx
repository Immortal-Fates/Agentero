/**
 * Left rail for writing: switch between the folders under thesis/, then its
 * files and the compile / outline panel. New projects create a folder; other
 * folder changes happen outside the app.
 */

import { ChevronDown, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { ManuscriptFiles } from "@/components/writing/manuscript-files";
import { NewProjectForm } from "@/components/writing/new-project-form";
import { WritingOutline } from "@/components/writing/writing-outline";
import { useVaultStore, useWritingStore } from "@/hooks/use-app-stores";
import { useTexRoot } from "@/hooks/use-tex-root";
import { errorText } from "@/lib/core/error";
import { notifyError } from "@/lib/core/notify";
import { normalizePath } from "@/lib/core/path";
import { cn } from "@/lib/core/utils";
import { vaultStore } from "@/lib/vault/store";
import { discoverWritingProjects } from "@/lib/writing/discover";
import { manuscriptDir } from "@/lib/writing/session";
import {
	selectManuscript,
	setDiscoveredManuscripts,
	setWritingDiscovering,
} from "@/lib/writing/store";
import { trashWritingProject } from "@/lib/writing/trash";

function sameProject(a: string, b: string): boolean {
	return normalizePath(manuscriptDir(a)) === normalizePath(manuscriptDir(b));
}

const ROW_CLASS =
	"flex h-8 w-full cursor-pointer items-center gap-1.5 rounded-md px-2 text-sm outline-none select-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground";

export function WritingRail() {
	const { t } = useTranslation("sidebar");
	const vaultPath = useVaultStore((s) => s.vaultPath);
	const activeRoot = useWritingStore((s) => s.activeRoot);
	const activeFile = useWritingStore((s) => s.activeFile);
	const manuscripts = useWritingStore((s) => s.manuscripts);
	const discovering = useWritingStore((s) => s.discovering);
	const compileRoot = useTexRoot(activeRoot);
	const [menuOpen, setMenuOpen] = useState(false);
	const [creating, setCreating] = useState(false);
	const active = manuscripts.find(
		(item) => activeRoot != null && sameProject(item.rootFile, activeRoot),
	);
	const rootDir = active ? manuscriptDir(active.rootFile) : "";
	const here = rootDir ? normalizePath(rootDir) : "";
	const projectDirs = new Set<string>();
	for (const item of manuscripts) {
		const dir = normalizePath(manuscriptDir(item.rootFile));
		if (dir && dir !== here) projectDirs.add(dir);
	}
	const label = active
		? active.title || t("writing.untitled")
		: t("writing.write");

	const removeProject = (rootFile: string) => {
		if (!vaultPath) return;
		void trashWritingProject(vaultPath, rootFile)
			.then((ok) => {
				if (!ok) notifyError(t("writing.deleteFailed"));
			})
			.catch((error) => {
				notifyError(errorText(error) || t("writing.deleteFailed"));
			});
	};

	// Structural vault changes (external folder create/rename/delete) rebuild
	// the tree; rediscover the project folders each time it moves.
	useEffect(() => {
		if (!vaultPath) return;
		let cancelled = false;
		let generation = 0;
		const discover = () => {
			const current = ++generation;
			setWritingDiscovering(true);
			void discoverWritingProjects(vaultPath)
				.then((found) => {
					if (!cancelled && current === generation) {
						setDiscoveredManuscripts(found);
					}
				})
				.catch(() => {
					if (!cancelled && current === generation) {
						setWritingDiscovering(false);
					}
				});
		};
		discover();
		const unsubscribe = vaultStore.subscribe((state, previous) => {
			if (state.tree !== previous.tree) discover();
		});
		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, [vaultPath]);

	if (!vaultPath) return null;

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex shrink-0 flex-col gap-1 px-2 pt-1">
				{discovering && manuscripts.length === 0 ? (
					<p className="text-muted-foreground px-1 py-2 text-xs">
						{t("writing.loading")}
					</p>
				) : null}
				<Popover
					open={menuOpen}
					onOpenChange={(open) => {
						setMenuOpen(open);
						if (!open) setCreating(false);
					}}
				>
					<PopoverTrigger className="hover:bg-sidebar-accent/80 flex h-8 w-full min-w-0 items-center gap-1 rounded-md px-2 text-left text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring/60">
						<span className="min-w-0 flex-1 truncate text-left font-medium">
							{label}
						</span>
						<ChevronDown
							className="text-muted-foreground size-3 shrink-0"
							aria-hidden
						/>
					</PopoverTrigger>
					<PopoverContent align="start" className="w-72 gap-0 p-1">
						{creating ? (
							<div className="p-1.5">
								<NewProjectForm
									vaultPath={vaultPath}
									startOpen
									onCreated={() => {
										setCreating(false);
										setMenuOpen(false);
									}}
								/>
							</div>
						) : (
							<div className="flex flex-col">
								<button
									type="button"
									onClick={() => setCreating(true)}
									className={ROW_CLASS}
								>
									{t("writing.newProject")}
								</button>
								{manuscripts.length > 0 ? <Separator className="my-1" /> : null}
								{manuscripts.map((item) => {
									const selected =
										activeRoot != null &&
										sameProject(item.rootFile, activeRoot);
									return (
										<div
											key={normalizePath(item.rootFile)}
											className={cn(
												"group/project hover:bg-accent hover:text-accent-foreground flex h-8 w-full items-center rounded-md pr-1 pl-2",
												selected && "bg-accent text-accent-foreground",
											)}
										>
											<button
												type="button"
												onClick={() => {
													selectManuscript(item.rootFile);
													setMenuOpen(false);
												}}
												className="flex h-full min-w-0 flex-1 cursor-pointer items-center text-left text-sm outline-none"
											>
												<span className="min-w-0 flex-1 truncate">
													{item.title || t("writing.untitled")}
												</span>
											</button>
											<button
												type="button"
												aria-label={t("writing.deleteProject")}
												title={t("writing.deleteProject")}
												onClick={() => removeProject(item.rootFile)}
												className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive pointer-events-none flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md opacity-0 outline-none transition-opacity group-focus-within/project:pointer-events-auto group-focus-within/project:opacity-100 group-hover/project:pointer-events-auto group-hover/project:opacity-100 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring/60"
											>
												<Trash2 className="size-3.5" aria-hidden />
											</button>
										</div>
									);
								})}
							</div>
						)}
					</PopoverContent>
				</Popover>
				{!discovering && manuscripts.length === 0 ? (
					<p className="text-muted-foreground px-1 py-2 text-xs">
						{t("writing.emptyTitle")}
					</p>
				) : null}
			</div>
			{active && activeRoot && rootDir ? (
				<>
					<ManuscriptFiles
						vaultPath={vaultPath}
						rootDir={rootDir}
						activePath={activeFile}
						projectDirs={projectDirs}
						projectRoot={activeRoot}
					/>
					<WritingOutline texPath={compileRoot ?? activeRoot} />
				</>
			) : null}
		</div>
	);
}
