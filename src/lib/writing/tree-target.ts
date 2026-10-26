/**
 * Path the writing rail shortcuts act on. The reading tree keeps its own
 * selection; the writing rail marks the row the user last touched so ⌘X / ⌘V /
 * ⌘⌫ / ⌥⌘R / ⌥⌘T mean the same thing on both surfaces.
 */

import { createStore } from "zustand/vanilla";
import { basenameOf, normalizePath } from "@/lib/core/path";

export type WritingTreeTarget = {
	path: string;
	name: string;
	kind: "file" | "directory";
};

type WritingTreeState = {
	target: WritingTreeTarget | null;
	/** Written by the ⌘⌫ shortcut; the file list opens its confirm dialog. */
	deleteRequest: WritingTreeTarget | null;
	/** Bumped when a shortcut moves files so the file list reloads. */
	revision: number;
};

export const writingTreeStore = createStore<WritingTreeState>(() => ({
	target: null,
	deleteRequest: null,
	revision: 0,
}));

export function setWritingTreeTarget(target: WritingTreeTarget | null): void {
	const current = writingTreeStore.getState().target;
	if (current?.path === target?.path && current?.kind === target?.kind) return;
	writingTreeStore.setState({ target });
}

export function requestWritingTreeDelete(): void {
	const target = writingTreeStore.getState().target;
	if (!target) return;
	writingTreeStore.setState({ deleteRequest: target });
}

export function clearWritingTreeDelete(): void {
	if (writingTreeStore.getState().deleteRequest) {
		writingTreeStore.setState({ deleteRequest: null });
	}
}

export function bumpWritingTreeRevision(): void {
	writingTreeStore.setState((state) => ({ revision: state.revision + 1 }));
}

/** Follow a move/rename so shortcuts keep acting on the same row. */
export function remapWritingTreeTargets(
	moves: readonly { from: string; to: string }[],
): void {
	if (moves.length === 0) return;
	const remap = (
		target: WritingTreeTarget | null,
	): WritingTreeTarget | null => {
		if (!target) return null;
		const current = normalizePath(target.path);
		const key = current.toLowerCase();
		for (const move of moves) {
			const from = normalizePath(move.from);
			const fromKey = from.toLowerCase();
			if (key !== fromKey && !key.startsWith(`${fromKey}/`)) continue;
			const next = `${normalizePath(move.to)}${current.slice(from.length)}`;
			return { ...target, path: next, name: basenameOf(next) };
		}
		return target;
	};
	const { target, deleteRequest } = writingTreeStore.getState();
	const nextTarget = remap(target);
	const nextDelete = remap(deleteRequest);
	if (nextTarget === target && nextDelete === deleteRequest) return;
	writingTreeStore.setState({ target: nextTarget, deleteRequest: nextDelete });
}

/** Drop a deleted subtree so later shortcuts do not act on a missing path. */
export function forgetWritingTreeTargets(path: string): void {
	const key = normalizePath(path).toLowerCase();
	const inside = (target: WritingTreeTarget | null): boolean => {
		if (!target) return false;
		const current = normalizePath(target.path).toLowerCase();
		return current === key || current.startsWith(`${key}/`);
	};
	const { target, deleteRequest } = writingTreeStore.getState();
	if (!inside(target) && !inside(deleteRequest)) return;
	writingTreeStore.setState({
		target: inside(target) ? null : target,
		deleteRequest: inside(deleteRequest) ? null : deleteRequest,
	});
}
