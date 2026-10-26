import { beforeEach, describe, expect, it } from "vitest";
import {
	closeAllWritingFiles,
	closeOtherWritingFiles,
	closeWritingFile,
	forgetWritingProject,
	writingStore,
} from "@/lib/writing/store";

const root = "D:/vault/thesis/paper/main.tex";
const chapter = "D:/vault/thesis/paper/chap.tex";

function openTabs(files: string[], active: string | null): void {
	writingStore.setState({
		vaultPath: null,
		surface: "writing",
		activeRoot: root,
		activeFile: active,
		openFiles: files,
		recents: [],
		manuscripts: [],
		discovering: false,
	});
}

describe("writing tabs", () => {
	beforeEach(() => {
		openTabs([root, chapter], chapter);
	});

	it("closes the current tab and keeps its neighbor", () => {
		closeWritingFile(chapter);
		expect(writingStore.getState().openFiles).toEqual([root]);
		expect(writingStore.getState().activeFile).toBe(root);
	});

	it("closes the last tab without reopening the project root", () => {
		closeWritingFile(root);
		closeWritingFile(chapter);
		const state = writingStore.getState();
		expect(state.openFiles).toEqual([]);
		expect(state.activeFile).toBeNull();
		expect(state.activeRoot).toBe(root);
	});

	it("keeps the chosen tab when closing the others", () => {
		closeOtherWritingFiles(chapter);
		const state = writingStore.getState();
		expect(state.openFiles).toEqual([chapter]);
		expect(state.activeFile).toBe(chapter);
	});

	it("closes every tab and leaves the project open", () => {
		closeAllWritingFiles();
		const state = writingStore.getState();
		expect(state.openFiles).toEqual([]);
		expect(state.activeFile).toBeNull();
		expect(state.activeRoot).toBe(root);
	});

	it("forgets a deleted project and returns to the project list", () => {
		writingStore.setState({ recents: [root, chapter] });
		forgetWritingProject(root);
		const state = writingStore.getState();
		expect(state.activeRoot).toBeNull();
		expect(state.openFiles).toEqual([]);
		expect(state.recents).toEqual([]);
	});
});
