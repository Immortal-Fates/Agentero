/**
 * Project-scoped destination picker for moving one writing source. Only
 * folders of the open manuscript are offered, so a chapter cannot be moved
 * into another project by accident.
 */

import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogTitle,
} from "@/components/ui/dialog";
import { dirnameOf, normalizePath } from "@/lib/core/path";
import { cn } from "@/lib/core/utils";
import {
	type FileNode,
	listVaultDirChildren,
	vaultRelativePath,
} from "@/lib/vault";
import { isWritingSourceName } from "@/lib/writing/files";

async function projectDirectories(
	vaultPath: string,
	rootDir: string,
	projectDirs: ReadonlySet<string>,
): Promise<string[]> {
	const found = [rootDir];
	const walk = async (dir: string) => {
		const children = await listVaultDirChildren(vaultPath, dir);
		for (const child of children) {
			if (child.kind !== "directory") continue;
			if (!isWritingSourceName("directory", child.name)) continue;
			if (projectDirs.has(normalizePath(child.path))) continue;
			found.push(child.path);
			await walk(child.path);
		}
	};
	await walk(rootDir);
	return found;
}

export function WritingMoveDialog({
	open,
	vaultPath,
	rootDir,
	projectDirs,
	node,
	onClose,
	onMove,
}: {
	open: boolean;
	vaultPath: string;
	rootDir: string;
	projectDirs: ReadonlySet<string>;
	node: FileNode | null;
	onClose: () => void;
	onMove: (destinationDir: string) => void;
}) {
	const { t } = useTranslation(["sidebar", "common"]);
	const [directories, setDirectories] = useState<string[] | null>(null);
	const [selected, setSelected] = useState<string | null>(null);
	const projectKey = useMemo(
		() => [...projectDirs].sort().join("\n"),
		[projectDirs],
	);

	useEffect(() => {
		if (!open || !node) return;
		let cancelled = false;
		setDirectories(null);
		setSelected(null);
		void projectDirectories(
			vaultPath,
			rootDir,
			new Set(projectKey ? projectKey.split("\n") : []),
		)
			.then((found) => {
				if (!cancelled) setDirectories(found);
			})
			.catch(() => {
				if (!cancelled) setDirectories([]);
			});
		return () => {
			cancelled = true;
		};
	}, [open, node, vaultPath, rootDir, projectKey]);

	const options = useMemo(() => {
		if (!directories || !node) return [];
		const nodeKey = normalizePath(node.path);
		const parentKey = normalizePath(dirnameOf(node.path));
		return directories.filter((dir) => {
			const key = normalizePath(dir);
			if (key === parentKey) return false;
			if (
				node.kind === "directory" &&
				(key === nodeKey || key.startsWith(`${nodeKey}/`))
			) {
				return false;
			}
			return true;
		});
	}, [directories, node]);

	return (
		<Dialog open={open} onOpenChange={(next) => !next && onClose()}>
			<DialogContent className="sm:max-w-sm">
				<DialogTitle>
					{t("writing.moveTitle", { name: node?.name ?? "" })}
				</DialogTitle>
				<div
					role="listbox"
					aria-label={t("writing.moveRoot")}
					className="max-h-64 overflow-y-auto rounded-md border p-1"
				>
					{directories == null ? (
						<p className="text-muted-foreground flex items-center gap-2 px-2 py-2 text-xs">
							<Loader2 className="size-3.5 animate-spin" aria-hidden />
							{t("writing.loadingFiles")}
						</p>
					) : options.length === 0 ? (
						<p className="text-muted-foreground px-2 py-2 text-xs">
							{t("writing.moveNoFolders")}
						</p>
					) : (
						options.map((dir) => {
							const root = normalizePath(dir) === normalizePath(rootDir);
							const label = root
								? t("writing.moveRoot")
								: (vaultRelativePath(rootDir, dir) ?? dir);
							const active = selected === dir;
							return (
								<button
									key={dir}
									type="button"
									role="option"
									aria-selected={active}
									onClick={() => setSelected(dir)}
									className={cn(
										"flex h-7 w-full items-center rounded px-2 text-left text-sm",
										active
											? "bg-accent text-accent-foreground"
											: "hover:bg-accent/60",
									)}
								>
									<span className="min-w-0 flex-1 truncate">{label}</span>
								</button>
							);
						})
					)}
				</div>
				<DialogFooter>
					<Button type="button" variant="ghost" onClick={onClose}>
						{t("common:cancel")}
					</Button>
					<Button
						type="button"
						disabled={!selected}
						onClick={() => selected && onMove(selected)}
					>
						{t("writing.moveAction")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
