import { RangeApi, type SlateEditor, TextApi } from "platejs";
import { isLiteralTextContext } from "@/lib/markdown/input-context";
import { isWikiLinkNode } from "@/lib/wiki/wikilink-model";

/** Normalize only a newly typed opening pair immediately before the caret. */
export function normalizeWikiTrigger(editor: SlateEditor): boolean {
	const selection = editor.selection;
	if (!selection || !RangeApi.isCollapsed(selection)) return false;
	const { path, offset } = selection.anchor;
	const leaf = editor.api.node(path)?.[0];
	if (!TextApi.isText(leaf) || offset < 2) return false;
	const pair = leaf.text.slice(offset - 2, offset);
	if (pair !== "【【" && pair !== "［［") return false;
	if (
		isLiteralTextContext(editor) ||
		isWikiLinkNode(editor.api.parent(path)?.[0])
	)
		return false;
	editor.tf.insertText("[[", {
		at: { anchor: { path, offset: offset - 2 }, focus: { path, offset } },
	});
	return true;
}
