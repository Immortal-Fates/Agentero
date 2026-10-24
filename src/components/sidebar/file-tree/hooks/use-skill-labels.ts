/**
 * Frontmatter `name` / `description` for skill rows. The tree lists directory
 * names until these reads finish; a missing or invalid `name` stays the
 * directory name.
 */
import { useEffect, useState } from "react";
import {
	listVaultSkillMarkdown,
	parseSkillDocument,
	type SkillTreeLabel,
} from "@/lib/vault/agent-tree";
import { readVaultFile } from "@/lib/vault/fs";
import { normalizePathKey } from "@/lib/vault/path";
import type { FileNode } from "@/lib/vault/types";

export function useSkillLabels(
	vaultPath: string | null,
	nodes: FileNode[],
): ReadonlyMap<string, SkillTreeLabel> {
	const [labels, setLabels] = useState<ReadonlyMap<string, SkillTreeLabel>>(
		() => new Map(),
	);

	useEffect(() => {
		const skills = listVaultSkillMarkdown(nodes, vaultPath);
		if (!vaultPath || skills.length === 0) {
			setLabels(new Map());
			return;
		}
		let cancelled = false;
		void (async () => {
			const next = new Map<string, SkillTreeLabel>();
			await Promise.all(
				skills.map(async (skill) => {
					try {
						const text = await readVaultFile(skill.filePath);
						next.set(
							normalizePathKey(skill.dirPath),
							parseSkillDocument(text, skill.dirName),
						);
					} catch {
						// Keep the directory name when the file can't be read.
					}
				}),
			);
			if (!cancelled) setLabels(next);
		})();
		return () => {
			cancelled = true;
		};
	}, [nodes, vaultPath]);

	return labels;
}
