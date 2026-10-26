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
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WritingProblems } from "@/components/writing/writing-problems";
import { normalizePath } from "@/lib/core/path";
import { cancelTask } from "@/lib/core/tasks";
import { cn } from "@/lib/core/utils";
import { ensureTexBuildEvents, texBuildStore } from "@/lib/tex/build-state";
import {
	getTexProjectSettings,
	setTexProjectSettings,
	type TexAutoBuild,
	texSettingsStore,
} from "@/lib/tex/config";
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
import {
	closeWritingHistory,
	openWritingHistory,
	openWritingSync,
	writingStore,
} from "@/lib/writing/store";
import { readWritingSyncPrefs } from "@/lib/writing/sync-prefs";
import {
	isWritingAutoSyncPaused,
	resumeWritingAutoSync,
	uploadWritingProject,
} from "@/lib/writing/upload";

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
	const autoBuild = useStore(
		texSettingsStore,
		(state) => state.projects[key]?.autoBuild ?? "never",
	);
	const compiling = compilingPath != null || snapshot?.status === "running";
	const ready = enginesLoading || engines.length > 0;
	const vault = getVaultPath();
	const historyActive = useStore(writingStore, (state) => state.historyActive);
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
		setSyncing(true);
		try {
			await uploadWritingProject(link, quiet);
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
			if (!vault || syncMode !== "onCompile" || !github) return;
			if (isWritingAutoSyncPaused()) return;
			void runSyncRef.current(github, true);
		});
	}, [key, vault, syncMode, github]);

	useEffect(() => {
		if (!vault || syncMode !== "interval" || !github) return;
		const timer = window.setInterval(
			() => {
				if (isWritingAutoSyncPaused()) return;
				void runSyncRef.current(github, true);
			},
			syncMinutes * 60 * 1000,
		);
		return () => window.clearInterval(timer);
	}, [vault, syncMode, syncMinutes, github]);

	function syncProject() {
		resumeWritingAutoSync();
		const current = getVaultPath();
		const link = current ? readWritingGitHub(current) : null;
		setGithub(link);
		if (!link) {
			openWritingSync();
			return;
		}
		void runSync(link);
	}

	return (
		<div className="flex h-full min-w-0 flex-1 items-center gap-1 overflow-hidden pr-2 pl-1">
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
					<DropdownMenuContent align="start" className="min-w-56">
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
						<DropdownMenuSeparator />
						<DropdownMenuLabel>{t("latexBuild:autoBuild")}</DropdownMenuLabel>
						<DropdownMenuRadioGroup
							value={autoBuild}
							onValueChange={(value) => {
								setTexProjectSettings(rootFile, {
									...getTexProjectSettings(rootFile),
									autoBuild: value as TexAutoBuild,
								});
							}}
						>
							<DropdownMenuRadioItem value="never">
								{t("latexBuild:manual")}
							</DropdownMenuRadioItem>
							<DropdownMenuRadioItem value="onSave">
								{t("latexBuild:onSave")}
							</DropdownMenuRadioItem>
							<DropdownMenuRadioItem value="onFileChange">
								{t("latexBuild:onFileChange")}
							</DropdownMenuRadioItem>
						</DropdownMenuRadioGroup>
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
			<WritingProblems rootFile={rootFile} />
			<span className="min-w-0 flex-1" />
			<Button
				type="button"
				variant="ghost"
				size="sm"
				aria-pressed={historyActive}
				className={cn(
					"shrink-0 text-muted-foreground",
					historyActive && "bg-muted text-foreground",
				)}
				onClick={() =>
					historyActive ? closeWritingHistory() : openWritingHistory()
				}
			>
				<History aria-hidden />
				{t("writing.history")}
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className="shrink-0 text-muted-foreground"
				aria-label={
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
				{syncing ? t("writing.syncing") : t("writing.sync")}
			</Button>
		</div>
	);
}
