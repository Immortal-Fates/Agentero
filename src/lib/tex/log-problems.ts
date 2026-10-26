/**
 * Pull errors and warnings out of a LaTeX log so the writing bar can
 * show the same findings as the raw log.
 */

export type LogProblem = {
	severity: "error" | "warning";
	message: string;
	file?: string;
	line?: number;
	logLine: number;
};

const FILE_LINE = /^(?:\.[\\/])?([^\s:]+\.(?:tex|sty|cls|bib)):(\d+):\s+(.+)$/i;
const WARNING = /^(?:LaTeX|Class|Package)(?: \S+)? Warning:\s*(.*)$/;
const BOX = /^(?:Overfull|Underfull) \\[hv]box .* at lines (\d+)/;
const OPENED = /\((?:\.[\\/])?([^\s()]+\.(?:tex|sty|cls))/;

export function parseLatexLog(text: string): LogProblem[] {
	const lines = text.split(/\r?\n/);
	const problems: LogProblem[] = [];
	let currentFile: string | undefined;
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index] ?? "";
		const opened = line.match(OPENED);
		if (opened?.[1]) currentFile = opened[1];

		const located = line.match(FILE_LINE);
		if (located) {
			const message = located[3] ?? "";
			problems.push({
				severity: /warning/i.test(message) ? "warning" : "error",
				message,
				file: located[1],
				line: Number(located[2]),
				logLine: index,
			});
			continue;
		}
		const warning = line.match(WARNING);
		if (warning) {
			const message = (warning[1] || line).trim();
			const inline = message.match(/on input line (\d+)/);
			problems.push({
				severity: "warning",
				message,
				file: currentFile,
				line: inline ? Number(inline[1]) : undefined,
				logLine: index,
			});
			continue;
		}
		if (line.startsWith("! ")) {
			let sourceLine: number | undefined;
			const end = Math.min(index + 8, lines.length);
			for (let next = index + 1; next < end; next++) {
				const marker = lines[next]?.match(/^l\.(\d+)/);
				if (marker) {
					sourceLine = Number(marker[1]);
					break;
				}
			}
			problems.push({
				severity: "error",
				message: line.slice(2).trim(),
				file: currentFile,
				line: sourceLine,
				logLine: index,
			});
			continue;
		}
		const box = line.match(BOX);
		if (box) {
			problems.push({
				severity: "warning",
				message: line.trim(),
				file: currentFile,
				line: Number(box[1]),
				logLine: index,
			});
		}
	}
	return problems;
}
