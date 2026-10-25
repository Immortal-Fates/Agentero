/**
 * Starter files for a writing project.
 * Conference styles are the official kits, copied unchanged from
 * vendor/. The main file only fills in the project title.
 */

import aclSty from "./vendor/acl/acl.sty?raw";
import aclBst from "./vendor/acl/acl_natbib.bst?raw";
import cvprSty from "./vendor/cvpr/cvpr.sty?raw";
import cvprBst from "./vendor/cvpr/ieeenat_fullname.bst?raw";
import iclrFancy from "./vendor/iclr/fancyhdr.sty?raw";
import iclrBst from "./vendor/iclr/iclr2026_conference.bst?raw";
import iclrSty from "./vendor/iclr/iclr2026_conference.sty?raw";
import iclrNatbib from "./vendor/iclr/natbib.sty?raw";
import icmlAlgorithm from "./vendor/icml/algorithm.sty?raw";
import icmlAlgorithmic from "./vendor/icml/algorithmic.sty?raw";
import icmlFancy from "./vendor/icml/fancyhdr.sty?raw";
import icmlBst from "./vendor/icml/icml2026.bst?raw";
import icmlSty from "./vendor/icml/icml2026.sty?raw";
import neuripsChecklist from "./vendor/neurips/checklist.tex?raw";
import neuripsSty from "./vendor/neurips/neurips_2026.sty?raw";

export const WRITING_TEMPLATE_IDS = [
	"blank",
	"cvpr",
	"icml",
	"iclr",
	"neurips",
	"acl",
] as const;

export type WritingTemplateId = (typeof WRITING_TEMPLATE_IDS)[number];

export type WritingTemplateFile = {
	name: string;
	contents: string;
};

const BIBLIOGRAPHY = "% References.\n";

export function isWritingTemplateId(value: string): value is WritingTemplateId {
	return (WRITING_TEMPLATE_IDS as readonly string[]).includes(value);
}

function latexText(name: string): string {
	return name
		.replace(/\\/g, "\\textbackslash{}")
		.replace(/([&%$#_{}])/g, "\\$1");
}

function files(
	main: string,
	extras: WritingTemplateFile[],
): WritingTemplateFile[] {
	return [
		{ name: "main.tex", contents: main },
		{ name: "main.bib", contents: BIBLIOGRAPHY },
		...extras,
	];
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

function cvprMain(title: string): string {
	return [
		"\\documentclass[10pt,twocolumn,letterpaper]{article}",
		"\\usepackage[review]{cvpr}",
		"\\definecolor{cvprblue}{rgb}{0.21,0.49,0.74}",
		"\\usepackage[pagebackref,breaklinks,colorlinks,allcolors=cvprblue]{hyperref}",
		"\\def\\paperID{*****}",
		"\\def\\confName{CVPR}",
		"\\def\\confYear{2026}",
		`\\title{${title}}`,
		"\\author{Anonymous}",
		"\\begin{document}",
		"\\maketitle",
		"\\begin{abstract}",
		"\\end{abstract}",
		"\\section{Introduction}",
		"",
		"{",
		"\\small",
		"\\bibliographystyle{ieeenat_fullname}",
		"\\bibliography{main}",
		"}",
		"\\end{document}",
		"",
	].join("\n");
}

function icmlMain(title: string): string {
	return [
		"\\documentclass{article}",
		"\\usepackage{microtype}",
		"\\usepackage{graphicx}",
		"\\usepackage{booktabs}",
		"\\usepackage{hyperref}",
		"\\usepackage{icml2026}",
		"\\usepackage{amsmath}",
		"\\usepackage{amssymb}",
		`\\icmltitlerunning{${title}}`,
		"\\begin{document}",
		"\\twocolumn[",
		`\\icmltitle{${title}}`,
		"",
		"\\begin{icmlauthorlist}",
		"\\icmlauthor{Anonymous}{anon}",
		"\\end{icmlauthorlist}",
		"",
		"\\icmlaffiliation{anon}{Anonymous Institution}",
		"\\icmlcorrespondingauthor{Anonymous}{anon@example.com}",
		"\\icmlkeywords{Machine Learning}",
		"",
		"\\vskip 0.3in",
		"]",
		"",
		"\\printAffiliationsAndNotice{}",
		"",
		"\\begin{abstract}",
		"\\end{abstract}",
		"",
		"\\section{Introduction}",
		"",
		"\\bibliographystyle{icml2026}",
		"\\bibliography{main}",
		"\\end{document}",
		"",
	].join("\n");
}

function iclrMain(title: string): string {
	return [
		"\\documentclass{article}",
		"\\usepackage{iclr2026_conference,times}",
		"\\usepackage{hyperref}",
		"\\usepackage{url}",
		`\\title{${title}}`,
		"\\author{Anonymous}",
		"\\begin{document}",
		"\\maketitle",
		"\\begin{abstract}",
		"\\end{abstract}",
		"\\section{Introduction}",
		"\\bibliographystyle{iclr2026_conference}",
		"\\bibliography{main}",
		"\\end{document}",
		"",
	].join("\n");
}

function neuripsMain(title: string): string {
	return [
		"\\documentclass{article}",
		"\\usepackage{neurips_2026}",
		"\\usepackage[utf8]{inputenc}",
		"\\usepackage[T1]{fontenc}",
		"\\usepackage{hyperref}",
		"\\usepackage{url}",
		`\\title{${title}}`,
		"\\author{Anonymous}",
		"\\begin{document}",
		"\\maketitle",
		"\\begin{abstract}",
		"\\end{abstract}",
		"\\section{Introduction}",
		"",
		"{",
		"\\small",
		"\\bibliographystyle{plainnat}",
		"\\bibliography{main}",
		"}",
		"",
		"\\input{checklist.tex}",
		"\\end{document}",
		"",
	].join("\n");
}

function aclMain(title: string): string {
	return [
		"\\documentclass[11pt]{article}",
		"\\usepackage[review]{acl}",
		"\\usepackage{times}",
		"\\usepackage{latexsym}",
		"\\usepackage[T1]{fontenc}",
		"\\usepackage[utf8]{inputenc}",
		"\\usepackage{graphicx}",
		`\\title{${title}}`,
		"\\author{Anonymous}",
		"\\begin{document}",
		"\\maketitle",
		"\\begin{abstract}",
		"\\end{abstract}",
		"\\section{Introduction}",
		"\\bibliography{main}",
		"\\end{document}",
		"",
	].join("\n");
}

/** Files to write into thesis/<name>/. main.tex is always first. */
export function writingTemplateFiles(
	id: WritingTemplateId,
	title: string,
): WritingTemplateFile[] {
	const safe = latexText(title);
	switch (id) {
		case "blank":
			return [{ name: "main.tex", contents: blankMain(safe) }];
		case "cvpr":
			return files(cvprMain(safe), [
				{ name: "cvpr.sty", contents: cvprSty },
				{ name: "ieeenat_fullname.bst", contents: cvprBst },
			]);
		case "icml":
			return files(icmlMain(safe), [
				{ name: "icml2026.sty", contents: icmlSty },
				{ name: "icml2026.bst", contents: icmlBst },
				{ name: "fancyhdr.sty", contents: icmlFancy },
				{ name: "algorithm.sty", contents: icmlAlgorithm },
				{ name: "algorithmic.sty", contents: icmlAlgorithmic },
			]);
		case "iclr":
			return files(iclrMain(safe), [
				{ name: "iclr2026_conference.sty", contents: iclrSty },
				{ name: "iclr2026_conference.bst", contents: iclrBst },
				{ name: "fancyhdr.sty", contents: iclrFancy },
				{ name: "natbib.sty", contents: iclrNatbib },
			]);
		case "neurips":
			return files(neuripsMain(safe), [
				{ name: "neurips_2026.sty", contents: neuripsSty },
				{ name: "checklist.tex", contents: neuripsChecklist },
			]);
		case "acl":
			return files(aclMain(safe), [
				{ name: "acl.sty", contents: aclSty },
				{ name: "acl_natbib.bst", contents: aclBst },
			]);
	}
}
