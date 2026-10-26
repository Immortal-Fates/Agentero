/**
 * Page and zoom controls for the writing PDF, drawn on the compile bar.
 */

import type { RefObject } from "react";
import { createStore } from "zustand/vanilla";
import type { PdfPaperTone } from "@/lib/pdf/page-theme";

export type WritingPdfChrome = {
	totalPages: number;
	pageField: string;
	onPageFieldChange: (value: string) => void;
	pageFocusedRef: RefObject<boolean>;
	onCommitPageField: () => void;
	currentPage: number;
	onGoToPage: (page: number) => void;
	pdfTone: PdfPaperTone;
	onSetPdfTone: (tone: PdfPaperTone) => void;
	zoomLevel: number;
	onZoomChange: (zoom: number) => void;
};

export const writingPdfChromeStore = createStore<{
	current: WritingPdfChrome | null;
}>(() => ({ current: null }));
