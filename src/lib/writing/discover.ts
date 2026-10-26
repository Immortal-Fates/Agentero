/**
 * Find TeX roots under the vault's thesis/ directory.
 * One level of nested folders is enough for a main file plus chapter dirs.
 */

import { normalizePath } from "@/lib/core/path";
import {
	type FileNode,
	joinVaultPath,
	listVaultDirChildren,
	readVaultFile,
} from "@/lib/vault";
import { resolveTexRoot } from "@/lib/workspace/tex-compile";
import { isWritingSourceName } from "@/lib/writing/files";
import {
	type Manuscript,
	manuscriptFromRoot,
	writingProjectTitle,
} from "@/lib/writing/session";

const ROOT_BUDGET = 32;
const FILES_PER_DIR = 24;
const DIRS_PER_LEVEL = 12;

function isTexFile(path: string): boolean {
	return /\.tex$/i.test(path);
}

async function collectRoots(
	vaultPath: string,
	dir: string,
	depth: number,
	budget: { left: number },
): Promise<string[]> {
	if (budget.left <= 0) return [];
	let children: FileNode[];
	try {
		children = await listVaultDirChildren(vaultPath, dir);
	} catch {
		return [];
	}
	const roots: string[] = [];
	const texFiles = children
		.filter((node) => node.kind === "file" && isTexFile(node.path))
		.slice(0, FILES_PER_DIR);
	for (const file of texFiles) {
		if (budget.left <= 0) break;
		budget.left -= 1;
		roots.push(await resolveTexRoot(file.path));
	}
	if (depth <= 0) return roots;
	const directories = children
		.filter(
			(node) =>
				node.kind === "directory" &&
				isWritingSourceName("directory", node.name),
		)
		.slice(0, DIRS_PER_LEVEL);
	for (const directory of directories) {
		roots.push(
			...(await collectRoots(vaultPath, directory.path, depth - 1, budget)),
		);
	}
	return roots;
}

async function projectFromRoot(rootFile: string): Promise<Manuscript> {
	let head = "";
	try {
		head = (await readVaultFile(rootFile)).slice(0, 8000);
	} catch {
		head = "";
	}
	const base = manuscriptFromRoot(rootFile);
	return { ...base, title: writingProjectTitle(rootFile, head) };
}

/**
 * Independently compilable TeX projects under thesis/.
 * Chapters that resolve to a parent main file stay inside that project.
 */
export async function discoverWritingProjects(
	vaultPath: string,
): Promise<Manuscript[]> {
	const roots = await collectRoots(
		vaultPath,
		joinVaultPath(vaultPath, "thesis"),
		1,
		{ left: ROOT_BUDGET },
	);
	const seen = new Set<string>();
	const unique: string[] = [];
	for (const root of roots) {
		const key = normalizePath(root);
		if (seen.has(key)) continue;
		seen.add(key);
		unique.push(root);
	}
	const manuscripts = await Promise.all(unique.map(projectFromRoot));
	manuscripts.sort((a, b) => {
		if (!a.title && b.title) return 1;
		if (a.title && !b.title) return -1;
		return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
	});
	return manuscripts;
}
