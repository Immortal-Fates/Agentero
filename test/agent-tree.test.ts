import { describe, expect, it } from "vitest";
import { sortFileTreeNodes } from "@/lib/paper";
import {
	adjustAgentRevealAncestors,
	agentTreeHighlightPath,
	finishAgentTreeDisplay,
	isVaultAgentRoot,
	isVaultSkillDirectory,
	parseSkillDocument,
	projectAgentTree,
	skillDescriptionTooltip,
} from "@/lib/vault/agent-tree";
import type { FileNode } from "@/lib/vault/types";

function dir(path: string, children: FileNode[] = []): FileNode {
	const name = path.split("/").pop() ?? path;
	return { id: path, name, path, kind: "directory", children };
}

function file(path: string): FileNode {
	const name = path.split("/").pop() ?? path;
	return { id: path, name, path, kind: "file" };
}

const vault = "/vault";

function sampleTree(): FileNode[] {
	return [
		dir(`${vault}/papers`, [dir(`${vault}/papers/a`)]),
		dir(`${vault}/notes`),
		dir(`${vault}/.agents`, [
			file(`${vault}/.agents/README.md`),
			dir(`${vault}/.agents/skills`, [
				file(`${vault}/.agents/skills/README.md`),
				dir(`${vault}/.agents/skills/paper-reader`, [
					file(`${vault}/.agents/skills/paper-reader/SKILL.md`),
					file(`${vault}/.agents/skills/paper-reader/LICENSE`),
					dir(`${vault}/.agents/skills/paper-reader/references`, [
						file(`${vault}/.agents/skills/paper-reader/references/guide.md`),
					]),
				]),
				dir(`${vault}/.agents/skills/not-a-skill`, [
					file(`${vault}/.agents/skills/not-a-skill/notes.md`),
				]),
			]),
		]),
		file(`${vault}/AGENTS.md`),
		dir(`${vault}/notes-extra`, [
			dir(`${vault}/notes-extra/.agents`, [
				file(`${vault}/notes-extra/.agents/SKILL.md`),
			]),
		]),
	];
}

describe("projectAgentTree", () => {
	it("nests AGENTS.md under .agents and keeps one row per skill", () => {
		const nodes = sampleTree();
		const projected = projectAgentTree(nodes, vault);
		expect(projected.some((node) => node.name === "AGENTS.md")).toBe(false);
		const agent = projected.find((node) => node.name === ".agents");
		expect(agent?.children?.map((child) => child.name)).toEqual([
			"AGENTS.md",
			"paper-reader",
		]);
		const skill = agent?.children?.find(
			(child) => child.name === "paper-reader",
		);
		expect(skill?.children?.map((child) => child.name)).toEqual(["references"]);
		const nested = projected.find((node) => node.name === "notes-extra");
		expect(nested?.children?.[0]?.name).toBe(".agents");
		expect(nodes.some((node) => node.name === "AGENTS.md")).toBe(true);
	});

	it("leaves a root AGENTS.md in place when .agents is absent", () => {
		const nodes = [file(`${vault}/AGENTS.md`), dir(`${vault}/notes`)];
		expect(projectAgentTree(nodes, vault)).toBe(nodes);
	});

	it("is a vault-root path, not a nested .agents folder", () => {
		expect(isVaultAgentRoot(vault, `${vault}/.agents`)).toBe(true);
		expect(isVaultAgentRoot(vault, `${vault}/notes/.agents`)).toBe(false);
		expect(isVaultAgentRoot("C:\\Research", "C:\\Research\\.agents")).toBe(
			true,
		);
		expect(
			isVaultSkillDirectory(vault, `${vault}/.agents/skills/paper-reader`),
		).toBe(true);
		expect(
			isVaultSkillDirectory(
				vault,
				`${vault}/notes/.agents/skills/paper-reader`,
			),
		).toBe(false);
	});
});

describe("finishAgentTreeDisplay", () => {
	it("places Agent before other root entries and skills by display name", () => {
		const projected = projectAgentTree(
			[
				dir(`${vault}/.agents`, [
					dir(`${vault}/.agents/skills`, [
						dir(`${vault}/.agents/skills/zeta`, [
							file(`${vault}/.agents/skills/zeta/SKILL.md`),
						]),
						dir(`${vault}/.agents/skills/alpha`, [
							file(`${vault}/.agents/skills/alpha/SKILL.md`),
						]),
					]),
				]),
				dir(`${vault}/papers`),
				dir(`${vault}/notes`),
				file(`${vault}/AGENTS.md`),
				file(`${vault}/OTHER.md`),
			],
			vault,
		);
		const sorted = sortFileTreeNodes(projected, "folder");
		const labels = new Map([
			[`${vault}/.agents/skills/zeta`.toLowerCase(), { name: "aaa" }],
			[`${vault}/.agents/skills/alpha`.toLowerCase(), { name: "mmm" }],
		]);
		const display = finishAgentTreeDisplay(sorted, vault, labels);
		expect(display.map((node) => node.name)).toEqual([
			".agents",
			"notes",
			"papers",
			"OTHER.md",
		]);
		expect(display[0]?.children?.map((child) => child.name)).toEqual([
			"AGENTS.md",
			"zeta",
			"alpha",
		]);
	});
});

describe("agent tree reveal", () => {
	it("highlights the skill row for hidden package files", () => {
		expect(
			agentTreeHighlightPath(
				vault,
				`${vault}/.agents/skills/paper-reader/SKILL.md`,
			),
		).toBe(`${vault}/.agents/skills/paper-reader`);
		expect(
			agentTreeHighlightPath(
				vault,
				`${vault}/.agents/skills/paper-reader/references/guide.md`,
			),
		).toBeNull();
		expect(agentTreeHighlightPath(vault, `${vault}/.agents/README.md`)).toBe(
			`${vault}/.agents`,
		);
		expect(agentTreeHighlightPath(vault, `${vault}/AGENTS.md`)).toBeNull();
	});

	it("expands .agents for AGENTS.md without opening the skill package", () => {
		expect(adjustAgentRevealAncestors(`${vault}/AGENTS.md`, vault, [])).toEqual(
			[`${vault}/.agents`],
		);
		expect(
			adjustAgentRevealAncestors(
				`${vault}/.agents/skills/paper-reader/SKILL.md`,
				vault,
				[
					`${vault}/.agents`,
					`${vault}/.agents/skills`,
					`${vault}/.agents/skills/paper-reader`,
				],
			),
		).toEqual([`${vault}/.agents`, `${vault}/.agents/skills`]);
	});
});

describe("parseSkillDocument", () => {
	it("reads the frontmatter name and folds the description", () => {
		const parsed = parseSkillDocument(
			"---\nname: paper-reader\ndescription: >-\n  用中文讲解。\n  用于提炼。\n---\n# Paper Reader\n",
			"dir",
		);
		expect(parsed.name).toBe("paper-reader");
		expect(parsed.description).toBe("用中文讲解。 用于提炼。");
		expect(skillDescriptionTooltip(parsed.description)).toBe("用中文讲解。");
	});

	it("falls back to the directory name when name is missing or invalid", () => {
		expect(parseSkillDocument("# Body\n", "paper-reader").name).toBe(
			"paper-reader",
		);
		expect(
			parseSkillDocument("---\nname: Paper Reader\n---\n", "paper-reader").name,
		).toBe("paper-reader");
	});

	it("reads a CRLF name", () => {
		expect(
			parseSkillDocument("---\r\nname: crlf-skill\r\n---\r\n", "dir").name,
		).toBe("crlf-skill");
	});
});
