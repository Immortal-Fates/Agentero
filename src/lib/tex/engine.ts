/**
 * Which engine latexmk should call.
 *
 * The document wins (`% !TEX program` / `% !TEX TS-program` on the root
 * file). Otherwise the last choice saved for that root, then the engine
 * its class or packages require (conference kits are pdfLaTeX), then
 * XeLaTeX when it is installed.
 */

import { normalizePath } from "@/lib/core/path";
import { readJsonStorage, writeJsonStorage } from "@/lib/core/storage";

const ENGINE_STORAGE_KEY = "agentero.texEngineByRoot";
const KNOWN_ENGINES = new Set(["pdflatex", "xelatex", "lualatex"]);

/** First `% !TEX program = …` / `% !TEX TS-program = …` that names an engine. */
export function parseTexProgram(content: string): string | null {
	for (const line of content.split(/\r?\n/)) {
		const match = line.match(/^\s*%\s*!\s*TEX\s+(?:TS-)?program\s*=\s*(\S+)/i);
		if (!match) continue;
		const id = match[1].toLowerCase();
		if (KNOWN_ENGINES.has(id)) return id;
	}
	return null;
}

const CONFERENCE_ENGINE =
	/\\(?:usepackage|documentclass)(?:\[[^\]]*\])?\{[^}]*\b(?:cvpr|iccv|iclr\d*(?:_conference)?|icml\d*|neurips(?:_\d+)?|acl|eccvabbrv|eccv|llncs)\b/;

function preambleOf(content: string): string {
	const head = content.split(/\\begin\s*\{document\}/)[0] ?? content;
	return head
		.split(/\r?\n/)
		.map((line) => {
			for (let index = 0; index < line.length; index++) {
				if (line[index] === "%" && (index === 0 || line[index - 1] !== "\\")) {
					return line.slice(0, index);
				}
			}
			return line;
		})
		.join("\n");
}

/**
 * Engine a template needs when it does not say so with `% !TEX program`.
 * Conference classes here are pdfLaTeX. `fontspec` / `babelfont` are not.
 */
export function inferRequiredEngine(content: string): string | null {
	const preamble = preambleOf(content);
	if (/\\(?:babelfont|babelprovide)\b/.test(preamble)) return "lualatex";
	if (
		/\\usepackage(?:\[[^\]]*\])?\{[^}]*\b(?:fontspec|polyglossia|xeCJK)\b/.test(
			preamble,
		) ||
		/\\documentclass(?:\[[^\]]*\])?\{[^}]*\bctex(?:art|rep|book)?\b/.test(
			preamble,
		)
	) {
		return "xelatex";
	}
	if (CONFERENCE_ENGINE.test(preamble)) return "pdflatex";
	return null;
}

export function chooseTexEngine(opts: {
	magic: string | null;
	remembered: string | null;
	required: string | null;
	available: readonly string[];
}): string | null {
	const has = (id: string | null): id is string =>
		id != null && opts.available.includes(id);
	if (has(opts.magic)) return opts.magic;
	if (has(opts.remembered)) return opts.remembered;
	if (opts.required) {
		if (has(opts.required)) return opts.required;
		if (opts.required === "lualatex" && has("xelatex")) return "xelatex";
		if (opts.required === "xelatex" && has("lualatex")) return "lualatex";
		return null;
	}
	if (has("xelatex")) return "xelatex";
	return opts.available[0] ?? null;
}

export function rememberedTexEngine(rootPath: string): string | null {
	const map = readJsonStorage<Record<string, string>>(ENGINE_STORAGE_KEY, {});
	const id = map?.[normalizePath(rootPath)];
	return typeof id === "string" ? id : null;
}

export function rememberTexEngine(rootPath: string, engineId: string): void {
	const map = readJsonStorage<Record<string, string>>(ENGINE_STORAGE_KEY, {});
	writeJsonStorage(ENGINE_STORAGE_KEY, {
		...(map && typeof map === "object" ? map : {}),
		[normalizePath(rootPath)]: engineId,
	});
}
