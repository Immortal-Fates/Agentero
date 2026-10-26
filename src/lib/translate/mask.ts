/**
 * Protect tokens that MT engines mangle (inline math, LaTeX commands, URLs,
 * DOIs, citation markers, cross-references, and Markdown links) by swapping
 * them for opaque placeholders before the request and restoring them afterwards.
 */

import { findPreservedLinkSpans } from "@/lib/translate/preserved-links";

export type MaskedToken = {
	placeholder: string;
	original: string;
};

export type MaskedText = {
	text: string;
	tokens: MaskedToken[];
};

export type RestoredText = {
	text: string;
	/** Placeholders the engine dropped or rewrote; caller decides retry policy. */
	missing: number;
	/** Duplicated or invented placeholders invalidate structural restoration. */
	invalid?: boolean;
};

/**
 * Mathematical white square brackets: absent from paper prose, and left alone
 * by MT engines far more reliably than ASCII brackets, which collide with
 * citation markers and with the `[[n]]` batch numbering.
 */
function placeholderFor(index: number): string {
	return `⟦${index}⟧`;
}

const MASK_PATTERNS: RegExp[] = [
	/⟪(?:F|\/?S)\d+⟫/gu,
	// Display / inline TeX math (present when the source came from LaTeX).
	/\$\$[^$]{1,400}\$\$/g,
	/\$[^$\n]{1,200}\$/g,
	/\\\((?:[^\\]|\\[^)]){1,200}?\\\)/g,
	// LaTeX commands with or without a braced argument.
	/\\[A-Za-z]+(?:\{[^{}]{0,120}\})?/g,
	// Links and identifiers.
	/https?:\/\/[^\s、，。]+/g,
	/\bdoi:\s*10\.\d{4,9}\/\S+/gi,
	/\b10\.\d{4,9}\/[^\s、，。]+/g,
];

export function maskInlineTokens(text: string): MaskedText {
	const tokens: MaskedToken[] = [];
	const spans = findPreservedLinkSpans(text);
	const placeholders = spans.map((_, index) => placeholderFor(index));
	spans.forEach((span, index) => {
		const placeholder = placeholders[index];
		if (!placeholder) return;
		tokens.push({ placeholder, original: span.text });
	});
	let masked = text;
	for (let index = spans.length - 1; index >= 0; index--) {
		const span = spans[index];
		const placeholder = placeholders[index];
		if (!span || !placeholder) continue;
		masked = masked.slice(0, span.start) + placeholder + masked.slice(span.end);
	}
	for (const pattern of MASK_PATTERNS) {
		masked = masked.replace(
			new RegExp(pattern.source, pattern.flags),
			(hit) => {
				// Already-masked spans must not be re-wrapped by a later pattern.
				if (/^⟦\d+⟧$/.test(hit)) return hit;
				const placeholder = placeholderFor(tokens.length);
				tokens.push({ placeholder, original: hit });
				return placeholder;
			},
		);
	}
	return { text: masked, tokens };
}

export function restoreInlineTokens(
	text: string,
	tokens: readonly MaskedToken[],
): RestoredText {
	let out = text;
	let missing = 0;
	let invalid = false;
	const known = new Set(tokens.map((token) => token.placeholder.slice(1, -1)));
	for (const match of text.matchAll(/⟦\s*(\d+)\s*⟧/g)) {
		if (!known.has(match[1] ?? "")) invalid = true;
	}
	for (const token of tokens) {
		// Engines sometimes pad the brackets ("⟦ 0 ⟧") or drop the token entirely.
		const body = token.placeholder.slice(1, -1);
		if ([...text.matchAll(new RegExp(`⟦\\s*${body}\\s*⟧`, "g"))].length > 1)
			invalid = true;
		if (!new RegExp(`⟦\\s*${body}\\s*⟧`).test(out)) {
			missing += 1;
			continue;
		}
		out = out.replace(
			new RegExp(`⟦\\s*${body}\\s*⟧`, "g"),
			() => token.original,
		);
	}
	return invalid
		? { text: out, missing, invalid: true }
		: { text: out, missing };
}
