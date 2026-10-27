import { MarkdownPlugin } from "@platejs/markdown";
import { createSlateEditor, createSlatePlugin, KEYS } from "platejs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/editor/nodes/inline/wikilink-node", () => ({
	WikiLinkElement: () => null,
}));

import { MarkdownKit } from "@/components/editor/plugins/markdown-kit";
import { WikiLinkPlugin } from "@/components/editor/plugins/wikilink-plugin";
import { findWikiCompletionTrigger } from "@/lib/wiki/completion";
import { normalizeWikiTrigger } from "@/lib/wiki/normalize-wiki-trigger";
import {
	parseWikiLinkMarkdown,
	type WikiSlateNode,
	wikiLinkToMarkdown,
} from "@/lib/wiki/wikilink-model";

const ParagraphPlugin = createSlatePlugin({
	key: KEYS.p,
	node: { isElement: true },
});

function createWikiEditor(children: unknown[]) {
	return createSlateEditor({
		plugins: [ParagraphPlugin, WikiLinkPlugin, ...MarkdownKit],
		value: [{ type: "p", children }],
	});
}

function serializeMd(editor: ReturnType<typeof createWikiEditor>): string {
	return editor.getApi(MarkdownPlugin).markdown.serialize();
}

/**
 * The wikilink presentation sync (use-wikilink-editing) marks
 * presentation-only change batches with a boolean flag instead of comparing
 * two full-document serializations per source/display swap. That is only
 * sound if every projection transform is Markdown-invariant: the serializer
 * emits `wikiLinkNodeSource(node) || wikiLinkToMarkdown(node)`, so swapping
 * between the two representations must never change the document.
 */
describe("wikilink projection markdown invariance", () => {
	it.each([
		"【",
		"［",
	])("normalizes repeated %s into a completion trigger", (bracket) => {
		const editor = createWikiEditor([{ text: "正文 !" }]);
		editor.tf.select({ path: [0, 0], offset: 4 });
		editor.tf.insertText(bracket);
		expect(editor.api.string([0])).toBe(`正文 !${bracket}`);
		editor.tf.insertText(bracket);
		expect(editor.api.string([0])).toBe("正文 ![[");
		expect(editor.selection?.anchor.offset).toBe(6);
		expect(findWikiCompletionTrigger(editor.api.string([0]), 6)).toMatchObject({
			raw: "",
			embed: true,
		});
	});

	it("normalizes an IME committed pair without rewriting surrounding text", () => {
		const editor = createWikiEditor([{ text: "前【【后" }]);
		editor.tf.select({ path: [0, 0], offset: 3 });
		expect(normalizeWikiTrigger(editor)).toBe(true);
		expect(editor.api.string([0])).toBe("前[[后");
		expect(editor.selection?.anchor.offset).toBe(3);
	});

	it("preserves brackets in inline code", () => {
		const editor = createWikiEditor([{ text: "【", code: true }]);
		editor.tf.select({ path: [0, 0], offset: 1 });
		editor.tf.insertText("【");
		expect(editor.api.string([0])).toBe("【【");
	});

	it("preserves brackets in code blocks", () => {
		const editor = createSlateEditor({
			plugins: [
				WikiLinkPlugin,
				createSlatePlugin({ key: KEYS.codeBlock, node: { isElement: true } }),
			],
			value: [{ type: KEYS.codeBlock, children: [{ text: "［" }] }],
		});
		editor.tf.select({ path: [0, 0], offset: 1 });
		editor.tf.insertText("［");
		expect(editor.api.string([0])).toBe("［［");
	});
	it.each([
		0, 9,
	])("does not duplicate a link when breaking at source offset %i", (offset) => {
		const link = parseWikiLinkMarkdown("[[notes]]");
		if (!link) throw new Error("expected link");
		const editor = createWikiEditor([{ text: "" }, link, { text: "" }]);
		editor.tf.select({ path: [0, 1, 0], offset });
		editor.tf.insertBreak();
		expect(serializeMd(editor).match(/\[\[notes\]\]/g)).toHaveLength(1);
		expect(editor.children).toHaveLength(2);
	});
	it("expanding a display node's source child keeps the markdown identical", () => {
		// Display node with an empty text child (as produced by template
		// insertion): expandWikiLinkAt writes the raw source into the child.
		const link: WikiSlateNode = {
			type: "wikiLink",
			value: "papers/foo/NOTES",
			heading: "sec",
			alias: "alias",
			children: [{ text: "" }],
		};
		const editor = createWikiEditor([{ text: "see " }, link, { text: "." }]);
		const before = serializeMd(editor);

		const raw = wikiLinkToMarkdown(link);
		editor.tf.insertText(raw, { at: { path: [0, 1, 0], offset: 0 } });

		expect(serializeMd(editor)).toBe(before);
		expect(before).toContain("[[papers/foo/NOTES#sec|alias]]");
	});

	it("reifying a complete draft leaf into a display node keeps the markdown identical", () => {
		const rawDraft = "[[papers/bar/NOTES@abc123|note]]";
		const editor = createWikiEditor([
			{ text: "before " },
			{ text: rawDraft, wikiLinkDraft: true },
			{ text: " after" },
		]);
		const before = serializeMd(editor);

		const parsed = parseWikiLinkMarkdown(rawDraft);
		if (!parsed) throw new Error("expected a parsable draft");
		editor.tf.withoutNormalizing(() => {
			editor.tf.removeNodes({ at: [0, 1] });
			editor.tf.insertNodes(parsed, { at: [0, 1] });
		});

		expect(serializeMd(editor)).toBe(before);
		expect(before).toContain(rawDraft);
	});

	it("committing edited source text back into node attributes keeps the markdown identical", () => {
		// The user edited the source child (added a heading); the node's cached
		// attributes are stale until syncWikiLinkNodeAt commits them.
		const editedRaw = "[[papers/baz/NOTES#intro]]";
		const stale: WikiSlateNode = {
			type: "wikiLink",
			value: "papers/baz/NOTES",
			children: [{ text: editedRaw }],
		};
		const editor = createWikiEditor([{ text: "" }, stale, { text: "" }]);
		const before = serializeMd(editor);

		const parsed = parseWikiLinkMarkdown(editedRaw);
		if (!parsed) throw new Error("expected a parsable source");
		editor.tf.setNodes(
			{
				value: parsed.value,
				heading: parsed.heading,
				alias: parsed.alias ?? undefined,
				embed: parsed.embed === true ? true : undefined,
			},
			{ at: [0, 1] },
		);

		expect(serializeMd(editor)).toBe(before);
		expect(before).toContain(editedRaw);
	});

	it("dropping the draft marker from an unfinished draft keeps the markdown identical", () => {
		// finalizeWikiLinkDrafts unsets `wikiLinkDraft` on incomplete syntax;
		// the mark itself must not be serialized.
		const editor = createWikiEditor([
			{ text: "[[unfinished", wikiLinkDraft: true },
		]);
		const before = serializeMd(editor);

		editor.tf.unsetNodes("wikiLinkDraft", { at: [0, 0] });

		expect(serializeMd(editor)).toBe(before);
	});
});
