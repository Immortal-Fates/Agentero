/**
 * Left rail for writing: switch projects, then its files and the existing
 * compile / outline panel. New projects are created from the project home.
 */

import { ChevronDown } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { LatexPanel } from "@/components/sidebar/latex-panel";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ManuscriptFiles } from "@/components/writing/manuscript-files";
import { useVaultStore, useWritingStore } from "@/hooks/use-app-stores";
import { normalizePath } from "@/lib/core/path";
import { cn } from "@/lib/core/utils";
import { discoverWritingProjects } from "@/lib/writing/discover";
import { manuscriptDir, mergeManuscripts } from "@/lib/writing/session";
import {
	closeManuscript,
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
	const manuscripts = mergeManuscripts(discovered, recents, activeRoot);
	const active = manuscripts.find(
		(item) =>
			activeRoot != null &&
			normalizePath(item.rootFile) === normalizePath(activeRoot),
	);
	const rootDir = active ? manuscriptDir(active.rootFile) : "";
	const label = active
		? active.title || t("writing.untitled")
		: t("writing.allProjects");

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
				{manuscripts.length > 0 ? (
					<DropdownMenu>
						<DropdownMenuTrigger className="hover:bg-sidebar-accent/80 flex h-8 w-full min-w-0 items-center gap-1 rounded-md px-2 text-left text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring/60">
							<span className="min-w-0 flex-1 truncate font-medium">
								{label}
							</span>
							<ChevronDown
								className="text-muted-foreground size-3.5 shrink-0"
								aria-hidden
							/>
						</DropdownMenuTrigger>
						<DropdownMenuContent>
							<DropdownMenuItem onSelect={() => closeManuscript()}>
								{t("writing.allProjects")}
							</DropdownMenuItem>
							<DropdownMenuItem onSelect={() => closeManuscript()}>
								{t("writing.newProject")}
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							{manuscripts.map((item) => {
								const selected =
									activeRoot != null &&
									normalizePath(item.rootFile) === normalizePath(activeRoot);
								return (
									<DropdownMenuItem
										key={normalizePath(item.rootFile)}
										onSelect={() => selectManuscript(item.rootFile)}
										className={cn(selected && "bg-accent")}
									>
										<span className="min-w-0 flex-1 truncate">
											{item.title || t("writing.untitled")}
										</span>
									</DropdownMenuItem>
								);
							})}
						</DropdownMenuContent>
					</DropdownMenu>
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
					/>
					<LatexPanel texPath={active.rootFile} />
				</>
			) : null}
		</div>
	);
}
