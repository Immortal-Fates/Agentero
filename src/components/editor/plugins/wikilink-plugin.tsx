"use client";

import { RangeApi } from "platejs";
import { createPlatePlugin } from "platejs/react";
import { WikiLinkElement } from "@/components/editor/nodes/inline/wikilink-node";
import { isWikiLinkNode, wikiLinkNodeSource } from "@/lib/wiki/wikilink-model";

/**
 * Stable inline `[[wikilink]]` / `![[embed]]` node.
 *
 * Its text child owns the portable source syntax. Selection only changes how
 * the component projects that child.
 */
export const WikiLinkPlugin = createPlatePlugin({
	key: "wikiLink",
	node: { isElement: true, isInline: true },
})
	.overrideEditor(({ editor, tf: { insertBreak } }) => ({
		transforms: {
			insertBreak() {
				const selection = editor.selection;
				if (selection && RangeApi.isCollapsed(selection)) {
					const parent = editor.api.parent(selection.anchor.path);
					if (parent && isWikiLinkNode(parent[0])) {
						const offset = selection.anchor.offset;
						const length = wikiLinkNodeSource(parent[0]).length;
						// Splitting the inline at an edge clones its link attributes
						// onto an empty node, which serializes as a second link.
						const point =
							offset === 0
								? editor.api.before(parent[1])
								: offset === length
									? editor.api.after(parent[1])
									: null;
						if (point) editor.tf.select(point);
					}
				}
				insertBreak();
			},
		},
	}))
	.withComponent(WikiLinkElement);
