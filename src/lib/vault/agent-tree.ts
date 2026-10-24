/**
 * Sidebar projection for the vault Agent group.
 *
 * Disk layout stays put: `AGENTS.md` at the vault root, skills under
 * `.agents/skills/<id>/`. The file tree shows one Agent row whose children
 * are that file plus one row per skill. Package internals other than
 * `references/`, `scripts/`, and `assets/` stay out of the tree.
 */

import { joinPath, toVaultRelative } from "@/lib/core/path";
import { compareNaturalName } from "@/lib/core/sort";
import { normalizePathKey } from "@/lib/vault/path";
import type { FileNode } from "@/lib/vault/types";

const SKILL_PACKAGE_DIRS = new Set(["references", "scripts", "assets"]);
const MAX_SKILL_NAME_LEN = 64;

export type SkillTreeLabel = {
	/** Frontmatter `name`, or the skill directory name when that field is missing. */
	name: string;
	description: string;
};

function vaultRel(vaultPath: string, path: string): string {
	return toVaultRelative(vaultPath, path).replace(/\\/g, "/");
}

/** Vault-root `.agents` directory (not a nested folder of the same name). */
export function isVaultAgentRoot(
	vaultPath: string | null | undefined,
	path: string,
): boolean {
	if (!vaultPath) return false;
	return vaultRel(vaultPath, path).toLowerCase() === ".agents";
}

/** A skill package directory: `.agents/skills/<id>`. */
export function isVaultSkillDirectory(
	vaultPath: string | null | undefined,
	path: string,
): boolean {
	if (!vaultPath) return false;
	return /^\.agents\/skills\/[^/]+$/i.test(vaultRel(vaultPath, path));
}

function isRootAgentsMd(rel: string): boolean {
	return /^agents\.md$/i.test(rel);
}

function isSkillMarkdownName(name: string): boolean {
	return name.toLowerCase() === "skill.md";
}

function hasSkillMarkdown(dir: FileNode): boolean {
	return (dir.children ?? []).some(
		(child) => child.kind === "file" && isSkillMarkdownName(child.name),
	);
}

/** `SKILL.md` inside a skill directory, preserving the on-disk filename. */
export function skillMarkdownPath(node: FileNode): string | null {
	const file = node.children?.find(
		(child) => child.kind === "file" && isSkillMarkdownName(child.name),
	);
	return file?.path ?? null;
}

function visibleSkillPackageChildren(
	children: FileNode[] | undefined,
): FileNode[] {
	return (children ?? []).filter(
		(child) =>
			child.kind === "directory" &&
			SKILL_PACKAGE_DIRS.has(child.name.toLowerCase()),
	);
}

function projectAgentDir(
	agentsDir: FileNode,
	agentsMd: FileNode | null,
): FileNode {
	if (agentsDir.childrenPending) {
		const rest = (agentsDir.children ?? []).filter(
			(child) => child !== agentsMd,
		);
		return {
			...agentsDir,
			children: agentsMd ? [agentsMd, ...rest] : rest,
		};
	}
	const skillsBucket = agentsDir.children?.find(
		(child) =>
			child.kind === "directory" && child.name.toLowerCase() === "skills",
	);
	const skills = (skillsBucket?.children ?? [])
		.filter(
			(child) =>
				child.kind === "directory" &&
				(child.childrenPending || hasSkillMarkdown(child)),
		)
		.map((child) =>
			child.childrenPending
				? child
				: { ...child, children: visibleSkillPackageChildren(child.children) },
		);
	return {
		...agentsDir,
		childrenPending: false,
		children: [...(agentsMd ? [agentsMd] : []), ...skills],
	};
}

/**
 * Nest root `AGENTS.md` under `.agents` and replace that folder's listing
 * with skill packages. No `.agents` directory → the tree is unchanged.
 * Does not mutate `nodes`.
 */
export function projectAgentTree(
	nodes: FileNode[],
	vaultPath: string | null,
): FileNode[] {
	if (!vaultPath || nodes.length === 0) return nodes;
	const agentsDir = nodes.find(
		(node) =>
			node.kind === "directory" && isVaultAgentRoot(vaultPath, node.path),
	);
	if (!agentsDir) return nodes;
	const agentsMd =
		nodes.find(
			(node) =>
				node.kind === "file" && isRootAgentsMd(vaultRel(vaultPath, node.path)),
		) ?? null;
	const projected = projectAgentDir(agentsDir, agentsMd);
	return nodes
		.filter((node) => node !== agentsMd)
		.map((node) => (node === agentsDir ? projected : node));
}

/**
 * After the generic directory-first sort: keep `AGENTS.md` as the first child
 * of the Agent row, order skills by their display name, and place the Agent
 * row before the other vault-root entries.
 */
export function finishAgentTreeDisplay(
	nodes: FileNode[],
	vaultPath: string | null,
	labels: ReadonlyMap<string, Pick<SkillTreeLabel, "name">>,
): FileNode[] {
	if (!vaultPath) return nodes;
	const ordered = nodes.map((node) => {
		if (
			node.kind !== "directory" ||
			!isVaultAgentRoot(vaultPath, node.path) ||
			!node.children?.length
		) {
			return node;
		}
		const files = node.children.filter((child) => child.kind === "file");
		const dirs = node.children.filter((child) => child.kind === "directory");
		dirs.sort((a, b) =>
			compareNaturalName(
				labels.get(normalizePathKey(a.path))?.name ?? a.name,
				labels.get(normalizePathKey(b.path))?.name ?? b.name,
			),
		);
		return { ...node, children: [...files, ...dirs] };
	});
	const agentIndex = ordered.findIndex(
		(node) =>
			node.kind === "directory" && isVaultAgentRoot(vaultPath, node.path),
	);
	if (agentIndex < 0) return ordered;
	const agent = ordered[agentIndex];
	if (!agent) return ordered;
	const rest = ordered.filter((_, index) => index !== agentIndex);
	return [agent, ...rest];
}

export type SkillMarkdownRef = {
	dirPath: string;
	dirName: string;
	filePath: string;
};

/** Skill packages in the raw (unprojected) vault tree. */
export function listVaultSkillMarkdown(
	nodes: FileNode[],
	vaultPath: string | null,
): SkillMarkdownRef[] {
	if (!vaultPath) return [];
	const agentsDir = nodes.find(
		(node) =>
			node.kind === "directory" && isVaultAgentRoot(vaultPath, node.path),
	);
	const skills = agentsDir?.children?.find(
		(child) =>
			child.kind === "directory" && child.name.toLowerCase() === "skills",
	);
	const out: SkillMarkdownRef[] = [];
	for (const dir of skills?.children ?? []) {
		if (dir.kind !== "directory") continue;
		const file = dir.children?.find(
			(child) => child.kind === "file" && isSkillMarkdownName(child.name),
		);
		if (!file) continue;
		out.push({ dirPath: dir.path, dirName: dir.name, filePath: file.path });
	}
	return out;
}

/**
 * Row to highlight for a path the Agent projection hides.
 * `null` means the path is already a visible row (or unrelated).
 */
export function agentTreeHighlightPath(
	vaultPath: string | null,
	absPath: string,
): string | null {
	if (!vaultPath) return null;
	const rel = vaultRel(vaultPath, absPath);
	const skill = /^\.agents\/skills\/([^/]+)(?:\/(.*))?$/i.exec(rel);
	if (skill) {
		const id = skill[1];
		const rest = skill[2] ?? "";
		if (!id) return null;
		const skillDir = joinPath(vaultPath, `.agents/skills/${id}`);
		if (!rest) return null;
		const top = rest.split("/")[0]?.toLowerCase() ?? "";
		if (SKILL_PACKAGE_DIRS.has(top)) return null;
		return skillDir;
	}
	if (/^\.agents\/[^/]+$/i.test(rel)) {
		const base = rel.slice(rel.indexOf("/") + 1);
		if (base.toLowerCase() === "skills") return null;
		return joinPath(vaultPath, ".agents");
	}
	return null;
}

/**
 * Ancestor folders to expand when revealing `target`.
 * Root `AGENTS.md` also expands `.agents`. A hidden skill file highlights the
 * skill row without opening `references/` / `scripts/` / `assets/`.
 */
export function adjustAgentRevealAncestors(
	target: string,
	vaultPath: string | null,
	ancestors: string[],
): string[] {
	if (!vaultPath) return ancestors;
	const rel = vaultRel(vaultPath, target);
	let next = ancestors;
	if (isRootAgentsMd(rel)) {
		const root = joinPath(vaultPath, ".agents");
		const rootKey = normalizePathKey(root);
		if (!next.some((path) => normalizePathKey(path) === rootKey)) {
			next = [...next, root];
		}
	}
	const hidden = agentTreeHighlightPath(vaultPath, target);
	if (hidden && !isVaultAgentRoot(vaultPath, hidden)) {
		const hiddenKey = normalizePathKey(hidden);
		if (normalizePathKey(target) !== hiddenKey) {
			next = next.filter((path) => normalizePathKey(path) !== hiddenKey);
		}
	}
	return next;
}

/** First sentence of a skill description, for the row tooltip. */
export function skillDescriptionTooltip(description: string): string {
	const text = description.replace(/\s+/g, " ").trim();
	if (!text) return "";
	let end = text.length;
	const cn = text.indexOf("。");
	if (cn >= 0) end = Math.min(end, cn + 1);
	const en = text.search(/\.(\s|$)/);
	if (en >= 0) end = Math.min(end, en + 1);
	let sentence = text.slice(0, end).trim();
	if (sentence.length > 160) {
		sentence = `${sentence.slice(0, 159).trimEnd()}…`;
	}
	return sentence;
}

/**
 * Read `name` / `description` from a `SKILL.md` body.
 * Mirrors Host `scalar_field`: folded `>-` blocks and plain continuations.
 * An invalid `name` falls back to the directory name.
 */
export function parseSkillDocument(
	content: string,
	fallbackName: string,
): SkillTreeLabel {
	const block = frontmatterBlock(content);
	if (!block) return { name: fallbackName, description: "" };
	const name = scalarField(block, "name");
	const description = scalarField(block, "description") ?? "";
	return {
		name: name && validSkillName(name) ? name : fallbackName,
		description,
	};
}

function validSkillName(value: string): boolean {
	return (
		value.length > 0 &&
		value.length <= MAX_SKILL_NAME_LEN &&
		/^[a-z0-9-]+$/.test(value) &&
		!value.startsWith("-") &&
		!value.endsWith("-")
	);
}

function frontmatterBlock(content: string): string | null {
	let rest: string | null = null;
	if (content.startsWith("---\n")) rest = content.slice(4);
	else if (content.startsWith("---\r\n")) rest = content.slice(5);
	if (rest === null) return null;
	const close = rest.indexOf("\n---");
	if (close < 0) return null;
	return rest.slice(0, close);
}

function scalarField(frontmatter: string, key: string): string | null {
	const lines = frontmatter.split("\n").map((line) => line.replace(/\r$/, ""));
	const prefix = `${key}:`;
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index] ?? "";
		if (line.startsWith(" ") || line.startsWith("\t")) continue;
		if (!line.startsWith(prefix)) continue;
		const continuation: string[] = [];
		for (const next of lines.slice(index + 1)) {
			if (next.trim() === "" || next.startsWith(" ") || next.startsWith("\t")) {
				continuation.push(next);
				continue;
			}
			break;
		}
		const value = line.slice(prefix.length).trim();
		const head = value[0];
		let resolved: string;
		if (head === ">") resolved = foldBlock(continuation, false);
		else if (head === "|") resolved = foldBlock(continuation, true);
		else if (!value) resolved = foldBlock(continuation, false);
		else {
			let text = value;
			for (const part of continuation) {
				const trimmed = part.trim();
				if (!trimmed) continue;
				text += ` ${trimmed}`;
			}
			resolved = unquote(text.trim());
		}
		resolved = resolved.trim();
		return resolved ? resolved : null;
	}
	return null;
}

function foldBlock(lines: string[], literal: boolean): string {
	let indent = Number.POSITIVE_INFINITY;
	for (const line of lines) {
		if (!line.trim()) continue;
		indent = Math.min(indent, line.length - line.trimStart().length);
	}
	if (!Number.isFinite(indent)) indent = 0;
	let out = "";
	for (const line of lines) {
		const text = line.length >= indent ? line.slice(indent) : line.trimStart();
		if (literal) {
			if (out) out += "\n";
			out += text;
		} else if (!text.trim()) {
			out += "\n";
		} else {
			if (out && !out.endsWith("\n")) out += " ";
			out += text.trim();
		}
	}
	return out;
}

function unquote(value: string): string {
	if (value.length < 2) return value;
	const first = value[0];
	const last = value[value.length - 1];
	if ((first === '"' || first === "'") && first === last) {
		return value.slice(1, -1);
	}
	return value;
}
