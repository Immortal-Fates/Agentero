/**
 * Starter files for a writing project.
 * Conference kits are the official packages, copied unchanged.
 * The blank project is the only file this app writes itself.
 */

export const WRITING_TEMPLATE_IDS = [
	"blank",
	"cvpr",
	"icml",
	"iclr",
	"neurips",
	"acl",
	"eccv",
] as const;

export type WritingTemplateId = (typeof WRITING_TEMPLATE_IDS)[number];

export type WritingTemplateFile = {
	/** Path relative to the new project directory. May contain folders. */
	name: string;
	contents: string;
};

export type WritingTemplateAsset = {
	name: string;
	url: string;
};

const ROOTS: Record<Exclude<WritingTemplateId, "blank">, string> = {
	cvpr: "main.tex",
	icml: "example_paper.tex",
	iclr: "iclr2027_conference.tex",
	neurips: "neurips_2026.tex",
	acl: "acl_latex.tex",
	eccv: "main.tex",
};

const textFiles = import.meta.glob(
	"./vendor/*/**/*.{tex,sty,bst,bib,cls,clo,eps}",
	{ query: "?raw", import: "default", eager: true },
) as Record<string, string>;

const binaryFiles = import.meta.glob("./vendor/*/**/*.pdf", {
	query: "?url",
	import: "default",
	eager: true,
}) as Record<string, string>;

export function isWritingTemplateId(value: string): value is WritingTemplateId {
	return (WRITING_TEMPLATE_IDS as readonly string[]).includes(value);
}

function latexText(name: string): string {
	return name
		.replace(/\\/g, "\\textbackslash{}")
		.replace(/([&%$#_{}])/g, "\\$1");
}

function blankMain(title: string): string {
	return [
		"\\documentclass{article}",
		`\\title{${title}}`,
		"\\author{}",
		"\\begin{document}",
		"\\maketitle",
		"",
		"\\end{document}",
		"",
	].join("\n");
}

function kitFiles(
	id: Exclude<WritingTemplateId, "blank">,
	table: Record<string, string>,
): { name: string; value: string }[] {
	const prefix = `./vendor/${id}/`;
	return Object.entries(table)
		.map(([path, value]) => ({
			path: path.replaceAll("\\", "/"),
			value,
		}))
		.filter((item) => item.path.startsWith(prefix))
		.map((item) => ({
			name: item.path.slice(prefix.length),
			value: item.value,
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** Main file written for this template. Conference kits keep the official name. */
export function writingTemplateRoot(id: WritingTemplateId): string {
	if (id === "blank") return "main.tex";
	return ROOTS[id];
}

/** Text files to write. Conference kits are not rewritten. */
export function writingTemplateFiles(
	id: WritingTemplateId,
	title: string,
): WritingTemplateFile[] {
	if (id === "blank") {
		return [{ name: "main.tex", contents: blankMain(latexText(title)) }];
	}
	return kitFiles(id, textFiles).map((file) => ({
		name: file.name,
		contents: file.value,
	}));
}

/** Figures the official example includes. Fetched when the project is created. */
export function writingTemplateAssets(
	id: WritingTemplateId,
): WritingTemplateAsset[] {
	if (id === "blank") return [];
	return kitFiles(id, binaryFiles).map((file) => ({
		name: file.name,
		url: file.value,
	}));
}
