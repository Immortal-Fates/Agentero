/**
 * Create one compilable TeX project under the vault's thesis/ shelf.
 * The folder name is the project; thesis/ itself is not a project.
 */

import { errorText } from "@/lib/core/error";
import {
	isValidVaultEntryName,
	joinVaultPath,
	vaultPathExists,
	writeVaultFile,
} from "@/lib/vault";
import { refreshTree } from "@/lib/vault/store";
import {
	type WritingTemplateId,
	writingTemplateFiles,
} from "@/lib/writing/templates";

export type CreateWritingProjectResult =
	| { ok: true; rootFile: string }
	| { ok: false; reason: "invalid" | "exists" | "failed"; message?: string };

export async function createWritingProject(
	vaultPath: string,
	name: string,
	template: WritingTemplateId = "blank",
): Promise<CreateWritingProjectResult> {
	const trimmed = name.trim();
	if (!isValidVaultEntryName(trimmed)) return { ok: false, reason: "invalid" };
	const dir = joinVaultPath(joinVaultPath(vaultPath, "thesis"), trimmed);
	const rootFile = joinVaultPath(dir, "main.tex");
	if ((await vaultPathExists(dir)) || (await vaultPathExists(rootFile))) {
		return { ok: false, reason: "exists" };
	}
	const starter = writingTemplateFiles(template, trimmed);
	try {
		for (const file of starter) {
			await writeVaultFile(joinVaultPath(dir, file.name), file.contents);
		}
		await refreshTree(vaultPath);
	} catch (error) {
		return { ok: false, reason: "failed", message: errorText(error) };
	}
	return { ok: true, rootFile };
}
