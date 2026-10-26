export type LintSeverity = "error" | "warning" | "info";

export type EditorDiagnostic = {
	from: number;
	to: number;
	severity: LintSeverity;
	message: string;
	source?: string;
	/** 1-based position of the diagnostic start, IDE-style. */
	line: number;
	column: number;
};
