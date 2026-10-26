import {
	PDFArray,
	PDFDict,
	PDFDocument,
	PDFHexString,
	PDFName,
	PDFNumber,
} from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
	type EditableBookmark,
	editableBookmarks,
	moveBookmark,
	removePageBookmark,
} from "../src/lib/pdf/bookmark-edit";
import {
	readPdfPageBookmarks,
	writePdfBookmarks,
} from "../src/lib/pdf/bookmark-write";

const N = PDFName.of;
const fresh = (id: string, pageIndex = 0): EditableBookmark => ({
	id,
	origin: null,
	title: id,
	pageIndex,
	children: [],
});
const buffer = (bytes: Uint8Array) => bytes.slice().buffer as ArrayBuffer;

async function fixture() {
	const pdf = await PDFDocument.create();
	pdf.addPage();
	pdf.addPage();
	const root = pdf.context.obj({ Type: "Outlines" });
	const rootRef = pdf.context.register(root);
	const item = pdf.context.obj({
		Title: PDFHexString.fromText("Original"),
		Parent: rootRef,
		Dest: [pdf.getPages()[1].ref, "XYZ", 20, 400, 1],
		C: [1, 0, 0],
		F: 2,
	});
	const itemRef = pdf.context.register(item);
	root.set(N("First"), itemRef);
	root.set(N("Last"), itemRef);
	root.set(N("Count"), PDFNumber.of(1));
	pdf.catalog.set(N("Outlines"), rootRef);
	return { pdf, item };
}

describe("PDF bookmark editing", () => {
	it("persists page toggle identity and removes only that bookmark while promoting children", async () => {
		const { pdf } = await fixture();
		const chapter: EditableBookmark = {
			id: "0",
			origin: "0",
			title: "Chapter",
			children: [],
		};
		const page = {
			...fresh("Page one"),
			pageBookmark: true,
			children: [fresh("Selected text")],
		};
		const saved = await writePdfBookmarks(buffer(await pdf.save()), [
			chapter,
			page,
		]);
		expect(await readPdfPageBookmarks(buffer(saved))).toEqual(["1"]);
		const removed = removePageBookmark([chapter, page], 0);
		expect(removed.map((node) => node.title)).toEqual([
			"Chapter",
			"Selected text",
		]);
		expect(removed[0]).toEqual(chapter);
	});

	it("moves entire subtrees without cycles and supports nesting / outdenting", () => {
		const a = fresh("a"),
			b = fresh("b"),
			c = fresh("c");
		a.children = [c];
		const nodes = [a, b];
		expect(moveBookmark(nodes, "a", "c", "inside")).toBe(nodes);
		const nested = moveBookmark(nodes, "b", "c", "inside");
		expect(nested[0].children[0].children[0].id).toBe("b");
		expect(moveBookmark(nested, "b", "a", "before").map((n) => n.id)).toEqual([
			"b",
			"a",
		]);
		expect(nodes).toEqual([a, b]);
	});
	it("persists Unicode titles and nesting while preserving original destination and style", async () => {
		const { pdf, item } = await fixture();
		const destination = item.get(N("Dest"))?.toString();
		const original: EditableBookmark = {
			id: "0",
			origin: "0",
			title: "章节一 · renamed",
			children: [fresh("子书签", 0)],
		};
		const saved = await writePdfBookmarks(buffer(await pdf.save()), [
			fresh("First"),
			original,
		]);
		const loaded = await PDFDocument.load(saved);
		const root = loaded.catalog.lookup(N("Outlines"), PDFDict);
		const first = root.lookup(N("First"), PDFDict);
		const second = first.lookup(N("Next"), PDFDict);
		expect(second.lookup(N("Title"), PDFHexString).decodeText()).toBe(
			original.title,
		);
		expect(second.get(N("Dest"))?.toString()).toBe(destination);
		expect(second.lookup(N("F"), PDFNumber).asNumber()).toBe(2);
		expect(second.lookup(N("C"), PDFArray).toString()).toBe("[ 1 0 0 ]");
		expect(
			second
				.lookup(N("First"), PDFDict)
				.lookup(N("Title"), PDFHexString)
				.decodeText(),
		).toBe("子书签");
		expect(root.lookup(N("Count"), PDFNumber).asNumber()).toBe(3);
		expect(loaded.getPageCount()).toBe(2);
	});
	it("can create a first outline, retarget an existing bookmark, and remove all bookmarks", async () => {
		const { pdf } = await fixture();
		const saved = await writePdfBookmarks(buffer(await pdf.save()), [
			{ ...fresh("retarget"), origin: "0" },
		]);
		const loaded = await PDFDocument.load(saved);
		const item = loaded.catalog
			.lookup(N("Outlines"), PDFDict)
			.lookup(N("First"), PDFDict);
		expect(item.lookup(N("Dest"), PDFArray).get(0)).toEqual(
			loaded.getPage(0).ref,
		);
		const removed = await PDFDocument.load(
			await writePdfBookmarks(buffer(saved), []),
		);
		expect(removed.catalog.has(N("Outlines"))).toBe(false);
		const created = await PDFDocument.load(
			await writePdfBookmarks(buffer(await removed.save()), [fresh("New")]),
		);
		expect(created.catalog.has(N("Outlines"))).toBe(true);
	});
	it("rejects unsupported actions, signed documents, invalid pages and duplicate origins", async () => {
		const { pdf, item } = await fixture();
		const bytes = buffer(await pdf.save());
		await expect(writePdfBookmarks(bytes, [fresh("bad", 99)])).rejects.toThrow(
			"invalid",
		);
		const original = editableBookmarks([{ title: "Original" }])[0];
		await expect(
			writePdfBookmarks(bytes, [original, original]),
		).rejects.toThrow("unsupported");
		item.set(
			N("A"),
			pdf.context.obj({ S: "GoToR", F: PDFHexString.fromText("other.pdf") }),
		);
		await expect(
			writePdfBookmarks(buffer(await pdf.save()), []),
		).rejects.toThrow("unsupported");
		pdf.context.register(
			pdf.context.obj({ Type: "Sig", ByteRange: [0, 1, 2, 3] }),
		);
		await expect(
			writePdfBookmarks(buffer(await pdf.save()), []),
		).rejects.toThrow("protected");
	});
});
