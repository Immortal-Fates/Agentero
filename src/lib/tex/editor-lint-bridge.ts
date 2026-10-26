/**
 * Writing shows the editor's lint counts on the PDF bar, not under the source.
 */

import { createStore } from "zustand/vanilla";
import type { EditorDiagnostic } from "@/lib/tex/editor-diagnostic";

export type EditorLintBridge = {
	path: string;
	diagnostics: EditorDiagnostic[];
	jump: (diagnostic: EditorDiagnostic) => void;
	jumpToLine: (line: number) => void;
};

export const editorLintStore = createStore<{
	current: EditorLintBridge | null;
}>(() => ({ current: null }));

/** A compile problem asked to open this file and place the cursor on a line. */
export const pendingEditorLineJump = createStore<{
	path: string;
	line: number;
}>(() => ({ path: "", line: 0 }));
