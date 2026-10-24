import { describe, expect, it, vi } from "vitest";

import { canonicalPaperPdfPath, findLocalPdfPath } from "@/lib/paper/media";

const { readDir } = vi.hoisted(() => ({ readDir: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({ readDir }));
vi.mock("@/lib/core/tauri", () => ({ isTauri: () => true }));

describe("canonical paper PDF", () => {
	it("prefers the canonical root PDF and never opens source illustrations", async () => {
		readDir.mockResolvedValueOnce([
			{ name: "source", isDirectory: true },
			{ name: "a.pdf", isFile: true },
			{ name: "demo.pdf", isFile: true },
		]);
		expect(await findLocalPdfPath("/vault/papers/demo")).toBe(
			"/vault/papers/demo/demo.pdf",
		);
		readDir.mockResolvedValueOnce([{ name: "source", isDirectory: true }]);
		expect(await findLocalPdfPath("/vault/papers/demo")).toBeNull();
	});
	it("uses the paper folder name as {id}.pdf at the paper root", () => {
		expect(canonicalPaperPdfPath("/vault/papers/2401.12345")).toBe(
			"/vault/papers/2401.12345/2401.12345.pdf",
		);
		expect(canonicalPaperPdfPath("/vault/papers/2401.12345/")).toBe(
			"/vault/papers/2401.12345/2401.12345.pdf",
		);
		expect(canonicalPaperPdfPath("C:\\vault\\papers\\demo")).toBe(
			"C:\\vault\\papers\\demo\\demo.pdf",
		);
		expect(canonicalPaperPdfPath("remote:sess/papers/abc")).toBe(
			"remote:sess/papers/abc/abc.pdf",
		);
	});

	it("does not invent a path when the paper folder is missing", () => {
		expect(canonicalPaperPdfPath("")).toBeNull();
		expect(canonicalPaperPdfPath("   ")).toBeNull();
		expect(canonicalPaperPdfPath(".")).toBeNull();
		expect(canonicalPaperPdfPath("..")).toBeNull();
	});
});
