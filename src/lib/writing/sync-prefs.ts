/**
 * When the writing folder is pushed. The address itself lives with the
 * GitHub link. Nothing here runs until that link exists.
 */

import {
	readJsonStorage,
	type StorageLike,
	writeJsonStorage,
} from "@/lib/core/storage";

export const WRITING_SYNC_MODE_KEY = "agentero.writing.syncMode.v1";

export const WRITING_SYNC_INTERVALS = [5, 15, 30, 60] as const;

export type WritingSyncMode = "manual" | "onCompile" | "interval";

export type WritingSyncPrefs = {
	mode: WritingSyncMode;
	intervalMinutes: number;
};

const DEFAULT_PREFS: WritingSyncPrefs = {
	mode: "onCompile",
	intervalMinutes: 15,
};

type Stored = Record<string, WritingSyncPrefs>;

function clean(value: unknown): WritingSyncPrefs {
	if (!value || typeof value !== "object") return DEFAULT_PREFS;
	const record = value as Partial<WritingSyncPrefs>;
	const mode =
		record.mode === "manual" ||
		record.mode === "onCompile" ||
		record.mode === "interval"
			? record.mode
			: DEFAULT_PREFS.mode;
	const minutes = WRITING_SYNC_INTERVALS.find(
		(item) => item === record.intervalMinutes,
	);
	return {
		mode,
		intervalMinutes: minutes ?? DEFAULT_PREFS.intervalMinutes,
	};
}

export function readWritingSyncPrefs(
	vaultPath: string,
	storage?: StorageLike | null,
): WritingSyncPrefs {
	const map = readJsonStorage<Stored>(WRITING_SYNC_MODE_KEY, {}, storage);
	return clean(map?.[vaultPath]);
}

export function writeWritingSyncPrefs(
	vaultPath: string,
	prefs: WritingSyncPrefs,
	storage?: StorageLike | null,
): void {
	const map = readJsonStorage<Stored>(WRITING_SYNC_MODE_KEY, {}, storage);
	writeJsonStorage(
		WRITING_SYNC_MODE_KEY,
		{ ...map, [vaultPath]: clean(prefs) },
		storage,
	);
}
