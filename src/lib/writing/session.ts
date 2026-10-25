/**
 * One writing project the surface can open.
 * The root file is the TeX main file. The title prefers `\title`, then a
 * directory name that is not the thesis shelf.
 */

import { basenameOf, dirnameOf, normalizePath } from "@/lib/core/path";
import {
	readJsonStorage,
	type StorageLike,
	writeJsonStorage,
} from "@/lib/core/storage";
import { vaultRelativePath } from "@/lib/vault/path";

export const WRITING_STORAGE_KEY = "agentero.writing.v1";
export const WRITING_RECENT_LIMIT = 8;

export type WorkspaceSurface = "reading" | "writing";

export type Manuscript = {
	/** Absolute path of the resolved TeX root file. */
	rootFile: string;
	/** Name shown in the project list. Empty until a title is known. */
	title: string;
	fileName: string;
};

export type WritingVaultPrefs = {
	surface: WorkspaceSurface;
	activeRoot: string | null;
	recents: string[];
};

const EMPTY_PREFS: WritingVaultPrefs = {
	surface: "reading",
	activeRoot: null,
	recents: [],
};

export function manuscriptFromRoot(rootFile: string): Manuscript {
	const fileName = basenameOf(rootFile);
	const title = basenameOf(dirnameOf(rootFile)) || fileName;
	return { rootFile, title, fileName };
}

/** First `\title{...}` in a TeX preamble, without a nested group. */
export function texDocumentTitle(source: string): string | null {
	const match = source.match(/\\title\s*\{([^{}]*)\}/);
	if (!match) return null;
	const text = match[1]
		.replace(/\\[a-zA-Z]+/g, "")
		.replace(/\s+/g, " ")
		.trim();
	return text || null;
}

/**
 * Name a project the way a person would. The vault folder `thesis` is the
 * shelf, not the project's name.
 */
export function writingProjectTitle(
	rootFile: string,
	sourceHead: string,
): string {
	const titled = texDocumentTitle(sourceHead);
	if (titled) return titled;
	const dir = basenameOf(manuscriptDir(rootFile));
	if (dir && dir.toLowerCase() !== "thesis") return dir;
	const stem = basenameOf(rootFile).replace(/\.tex$/i, "");
	if (!/^(main|thesis)$/i.test(stem)) return stem;
	return "";
}

/** Parent directory of the root file, keeping the path's own separators. */
export function manuscriptDir(rootFile: string): string {
	const trimmed = rootFile.replace(/[\\/]+$/, "");
	const index = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
	return index <= 0 ? "" : trimmed.slice(0, index);
}

export function touchRecent(
	recents: readonly string[],
	rootFile: string,
): string[] {
	const key = normalizePath(rootFile);
	return [
		rootFile,
		...recents.filter((item) => normalizePath(item) !== key),
	].slice(0, WRITING_RECENT_LIMIT);
}

/**
 * Active manuscript, then recents, then anything discovered under thesis/.
 * The same root file appears once.
 */
export function mergeManuscripts(
	discovered: readonly Manuscript[],
	recents: readonly string[],
	activeRoot: string | null,
): Manuscript[] {
	const byRoot = new Map(
		discovered.map((item) => [normalizePath(item.rootFile), item]),
	);
	const ordered: Manuscript[] = [];
	const seen = new Set<string>();
	const push = (rootFile: string) => {
		const key = normalizePath(rootFile);
		if (seen.has(key)) return;
		seen.add(key);
		ordered.push(byRoot.get(key) ?? manuscriptFromRoot(rootFile));
	};
	if (activeRoot) push(activeRoot);
	for (const recent of recents) push(recent);
	for (const item of discovered) push(item.rootFile);
	return ordered;
}

function parseOne(value: unknown): WritingVaultPrefs | null {
	if (!value || typeof value !== "object") return null;
	const record = value as Record<string, unknown>;
	const surface: WorkspaceSurface =
		record.surface === "writing" ? "writing" : "reading";
	const activeRoot =
		typeof record.activeRoot === "string" && record.activeRoot.length > 0
			? record.activeRoot
			: null;
	const recents = Array.isArray(record.recents)
		? record.recents
				.filter(
					(item): item is string => typeof item === "string" && item.length > 0,
				)
				.slice(0, WRITING_RECENT_LIMIT)
		: [];
	return { surface, activeRoot, recents };
}

export function parseWritingVaults(
	raw: unknown,
): Record<string, WritingVaultPrefs> {
	if (!raw || typeof raw !== "object") return {};
	const vaults = (raw as { vaults?: unknown }).vaults;
	if (!vaults || typeof vaults !== "object") return {};
	const out: Record<string, WritingVaultPrefs> = {};
	for (const [vault, value] of Object.entries(vaults)) {
		if (!vault) continue;
		const prefs = parseOne(value);
		if (prefs) out[vault] = prefs;
	}
	return out;
}

function insideVault(vaultPath: string, path: string): boolean {
	return vaultRelativePath(vaultPath, path) != null;
}

/** Drop roots that do not belong to this vault. Missing vaults read as reading. */
export function prefsForVault(
	vaultPath: string,
	raw: unknown,
): WritingVaultPrefs {
	const stored = parseWritingVaults(raw)[vaultPath];
	if (!stored) return { ...EMPTY_PREFS };
	return {
		surface: stored.surface,
		activeRoot:
			stored.activeRoot && insideVault(vaultPath, stored.activeRoot)
				? stored.activeRoot
				: null,
		recents: stored.recents.filter((path) => insideVault(vaultPath, path)),
	};
}

export function readWritingPrefs(
	vaultPath: string,
	storage?: StorageLike | null,
): WritingVaultPrefs {
	const raw = readJsonStorage<unknown>(WRITING_STORAGE_KEY, null, storage);
	return prefsForVault(vaultPath, raw);
}

export function writeWritingPrefs(
	vaultPath: string,
	prefs: WritingVaultPrefs,
	storage?: StorageLike | null,
): void {
	const raw = readJsonStorage<unknown>(WRITING_STORAGE_KEY, null, storage);
	const vaults = parseWritingVaults(raw);
	vaults[vaultPath] = {
		surface: prefs.surface,
		activeRoot: prefs.activeRoot,
		recents: prefs.recents.slice(0, WRITING_RECENT_LIMIT),
	};
	writeJsonStorage(WRITING_STORAGE_KEY, { vaults }, storage);
}
