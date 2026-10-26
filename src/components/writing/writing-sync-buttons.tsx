/**
 * Overleaf-style SyncTeX pair on the writing split: source → PDF on top,
 * PDF → source below. Both stay out of the editor toolbar.
 */

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { getTexEditorCursor } from "@/lib/tex/editor-navigation";
import { syncTexToPdf, syncWritingPdfToSource } from "@/lib/tex/synctex";
import { isTexPath } from "@/lib/workspace/viewer";

export function WritingSyncButtons({
	activeFile,
}: {
	activeFile: string | null;
}) {
	const { t } = useTranslation("latexLanguage");

	const syncForward = () => {
		const cursor =
			(activeFile && isTexPath(activeFile)
				? getTexEditorCursor(activeFile)
				: null) ?? getTexEditorCursor();
		if (!cursor) return;
		void syncTexToPdf(cursor.path, cursor.line, cursor.column, {
			scope: "writing",
		});
	};

	return (
		<div className="pointer-events-auto absolute top-1/2 left-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col rounded-full bg-foreground/90 p-0.5 text-background shadow-md ring-1 ring-black/10 dark:ring-white/15">
			<Button
				type="button"
				size="icon-xs"
				variant="ghost"
				aria-label={t("syncPdf")}
				title={`${t("syncPdf")} (⌘/Ctrl+Alt+J)`}
				className="rounded-full text-background hover:bg-background/15 hover:text-background"
				onClick={syncForward}
			>
				<ArrowRight className="size-3.5" aria-hidden />
			</Button>
			<Button
				type="button"
				size="icon-xs"
				variant="ghost"
				aria-label={t("syncSource")}
				title={t("syncSource")}
				className="rounded-full text-background hover:bg-background/15 hover:text-background"
				onClick={() => {
					syncWritingPdfToSource();
				}}
			>
				<ArrowLeft className="size-3.5" aria-hidden />
			</Button>
		</div>
	);
}
