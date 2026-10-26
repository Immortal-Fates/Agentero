/**
 * Left rail for writing: switch projects, then its files and the existing
 * compile / outline panel. New projects are created from the project menu.
 */

import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ManuscriptFiles } from "@/components/writing/manuscript-files";
import { NewProjectForm } from "@/components/writing/new-project-form";
import { WritingDeleteDialog } from "@/components/writing/writing-delete-dialog";
import { WritingOutline } from "@/components/writing/writing-outline";
import { useVaultStore, useWritingStore } from "@/hooks/use-app-stores";
import { useTexRoot } from "@/hooks/use-tex-root";
import { normalizePath } from "@/lib/core/path";
import { cn } from "@/lib/core/utils";
import { discoverWritingProjects } from "@/lib/writing/discover";
import {
	manuscriptDir,
	mergeManuscripts,
	writingProjectTrashRel,
} from "@/lib/writing/session";
import {
	selectManuscript,
	setDiscoveredManuscripts,
	setWritingDiscovering,
} from "@/lib/writing/store";

export function WritingRail() {
	const { t } = useTranslation("sidebar");
	const vaultPath = useVaultStore((s) => s.vaultPath);
	const activeRoot = useWritingStore((s) => s.activeRoot);
	const activeFile = useWritingStore((s) => s.activeFile);
	const recents = useWritingStore((s) => s.recents);
	const discovered = useWritingStore((s) => s.manuscripts);
	const discovering = useWritingStore((s) => s.discovering);
	const compileRoot = useTexRoot(activeRoot);
	const manuscripts = mergeManuscripts(discovered, recents, activeRoot);
	const active = manuscripts.find(
		(item) =>
			activeRoot != null &&
			normalizePath(item.rootFile) === normalizePath(activeRoot),
	);
	const [creating, setCreating] = useState(false);
	const [pendingDelete, setPendingDelete] = useState<{
		rootFile: string;
		title: string;
	} | null>(null);
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
	const canDelete =
		active != null &&
		vaultPath != null &&
		writingProjectTrashRel(vaultPath, active.rootFile) != null;

	useEffect(() => {
		if (!vaultPath) return;
		let cancelled = false;
		setWritingDiscovering(true);
		void discoverWritingProjects(vaultPath)
			.then((found) => {
				if (!cancelled) setDiscoveredManuscripts(found);
			})
			.catch(() => {
				if (!cancelled) setWritingDiscovering(false);
			});
		return () => {
			cancelled = true;
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
				<DropdownMenu>
					<DropdownMenuTrigger className="hover:bg-sidebar-accent/80 flex h-8 w-full min-w-0 items-center gap-1 rounded-md px-2 text-left text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring/60">
						<span className="min-w-0 flex-1 truncate font-medium">{label}</span>
						<ChevronDown
							className="text-muted-foreground size-3.5 shrink-0"
							aria-hidden
						/>
					</DropdownMenuTrigger>
					<DropdownMenuContent>
						<DropdownMenuItem onSelect={() => setCreating(true)}>
							{t("writing.newProject")}
						</DropdownMenuItem>
						{manuscripts.length > 0 ? <DropdownMenuSeparator /> : null}
						{manuscripts.map((item) => {
							const selected =
								activeRoot != null &&
								normalizePath(item.rootFile) === normalizePath(activeRoot);
							return (
								<DropdownMenuItem
									key={normalizePath(item.rootFile)}
									onSelect={() => {
										setCreating(false);
										selectManuscript(item.rootFile);
									}}
									className={cn(selected && "bg-accent")}
								>
									<span className="min-w-0 flex-1 truncate">
										{item.title || t("writing.untitled")}
									</span>
								</DropdownMenuItem>
							);
						})}
						{active && canDelete ? (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									onSelect={() =>
										setPendingDelete({
											rootFile: active.rootFile,
											title: active.title || t("writing.untitled"),
										})
									}
									className="text-destructive"
								>
									{t("writing.deleteProject")}
								</DropdownMenuItem>
							</>
						) : null}
					</DropdownMenuContent>
				</DropdownMenu>
				{creating ? (
					<div className="px-1 pb-1">
						<NewProjectForm
							vaultPath={vaultPath}
							startOpen
							onCreated={() => setCreating(false)}
						/>
					</div>
				) : null}
			</div>
			{active && rootDir ? (
				<>
					<p className="text-muted-foreground shrink-0 px-3 pt-1 pb-0.5 text-xs">
						{t("writing.files")}
					</p>
					<ManuscriptFiles
						vaultPath={vaultPath}
						rootDir={rootDir}
						activePath={activeFile}
						projectDirs={projectDirs}
						projectRoot={active.rootFile}
					/>
					<WritingOutline texPath={compileRoot ?? active.rootFile} />
				</>
			) : null}
			<WritingDeleteDialog
				vaultPath={vaultPath}
				target={pendingDelete}
				onClose={() => setPendingDelete(null)}
			/>
		</div>
	);
}
