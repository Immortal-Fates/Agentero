import { isPaperAttachmentsDirName } from "@/lib/paper/paths";

const PDF_NAME_RE = /\.pdf$/i;
const TEX_NAME_RE = /\.(tex|ltx)$/i;
const PAPER_MD_RE = /^paper\.md$/i;

type TreeWalkNode = {
	name: string;
	kind?: string;
	path?: string;
	/** Lazy `source/` shells carry a Host-computed TeX-on-disk flag. */
	hasTex?: boolean;
	needsSource?: boolean;
	children?: Array<{
		name: string;
		kind?: string;
		path?: string;
		hasTex?: boolean;
		needsSource?: boolean;
		children?: unknown[];
	}>;
};

export function paperHasLocalPdf(node: TreeWalkNode): boolean {
	return (
		(node.kind !== "directory" && PDF_NAME_RE.test(node.name)) ||
		(node.children ?? []).some(
			(child) => child.kind !== "directory" && PDF_NAME_RE.test(child.name),
		)
	);
}

export function paperHasLocalTex(node: TreeWalkNode): boolean {
	// Lazy `source/` shells have no listed children; trust the on-disk flag.
	if (node.hasTex != null) return node.hasTex;
	for (const child of node.children ?? []) {
		if (isPaperAttachmentsDirName(child.name)) continue;
		if (paperHasLocalTex(child as TreeWalkNode)) return true;
	}
	return node.kind !== "directory" && TEX_NAME_RE.test(node.name);
}

/** True when the paper folder has a direct-child `PAPER.md`. */
export function paperHasLocalPaperMd(node: TreeWalkNode): boolean {
	return (
		(node.kind !== "directory" && PAPER_MD_RE.test(node.name)) ||
		(node.children ?? []).some(
			(child) => child.kind !== "directory" && PAPER_MD_RE.test(child.name),
		)
	);
}

/**
 * Reasons a paper row should show the Download icon (for hover tooltip).
 * Keys are i18n suffixes under `sidebar:fileTree.downloadReason.*`.
 *
 * Readable body: **TeX OR PAPER.md** is enough (prefer TeX — if TeX exists, PAPER.md is not required).
 */
export type PaperDownloadReason = "noPdf" | "noBody" | "noSource";

/** Host source repair is independent of derived Markdown. Local files, not
 * catalog labels, determine PDF/body readiness. */
export function paperAssetDownloadReasons(
	node: TreeWalkNode,
	meta?: { body_source?: string | null } | null,
): PaperDownloadReason[] {
	const reasons: PaperDownloadReason[] = [];
	if (!paperHasLocalPdf(node)) reasons.push("noPdf");
	void meta; // Catalog source labels can outlive the local source/body files.
	if (node.needsSource) {
		reasons.push("noSource");
	} else if (!paperHasLocalTex(node) && !paperHasLocalPaperMd(node)) {
		reasons.push("noBody");
	}
	return reasons;
}

/** Show file-tree Download when PDF / source / readable body is incomplete. */
export function paperNeedsAssetDownload(
	node: TreeWalkNode,
	meta?: { body_source?: string | null } | null,
): boolean {
	return paperAssetDownloadReasons(node, meta).length > 0;
}

/**
 * Local assets are complete enough for reading / paper-reader:
 * PDF present, and TeX or PAPER.md as readable body.
 */
function paperAssetsComplete(
	node: TreeWalkNode,
	meta?: { body_source?: string | null } | null,
): boolean {
	return paperAssetDownloadReasons(node, meta).length === 0;
}

/**
 * Show the file-tree read action when assets are complete and catalog says
 * not yet read.
 */
export function paperNeedsRead(
	node: TreeWalkNode,
	meta: { is_read?: boolean; body_source?: string | null } | null | undefined,
): boolean {
	if (!paperAssetsComplete(node, meta)) return false;
	return !(meta?.is_read === true);
}
