/**
 * One-shot desktop run. Kept out of `perf.ts` so span helpers do not import
 * the workspace.
 */

import {
	markOnce,
	perfActive,
	perfAnchor,
	perfBoot,
	perfEmit,
	perfFlush,
	perfMarked,
	perfSettled,
	waitMark,
} from "@/lib/core/perf";

let runStarted = false;

function nextFrame(): Promise<void> {
	return new Promise((resolve) => {
		requestAnimationFrame(() => resolve());
	});
}

/**
 * Wait until a PDF host and/or the markdown editor have mounted and reported
 * ready. Viewers that never mount are not waited on.
 */
async function waitForViewers(): Promise<void> {
	const want = new Set<string>();
	let quiet = 0;
	for (let i = 0; i < 180; i++) {
		await nextFrame();
		const before = want.size;
		if (document.getElementById("agentero-pdf-host")) {
			want.add("pdf_first_page");
		}
		if (document.querySelector("[data-agentero-editor]")) {
			want.add("notes_editor_ready");
		}
		if (want.size === 0) continue;
		const pending = [...want].filter((name) => !perfMarked(name));
		if (pending.length === 0 && want.size === before) {
			quiet += 1;
			if (quiet >= 3) return;
		} else {
			quiet = 0;
		}
	}
	await Promise.all(
		[...want]
			.filter((name) => !perfMarked(name))
			.map((name) => waitMark(name, 60_000)),
	);
}

async function openPerfTarget(vault: string, rel: string): Promise<void> {
	const { joinVaultPath } = await import("@/lib/vault/path");
	const abs = joinVaultPath(vault, rel);
	const { stat } = await import("@tauri-apps/plugin-fs");
	const info = await stat(abs);
	perfAnchor("open");
	if (info.isDirectory) {
		const { openPaper } = await import("@/lib/workspace/actions");
		openPaper(abs);
		return;
	}
	const { openPath } = await import("@/lib/workspace/actions");
	openPath(abs);
}

/**
 * No-op unless `AGENTERO_PERF=1`.
 * Opens `AGENTERO_PERF_VAULT` and, when set, `AGENTERO_PERF_OPEN`, then exits.
 */
export function startPerfRun(): void {
	if (runStarted || !perfActive()) return;
	runStarted = true;
	void runPerf();
}

async function runPerf(): Promise<void> {
	const cfg = perfBoot();
	try {
		const vault = cfg?.vault?.trim();
		if (vault) {
			const { openLocalVaultPath } = await import("@/lib/vault/actions");
			await openLocalVaultPath(vault);
			await nextFrame();
			await perfSettled();
			await nextFrame();
			await nextFrame();
			markOnce("vault_interactive");
			const open = cfg?.open?.trim();
			if (open) {
				await openPerfTarget(vault, open);
				await waitForViewers();
				await nextFrame();
				await nextFrame();
			}
		} else {
			await nextFrame();
			await nextFrame();
			markOnce("vault_interactive");
		}
	} catch (error) {
		perfEmit(
			"perf_run",
			performance.now() * 1000,
			false,
			error instanceof Error ? error.message : String(error),
		);
	} finally {
		await perfFlush();
		try {
			const { getCurrentWindow } = await import("@tauri-apps/api/window");
			await getCurrentWindow().close();
		} catch {
			// The harness still has the trace file if the window is already gone.
		}
	}
}
