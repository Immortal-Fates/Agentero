// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useLibraryPreview } from "@/components/library/hooks/use-library-preview";
import { uiStore } from "@/lib/shell/ui-store";

type Props = Parameters<typeof useLibraryPreview>[0];
let preview: ReturnType<typeof useLibraryPreview>;
let root: Root;
let container: HTMLDivElement;
let props: Props;

function Fixture(props: Props) {
	preview = useLibraryPreview(props);
	return null;
}

async function render(changes: Partial<Props> = {}) {
	props = { ...props, ...changes };
	await act(async () => root.render(createElement(Fixture, props)));
}

function hover(path: string) {
	preview(path);
	vi.advanceTimersByTime(180);
}

const current = () => uiStore.getState().hoveredPaperPath;

beforeEach(async () => {
	vi.useFakeTimers();
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	props = {
		active: true,
		vaultPath: "/vault",
		scopePath: null,
		paths: new Set(["papers/a", "papers/b"]),
	};
	await render();
});

afterEach(async () => {
	await act(async () => root.unmount());
	document.body.replaceChildren();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

it("retains the preview when crossing another row on the way to Info", () => {
	preview("papers/a");
	vi.advanceTimersByTime(179);
	expect(current()).toBeNull();
	vi.advanceTimersByTime(1);
	expect(current()).toBe("papers/a");
	preview("papers/b");
	vi.advanceTimersByTime(80);
	preview.cancel(); // Row leave / scroll cancels only the pending switch.
	vi.advanceTimersByTime(500);
	expect(current()).toBe("papers/a");
	hover("papers/b");
	expect(current()).toBe("papers/b");
});

it.each([
	{ scopePath: "papers/subfolder" },
	{ vaultPath: "/other-vault" },
	{ active: false },
])("clears both the preview and pending hover on navigation: %j", async (change) => {
	hover("papers/a");
	preview("papers/b");
	await render(change);
	vi.advanceTimersByTime(500);
	expect(current()).toBeNull();
	await render({ active: true, scopePath: null, vaultPath: "/vault" });
	expect(current()).toBeNull();
});

it("clears removed/filtered papers and pending previews on unmount", async () => {
	hover("papers/a");
	await render({ paths: new Set(["papers/b"]) });
	expect(current()).toBeNull();
	hover("papers/b");
	preview("papers/b");
	await act(async () => root.render(null));
	vi.advanceTimersByTime(500);
	expect(current()).toBeNull();
});

it("keeps Info stable while editing or using its portaled popover", () => {
	hover("papers/a");
	const panel = document.createElement("div");
	panel.setAttribute("data-paper-info", "");
	const input = document.createElement("input");
	panel.append(input);
	document.body.append(panel);
	input.focus();
	hover("papers/b");
	expect(current()).toBe("papers/a");
	input.blur();
	const trigger = document.createElement("button");
	trigger.setAttribute("aria-expanded", "true");
	trigger.setAttribute("aria-haspopup", "dialog");
	panel.append(trigger);
	hover("papers/b");
	expect(current()).toBe("papers/a");
	trigger.setAttribute("aria-expanded", "false");
	hover("papers/b");
	expect(current()).toBe("papers/b");
});

it("does not let a hidden Library instance clear the active preview", async () => {
	const hidden = createRoot(document.createElement("div"));
	hover("papers/a");
	await act(async () =>
		hidden.render(createElement(Fixture, { ...props, active: false })),
	);
	expect(current()).toBe("papers/a");
	await act(async () => hidden.unmount());
	expect(current()).toBe("papers/a");
});
