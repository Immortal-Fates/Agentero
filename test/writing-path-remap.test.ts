import { beforeEach, describe, expect, it } from "vitest";
import { remapWritingPaths, writingStore } from "@/lib/writing/store";

describe("remapWritingPaths", () => {
	beforeEach(() => {
		writingStore.setState({
			vaultPath: null,
			activeRoot: "/vault/thesis/paper/main.tex",
			activeFile: "/vault/thesis/paper/sections/intro.tex",
			openFiles: [
				"/vault/thesis/paper/main.tex",
				"/vault/thesis/paper/sections/intro.tex",
				"/vault/thesis/paper/other.tex",
			],
			recents: ["/vault/thesis/paper/main.tex"],
		});
	});

	it("moves open files when their folder is moved", () => {
		remapWritingPaths([
			{
				from: "/vault/thesis/paper/sections",
				to: "/vault/thesis/paper/chapters",
			},
		]);
		const state = writingStore.getState();
		expect(state.activeFile).toBe("/vault/thesis/paper/chapters/intro.tex");
		expect(state.openFiles).toEqual([
			"/vault/thesis/paper/main.tex",
			"/vault/thesis/paper/chapters/intro.tex",
			"/vault/thesis/paper/other.tex",
		]);
	});

	it("follows a moved project root and keeps recents in sync", () => {
		remapWritingPaths([
			{
				from: "/vault/thesis/paper/main.tex",
				to: "/vault/thesis/renamed/main.tex",
			},
		]);
		const state = writingStore.getState();
		expect(state.activeRoot).toBe("/vault/thesis/renamed/main.tex");
		expect(state.recents).toEqual(["/vault/thesis/renamed/main.tex"]);
	});
});
