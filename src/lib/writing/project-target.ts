import { normalizePath } from "@/lib/core/path";
import { joinVaultPath, vaultRelativePath } from "@/lib/vault/path";
import { resolveTexPdfPath, resolveTexRoot } from "@/lib/workspace/tex-compile";
import { findTexRoot } from "./discover";

export function isWritingPath(vault: string, path: string): boolean {
	const rel = vaultRelativePath(vault, path);
	return Boolean(rel?.toLowerCase().startsWith("thesis/"));
}

/** Membership follows a project directory, including its non-TeX assets. */
export async function resolveWritingTarget(
	vault: string,
	path: string,
	directory = false,
) {
	const rel = vaultRelativePath(vault, path);
	if (!rel || !isWritingPath(vault, path)) return null;
	const parts = rel.split("/");
	const hasProjectFolder = directory || parts.length > 2;
	let root = hasProjectFolder
		? await findTexRoot(vault, joinVaultPath(vault, `thesis/${parts[1]}`), 1)
		: null;
	// Support older vaults with main.tex directly in thesis/, but never borrow
	// another project's root for an unrelated folder.
	if (!root) root = await findTexRoot(vault, joinVaultPath(vault, "thesis"), 0);
	if (!root) return null;
	root = await resolveTexRoot(root);
	const compiledPdf =
		/\.pdf$/i.test(path) &&
		normalizePath(path) === normalizePath(await resolveTexPdfPath(root));
	return { root, compiledPdf };
}
