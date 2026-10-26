/**
 * Files of the open manuscript. Build artifacts stay hidden.
 * Right-click and the row menu share the same actions.
 */

import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import type { TFunction } from "i18next";
import { ChevronRight, FileText, Folder, MoreHorizontal } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { Button } from "@/components/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { presentAgentComposer } from "@/lib/agent/composer-focus";
import { broadcastAgentAttachContext } from "@/lib/agent/context-attach";
import { copyTextToClipboard } from "@/lib/core/clipboard";
import { errorText } from "@/lib/core/error";
import { notifyError, notifySuccess } from "@/lib/core/notify";
import { basenameOf, displayPath, normalizePath } from "@/lib/core/path";
import { cn } from "@/lib/core/utils";
import {
	explicitTexRoot,
	setDirectoryTexRoot,
	texSettingsStore,
} from "@/lib/tex/config";
import {
	createVaultDirectory,
	type FileNode,
	isValidVaultEntryName,
	joinVaultPath,
	listVaultDirChildren,
	readVaultBytes,
	removeVaultPath,
	vaultPathExists,
	vaultRelativePath,
	writeVaultBytes,
	writeVaultFile,
} from "@/lib/vault";
import {
	openInTerminal,
	revealInFileManager,
	revealInOsLabelKey,
} from "@/lib/vault/reveal";
import { moveVaultPath } from "@/lib/wiki";
import { dirtyVaultPaths } from "@/lib/workspace/persistence";
import {
	compareWritingNodes,
	isWritingSourceName,
	withoutNestedProjects,
} from "@/lib/writing/files";
import { closeWritingFile, setWritingFile } from "@/lib/writing/store";

function visibleNodes(nodes: readonly FileNode[]): FileNode[] {
	return nodes
		.filter((node) => isWritingSourceName(node.kind, node.name))
		.sort(compareWritingNodes);
}

type NameAsk = {
	title: string;
	initial: string;
	submit: (name: string) => Promise<void>;
};

export function ManuscriptFiles({
	vaultPath,
	rootDir,
	activePath,
	projectDirs,
	projectRoot,
}: {
	vaultPath: string;
	rootDir: string;
	activePath: string | null;
	/** Directories of other projects. They are not chapters of this one. */
	projectDirs: ReadonlySet<string>;
	projectRoot: string;
}) {
	const { t } = useTranslation("sidebar");
	const [nodes, setNodes] = useState<FileNode[] | null>(null);
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
	const [childNodes, setChildNodes] = useState<Record<string, FileNode[]>>({});
	const [revision, setRevision] = useState(0);
	const [ask, setAsk] = useState<NameAsk | null>(null);
	const [pendingDelete, setPendingDelete] = useState<FileNode | null>(null);
	const roots = useStore(texSettingsStore, (state) => state.roots);
	const mainPath =
		roots[normalizePath(rootDir)] ?? explicitTexRoot(rootDir) ?? projectRoot;

	useEffect(() => {
		const request = revision;
		let cancelled = false;
		setNodes(null);
		void listVaultDirChildren(vaultPath, rootDir)
			.then((listed) => {
				if (!cancelled && request === revision) setNodes(visibleNodes(listed));
			})
			.catch(() => {
				if (!cancelled && request === revision) setNodes([]);
			});
		return () => {
			cancelled = true;
		};
	}, [vaultPath, rootDir, revision]);

	const reload = () => {
		setChildNodes({});
		setRevision((current) => current + 1);
	};

	const toggleDirectory = (node: FileNode) => {
		setExpanded((current) => {
			const next = new Set(current);
			if (next.has(node.path)) next.delete(node.path);
			else next.add(node.path);
			return next;
		});
		if (childNodes[node.path]) return;
		void listVaultDirChildren(vaultPath, node.path)
			.then((listed) => {
				setChildNodes((current) => ({
					...current,
					[node.path]: visibleNodes(listed),
				}));
			})
			.catch(() => {
				setChildNodes((current) => ({ ...current, [node.path]: [] }));
			});
	};

	async function createEntry(dir: string, name: string, directory: boolean) {
		const trimmed = name.trim();
		const fileName =
			directory || trimmed.includes(".") ? trimmed : `${trimmed}.tex`;
		if (!isValidVaultEntryName(fileName)) {
			notifyError(t("fileTree.invalidName"));
			return;
		}
		const target = joinVaultPath(dir, fileName);
		if (await vaultPathExists(target)) {
			notifyError(t("fileTree.alreadyExists", { name: fileName }));
			return;
		}
		if (directory) await createVaultDirectory(target);
		else {
			await writeVaultFile(target, "");
			setWritingFile(target);
		}
		reload();
	}

	async function renameFile(node: FileNode, name: string) {
		const trimmed = name.trim();
		if (!isValidVaultEntryName(trimmed)) {
			notifyError(t("fileTree.invalidName"));
			return;
		}
		const from = vaultRelativePath(vaultPath, node.path);
		const parent = node.path.slice(0, node.path.length - node.name.length);
		const target = joinVaultPath(parent.replace(/[\\/]$/, ""), trimmed);
		const to = vaultRelativePath(vaultPath, target);
		if (!from || !to) return;
		if (await vaultPathExists(target)) {
			notifyError(t("fileTree.alreadyExists", { name: trimmed }));
			return;
		}
		await moveVaultPath(vaultPath, from, to, dirtyVaultPaths(vaultPath));
		closeWritingFile(node.path);
		setWritingFile(target);
		reload();
	}

	async function downloadFile(node: FileNode) {
		const dest = await save({ defaultPath: node.name });
		if (!dest) return;
		await writeFile(dest, await readVaultBytes(node.path));
	}

	async function uploadInto(dir: string) {
		const picked = await open({ multiple: true });
		if (!picked) return;
		const paths = Array.isArray(picked) ? picked : [picked];
		for (const source of paths) {
			const name = basenameOf(source);
			if (!isValidVaultEntryName(name)) continue;
			const target = joinVaultPath(dir, name);
			if (await vaultPathExists(target)) {
				notifyError(t("fileTree.alreadyExists", { name }));
				continue;
			}
			await writeVaultBytes(target, await readFile(source));
		}
		reload();
	}

	function makeMain(node: FileNode) {
		setDirectoryTexRoot(rootDir, node.path);
		notifySuccess(t("writing.setMainFileDone"));
	}

	async function deleteFile(node: FileNode) {
		await removeVaultPath(node.path);
		closeWritingFile(node.path);
		setPendingDelete(null);
		reload();
	}

	if (nodes == null) {
		return (
			<p className="text-muted-foreground px-2 py-2 text-xs">
				{t("writing.loadingFiles")}
			</p>
		);
	}
	const shown = withoutNestedProjects(nodes, projectDirs);

	return (
		<div className="min-h-0 flex-1 overflow-y-auto px-1 pb-1">
			<FolderMenu
				path={rootDir}
				label={basenameOf(rootDir) || t("writing.files")}
				onNewFile={() =>
					setAsk({
						title: t("fileTree.newFile"),
						initial: "",
						submit: (name) => createEntry(rootDir, name, false),
					})
				}
				onNewFolder={() =>
					setAsk({
						title: t("fileTree.newFolder"),
						initial: "",
						submit: (name) => createEntry(rootDir, name, true),
					})
				}
				onUpload={() => void uploadInto(rootDir).catch(fail)}
			/>
			{shown.length === 0 ? (
				<p className="text-muted-foreground px-2 py-2 text-xs">
					{t("writing.noSources")}
				</p>
			) : (
				<NodeList
					nodes={shown}
					depth={0}
					activePath={activePath}
					expanded={expanded}
					childNodes={childNodes}
					projectDirs={projectDirs}
					loadingLabel={t("writing.loadingFiles")}
					mainPath={mainPath}
					onMakeMain={makeMain}
					onToggle={toggleDirectory}
					onNewFile={(dir) =>
						setAsk({
							title: t("fileTree.newFile"),
							initial: "",
							submit: (name) => createEntry(dir, name, false),
						})
					}
					onNewFolder={(dir) =>
						setAsk({
							title: t("fileTree.newFolder"),
							initial: "",
							submit: (name) => createEntry(dir, name, true),
						})
					}
					onUpload={(dir) => void uploadInto(dir).catch(fail)}
					onRename={(node) =>
						setAsk({
							title: t("fileTree.rename"),
							initial: node.name,
							submit: (name) => renameFile(node, name),
						})
					}
					onDownload={(node) => void downloadFile(node).catch(fail)}
					onDelete={setPendingDelete}
				/>
			)}
			<NameDialog ask={ask} onClose={() => setAsk(null)} />
			<Dialog
				open={pendingDelete != null}
				onOpenChange={(next) => {
					if (!next) setPendingDelete(null);
				}}
			>
				<DialogContent className="sm:max-w-sm">
					<DialogTitle>{t("writing.deleteFile")}</DialogTitle>
					<p className="text-sm">
						{t("writing.deleteFileConfirm", {
							name: pendingDelete?.name ?? "",
						})}
					</p>
					<DialogFooter>
						<Button
							type="button"
							variant="destructive"
							onClick={() => {
								if (pendingDelete) void deleteFile(pendingDelete).catch(fail);
							}}
						>
							{t("writing.deleteFile")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function fail(error: unknown) {
	notifyError(errorText(error));
}

type WritingMenuItem = {
	id: string;
	label: string;
	disabled?: boolean;
	destructive?: boolean;
	run: () => void;
};

function pathMenuItems(
	t: TFunction<"sidebar">,
	path: string,
): WritingMenuItem[] {
	return [
		{
			id: "copy",
			label: t("fileTree.copyPath"),
			run: () => {
				void copyTextToClipboard(displayPath(path), {
					successMessage: t("fileTree.copiedPath"),
					errorMessage: t("fileTree.copyPathFailed"),
					successNotify: { duration: 2000 },
				});
			},
		},
		{
			id: "reveal",
			label: t(revealInOsLabelKey()),
			run: () => {
				void revealInFileManager(path).catch(() => {
					notifyError(t("fileTree.revealFailed"));
				});
			},
		},
		{
			id: "terminal",
			label: t("fileTree.openInTerminal"),
			run: () => {
				void openInTerminal(path).catch(() => {
					notifyError(t("fileTree.openInTerminalFailed"));
				});
			},
		},
		{
			id: "chat",
			label: t("fileTree.addToChat"),
			run: () => {
				broadcastAgentAttachContext([path]);
				presentAgentComposer();
			},
		},
	];
}

function FolderMenu({
	path,
	label,
	onNewFile,
	onNewFolder,
	onUpload,
}: {
	path: string;
	label: string;
	onNewFile: () => void;
	onNewFolder: () => void;
	onUpload: () => void;
}) {
	const { t } = useTranslation("sidebar");
	const items: WritingMenuItem[] = [
		{ id: "new-file", label: t("fileTree.newFile"), run: onNewFile },
		{ id: "new-folder", label: t("fileTree.newFolder"), run: onNewFolder },
		{ id: "upload", label: t("writing.upload"), run: onUpload },
		...pathMenuItems(t, path),
	];
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div className="group flex h-7 items-center gap-1 rounded-md pr-1 pl-2">
					<Folder
						className="size-3.5 shrink-0 text-muted-foreground"
						aria-hidden
					/>
					<span className="min-w-0 flex-1 truncate text-sm font-medium">
						{label}
					</span>
					<RowMenu items={items} />
				</div>
			</ContextMenuTrigger>
			<MenuContent items={items} />
		</ContextMenu>
	);
}

function NodeList({
	nodes,
	depth,
	activePath,
	expanded,
	childNodes,
	projectDirs,
	loadingLabel,
	mainPath,
	onMakeMain,
	onToggle,
	onNewFile,
	onNewFolder,
	onUpload,
	onRename,
	onDownload,
	onDelete,
}: {
	nodes: readonly FileNode[];
	depth: number;
	activePath: string | null;
	expanded: ReadonlySet<string>;
	childNodes: Record<string, FileNode[]>;
	projectDirs: ReadonlySet<string>;
	loadingLabel: string;
	mainPath: string;
	onMakeMain: (node: FileNode) => void;
	onToggle: (node: FileNode) => void;
	onNewFile: (dir: string) => void;
	onNewFolder: (dir: string) => void;
	onUpload: (dir: string) => void;
	onRename: (node: FileNode) => void;
	onDownload: (node: FileNode) => void;
	onDelete: (node: FileNode) => void;
}) {
	return (
		<ul className="flex flex-col">
			{nodes.map((node) => (
				<li key={node.path}>
					<FileRow
						node={node}
						depth={depth}
						selected={
							activePath != null &&
							normalizePath(activePath) === normalizePath(node.path)
						}
						expanded={expanded.has(node.path)}
						mainPath={mainPath}
						onMakeMain={onMakeMain}
						onToggle={onToggle}
						onNewFile={onNewFile}
						onNewFolder={onNewFolder}
						onUpload={onUpload}
						onRename={onRename}
						onDownload={onDownload}
						onDelete={onDelete}
					/>
					{node.kind === "directory" && expanded.has(node.path) ? (
						childNodes[node.path] ? (
							<NodeList
								nodes={withoutNestedProjects(
									childNodes[node.path],
									projectDirs,
								)}
								depth={depth + 1}
								activePath={activePath}
								expanded={expanded}
								childNodes={childNodes}
								projectDirs={projectDirs}
								loadingLabel={loadingLabel}
								mainPath={mainPath}
								onMakeMain={onMakeMain}
								onToggle={onToggle}
								onNewFile={onNewFile}
								onNewFolder={onNewFolder}
								onUpload={onUpload}
								onRename={onRename}
								onDownload={onDownload}
								onDelete={onDelete}
							/>
						) : (
							<p
								className="text-muted-foreground py-1 text-xs"
								style={{ paddingLeft: 20 + depth * 12 }}
							>
								{loadingLabel}
							</p>
						)
					) : null}
				</li>
			))}
		</ul>
	);
}

function FileRow({
	node,
	depth,
	selected,
	expanded,
	mainPath,
	onMakeMain,
	onToggle,
	onNewFile,
	onNewFolder,
	onUpload,
	onRename,
	onDownload,
	onDelete,
}: {
	node: FileNode;
	depth: number;
	selected: boolean;
	expanded: boolean;
	mainPath: string;
	onMakeMain: (node: FileNode) => void;
	onToggle: (node: FileNode) => void;
	onNewFile: (dir: string) => void;
	onNewFolder: (dir: string) => void;
	onUpload: (dir: string) => void;
	onRename: (node: FileNode) => void;
	onDownload: (node: FileNode) => void;
	onDelete: (node: FileNode) => void;
}) {
	const { t } = useTranslation("sidebar");
	const directory = node.kind === "directory";
	const texFile = !directory && node.name.toLowerCase().endsWith(".tex");
	const isMain =
		texFile && normalizePath(node.path) === normalizePath(mainPath);
	const Icon = directory ? Folder : FileText;
	const items: WritingMenuItem[] = directory
		? [
				{
					id: "new-file",
					label: t("fileTree.newFile"),
					run: () => onNewFile(node.path),
				},
				{
					id: "new-folder",
					label: t("fileTree.newFolder"),
					run: () => onNewFolder(node.path),
				},
				{
					id: "upload",
					label: t("writing.upload"),
					run: () => onUpload(node.path),
				},
				...pathMenuItems(t, node.path),
				{
					id: "rename",
					label: t("fileTree.rename"),
					run: () => onRename(node),
				},
				{
					id: "delete",
					label: t("writing.deleteFile"),
					destructive: true,
					run: () => onDelete(node),
				},
			]
		: [
				...(texFile
					? [
							{
								id: "main",
								label: isMain
									? t("writing.mainFile")
									: t("writing.setMainFile"),
								disabled: isMain,
								run: () => onMakeMain(node),
							},
						]
					: []),
				{
					id: "rename",
					label: t("fileTree.rename"),
					run: () => onRename(node),
				},
				{
					id: "download",
					label: t("writing.download"),
					run: () => onDownload(node),
				},
				...pathMenuItems(t, node.path),
				{
					id: "delete",
					label: t("writing.deleteFile"),
					destructive: true,
					run: () => onDelete(node),
				},
			];
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div
					className={cn(
						"group flex h-7 min-w-0 items-center gap-1 rounded-md pr-1 text-sm",
						selected && "bg-sidebar-accent text-sidebar-accent-foreground",
					)}
					style={{ paddingLeft: 8 + depth * 12 }}
				>
					<button
						type="button"
						aria-expanded={directory ? expanded : undefined}
						aria-current={selected ? "page" : undefined}
						title={node.name}
						onContextMenu={() => {
							if (!directory) setWritingFile(node.path);
						}}
						onClick={() => {
							if (directory) onToggle(node);
							else setWritingFile(node.path);
						}}
						className="flex h-7 min-w-0 flex-1 items-center gap-1 rounded-md text-left outline-none hover:bg-sidebar-accent/80 focus-visible:ring-1 focus-visible:ring-ring/60"
					>
						{directory ? (
							<ChevronRight
								className={cn(
									"size-3.5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
									expanded && "rotate-90",
								)}
								aria-hidden
							/>
						) : (
							<span className="size-3.5 shrink-0" aria-hidden />
						)}
						<Icon
							className="size-3.5 shrink-0 text-muted-foreground"
							aria-hidden
						/>
						<span className="min-w-0 flex-1 truncate">{node.name}</span>
					</button>
					<RowMenu items={items} />
				</div>
			</ContextMenuTrigger>
			<MenuContent items={items} />
		</ContextMenu>
	);
}

function MenuContent({ items }: { items: WritingMenuItem[] }) {
	const deleteAt = items.findIndex((item) => item.destructive);
	return (
		<ContextMenuContent>
			{items.map((item, index) => (
				<MenuEntry
					key={item.id}
					item={item}
					kind="context"
					separator={Boolean(item.destructive && index === deleteAt)}
				/>
			))}
		</ContextMenuContent>
	);
}

function RowMenu({ items }: { items: WritingMenuItem[] }) {
	const { t } = useTranslation("sidebar");
	const deleteAt = items.findIndex((item) => item.destructive);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				className="text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-md opacity-0 outline-none hover:bg-sidebar-accent group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring/60 data-[state=open]:opacity-100"
				aria-label={t("writing.more")}
			>
				<MoreHorizontal className="size-3.5" aria-hidden />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{items.map((item, index) => (
					<MenuEntry
						key={item.id}
						item={item}
						kind="dropdown"
						separator={Boolean(item.destructive && index === deleteAt)}
					/>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function MenuEntry({
	item,
	separator,
	kind,
}: {
	item: WritingMenuItem;
	separator: boolean;
	kind: "context" | "dropdown";
}) {
	const action = (
		<Action
			kind={kind}
			disabled={item.disabled}
			destructive={item.destructive}
			onSelect={item.run}
		>
			{item.label}
		</Action>
	);
	if (!separator) return action;
	return (
		<>
			{kind === "context" ? (
				<ContextMenuSeparator />
			) : (
				<DropdownMenuSeparator />
			)}
			{action}
		</>
	);
}

function Action({
	kind,
	disabled,
	destructive,
	onSelect,
	children,
}: {
	kind: "context" | "dropdown";
	disabled?: boolean;
	destructive?: boolean;
	onSelect: () => void;
	children: ReactNode;
}) {
	if (kind === "dropdown") {
		return (
			<DropdownMenuItem
				disabled={disabled}
				variant={destructive ? "destructive" : "default"}
				onSelect={onSelect}
			>
				{children}
			</DropdownMenuItem>
		);
	}
	return (
		<ContextMenuItem
			disabled={disabled}
			className={
				destructive ? "text-destructive focus:text-destructive" : undefined
			}
			onSelect={onSelect}
		>
			{children}
		</ContextMenuItem>
	);
}

function NameDialog({
	ask,
	onClose,
}: {
	ask: NameAsk | null;
	onClose: () => void;
}) {
	const [value, setValue] = useState("");
	useEffect(() => {
		setValue(ask?.initial ?? "");
	}, [ask]);
	return (
		<Dialog open={ask != null} onOpenChange={(next) => !next && onClose()}>
			<DialogContent className="sm:max-w-sm">
				<DialogTitle>{ask?.title}</DialogTitle>
				<form
					onSubmit={(event) => {
						event.preventDefault();
						if (!ask) return;
						void ask.submit(value).then(onClose).catch(fail);
					}}
				>
					<Input
						value={value}
						autoFocus
						onChange={(event) => setValue(event.target.value)}
					/>
					<DialogFooter className="mt-3 px-0">
						<Button type="submit">{ask?.title}</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
