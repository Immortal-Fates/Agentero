import type { DockviewApi } from "dockview-react";
import { describe, expect, it, vi } from "vitest";
import type { DocTab } from "@/lib/workspace/tabs";
import {
	createWritingFocus,
	isWritingSource,
} from "@/lib/workspace/writing-focus";

const source = {
	id: "source",
	path: "/vault/thesis/main.tex",
	mode: "text",
	writingRoot: "/vault/thesis/main.tex",
} as DocTab;
const notes = {
	id: "notes",
	path: "/vault/notes/NOTES.md",
	mode: "markdown",
} as DocTab;
function fixture(restored = false) {
	let maximized = restored;
	const panel = { id: "source", api: { isMaximized: () => maximized } };
	const maximize = vi.fn(() => {
		maximized = true;
	});
	const restore = vi.fn(() => {
		maximized = false;
	});
	const api = {
		activePanel: panel,
		maximizeGroup: maximize,
		exitMaximizedGroup: restore,
		hasMaximizedGroup: () => maximized,
	} as unknown as DockviewApi;
	return { api, maximize, restore };
}

describe("writing project fills the workspace", () => {
	it("temporarily hides reading splits and restores them on switching to notes", () => {
		const { api, maximize, restore } = fixture();
		const sync = createWritingFocus();
		sync(api, source, "/vault");
		sync(api, source, "/vault");
		expect(maximize).toHaveBeenCalledTimes(1);
		sync(api, notes, "/vault");
		expect(restore).toHaveBeenCalledTimes(1);
	});
	it("also restores reading splits when the writing layout was loaded maximized", () => {
		const { api, maximize, restore } = fixture(true);
		const sync = createWritingFocus();
		sync(api, source, "/vault");
		sync(api, notes, "/vault");
		expect(maximize).not.toHaveBeenCalled();
		expect(restore).toHaveBeenCalledTimes(1);
	});
	it("leaves manually maximized reading documents alone", () => {
		const { api, restore } = fixture(true);
		createWritingFocus()(api, notes, "/vault");
		expect(restore).not.toHaveBeenCalled();
		expect(
			isWritingSource(
				{
					...source,
					path: "/vault/thesis/main.pdf",
					mode: "pdf",
					writingRoot: undefined,
				},
				"/vault",
			),
		).toBe(false);
	});
});
