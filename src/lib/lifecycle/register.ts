import { loadCustomProperties } from "@/lib/paper/custom-properties-store";
/**
 * Central lifecycle handler registration. The bus runs handlers serially in
 * registration order, so cross-handler ordering lives in this file.
 */

import i18n from "@/i18n";
import { clearAgentVaultState } from "@/lib/agent/agent-session-store";
import { commands } from "@/lib/core/bindings";
import { errorText } from "@/lib/core/error";
import { callApi, callApiResult } from "@/lib/core/ipc";
import { logger } from "@/lib/core/logger";
import { notifySuccess } from "@/lib/core/notify";
import { isTauri } from "@/lib/core/tauri";
import { lifecycle } from "@/lib/lifecycle";
import {
	noteCommittedLibraryList,
	noteCommittedPaths,
	noteCommittedRename,
} from "@/lib/lifecycle/refresh-wave";
import {
	clearLibraryVaultState,
	refreshLibrary,
} from "@/lib/paper/library-store";
import { clearAnnotationsVaultState } from "@/lib/pdf/annotations-store";
import { clearLayoutVaultState } from "@/lib/pdf/layout/store";
import { recommendArxiv } from "@/lib/recommend";
import { isFeatureViewType } from "@/lib/shell/feature-window";
import {
	clearUiVaultState,
	setFeaturePoppedOut,
	setSettingsOpenState,
} from "@/lib/shell/ui-store";
import { seedVaultSkills } from "@/lib/vault/actions";
import { joinVaultPath } from "@/lib/vault/path";
import { isRemoteVaultHandle } from "@/lib/vault/remote/remote-vault";
import {
	getVaultPath,
	refreshTree,
	scheduleTreeRefresh,
} from "@/lib/vault/store";
import { remapMovedWorkspacePaths } from "@/lib/wiki/actions";
import {
	clearWikiVaultState,
	trackInternalRenamePaths,
} from "@/lib/wiki/store";
import { syncRenamedPaperTabs } from "@/lib/workspace/actions";

export function registerLifecycleHandlers(): () => void {
	const offs = [
		lifecycle.on("window:closed", ({ kind, view }) => {
			if (kind === "settings") {
				setSettingsOpenState(false);
				return;
			}
			if (kind === "feature" && isFeatureViewType(view)) {
				setFeaturePoppedOut(view, false);
			}
		}),
		lifecycle.on("vault:opened", async ({ vaultId }) => {
			void refreshTree(vaultId);
			void refreshLibrary();
			void loadCustomProperties(vaultId);
			seedVaultSkills(vaultId);
			if (isTauri() && !isRemoteVaultHandle(vaultId)) {
				// Establish the Host scope before later handlers activate plugins.
				await callApi(() => commands.vaultHold(vaultId), {
					fallback: "vault hold failed",
				}).catch((e: unknown) => {
					logger.warn("vault hold failed", { error: errorText(e) });
				});
			}
			if (isTauri()) {
				// T2 reconcile: backfill PAPER.md for catalog papers missing it. Fire
				// & forget; jobs are idempotent and throttled (ParseBody cap = 1).
				void callApiResult(
					() => commands.jobReconcileVault({ vaultPath: vaultId }),
					{ fallback: "vault reconcile failed" },
				).catch(() => undefined);
			}
			if (isTauri() && !isRemoteVaultHandle(vaultId)) {
				// Auto-ingest: adopt bare papers/ folders created while the app
				// was closed; the FS watcher only covers the live session.
				void callApiResult(
					() => commands.paperIngestReconcile({ vaultPath: vaultId }),
					{ fallback: "paper ingest reconcile failed" },
				).catch(() => undefined);
			}
			if (isTauri() && !isRemoteVaultHandle(vaultId)) {
				// Warm today's arXiv ranking so the Plaza panel opens instantly. The
				// Host returns its stored same-day run untouched and exits early when
				// no embedding endpoint is configured, so this is usually free.
				void recommendArxiv({ vaultPath: vaultId }).catch(() => undefined);
			}
			// `vaultId` is captured at setup, so this names the vault being closed.
			// `activateVault` keeps its own synchronous clears: those stop the first
			// painted frame of the new vault from showing the old one, which is a
			// different concern from releasing resources.
			return () => {
				clearLibraryVaultState();
				clearWikiVaultState();
				clearAgentVaultState();
				clearAnnotationsVaultState();
				clearLayoutVaultState();
				clearUiVaultState();
				if (isTauri() && !isRemoteVaultHandle(vaultId)) {
					void callApi(() => commands.vaultRelease(vaultId), {
						fallback: "vault release failed",
					}).catch(() => undefined);
				}
			};
		}),
		lifecycle.on("paper:imported", ({ vaultId, paperId }) => {
			// `app.emit` broadcasts to every window; only react to the active vault.
			if (vaultId !== getVaultPath()) return;
			// The catalog row is already committed. Hold the list refresh and a
			// path-scoped wiki update until this import wave, including
			// recognition renames, goes idle.
			if (paperId) {
				noteCommittedPaths([joinVaultPath(vaultId, `papers/${paperId}`)]);
				void syncRenamedPaperTabs(
					vaultId,
					joinVaultPath(vaultId, `papers/${paperId}`),
				);
			} else {
				noteCommittedLibraryList();
				scheduleTreeRefresh();
			}
		}),
		lifecycle.on("paper:renamed", (event) => {
			const { vaultId, oldPath, newPath, outcome } = event;
			if (vaultId !== getVaultPath()) return;
			const fromAbs = joinVaultPath(vaultId, oldPath);
			const toAbs = joinVaultPath(vaultId, newPath);
			// The Host performed this rename itself: suppress the watcher's
			// external-rename repair for its echoes (same window the UI move
			// flow uses, see `syncMovedPaths`).
			trackInternalRenamePaths([fromAbs, toAbs], Date.now() + 2000);
			if (outcome === "renamed") {
				remapMovedWorkspacePaths(fromAbs, toAbs, oldPath, newPath);
				void syncRenamedPaperTabs(vaultId, toAbs);
			}
			noteCommittedRename(fromAbs, toAbs);
			if (outcome === "merged") {
				notifySuccess(
					i18n.t("sidebar:papersLibrary.recognizeMerged", {
						id: event.newPaperId,
					}),
				);
			}
		}),
	];
	return () => {
		for (const off of offs) off();
	};
}
