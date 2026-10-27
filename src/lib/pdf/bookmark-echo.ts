import { normalizePathKey } from "@/lib/vault/path";

/** Watcher echoes of a bookmark write settle well within this window. */
const BOOKMARK_WRITE_TTL_MS = 4000;
const writes = new Map<string, number>();

/** Remember a PDF this editor is about to replace, so the watcher does not reload it. */
export function noteBookmarkWrite(path: string): void {
	const now = Date.now();
	writes.set(normalizePathKey(path), now + BOOKMARK_WRITE_TTL_MS);
	for (const [key, expiresAt] of writes) {
		if (expiresAt <= now) writes.delete(key);
	}
}

/** True when `path` is a bookmark write's own watcher echo. */
export function isRecentBookmarkWrite(path: string): boolean {
	const expiresAt = writes.get(normalizePathKey(path));
	return expiresAt !== undefined && expiresAt > Date.now();
}

/** Test isolation. */
export function clearBookmarkWrites(): void {
	writes.clear();
}
