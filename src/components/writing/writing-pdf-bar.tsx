/**
 * Compile controls on the PDF pane, in the same place Overleaf puts Recompile.
 */

import {
	ChevronDown,
	CloudUpload,
	History,
	Loader2,
	Play,
	Square,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	PdfBottomBar,
	PdfPaperToneButton,
} from "@/components/viewer/pdf/chrome/pdf-bottom-bar";
import { WritingProblems } from "@/components/writing/writing-problems";
import { errorText } from "@/lib/core/error";
import { notifyError, notifySuccess } from "@/lib/core/notify";
import { normalizePath } from "@/lib/core/path";
import { cancelTask } from "@/lib/core/tasks";
import { cn } from "@/lib/core/utils";
import { writingPdfChromeStore } from "@/lib/pdf/writing-chrome";
import { openSettingsWindow } from "@/lib/shell/settings-window";
import { ensureTexBuildEvents, texBuildStore } from "@/lib/tex/build-state";
import { joinVaultPath } from "@/lib/vault/path";
import { getVaultPath } from "@/lib/vault/store";
import { compileTexProject } from "@/lib/workspace/actions";
import {
	cleanTexAuxFiles,
	initTexEngines,
	texCompileStore,
} from "@/lib/workspace/tex-compile";
import {
	readWritingGitHub,
	type WritingGitHubLink,
} from "@/lib/writing/github";
import { writingStore } from "@/lib/writing/store";
import { syncWritingProject } from "@/lib/writing/sync";
import { readWritingSyncPrefs } from "@/lib/writing/sync-prefs";

let autoSyncPaused = false;

export function WritingPdfBar({ rootFile }: { rootFile: string }) {
	const { t } = useTranslation(["sidebar", "latexBuild"]);
	const key = normalizePath(rootFile);
	const engines = useStore(texCompileStore, (state) => state.engines);
	const enginesLoading = useStore(
		texCompileStore,
		(state) => state.enginesLoading,
	);
	const compilingPath = useStore(
		texCompileStore,
		(state) => state.compilingPath,
	);
	const snapshot = useStore(texBuildStore, (state) => state.byRoot[key]);
	const chrome = useStore(writingPdfChromeStore, (state) => state.current);
	const compiling = compilingPath != null || snapshot?.status === "running";
	const ready = enginesLoading || engines.length > 0;
	const vault = getVaultPath();
	const thesisDir = vault ? joinVaultPath(vault, "thesis") : "";
	const historyOpen = useStore(writingStore, (state) => state.historyOpen);
	const [syncing, setSyncing] = useState(false);
	const [github, setGithub] = useState<WritingGitHubLink | null>(() =>
		vault ? readWritingGitHub(vault) : null,
	);
	const [syncMode, setSyncMode] = useState(() =>
		vault ? readWritingSyncPrefs(vault).mode : "manual",
	);
	const [syncMinutes, setSyncMinutes] = useState(() =>
		vault ? readWritingSyncPrefs(vault).intervalMinutes : 15,
	);

	useEffect(() => {
		initTexEngines();
		void ensureTexBuildEvents();
	}, []);

	useEffect(() => {
		const refresh = () => {
			const current = getVaultPath();
			setGithub(current ? readWritingGitHub(current) : null);
			const prefs = current ? readWritingSyncPrefs(current) : null;
			setSyncMode(prefs?.mode ?? "manual");
			setSyncMinutes(prefs?.intervalMinutes ?? 15);
		};
		window.addEventListener("storage", refresh);
		return () => window.removeEventListener("storage", refresh);
	}, []);

	async function runSync(link: WritingGitHubLink, quiet = false) {
		if (quiet && autoSyncPaused) return;
		if (!thesisDir) {
			if (!quiet) notifyError(t("writing.syncMissing"));
			return;
		}
		setSyncing(true);
		try {
			const report = await syncWritingProject(
				thesisDir,
				link.remote,
				link.branch,
			);
			const stop = () => {
				if (quiet) autoSyncPaused = true;
			};
			if (report.code === "git_missing") {
				stop();
				notifyError(t("writing.syncNoGit"));
				return;
			}
			if (report.code === "auth") {
				stop();
				notifyError(t("writing.syncAuth"), {
					description: report.detail || undefined,
				});
				return;
			}
			if (report.code === "conflict") {
				stop();
				notifyError(t("writing.syncConflict"), {
					description: report.detail || undefined,
				});
				return;
			}
			if (report.code === "missing") {
				stop();
				if (!quiet) notifyError(t("writing.syncMissing"));
				return;
			}
			if (report.code === "clean") {
				if (!quiet) notifySuccess(t("writing.syncClean"));
				return;
			}
			if (report.code === "pulled") {
				notifySuccess(t("writing.syncPulled"));
				return;
			}
			if (report.code === "pushed") {
				if (!quiet) {
					notifySuccess(t("writing.syncPushed"), {
						description: link.label,
					});
				}
				return;
			}
			stop();
			notifyError(t("writing.syncFailed"), {
				description: report.detail || undefined,
			});
		} catch (error) {
			if (quiet) autoSyncPaused = true;
			notifyError(errorText(error) || t("writing.syncFailed"));
		} finally {
			setSyncing(false);
		}
	}

	const runSyncRef = useRef(runSync);
	runSyncRef.current = runSync;
	const seenJob = useRef<string | null>(null);

	useEffect(() => {
		return texBuildStore.subscribe((state) => {
			const snap = state.byRoot[key];
			if (
				!snap?.jobId ||
				snap.status === "running" ||
				snap.status === "cancelled"
			) {
				return;
			}
			if (seenJob.current === snap.jobId) return;
			seenJob.current = snap.jobId;
			if (!vault || syncMode !== "onCompile" || !github || autoSyncPaused)
				return;
			void runSyncRef.current(github, true);
		});
	}, [key, vault, syncMode, github]);

	useEffect(() => {
		if (!vault || syncMode !== "interval" || !github) return;
		const timer = window.setInterval(
			() => {
				if (autoSyncPaused) return;
				void runSyncRef.current(github, true);
			},
			syncMinutes * 60 * 1000,
		);
		return () => window.clearInterval(timer);
	}, [vault, syncMode, syncMinutes, github]);

	function syncProject() {
		autoSyncPaused = false;
		if (!github) {
			openSettingsWindow("writing");
			return;
		}
		void runSync(github);
	}

	return (
		<div className="flex h-10 shrink-0 items-center gap-1 overflow-hidden border-b border-border bg-background px-2">
			<div className="inline-flex items-stretch">
				<Button
					type="button"
					size="sm"
					className="rounded-r-none"
					disabled={!ready || compiling}
					onClick={() => {
						void compileTexProject(rootFile);
					}}
				>
					{compiling ? (
						<Loader2 className="animate-spin" aria-hidden />
					) : (
						<Play aria-hidden />
					)}
					{t("writing.recompile")}
				</Button>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							type="button"
							size="sm"
							className="rounded-l-none border-l border-primary-foreground/25 px-1.5"
							aria-label={t("writing.compileMenu")}
							disabled={!ready}
						>
							<ChevronDown aria-hidden />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
						<DropdownMenuItem
							disabled={compiling}
							onSelect={() => {
								void compileTexProject(rootFile, "force");
							}}
						>
							{t("latexBuild:rebuild")}
						</DropdownMenuItem>
						<DropdownMenuItem
							disabled={compiling}
							onSelect={() => {
								void compileTexProject(rootFile, "clean");
							}}
						>
							{t("latexBuild:cleanRebuild")}
						</DropdownMenuItem>
						<DropdownMenuItem
							disabled={compiling}
							onSelect={() => {
								void cleanTexAuxFiles(rootFile);
							}}
						>
							{t("fileTree.cleanAux")}
						</DropdownMenuItem>
						{snapshot?.status === "running" && snapshot.jobId ? (
							<DropdownMenuItem
								onSelect={() => {
									if (snapshot.jobId) cancelTask(snapshot.jobId);
								}}
							>
								<Square aria-hidden />
								{t("latexBuild:stop")}
							</DropdownMenuItem>
						) : null}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				aria-label={t("writing.history")}
				aria-pressed={historyOpen}
				title={t("writing.history")}
				className={cn(
					"shrink-0 text-muted-foreground",
					historyOpen && "bg-muted text-foreground",
				)}
				onClick={() =>
					writingStore.setState((state) => ({
						historyOpen: !state.historyOpen,
					}))
				}
			>
				<History aria-hidden />
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				className="shrink-0 text-muted-foreground"
				aria-label={
					syncing
						? t("writing.syncing")
						: github
							? t("writing.syncTo", { repo: github.label })
							: t("writing.sync")
				}
				title={
					syncing
						? t("writing.syncing")
						: github
							? t("writing.syncTo", { repo: github.label })
							: t("writing.sync")
				}
				disabled={syncing}
				onClick={syncProject}
			>
				{syncing ? (
					<Loader2 className="animate-spin" aria-hidden />
				) : (
					<CloudUpload aria-hidden />
				)}
			</Button>
			<WritingProblems rootFile={rootFile} />
			<span className="min-w-0 flex-1" />
			{chrome ? (
				<PdfPaperToneButton
					pdfTone={chrome.pdfTone}
					onSetPdfTone={chrome.onSetPdfTone}
				/>
			) : null}
			{chrome ? <PdfBottomBar {...chrome} variant="inline" /> : null}
		</div>
	);
}
