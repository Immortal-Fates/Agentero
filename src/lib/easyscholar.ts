/**
 * EasyScholar key/probe helpers.
 *
 * Metrics are fetched and parsed by the Host (`paper_sync_publication`); the
 * renderer no longer builds `#easyscholar:` tags itself. This module keeps the
 * settings-facing helpers and the shared namespace predicate.
 */

import { commands } from "@/lib/core/bindings";
import { callApi } from "@/lib/core/ipc";
import { isTauri } from "@/lib/core/tauri";
import {
	EASY_SCHOLAR_TAG_PREFIX,
	isEasyScholarTagName,
} from "@/lib/paper/tag-namespaces";

export { EASY_SCHOLAR_TAG_PREFIX };

export type EasyScholarProbeStatus = "idle" | "probing" | "ok" | "fail";

/** Whether a tag belongs to the EasyScholar namespace. */
export function isEasyScholarTag(tag: string): boolean {
	return isEasyScholarTagName(tag);
}

/**
 * Probe the configured EasyScholar key through the Host. The WebView never
 * sees the plaintext secret; the Host reads it from durable settings.
 */
export async function probeEasyScholarKey(
	signal?: AbortSignal,
): Promise<boolean> {
	if (!isTauri()) return false;
	try {
		const ok = await callApi(() => commands.easyScholarProbe(), {
			fallback: "EasyScholar probe failed",
		});
		if (signal?.aborted) return false;
		return ok;
	} catch {
		return false;
	}
}
