/**
 * Line diff for a writing snapshot against the file on disk.
 * Long files stay unrestored as text; the caller shows that case itself.
 */

export type DiffKind = "same" | "add" | "del" | "skip";

export type DiffRow = {
	kind: DiffKind;
	text: string;
};

const MAX_LINES = 900;

/** Myers is unnecessary here: a textbook LCS table is enough under the cap. */
export function diffLines(before: string, after: string): DiffRow[] | null {
	if (before === after) return [];
	const left = before.split("\n");
	const right = after.split("\n");
	if (left.length > MAX_LINES || right.length > MAX_LINES) return null;

	const width = right.length + 1;
	const table = new Uint32Array((left.length + 1) * width);
	for (let i = 1; i <= left.length; i++) {
		for (let j = 1; j <= right.length; j++) {
			table[i * width + j] =
				left[i - 1] === right[j - 1]
					? table[(i - 1) * width + (j - 1)] + 1
					: Math.max(table[(i - 1) * width + j], table[i * width + (j - 1)]);
		}
	}

	const stack: DiffRow[] = [];
	let i = left.length;
	let j = right.length;
	while (i > 0 && j > 0) {
		if (left[i - 1] === right[j - 1]) {
			stack.push({ kind: "same", text: left[i - 1] });
			i -= 1;
			j -= 1;
		} else if (table[(i - 1) * width + j] > table[i * width + (j - 1)]) {
			stack.push({ kind: "del", text: left[i - 1] });
			i -= 1;
		} else {
			stack.push({ kind: "add", text: right[j - 1] });
			j -= 1;
		}
	}
	while (i > 0) {
		i -= 1;
		stack.push({ kind: "del", text: left[i] });
	}
	while (j > 0) {
		j -= 1;
		stack.push({ kind: "add", text: right[j] });
	}
	stack.reverse();
	return stack;
}

/** Keep a little context around edits so an unchanged file does not fill the pane. */
export function collapseDiff(rows: readonly DiffRow[], context = 2): DiffRow[] {
	const keep = rows.map((row) => row.kind !== "same");
	for (let index = 0; index < rows.length; index++) {
		if (rows[index]?.kind === "same") continue;
		const start = Math.max(0, index - context);
		const end = Math.min(rows.length - 1, index + context);
		for (let cursor = start; cursor <= end; cursor++) keep[cursor] = true;
	}
	const collapsed: DiffRow[] = [];
	let skipping = false;
	for (let index = 0; index < rows.length; index++) {
		if (!keep[index]) {
			if (!skipping) collapsed.push({ kind: "skip", text: "" });
			skipping = true;
			continue;
		}
		skipping = false;
		const row = rows[index];
		if (row) collapsed.push(row);
	}
	return collapsed;
}
