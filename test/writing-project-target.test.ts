import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	find: vi.fn(),
	root: vi.fn(),
	pdf: vi.fn(),
}));
vi.mock("@/lib/writing/discover", () => ({ findTexRoot: mocks.find }));
vi.mock("@/lib/workspace/tex-compile", () => ({
	resolveTexRoot: mocks.root,
	resolveTexPdfPath: mocks.pdf,
}));

import { resolveWritingTarget } from "@/lib/writing/project-target";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.find.mockImplementation(async (_vault: string, dir: string) =>
		dir === "/vault/thesis/paper" ? `${dir}/main.tex` : null,
	);
	mocks.root.mockImplementation(async (path: string) => path);
	mocks.pdf.mockImplementation(async (path: string) =>
		path.replace(/\.tex$/, ".pdf"),
	);
});
describe("writing project membership", () => {
	it.each([
		"refs.bib",
		"style.sty",
		"images/chart.png",
		"notes.md",
		"chapters/intro.tex",
	])("resolves the same owning project for %s", async (file) => {
		expect(
			await resolveWritingTarget("/vault", `/vault/thesis/paper/${file}`),
		).toEqual({ root: "/vault/thesis/paper/main.tex", compiledPdf: false });
	});
	it("opens a project directory and identifies only its configured compiled PDF", async () => {
		expect(
			await resolveWritingTarget("/vault", "/vault/thesis/paper", true),
		).toEqual({ root: "/vault/thesis/paper/main.tex", compiledPdf: false });
		expect(
			(await resolveWritingTarget("/vault", "/vault/thesis/paper/main.pdf"))
				?.compiledPdf,
		).toBe(true);
		expect(
			(
				await resolveWritingTarget(
					"/vault",
					"/vault/thesis/paper/references/main.pdf",
				)
			)?.compiledPdf,
		).toBe(false);
	});
	it("does not borrow another project's root or treat the writing shelf as a project", async () => {
		expect(
			await resolveWritingTarget("/vault", "/vault/thesis/other/main.pdf"),
		).toBeNull();
		expect(
			await resolveWritingTarget("/vault", "/vault/thesis", true),
		).toBeNull();
		expect(
			await resolveWritingTarget("/vault", "/vault/papers/main.pdf"),
		).toBeNull();
	});
	it("supports legacy files directly under thesis and custom build output", async () => {
		mocks.find.mockImplementation(async (_vault: string, dir: string) =>
			dir === "/vault/thesis" ? `${dir}/main.tex` : null,
		);
		mocks.pdf.mockResolvedValue("/vault/thesis/build/output.pdf");
		expect(
			await resolveWritingTarget("/vault", "/vault/thesis/build/output.pdf"),
		).toEqual({ root: "/vault/thesis/main.tex", compiledPdf: true });
	});
});
