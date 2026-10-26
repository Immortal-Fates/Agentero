/**
 * Writing surface session. The manuscript root and the last surface are
 * per vault; discovery results live only in memory.
 */

import { createStore } from "zustand/vanilla";
import { normalizePath } from "@/lib/core/path";
import {
	type Manuscript,
	manuscriptDir,
	readWritingPrefs,
	touchRecent,
	type WorkspaceSurface,
	writeWritingPrefs,
} from "@/lib/writing/session";

type WritingStore = {
	vaultPath: string | null;
	surface: WorkspaceSurface;
	activeRoot: string | null;
	/** File open in the writing editor. Not persisted; follows the project. */
	activeFile: string | null;
	/** Source files open as writing tabs. Session only. */
	openFiles: string[];
	recents: string[];
	manuscripts: Manuscript[];
	discovering: boolean;
	/** Writing canvas shows the vault recycle bin. Session only. */
	showTrash: boolean;
	/** Editor pane shows upload history instead of the source. Session only. */
	historyOpen: boolean;
};

export const writingStore = createStore<WritingStore>(() => ({
	vaultPath: null,
	surface: "reading",
	activeRoot: null,
	activeFile: null,
	openFiles: [],
	recents: [],
	manuscripts: [],
	discovering: false,
	showTrash: false,
	historyOpen: false,
}));

function persist(): void {
	const { vaultPath, surface, activeRoot, recents } = writingStore.getState();
	if (!vaultPath) return;
	writeWritingPrefs(vaultPath, { surface, activeRoot, recents });
}

/** Load the vault's writing prefs. Same-vault calls keep discovered manuscripts. */
export function bindWritingVault(vaultPath: string | null): void {
	const current = writingStore.getState();
	if (current.vaultPath === vaultPath) return;
	if (!vaultPath) {
		writingStore.setState({
			vaultPath: null,
			surface: "reading",
			activeRoot: null,
			activeFile: null,
			openFiles: [],
			recents: [],
			manuscripts: [],
			discovering: false,
			showTrash: false,
			historyOpen: false,
		});
		return;
	}
	const prefs = readWritingPrefs(vaultPath);
	writingStore.setState({
		vaultPath,
		surface: prefs.surface,
		activeRoot: prefs.activeRoot,
		activeFile: prefs.activeRoot,
		openFiles: prefs.activeRoot ? [prefs.activeRoot] : [],
		recents: prefs.recents,
		manuscripts: [],
		discovering: false,
		showTrash: false,
		historyOpen: false,
	});
}

export function setWritingSurface(surface: WorkspaceSurface): void {
	if (writingStore.getState().surface === surface) return;
	writingStore.setState({ surface });
	persist();
}

export function selectManuscript(rootFile: string): void {
	const state = writingStore.getState();
	const same =
		state.activeRoot != null &&
		normalizePath(state.activeRoot) === normalizePath(rootFile);
	const recents = touchRecent(state.recents, rootFile);
	const files = same
		? rememberWritingFile(state.openFiles, state.activeFile ?? rootFile)
		: [rootFile];
	writingStore.setState({
		surface: "writing",
		activeRoot: rootFile,
		activeFile: same ? (state.activeFile ?? rootFile) : rootFile,
		openFiles: files,
		recents,
		showTrash: false,
		...(same ? {} : { historyOpen: false }),
	});
	persist();
}

/** Leave the open project and return to the project list. Stays on writing. */
export function closeManuscript(): void {
	const state = writingStore.getState();
	if (!state.activeRoot && !state.activeFile && !state.showTrash) return;
	writingStore.setState({
		activeRoot: null,
		activeFile: null,
		openFiles: [],
		showTrash: false,
		historyOpen: false,
	});
	persist();
}

/** Show the vault recycle bin on the writing canvas. */
export function openWritingTrash(): void {
	writingStore.setState({
		showTrash: true,
		surface: "writing",
		historyOpen: false,
	});
}

/**
 * Drop a deleted project from the session. The path is already gone.
 * `file` removes one manuscript that lived directly in `thesis/`.
 * `directory` removes every recent under that project folder.
 */
export function forgetWritingProject(
	rootFile: string,
	scope: "directory" | "file" = "directory",
): void {
	const state = writingStore.getState();
	if (scope === "file") {
		const key = normalizePath(rootFile);
		const recents = state.recents.filter((item) => normalizePath(item) !== key);
		const hitsActive =
			state.activeRoot != null && normalizePath(state.activeRoot) === key;
		writingStore.setState({
			recents,
			...(hitsActive
				? {
						activeRoot: null,
						activeFile: null,
						openFiles: [],
						showTrash: false,
					}
				: {}),
		});
		persist();
		return;
	}
	const dirKey = normalizePath(manuscriptDir(rootFile));
	const recents = state.recents.filter((item) => {
		const itemDir = normalizePath(manuscriptDir(item));
		return itemDir !== dirKey && !itemDir.startsWith(`${dirKey}/`);
	});
	const activeDir = state.activeRoot
		? normalizePath(manuscriptDir(state.activeRoot))
		: "";
	const hitsActive =
		dirKey.length > 0 &&
		(activeDir === dirKey || activeDir.startsWith(`${dirKey}/`));
	writingStore.setState({
		recents,
		...(hitsActive
			? {
					activeRoot: null,
					activeFile: null,
					openFiles: [],
					showTrash: false,
				}
			: {}),
	});
	persist();
}

/** Open a source file in the writing editor. Does not touch the reading dock. */
export function setWritingFile(path: string): void {
	const state = writingStore.getState();
	writingStore.setState({
		activeFile: path,
		openFiles: rememberWritingFile(state.openFiles, path),
	});
}

/** Drop one writing tab. Closing the last tab leaves the project open with no editor. */
export function closeWritingFile(path: string): void {
	const state = writingStore.getState();
	const key = normalizePath(path);
	const index = state.openFiles.findIndex(
		(item) => normalizePath(item) === key,
	);
	if (index < 0) return;
	const next = state.openFiles.filter((_, item) => item !== index);
	const closingActive =
		state.activeFile != null && normalizePath(state.activeFile) === key;
	writingStore.setState({
		openFiles: next,
		activeFile: closingActive
			? (next[Math.min(index, next.length - 1)] ?? null)
			: state.activeFile,
	});
}

/** Keep one writing tab and close the rest. */
export function closeOtherWritingFiles(path: string): void {
	const state = writingStore.getState();
	const key = normalizePath(path);
	const kept = state.openFiles.filter((item) => normalizePath(item) === key);
	writingStore.setState({
		openFiles: kept,
		activeFile: kept[0] ?? null,
	});
}

/** Close every writing tab. The project and its PDF stay open. */
export function closeAllWritingFiles(): void {
	if (writingStore.getState().openFiles.length === 0) return;
	writingStore.setState({ openFiles: [], activeFile: null });
}

function rememberWritingFile(
	openFiles: readonly string[],
	path: string,
): string[] {
	const key = normalizePath(path);
	if (openFiles.some((item) => normalizePath(item) === key))
		return [...openFiles];
	return [...openFiles, path];
}

export function setDiscoveredManuscripts(manuscripts: Manuscript[]): void {
	writingStore.setState({ manuscripts, discovering: false });
}

export function setWritingDiscovering(discovering: boolean): void {
	writingStore.setState({ discovering });
}
