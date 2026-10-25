/**
 * Files of the open manuscript. Build artifacts stay hidden.
 * Folders expand one level at a time through the vault listing command.
 */

import { ChevronRight, FileText, Folder } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { normalizePath } from "@/lib/core/path";
import { cn } from "@/lib/core/utils";
import { type FileNode, listVaultDirChildren } from "@/lib/vault";
import { compareWritingNodes, isWritingSourceName } from "@/lib/writing/files";
import { setWritingFile } from "@/lib/writing/store";

function visibleNodes(nodes: readonly FileNode[]): FileNode[] {
	return nodes
		.filter((node) => isWritingSourceName(node.kind, node.name))
		.sort(compareWritingNodes);
}

export function ManuscriptFiles({
	vaultPath,
	rootDir,
	activePath,
}: {
	vaultPath: string;
	rootDir: string;
	activePath: string | null;
}) {
	const { t } = useTranslation("sidebar");
	const [nodes, setNodes] = useState<FileNode[] | null>(null);
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
	const [childNodes, setChildNodes] = useState<Record<string, FileNode[]>>({});

	useEffect(() => {
		let cancelled = false;
		setNodes(null);
		setExpanded(new Set());
		setChildNodes({});
		void listVaultDirChildren(vaultPath, rootDir)
			.then((listed) => {
				if (!cancelled) setNodes(visibleNodes(listed));
			})
			.catch(() => {
				if (!cancelled) setNodes([]);
			});
		return () => {
			cancelled = true;
		};
	}, [vaultPath, rootDir]);

	const toggleDirectory = (node: FileNode) => {
		setExpanded((current) => {
			const next = new Set(current);
			if (next.has(node.path)) {
				next.delete(node.path);
				return next;
			}
			next.add(node.path);
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

	if (nodes == null) {
		return (
			<p className="text-muted-foreground px-2 py-2 text-xs">
				{t("writing.loadingFiles")}
			</p>
		);
	}
	if (nodes.length === 0) {
		return (
			<p className="text-muted-foreground px-2 py-2 text-xs">
				{t("writing.noSources")}
			</p>
		);
	}

	return (
		<div className="min-h-0 flex-1 overflow-y-auto px-1 pb-1">
			<NodeList
				nodes={nodes}
				depth={0}
				activePath={activePath}
				expanded={expanded}
				childNodes={childNodes}
				loadingLabel={t("writing.loadingFiles")}
				onToggle={toggleDirectory}
			/>
		</div>
	);
}

function NodeList({
	nodes,
	depth,
	activePath,
	expanded,
	childNodes,
	loadingLabel,
	onToggle,
}: {
	nodes: readonly FileNode[];
	depth: number;
	activePath: string | null;
	expanded: ReadonlySet<string>;
	childNodes: Record<string, FileNode[]>;
	loadingLabel: string;
	onToggle: (node: FileNode) => void;
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
						onToggle={onToggle}
					/>
					{node.kind === "directory" && expanded.has(node.path) ? (
						childNodes[node.path] ? (
							<NodeList
								nodes={childNodes[node.path]}
								depth={depth + 1}
								activePath={activePath}
								expanded={expanded}
								childNodes={childNodes}
								loadingLabel={loadingLabel}
								onToggle={onToggle}
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
	onToggle,
}: {
	node: FileNode;
	depth: number;
	selected: boolean;
	expanded: boolean;
	onToggle: (node: FileNode) => void;
}) {
	const directory = node.kind === "directory";
	const Icon = directory ? Folder : FileText;
	return (
		<button
			type="button"
			aria-expanded={directory ? expanded : undefined}
			aria-current={selected ? "page" : undefined}
			title={node.name}
			onClick={() => {
				if (directory) onToggle(node);
				else setWritingFile(node.path);
			}}
			className={cn(
				"flex h-7 w-full min-w-0 items-center gap-1 rounded-md pr-2 text-left text-sm outline-none transition-colors hover:bg-sidebar-accent/80 focus-visible:ring-1 focus-visible:ring-ring/60",
				selected && "bg-sidebar-accent text-sidebar-accent-foreground",
			)}
			style={{ paddingLeft: 8 + depth * 12 }}
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
			<Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
			<span className="min-w-0 flex-1 truncate">{node.name}</span>
		</button>
	);
}
