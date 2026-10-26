/** Opt-in real PDF extraction/export validation. Inputs stay outside the repository. */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PdfiumNative } from "@embedpdf/engines/pdfium";
import { init } from "@embedpdf/pdfium";
import { describe, expect, it } from "vitest";
import {
	listTranslatableLayoutRegions,
	toLayoutTranslateItems,
} from "@/lib/pdf/layout/layout-translate";
import type { PdfLayoutRegion } from "@/lib/pdf/layout/types";
import { buildReflowPdf } from "@/lib/pdf/reflow/export";
import { extractReflowDocument } from "@/lib/pdf/reflow/extract";

const dir = process.env.AGENTERO_REFLOW_FIXTURES,
	font = process.env.AGENTERO_REFLOW_FONT;
describe.skipIf(!dir || !font)("real PDF reflow", () => {
	it.each(
		(process.env.AGENTERO_REFLOW_PDFS ?? "attention,resnet").split(","),
	)("exports vector text and formulas in %s", async (name) => {
		const root = dir ?? "";
		const mode = process.env.AGENTERO_REFLOW_MODE ?? "fixed";
		const pages = (process.env.AGENTERO_REFLOW_PAGES ?? "1")
			.split(",")
			.map((n) => Number(n) - 1);
		const tag = mode === "fixed" ? name : `${name}-${mode}`;
		const engine = new PdfiumNative(
			await init({
				wasmBinary: readFileSync(
					fileURLToPath(import.meta.resolve("@embedpdf/pdfium/pdfium.wasm")),
				),
			}),
			{ fontFallback: null },
		);
		const bytes = readFileSync(join(root, `${name}.pdf`));
		const doc = await engine
			.openDocumentBuffer({
				id: name,
				content: bytes.buffer.slice(
					bytes.byteOffset,
					bytes.byteOffset + bytes.byteLength,
				),
			})
			.toPromise();
		try {
			const regions = (
				JSON.parse(readFileSync(join(root, `${name}-after.json`), "utf8"))
					.raw as PdfLayoutRegion[]
			).filter((r) => pages.includes(r.pageIndex));
			const items = toLayoutTranslateItems(
				listTranslatableLayoutRegions(regions),
			);
			const ir = await extractReflowDocument(engine, doc, items, regions);
			writeFileSync(
				join(root, `${tag}-reflow-ir.json`),
				JSON.stringify(ir, null, 2),
			);
			const fixed =
				mode !== "fixed"
					? []
					: (JSON.parse(
							readFileSync(
								join(
									root,
									name === "attention"
										? "fixed-reference-input.json"
										: "resnet-reference-input.json",
								),
								"utf8",
							),
						) as { source: string; translated: string }[]);
			const translations = new Map<string, string>();
			const service =
				mode === "service"
					? (JSON.parse(
							readFileSync(
								join(root, `${name}-service-translations.json`),
								"utf8",
							),
						) as Record<string, string>)
					: {};
			for (const p of ir.pages.flatMap((p) => p.paragraphs)) {
				if (mode !== "fixed") {
					const text = mode === "identity" ? p.protectedText : service[p.id];
					if (text) translations.set(p.id, text);
					continue;
				}
				const row = fixed.find((r) =>
					p.source
						.replace(/\s/g, "")
						.startsWith(r.source.replace(/\s/g, "").slice(0, 25)),
				);
				if (!row) continue;
				let text = row.translated;
				for (const f of p.formulas) {
					if (f.text === "8×") text = text.replace("8 倍", `⟪F${f.id}⟫`);
					else if (f.text === "×") text = text.replace("8 倍", `8⟪F${f.id}⟫`);
					else if (f.text === "1")
						text = text.replace("2015", `2015⟪F${f.id}⟫`);
					else if (text.includes(f.text))
						text = text.replace(f.text, `⟪F${f.id}⟫`);
					else
						throw new Error(`Unmapped formula ${JSON.stringify(f)} in ${p.id}`);
				}
				for (const id of Object.keys(p.styles)) {
					const content = new RegExp(`⟪S${id}⟫(.*?)⟪/S${id}⟫`)
						.exec(p.protectedText)?.[1]
						?.trim();
					const target = content === "test" ? "测试" : content;
					if (!target || !text.includes(target))
						throw new Error(`Unmapped style ${id}: ${content}`);
					text = text.replace(target, `⟪S${id}⟫${target}⟪/S${id}⟫`);
				}
				translations.set(p.id, text);
			}
			writeFileSync(
				join(root, `${tag}-reflow-ir.json`),
				JSON.stringify(ir, null, 2),
			);
			if (mode === "fixed")
				expect(translations.size).toBe(name === "attention" ? 3 : 4);
			else expect(translations.size).toBeGreaterThan(0);
			const output = await buildReflowPdf(engine, doc, ir, translations, {
				regular: readFileSync(
					join(dirname(font ?? ""), "NotoSerif-Regular.ttf"),
				),
				bold: readFileSync(join(dirname(font ?? ""), "NotoSerif-Bold.ttf")),
				italic: readFileSync(join(dirname(font ?? ""), "NotoSerif-Italic.ttf")),
				boldItalic: readFileSync(
					join(dirname(font ?? ""), "NotoSerif-BoldItalic.ttf"),
				),
				cjk: readFileSync(font ?? ""),
				cjkBold: readFileSync(
					join(dirname(font ?? ""), "SourceHanSerifCN-Bold.ttf"),
				),
			});
			writeFileSync(join(root, `${tag}-reflow.pdf`), output.bytes);
			writeFileSync(
				join(root, `${tag}-reflow-layout.json`),
				JSON.stringify(output.pages, null, 2),
			);
			expect(
				output.pages.flatMap((p) => p.paragraphs).every((p) => p.fits),
			).toBe(true);
			const exported = await engine
				.openDocumentBuffer({
					id: `${name}-output`,
					content: output.bytes.slice().buffer,
				})
				.toPromise();
			const text = await engine
				.getPageTextRuns(exported, exported.pages[0])
				.toPromise();
			const exportedText = text.runs.map((r) => r.text).join("");
			if (mode === "fixed") {
				expect(exportedText).toContain("摘要");
				expect(exportedText).not.toContain(
					name === "attention"
						? "Attention Is All You Need"
						: "Deep Residual Learning",
				);
			}
			await engine.closeDocument(exported).toPromise();
		} finally {
			await engine.closeDocument(doc).toPromise();
			await engine.destroy().toPromise();
		}
	}, 180000);
});
