import type { PdfBookmarkObject } from "@embedpdf/models";
import { bookmarkPageIndex } from "./bookmark";

export type EditableBookmark = {
	id: string;
	/** Original tree path; null for a new bookmark. Never changes on drag. */
	origin: string | null;
	originalTitle?: string;
	/** Page-corner toggle, persisted in the PDF outline item. */
	pageBookmark?: boolean;
	title: string;
	/** Only set for a new / explicitly retargeted bookmark (zero-based). */
	pageIndex?: number;
	target?: PdfBookmarkObject["target"];
	children: EditableBookmark[];
};

export function editableBookmarks(
	nodes: PdfBookmarkObject[],
	prefix = "",
): EditableBookmark[] {
	return nodes.map((node, index) => {
		const origin = `${prefix}${index}`;
		return {
			id: origin,
			origin,
			originalTitle: node.title,
			title: node.title,
			target: node.target,
			children: editableBookmarks(node.children ?? [], `${origin}.`),
		};
	});
}

export function updateBookmark(
	nodes: EditableBookmark[],
	id: string,
	update: (node: EditableBookmark) => EditableBookmark | null,
): EditableBookmark[] {
	return nodes.flatMap((node) => {
		if (node.id === id) {
			const next = update(node);
			return next ? [next] : [];
		}
		return [{ ...node, children: updateBookmark(node.children, id, update) }];
	});
}

export function findBookmark(
	nodes: EditableBookmark[],
	id: string,
): EditableBookmark | undefined {
	for (const node of nodes) {
		if (node.id === id) return node;
		const found = findBookmark(node.children, id);
		if (found) return found;
	}
}

/** Moving a subtree into itself is a no-op. Position is relative to target. */
export function moveBookmark(
	nodes: EditableBookmark[],
	id: string,
	targetId: string,
	position: "before" | "after" | "inside",
): EditableBookmark[] {
	const moving = findBookmark(nodes, id);
	if (
		!moving ||
		id === targetId ||
		findBookmark(moving.children, targetId) ||
		!findBookmark(nodes, targetId)
	)
		return nodes;
	const removed = updateBookmark(nodes, id, () => null);
	const insert = (items: EditableBookmark[]): EditableBookmark[] =>
		items.flatMap((node) => {
			if (node.id !== targetId)
				return [{ ...node, children: insert(node.children) }];
			if (position === "inside")
				return [{ ...node, children: [...node.children, moving] }];
			return position === "before" ? [moving, node] : [node, moving];
		});
	return insert(removed);
}

/** Removing a page toggle promotes children; it never deletes other bookmarks. */
export function removePageBookmark(
	nodes: EditableBookmark[],
	pageIndex: number,
): EditableBookmark[] {
	return nodes.flatMap((node) => {
		const children = removePageBookmark(node.children, pageIndex);
		const targetPage = node.pageIndex ?? bookmarkPageIndex(node);
		return node.pageBookmark && targetPage === pageIndex
			? children
			: [{ ...node, children }];
	});
}
