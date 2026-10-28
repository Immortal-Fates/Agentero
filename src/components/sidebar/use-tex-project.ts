/**
 * TeX file the sidebar panel should follow for the active document.
 * Keeps the previous project until the next root lookup lands, so switching
 * to the compiled PDF does not unmount the panel for a frame.
 */

import { useEffect, useState } from "react";
import { useStore } from "zustand";
import { isPapersRoot, isUnderPapers } from "@/lib/paper";
import { texSettingsStore } from "@/lib/tex/config";
import {
	reduceTexProject,
	siblingTexPath,
	type TexProject,
} from "@/lib/tex/project";
import { vaultPathExists } from "@/lib/vault/fs";
import { vaultRelativePath } from "@/lib/vault/path";
import { resolveTexRoot } from "@/lib/workspace/tex-compile";
import { isTexPath } from "@/lib/workspace/viewer";

async function texToResolve(activePath: string): Promise<string | null> {
	if (isTexPath(activePath)) return activePath;
	const sibling = siblingTexPath(activePath);
	if (!sibling) return null;
	try {
		return (await vaultPathExists(sibling)) ? sibling : null;
	} catch {
		return null;
	}
}

export function useTexProject(
	vaultPath: string | null,
	activePath: string | null,
	activeTexRoot?: string | null,
): string | null {
	const roots = useStore(texSettingsStore, (state) => state.roots);
	const [project, setProject] = useState<TexProject | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: persisted root overrides invalidate resolveTexRoot.
	useEffect(() => {
		if (
			!vaultPath ||
			!activePath ||
			isPapersRoot(activePath) ||
			isUnderPapers(activePath) ||
			vaultRelativePath(vaultPath, activePath) === null
		) {
			setProject(null);
			return;
		}
		let cancelled = false;
		void (async () => {
			const resolvedFrom = activeTexRoot ?? (await texToResolve(activePath));
			const rootFile = resolvedFrom ? await resolveTexRoot(resolvedFrom) : null;
			if (cancelled) return;
			setProject((previous) =>
				reduceTexProject(previous, activePath, rootFile, resolvedFrom),
			);
		})().catch(() => {
			if (!cancelled) setProject(null);
		});
		return () => {
			cancelled = true;
		};
	}, [vaultPath, activePath, activeTexRoot, roots]);

	return project?.texPath ?? null;
}
