import { describe, expect, it, vi } from "vitest";
import type { FileNode } from "@/lib/vault/types";
import {
	compareWritingNodes,
	isWritingSourceName,
	withoutNestedProjects,
} from "@/lib/writing/files";
import {
	manuscriptDir,
	manuscriptFromRoot,
	mergeManuscripts,
	parseWritingVaults,
	prefsForVault,
	texDocumentTitle,
	touchRecent,
	WRITING_RECENT_LIMIT,
	writingProjectTitle,
	writingProjectTrashRel,
} from "@/lib/writing/session";

vi.mock("@/lib/vault", () => ({
	joinVaultPath: (vaultPath: string, rel: string) => `${vaultPath}/${rel}`,
	listVaultDirChildren: vi.fn(),
	readVaultFile: vi.fn(),
}));

vi.mock("@/lib/workspace/tex-compile", () => ({
	resolveTexRootInfo: vi.fn(),
}));

import { listVaultDirChildren, readVaultFile } from "@/lib/vault";
import { resolveTexRootInfo } from "@/lib/workspace/tex-compile";
import { discoverWritingProjects } from "@/lib/writing/discover";

describe("writing project file list", () => {
	it("hides another project's directory", () => {
		const nodes = [
			{ kind: "file", path: "D:/vault/thesis/main.tex", name: "main.tex" },
			{
				kind: "directory",
				path: "D:/vault/thesis/test-1",
				name: "test-1",
			},
			{
				kind: "directory",
				path: "D:/vault/thesis/sections",
				name: "sections",
			},
		];
		const shown = withoutNestedProjects(
			nodes,
			new Set(["D:/vault/thesis/test-1"]),
		);
		expect(shown.map((node) => node.name)).toEqual(["main.tex", "sections"]);
	});
});

describe("writing source filter", () => {
	it("hides latex build products and keeps source", () => {
		expect(isWritingSourceName("file", "main.tex")).toBe(true);
		expect(isWritingSourceName("file", "refs.bib")).toBe(true);
		expect(isWritingSourceName("file", "figure.png")).toBe(true);
		expect(isWritingSourceName("file", ".latexmkrc")).toBe(true);
		expect(isWritingSourceName("file", "main.pdf")).toBe(false);
		expect(isWritingSourceName("file", "main.aux")).toBe(false);
		expect(isWritingSourceName("file", "main.fdb_latexmk")).toBe(false);
		expect(isWritingSourceName("file", "main.synctex.gz")).toBe(false);
		expect(isWritingSourceName("file", "main.run.xml")).toBe(false);
		expect(isWritingSourceName("file", ".DS_Store")).toBe(false);
		expect(isWritingSourceName("directory", "chapters")).toBe(true);
		expect(isWritingSourceName("directory", "build")).toBe(false);
		expect(isWritingSourceName("directory", ".git")).toBe(false);
		expect(isWritingSourceName("directory", "_minted-main")).toBe(false);
	});

	it("lists directories before files", () => {
		const sorted = [
			{ kind: "file" as const, name: "a.tex" },
			{ kind: "directory" as const, name: "chapters" },
			{ kind: "file" as const, name: "b.bib" },
		].sort(compareWritingNodes);
		expect(sorted.map((item) => item.name)).toEqual([
			"chapters",
			"a.tex",
			"b.bib",
		]);
	});
});

describe("writing session", () => {
	it("names a project from its title, not the thesis folder", () => {
		expect(texDocumentTitle("\\title{A Note}\n")).toBe("A Note");
		expect(texDocumentTitle("no title here")).toBeNull();
		expect(
			texDocumentTitle(
				"\\title{\\LaTeX\\ Author Guidelines for \\confName~Proceedings}",
			),
		).toBe("Author Guidelines for Proceedings");
		expect(texDocumentTitle("% \\title{Hidden}\n\\title{Shown}")).toBe("Shown");
		expect(
			writingProjectTitle("/vault/thesis/main.tex", "\\title{A Note}"),
		).toBe("A Note");
		expect(
			writingProjectTitle(
				"/vault/thesis/cvpr-test/main.tex",
				"\\title{\\LaTeX\\ Author Guidelines for \\confName~Proceedings}",
			),
		).toBe("cvpr-test");
		expect(
			writingProjectTitle(
				"/vault/thesis/cvpr-test/main.tex",
				"\\title{Depth Anything}",
			),
		).toBe("Depth Anything");
		expect(writingProjectTitle("/vault/thesis/main.tex", "")).toBe("");
		expect(writingProjectTitle("/vault/thesis/talk/main.tex", "")).toBe("talk");
		expect(writingProjectTitle("/vault/thesis/slides.tex", "")).toBe("slides");
	});
	it("keeps the directory name on the raw manuscript and the parent separators", () => {
		expect(manuscriptFromRoot("/vault/thesis/main.tex")).toEqual({
			rootFile: "/vault/thesis/main.tex",
			title: "thesis",
			fileName: "main.tex",
		});
		expect(manuscriptDir("C:\\vault\\thesis\\main.tex")).toBe(
			"C:\\vault\\thesis",
		);
		expect(manuscriptDir("/vault/thesis/main.tex")).toBe("/vault/thesis");
	});

	it("keeps the latest root first and caps the recent list", () => {
		const first = touchRecent([], "/vault/thesis/main.tex");
		const second = touchRecent(first, "/vault/notes/draft.tex");
		const again = touchRecent(second, "/vault/thesis/main.tex");
		expect(again).toEqual(["/vault/thesis/main.tex", "/vault/notes/draft.tex"]);
		const many = Array.from({ length: 20 }, (_, index) => `/v/m${index}.tex`);
		expect(touchRecent(many, "/v/new.tex")).toHaveLength(WRITING_RECENT_LIMIT);
	});

	it("merges the active root, recents, and discovered projects once", () => {
		const discovered = [
			manuscriptFromRoot("/vault/thesis/main.tex"),
			manuscriptFromRoot("/vault/thesis/notes/draft.tex"),
		];
		const merged = mergeManuscripts(
			discovered,
			["/vault/talk/slides.tex", "/vault/thesis/main.tex"],
			"/vault/talk/slides.tex",
		);
		expect(merged.map((item) => item.fileName)).toEqual([
			"slides.tex",
			"main.tex",
			"draft.tex",
		]);
	});

	it("drops roots that sit outside the vault", () => {
		const raw = {
			vaults: {
				"/vault": {
					surface: "writing",
					activeRoot: "/other/main.tex",
					recents: ["/vault/thesis/main.tex", "/other/slides.tex"],
				},
				"/elsewhere": { surface: "nope", activeRoot: 3, recents: [1] },
			},
		};
		expect(parseWritingVaults(raw)["/elsewhere"]).toEqual({
			surface: "reading",
			activeRoot: null,
			recents: [],
		});
		expect(prefsForVault("/vault", raw)).toEqual({
			surface: "writing",
			activeRoot: null,
			recents: ["/vault/thesis/main.tex"],
		});
		expect(prefsForVault("/missing", raw).surface).toBe("reading");
	});
});

describe("writing project trash path", () => {
	it("moves a project directory and a loose shelf file, not the shelf", () => {
		expect(
			writingProjectTrashRel("D:/vault", "D:/vault/thesis/test-cvpr/main.tex"),
		).toBe("thesis/test-cvpr");
		expect(writingProjectTrashRel("D:/vault", "D:/vault/thesis/main.tex")).toBe(
			"thesis/main.tex",
		);
		expect(
			writingProjectTrashRel("D:/vault", "D:/vault/notes/main.tex"),
		).toBeNull();
		expect(writingProjectTrashRel("D:/vault", "D:/vault/thesis")).toBeNull();
	});
});

function fileNode(parent: string, name: string): FileNode {
	return {
		id: `${parent}/${name}`,
		name,
		path: `${parent}/${name}`,
		kind: "file",
	};
}

function directoryNode(parent: string, name: string): FileNode {
	return {
		id: `${parent}/${name}`,
		name,
		path: `${parent}/${name}`,
		kind: "directory",
	};
}

describe("writing project discovery", () => {
	it("keeps an unreferenced section inside the root-level project", async () => {
		const shelf = "/vault/thesis";
		const sections = `${shelf}/sections`;
		const paper2 = `${shelf}/paper2`;
		const main = `${shelf}/main.tex`;
		const intro = `${sections}/intro.tex`;
		const unused = `${sections}/ack.tex`;
		const second = `${paper2}/paper.tex`;
		const children: Record<string, FileNode[]> = {
			[shelf]: [
				fileNode(shelf, "main.tex"),
				directoryNode(shelf, "sections"),
				directoryNode(shelf, "paper2"),
			],
			[sections]: [
				fileNode(sections, "intro.tex"),
				fileNode(sections, "ack.tex"),
			],
			[paper2]: [fileNode(paper2, "paper.tex")],
		};
		vi.mocked(listVaultDirChildren).mockImplementation(
			async (_root: string, dir: string) => children[dir] ?? [],
		);
		vi.mocked(resolveTexRootInfo).mockImplementation(async (path) => {
			if (path === unused) return { rootPath: path, fallbackSelf: true };
			if (path === intro) return { rootPath: main, fallbackSelf: false };
			return { rootPath: path, fallbackSelf: false };
		});
		vi.mocked(readVaultFile).mockImplementation(async (path) =>
			path === main
				? "\\documentclass{article}\n\\title{Main}"
				: "\\documentclass{article}\n\\title{Second}",
		);

		const found = await discoverWritingProjects("/vault");

		expect(found.map((item) => item.rootFile)).toEqual([main, second]);
		expect(found.map((item) => item.title)).toEqual(["Main", "Second"]);
	});
});
