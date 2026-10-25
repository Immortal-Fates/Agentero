import { describe, expect, it } from "vitest";
import { compareWritingNodes, isWritingSourceName } from "@/lib/writing/files";
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
} from "@/lib/writing/session";

describe("writing source filter", () => {
	it("hides latex build products and keeps source", () => {
		expect(isWritingSourceName("file", "main.tex")).toBe(true);
		expect(isWritingSourceName("file", "refs.bib")).toBe(true);
		expect(isWritingSourceName("file", "figure.png")).toBe(true);
		expect(isWritingSourceName("file", ".latexmkrc")).toBe(true);
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
			writingProjectTitle("/vault/thesis/main.tex", "\\title{A Note}"),
		).toBe("A Note");
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
