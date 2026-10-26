/**
 * Writing canvas: a project list, or one project's source beside its PDF.
 * The reading dock stays mounted underneath and is not shown here.
 */

import { Trash2, X } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	ResizableGroup,
	ResizableHandle,
	ResizablePanel,
} from "@/components/ui/resizable";
import { RecycleBinView } from "@/components/workspace/recycle-bin-view";
import { NewProjectForm } from "@/components/writing/new-project-form";
import { WritingDeleteDialog } from "@/components/writing/writing-delete-dialog";
import { WritingHistory } from "@/components/writing/writing-history";
import { WritingPdfBar } from "@/components/writing/writing-pdf-bar";
import { WritingSyncButtons } from "@/components/writing/writing-sync-buttons";
import { useVaultStore, useWritingStore } from "@/hooks/use-app-stores";
import { useTexRoot } from "@/hooks/use-tex-root";
import { errorText } from "@/lib/core/error";
import { notifyError } from "@/lib/core/notify";
import { basenameOf, normalizePath } from "@/lib/core/path";
import { cn } from "@/lib/core/utils";
import { localFileToArrayBuffer } from "@/lib/paper/media";
import { texBuildStore } from "@/lib/tex/build-state";
import { readVaultFile } from "@/lib/vault";
import { handleTrashChanged } from "@/lib/vault/actions";
import { persistTextFile } from "@/lib/workspace/persistence";
import { resolveTexPdfPath } from "@/lib/workspace/tex-compile";
import { compileTexOnManualSave } from "@/lib/workspace/viewer-actions";
import { discoverWritingProjects } from "@/lib/writing/discover";
import { writingFileReloadStore } from "@/lib/writing/history";
import {
	mergeManuscripts,
	writingProjectTrashRel,
} from "@/lib/writing/session";
import {
	closeAllWritingFiles,
	closeOtherWritingFiles,
	closeWritingFile,
	selectManuscript,
	setDiscoveredManuscripts,
	setWritingDiscovering,
	setWritingFile,
} from "@/lib/writing/store";

const TextEditor = lazy(() =>
	import("@/components/viewer/text-editor").then((mod) => ({
		default: mod.TextEditor,
	})),
);
const PdfViewer = lazy(() =>
	import("@/components/viewer/pdf/pdf-viewer").then((mod) => ({
		default: mod.PdfViewer,
	})),
);

type PdfState = {
	status: "loading" | "ready" | "missing";
	bytes: ArrayBuffer | null;
	path: string | null;
	rev: number;
};

export function WritingDesk() {
	const { t } = useTranslation(["sidebar", "app"]);
	const vaultPath = useVaultStore((s) => s.vaultPath);
	const activeRoot = useWritingStore((s) => s.activeRoot);
	const compileRoot = useTexRoot(activeRoot);
	const activeFile = useWritingStore((s) => s.activeFile);
	const openFiles = useWritingStore((s) => s.openFiles);
	const discovered = useWritingStore((s) => s.manuscripts);
	const recents = useWritingStore((s) => s.recents);
	const discovering = useWritingStore((s) => s.discovering);
	const showTrash = useWritingStore((s) => s.showTrash);
	const historyOpen = useWritingStore((s) => s.historyOpen);
	const [pendingDelete, setPendingDelete] = useState<{
		rootFile: string;
		title: string;
	} | null>(null);
	const manuscripts = mergeManuscripts(discovered, recents, activeRoot);

	if (!vaultPath) return null;
	if (showTrash) {
		return <WritingTrash vaultPath={vaultPath} />;
	}
	if (!activeRoot) {
		return (
			<div className="mx-auto flex h-full w-full max-w-xl flex-col gap-6 overflow-y-auto px-6 py-10">
				<div>
					<h1 className="text-lg font-medium">{t("writing.write")}</h1>
				</div>
				<NewProjectForm vaultPath={vaultPath} startOpen />
				{discovering && manuscripts.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						{t("writing.loading")}
					</p>
				) : null}
				{manuscripts.length === 0 && !discovering ? (
					<p className="text-muted-foreground text-sm">
						{t("writing.emptyTitle")}
					</p>
				) : null}
				<ul className="flex flex-col gap-1">
					{manuscripts.map((item) => {
						const title = item.title || t("writing.untitled");
						const canDelete = writingProjectTrashRel(vaultPath, item.rootFile);
						return (
							<li
								key={normalizePath(item.rootFile)}
								className="flex items-center gap-1"
							>
								<button
									type="button"
									onClick={() => selectManuscript(item.rootFile)}
									className="hover:bg-accent flex h-10 min-w-0 flex-1 items-center rounded-md px-3 text-left text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
								>
									<span className="min-w-0 flex-1 truncate font-medium">
										{title}
									</span>
									<span className="text-muted-foreground ml-3 shrink-0 text-xs">
										{item.fileName}
									</span>
								</button>
								{canDelete ? (
									<button
										type="button"
										aria-label={t("writing.deleteProject")}
										title={t("writing.deleteProject")}
										onClick={() =>
											setPendingDelete({
												rootFile: item.rootFile,
												title,
											})
										}
										className="text-muted-foreground hover:bg-accent hover:text-destructive flex size-8 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
									>
										<Trash2 className="size-3.5" aria-hidden />
									</button>
								) : null}
							</li>
						);
					})}
				</ul>
				<WritingDeleteDialog
					vaultPath={vaultPath}
					target={pendingDelete}
					onClose={() => setPendingDelete(null)}
				/>
			</div>
		);
	}

	const tabs = openFiles;
	return (
		<div className="flex h-full min-h-0 flex-col">
			{historyOpen ? null : (
				<div
					role="tablist"
					aria-label={t("writing.files")}
					className="flex h-9 shrink-0 items-end gap-0.5 overflow-x-auto border-b border-border bg-muted/40 px-1"
				>
					{tabs.map((path) => {
						const selected =
							activeFile != null &&
							normalizePath(path) === normalizePath(activeFile);
						const title = basenameOf(path);
						return (
							<ContextMenu key={normalizePath(path)}>
								<ContextMenuTrigger asChild>
									<div
										className={cn(
											"flex h-7 max-w-48 min-w-0 items-center rounded-t-md",
											selected
												? "bg-background text-foreground"
												: "text-muted-foreground hover:bg-background/70",
										)}
									>
										<button
											type="button"
											role="tab"
											aria-selected={selected}
											title={title}
											onClick={() => setWritingFile(path)}
											className="h-full min-w-0 flex-1 truncate px-2 text-left text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
										>
											{title}
										</button>
										<button
											type="button"
											aria-label={t("app:tabs.close", { title })}
											onClick={() => closeWritingFile(path)}
											className="mr-0.5 flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/60"
										>
											<X className="size-3" aria-hidden />
										</button>
									</div>
								</ContextMenuTrigger>
								<ContextMenuContent>
									<ContextMenuItem onSelect={() => closeWritingFile(path)}>
										{t("app:tabs.contextClose")}
									</ContextMenuItem>
									<ContextMenuItem
										disabled={tabs.length < 2}
										onSelect={() => closeOtherWritingFiles(path)}
									>
										{t("app:tabs.contextCloseOthers")}
									</ContextMenuItem>
									<ContextMenuItem onSelect={() => closeAllWritingFiles()}>
										{t("app:tabs.contextCloseAll")}
									</ContextMenuItem>
								</ContextMenuContent>
							</ContextMenu>
						);
					})}
				</div>
			)}
			<ResizableGroup orientation="horizontal" className="min-h-0 flex-1">
				<ResizablePanel
					id="writing-editor"
					defaultSize="58"
					minSize="24"
					className="min-h-0 min-w-0"
				>
					{historyOpen ? (
						<WritingHistory />
					) : (
						<div className="flex h-full min-h-0 min-w-0 flex-col">
							{activeFile ? (
								<Suspense
									fallback={
										<p className="text-muted-foreground px-3 py-2 text-sm">
											{t("writing.loadingFiles")}
										</p>
									}
								>
									<ProjectEditor path={activeFile} />
								</Suspense>
							) : null}
						</div>
					)}
				</ResizablePanel>
				<ResizableHandle className="z-30">
					<WritingSyncButtons activeFile={activeFile} />
				</ResizableHandle>
				<ResizablePanel
					id="writing-pdf"
					defaultSize="42"
					minSize="20"
					className="min-h-0 min-w-0"
				>
					<div className="flex h-full min-h-0 min-w-0 flex-col">
						<WritingPdfBar rootFile={compileRoot ?? activeRoot} />
						<div className="min-h-0 flex-1">
							<ProjectPdf
								rootFile={compileRoot ?? activeRoot}
								vaultPath={vaultPath}
							/>
						</div>
					</div>
				</ResizablePanel>
			</ResizableGroup>
		</div>
	);
}

function WritingTrash({ vaultPath }: { vaultPath: string }) {
	const { t } = useTranslation("sidebar");
	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex h-10 shrink-0 items-center border-b border-border px-4">
				<h1 className="text-sm font-medium">{t("recycleBin.title")}</h1>
			</div>
			<RecycleBinView
				vaultPath={vaultPath}
				active
				className="min-h-0 flex-1"
				onChanged={() => {
					void handleTrashChanged().then(async () => {
						try {
							setDiscoveredManuscripts(
								await discoverWritingProjects(vaultPath),
							);
						} catch {
							setWritingDiscovering(false);
						}
					});
				}}
			/>
		</div>
	);
}

function ProjectEditor({ path }: { path: string }) {
	const { t } = useTranslation("sidebar");
	const [seed, setSeed] = useState<string | null>(null);
	const [failed, setFailed] = useState(false);
	const reloadToken = useStore(writingFileReloadStore, (state) =>
		state.path === "*" || state.path === normalizePath(path) ? state.token : 0,
	);

	useEffect(() => {
		let cancelled = false;
		const generation = reloadToken;
		setSeed(null);
		setFailed(false);
		void readVaultFile(path)
			.then((text) => {
				if (!cancelled && generation === reloadToken) setSeed(text);
			})
			.catch((error) => {
				if (cancelled) return;
				setFailed(true);
				notifyError(errorText(error));
			});
		return () => {
			cancelled = true;
		};
	}, [path, reloadToken]);

	if (failed) return null;
	if (seed == null) {
		return (
			<p className="text-muted-foreground px-3 py-2 text-sm">
				{t("writing.loadingFiles")}
			</p>
		);
	}

	return (
		<TextEditor
			key={`${path}:${reloadToken}`}
			seed={seed}
			path={path}
			reloadKey={0}
			active
			showLivePreview={false}
			onPersist={persistTextFile}
			onDirtyChange={() => {}}
			onManualSave={(saved) => {
				void compileTexOnManualSave(saved);
			}}
			hideLintFooter
			toolbarPlacement="bar"
			showSyncPdf={false}
			className="min-h-0 flex-1"
		/>
	);
}

function ProjectPdf({
	rootFile,
	vaultPath,
}: {
	rootFile: string;
	vaultPath: string;
}) {
	const { t } = useTranslation("sidebar");
	const buildToken = useStore(texBuildStore, (state) => {
		const snap = state.byRoot[normalizePath(rootFile)];
		if (!snap) return "";
		if (snap.status !== "succeeded") return snap.status;
		return `ok:${snap.result?.pdfPath ?? ""}:${snap.jobId ?? ""}`;
	});
	const [pdf, setPdf] = useState<PdfState>({
		status: "loading",
		bytes: null,
		path: null,
		rev: 0,
	});

	useEffect(() => {
		const revision = buildToken;
		let cancelled = false;
		setPdf((current) => ({
			...current,
			status: current.bytes ? "ready" : "loading",
		}));
		void (async () => {
			const snap = texBuildStore.getState().byRoot[normalizePath(rootFile)];
			let path: string | null =
				snap?.status === "succeeded" && revision.startsWith("ok:")
					? (snap.result?.pdfPath ?? null)
					: null;
			if (!path) {
				try {
					path = await resolveTexPdfPath(rootFile);
				} catch {
					path = null;
				}
			}
			if (!path) {
				if (!cancelled) {
					setPdf((current) =>
						current.bytes
							? current
							: { status: "missing", bytes: null, path: null, rev: 0 },
					);
				}
				return;
			}
			const bytes = await localFileToArrayBuffer(path);
			if (cancelled) return;
			setPdf((current) =>
				bytes
					? { status: "ready", bytes, path, rev: current.rev + 1 }
					: current.bytes
						? current
						: { status: "missing", bytes: null, path, rev: 0 },
			);
		})();
		return () => {
			cancelled = true;
		};
	}, [rootFile, buildToken]);

	if (pdf.status === "ready" && pdf.bytes && pdf.path) {
		return (
			<Suspense
				fallback={
					<p className="text-muted-foreground px-3 py-2 text-sm">
						{t("writing.previewLoading")}
					</p>
				}
			>
				<PdfViewer
					key={`${pdf.path}:${pdf.rev}`}
					source={null}
					sourceBytes={pdf.bytes}
					docId={`writing:${normalizePath(pdf.path)}:${pdf.rev}`}
					vaultPath={vaultPath}
					isActive
					plainViewer
					texRootPath={rootFile}
					pdfPath={pdf.path}
					syncTexScope="writing"
					className="h-full w-full"
				/>
			</Suspense>
		);
	}

	return (
		<div className="text-muted-foreground flex h-full items-center justify-center px-6 text-center text-sm">
			{pdf.status === "loading"
				? t("writing.previewLoading")
				: t("writing.previewEmpty")}
		</div>
	);
}
