/**
 * Explicit git sync for the writing folder. Autosave does not call this.
 */

import { invoke } from "@tauri-apps/api/core";
import type { ApiResult } from "@/lib/core/bindings";

export type WritingSyncReport = {
	committed: boolean;
	pushed: boolean;
	remote: boolean;
	code: string;
	detail: string;
};

export async function syncWritingProject(
	thesisDir: string,
	remote: string,
	branch: string,
): Promise<WritingSyncReport> {
	const result = await invoke<ApiResult<WritingSyncReport>>(
		"writing_sync_project",
		{ thesisDir, remote, branch },
	);
	if (!result.ok || result.data == null) {
		throw new Error(result.error?.message ?? "writing_sync_project");
	}
	return result.data;
}

export type WritingGitFile = {
	path: string;
	added: number;
	removed: number;
};

export type WritingGitCommit = {
	id: string;
	at: number;
	summary: string;
	files: WritingGitFile[];
};

export type WritingGitLog = {
	code: string;
	commits: WritingGitCommit[];
};

export type WritingGitDiff = {
	code: string;
	patch: string;
	truncated: boolean;
};

export async function loadWritingGitLog(
	thesisDir: string,
): Promise<WritingGitLog> {
	const result = await invoke<ApiResult<WritingGitLog>>("writing_git_log", {
		thesisDir,
	});
	if (!result.ok || result.data == null) {
		throw new Error(result.error?.message ?? "writing_git_log");
	}
	return result.data;
}

export async function loadWritingGitDiff(
	thesisDir: string,
	commit: string,
): Promise<WritingGitDiff> {
	const result = await invoke<ApiResult<WritingGitDiff>>("writing_git_diff", {
		thesisDir,
		commit,
	});
	if (!result.ok || result.data == null) {
		throw new Error(result.error?.message ?? "writing_git_diff");
	}
	return result.data;
}

export async function restoreWritingRevision(
	thesisDir: string,
	commit: string,
): Promise<WritingSyncReport> {
	const result = await invoke<ApiResult<WritingSyncReport>>(
		"writing_git_restore",
		{ thesisDir, commit },
	);
	if (!result.ok || result.data == null) {
		throw new Error(result.error?.message ?? "writing_git_restore");
	}
	return result.data;
}
