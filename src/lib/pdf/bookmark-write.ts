/** Runs in a worker. Edit the original outline dictionaries rather than
 * rebuilding a PDFium document that already contains sidecar annotations. */
import {
	PDFBool,
	PDFDict,
	PDFDocument,
	PDFHexString,
	PDFName,
	PDFNumber,
	PDFRef,
	PDFString,
} from "pdf-lib";
import type { EditableBookmark } from "./bookmark-edit";

export async function writePdfBookmarks(
	bytes: ArrayBuffer,
	nodes: EditableBookmark[],
): Promise<Uint8Array> {
	const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
	const name = PDFName.of;
	// Rewriting a signed PDF invalidates its signatures. Never silently do so.
	for (const [, object] of pdf.context.enumerateIndirectObjects()) {
		if (
			object instanceof PDFDict &&
			(object.has(name("ByteRange")) || object.get(name("FT")) === name("Sig"))
		)
			throw new Error("protected");
	}
	const originals = new Map<string, { dict: PDFDict; ref: PDFRef }>();
	const seen = new Set<string>();
	const root = pdf.catalog.lookupMaybe(name("Outlines"), PDFDict);
	function read(parent: PDFDict, prefix: string) {
		let item = parent.get(name("First"));
		let index = 0;
		while (item) {
			if (!(item instanceof PDFRef) || seen.has(item.toString()))
				throw new Error("unsupported");
			seen.add(item.toString());
			const dict = pdf.context.lookup(item, PDFDict);
			const action = dict.lookupMaybe(name("A"), PDFDict);
			// Preserve local destinations verbatim (including named / XYZ targets).
			// Do not overwrite documents with actions this editor cannot represent.
			if (
				action &&
				(action.get(name("S")) !== name("GoTo") || action.has(name("Next")))
			)
				throw new Error("unsupported");
			const key = `${prefix}${index++}`;
			originals.set(key, { dict, ref: item });
			read(dict, `${key}.`);
			item = dict.get(name("Next"));
		}
	}
	if (root) read(root, "");
	const outlines = root ?? pdf.context.obj({ Type: "Outlines" });
	const rootRef =
		pdf.context.getObjectRef(outlines) ?? pdf.context.register(outlines);
	const pages = pdf.getPages();
	const used = new Set<string>();
	function write(
		items: EditableBookmark[],
		parent: PDFDict,
		parentRef: PDFRef,
	): number {
		const entries = items.map((node) => {
			if (!node.title.trim()) throw new Error("invalid");
			if (
				node.origin !== null &&
				(used.has(node.origin) || !originals.has(node.origin))
			)
				throw new Error("unsupported");
			if (node.origin !== null) used.add(node.origin);
			const original =
				node.origin === null ? undefined : originals.get(node.origin);
			if (original && node.originalTitle !== undefined) {
				const title = original.dict.lookup(name("Title"));
				if (
					!(title instanceof PDFString || title instanceof PDFHexString) ||
					title.decodeText() !== node.originalTitle
				)
					throw new Error("unsupported");
			}
			const dict = original?.dict ?? pdf.context.obj({});
			const ref = original?.ref ?? pdf.context.register(dict);
			dict.set(name("Title"), PDFHexString.fromText(node.title.trim()));
			if (node.pageBookmark)
				dict.set(name("AgenteroPageBookmark"), PDFBool.True);
			dict.set(name("Parent"), parentRef);
			if (node.pageIndex !== undefined) {
				if (!Number.isInteger(node.pageIndex) || !pages[node.pageIndex])
					throw new Error("invalid");
				dict.delete(name("A"));
				dict.set(
					name("Dest"),
					pdf.context.obj([pages[node.pageIndex].ref, "Fit"]),
				);
			} else if (!original) throw new Error("invalid");
			return { node, dict, ref };
		});
		parent.delete(name("First"));
		parent.delete(name("Last"));
		if (entries.length) {
			parent.set(name("First"), entries[0].ref);
			parent.set(name("Last"), entries[entries.length - 1].ref);
		}
		let visible = 0;
		entries.forEach(({ node, dict, ref }, i) => {
			dict.delete(name("Prev"));
			dict.delete(name("Next"));
			if (i > 0) dict.set(name("Prev"), entries[i - 1].ref);
			if (i + 1 < entries.length) dict.set(name("Next"), entries[i + 1].ref);
			const closed =
				(dict.lookupMaybe(name("Count"), PDFNumber)?.asNumber() ?? 0) < 0;
			const children = write(node.children, dict, ref);
			dict.delete(name("Count"));
			if (children)
				dict.set(name("Count"), PDFNumber.of(closed ? -children : children));
			visible += 1 + (closed ? 0 : children);
		});
		return visible;
	}
	const count = write(nodes, outlines, rootRef);
	outlines.set(name("Count"), PDFNumber.of(count));
	if (nodes.length) pdf.catalog.set(name("Outlines"), rootRef);
	else pdf.catalog.delete(name("Outlines"));
	const saved = await pdf.save({ updateFieldAppearances: false });
	// Ensure the result parses before it can be handed to the atomic writer.
	const check = await PDFDocument.load(saved, { updateMetadata: false });
	if (check.getPageCount() !== pages.length) throw new Error("invalid");
	return saved;
}

/** Read only our page-toggle identity; all items remain standard PDF outlines. */
export async function readPdfPageBookmarks(
	bytes: ArrayBuffer,
): Promise<string[]> {
	const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
	const origins: string[] = [];
	const seen = new Set<PDFDict>();
	function visit(parent: PDFDict, prefix: string) {
		let item = parent.lookupMaybe(PDFName.of("First"), PDFDict);
		let index = 0;
		while (item) {
			if (seen.has(item)) throw new Error("unsupported");
			seen.add(item);
			const origin = `${prefix}${index++}`;
			if (item.get(PDFName.of("AgenteroPageBookmark")) === PDFBool.True)
				origins.push(origin);
			visit(item, `${origin}.`);
			item = item.lookupMaybe(PDFName.of("Next"), PDFDict);
		}
	}
	const root = pdf.catalog.lookupMaybe(PDFName.of("Outlines"), PDFDict);
	if (root) visit(root, "");
	return origins;
}
