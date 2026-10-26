/**
 * Writing-rail commands shared by the context menus and the global shortcuts,
 * so both act on the same target row.
 */

import { errorText } from "@/lib/core/error";
import { notifyError } from "@/lib/core/notify";
import { closeTopOverlay } from "@/lib/core/overlay-stack";
import { remapTexSettingsPaths } from "@/lib/tex/config";
import { cutSelectedPaths, pasteCutPaths } from "@/lib/vault/actions";
import {
	openFilePathInTerminal,
	revealFilePath,
} from "@/lib/workspace/file-path-actions";
import {
	closeWritingFile,
	closeWritingHistory,
	closeWritingSync,
	remapWritingPaths,
	writingStore,
} from "@/lib/writing/store";
import {
	bumpWritingTreeRevision,
	remapWritingTreeTargets,
	requestWritingTreeDelete,
	writingTreeStore,
} from "@/lib/writing/tree-target";

function report(action: () => Promise<void>): void {
	void action().catch((error) => notifyError(errorText(error)));
}

export function revealWritingTarget(): void {
	const target = writingTreeStore.getState().target;
	if (target) report(() => revealFilePath(target.path));
}

export function openWritingTargetInTerminal(): void {
	const target = writingTreeStore.getState().target;
	if (target) report(() => openFilePathInTerminal(target.path));
}

export function cutWritingTarget(): void {
	const target = writingTreeStore.getState().target;
	if (target) cutSelectedPaths([target.path]);
}

export function deleteWritingTarget(): void {
	requestWritingTreeDelete();
}

/** Remap every writing surface that remembers a path after a move. */
export function applyWritingMoves(
	moves: readonly { from: string; to: string }[],
): void {
	if (moves.length === 0) return;
	remapWritingPaths(moves);
	remapTexSettingsPaths(moves);
	remapWritingTreeTargets(moves);
}

/** ⌘V on the writing rail: paste the staged cut paths into the target. */
export function pasteWritingTarget(): void {
	const target = writingTreeStore.getState().target;
	if (!target) return;
	void pasteCutPaths(target.path)
		.then((moved) => {
			if (moved.length === 0) return;
			applyWritingMoves(moved);
			bumpWritingTreeRevision();
		})
		.catch((error) => notifyError(errorText(error)));
}

/** ⌘W on the writing surface: close the active source / history / upload tab. */
export function closeActiveWritingTab(): void {
	if (closeTopOverlay()) return;
	const state = writingStore.getState();
	if (state.historyActive) {
		closeWritingHistory();
		return;
	}
	if (state.syncActive) {
		closeWritingSync();
		return;
	}
	if (state.activeFile) closeWritingFile(state.activeFile);
}
