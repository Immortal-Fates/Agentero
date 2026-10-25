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

export type CreateWritingProjectResult =
	| { ok: true; rootFile: string }
	| { ok: false; reason: "invalid" | "exists" | "failed"; message?: string };

function latexText(name: string): string {
	return name
		.replace(/\\/g, "\\textbackslash{}")
		.replace(/([&%$#_{}])/g, "\\$1");
}

export async function createWritingProject(
	vaultPath: string,
	name: string,
): Promise<CreateWritingProjectResult> {
	const trimmed = name.trim();
	if (!isValidVaultEntryName(trimmed)) return { ok: false, reason: "invalid" };
	const dir = joinVaultPath(joinVaultPath(vaultPath, "thesis"), trimmed);
	const rootFile = joinVaultPath(dir, "main.tex");
	if ((await vaultPathExists(dir)) || (await vaultPathExists(rootFile))) {
		return { ok: false, reason: "exists" };
	}
	const source = [
		"\\documentclass{article}",
		`\\title{${latexText(trimmed)}}`,
		"\\author{}",
		"\\begin{document}",
		"\\maketitle",
		"",
		"\\end{document}",
		"",
	].join("\n");
	try {
		await writeVaultFile(rootFile, source);
		await refreshTree(vaultPath);
	} catch (error) {
		return { ok: false, reason: "failed", message: errorText(error) };
	}
	return { ok: true, rootFile };
}
