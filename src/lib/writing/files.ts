/**
 * Which files belong in the manuscript navigator.
 * Build products stay on disk and out of the list; project config stays.
 */

const SKIP_DIRECTORIES = new Set(["build", "out", "aux", "node_modules"]);

const SKIP_EXTENSIONS = new Set([
	"aux",
	"log",
	"out",
	"toc",
	"lof",
	"lot",
	"fls",
	"fdb_latexmk",
	"bbl",
	"blg",
	"nav",
	"snm",
	"vrb",
	"xdv",
	"bcf",
	"idx",
	"ilg",
	"ind",
	"acn",
	"acr",
	"alg",
	"glg",
	"glo",
	"gls",
	"ist",
	"fff",
	"ttt",
]);

export type WritingNodeKind = "file" | "directory";

export function isWritingSourceName(
	kind: WritingNodeKind,
	name: string,
): boolean {
	const lower = name.toLowerCase();
	if (kind === "directory") {
		if (lower.startsWith(".") || lower.startsWith("_minted")) return false;
		return !SKIP_DIRECTORIES.has(lower);
	}
	if (lower === ".ds_store") return false;
	if (lower.endsWith(".synctex.gz") || lower.endsWith(".run.xml")) return false;
	if (lower.startsWith(".") && lower !== ".latexmkrc") return false;
	const dot = lower.lastIndexOf(".");
	const ext = dot >= 0 ? lower.slice(dot + 1) : "";
	return !SKIP_EXTENSIONS.has(ext);
}

export function compareWritingNodes(
	a: { kind: WritingNodeKind; name: string },
	b: { kind: WritingNodeKind; name: string },
): number {
	if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
	return a.name.localeCompare(b.name, undefined, {
		numeric: true,
		sensitivity: "base",
	});
}
