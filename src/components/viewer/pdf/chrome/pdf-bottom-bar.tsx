import { ChevronLeft, ChevronRight, Minus, Palette, Plus } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SiArxiv } from "react-icons/si";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { PDF_CHROME_CHIP } from "@/components/viewer/pdf/chrome/pdf-chrome-surface";
import { cn } from "@/lib/core/utils";
import {
	PDF_PAPER_SWATCH_CLASS,
	PDF_PAPER_TONES,
	type PdfPaperTone,
} from "@/lib/pdf/page-theme";
import {
	formatPdfZoomPercentage,
	PDF_ZOOM_MAX,
	PDF_ZOOM_MIN,
	stepPdfZoom,
} from "@/lib/pdf/zoom";

type PdfBottomBarProps = {
	/** Hidden until the document reports its page count. */
	totalPages: number;
	/** Editable page number (raw digits while typing). */
	pageField: string;
	onPageFieldChange: (value: string) => void;
	/** True while the field owns focus, so scrolling does not clobber typing. */
	pageFocusedRef: RefObject<boolean>;
	onCommitPageField: () => void;
	/** Page the viewer is actually showing. Writing steppers use this. */
	currentPage?: number;
	onGoToPage?: (page: number) => void;
	pdfTone: PdfPaperTone;
	onSetPdfTone: (tone: PdfPaperTone) => void;
	/** Current zoom scale (1 = 100%). */
	zoomLevel: number;
	/** Apply a zoom scale from the slider. */
	onZoomChange: (zoom: number) => void;
	/** True for remote arXiv papers with no local sidecar. */
	isRemotePaper?: boolean;
	/** Floating chip over the page, or a row inside another toolbar. */
	variant?: "floating" | "inline";
};

/** Bottom bar: page nav + zoom slider + PDF paper tone. */
export const PdfBottomBar = memo(function PdfBottomBar({
	totalPages,
	pageField,
	onPageFieldChange,
	pageFocusedRef,
	onCommitPageField,
	currentPage,
	onGoToPage,
	pdfTone,
	onSetPdfTone,
	zoomLevel,
	onZoomChange,
	isRemotePaper = false,
	variant = "floating",
}: PdfBottomBarProps) {
	const { t } = useTranslation("viewer");
	const [tonePickerOpen, setTonePickerOpen] = useState(false);

	if (totalPages <= 0) return null;

	const pageDigits = Math.max(2, String(totalPages).length, pageField.length);
	const zoomPercent = Math.round(zoomLevel * 100);
	const zoomMinPercent = Math.round(PDF_ZOOM_MIN * 100);
	const zoomMaxPercent = Math.round(PDF_ZOOM_MAX * 100);
	const toneSide = variant === "inline" ? "bottom" : "top";
	const shownPage = currentPage ?? Number.parseInt(pageField, 10);
	const inline = variant === "inline";

	const pageFieldNode = (
		<div
			className={cn(
				"flex items-center",
				inline ? "shrink-0" : "min-w-0 shrink",
			)}
		>
			<input
				type="text"
				inputMode="numeric"
				className={cn(
					"min-w-6 rounded bg-transparent px-0.5 text-center font-medium text-foreground tabular-nums outline-none focus:bg-muted",
					inline ? "h-7 text-xs" : "text-sm",
				)}
				style={{ width: `${pageDigits + 1}ch` }}
				aria-label={t("pdf.goToPage")}
				value={pageField}
				onFocus={(e) => {
					pageFocusedRef.current = true;
					e.currentTarget.select();
				}}
				onChange={(e) =>
					onPageFieldChange(e.target.value.replace(/[^0-9]/g, ""))
				}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						onCommitPageField();
						e.currentTarget.blur();
					}
				}}
				onBlur={() => {
					pageFocusedRef.current = false;
					onCommitPageField();
				}}
			/>
			<span
				className={cn(
					"shrink-0 px-0.5 text-muted-foreground tabular-nums",
					inline ? "text-xs" : "text-sm",
				)}
			>
				/ {totalPages}
			</span>
		</div>
	);

	const tone = (
		<PdfPaperToneButton
			pdfTone={pdfTone}
			onSetPdfTone={onSetPdfTone}
			side={toneSide}
			size="icon-xs"
			open={tonePickerOpen}
			onOpenChange={setTonePickerOpen}
		/>
	);

	const chrome = (
		<TooltipProvider delayDuration={200}>
			<div
				data-pdf-chrome
				className={cn(
					"pointer-events-auto flex max-w-full select-none items-center",
					inline
						? "h-7 shrink-0 whitespace-nowrap rounded-[min(var(--radius-md),12px)] border border-border bg-background text-xs"
						: cn("gap-0.5 rounded-lg p-0.5", PDF_CHROME_CHIP),
				)}
			>
				{isRemotePaper ? (
					<Tooltip>
						<TooltipTrigger asChild>
							<div
								className={cn(
									"flex items-center gap-1 rounded px-1.5 py-0.5 text-primary",
									"bg-primary/10",
								)}
							>
								<SiArxiv
									className="size-3.5 shrink-0 text-[#B31B1B]"
									aria-hidden
								/>
								<span className="whitespace-nowrap text-caption font-medium">
									{t("pdf.remoteMode")}
								</span>
							</div>
						</TooltipTrigger>
						<TooltipContent side="top">{t("pdf.remoteMode")}</TooltipContent>
					</Tooltip>
				) : null}
				{inline ? (
					<StepButton
						label={t("pdf.previousPage")}
						disabled={!onGoToPage || shownPage <= 1}
						onClick={() => onGoToPage?.(shownPage - 1)}
					>
						<ChevronLeft />
					</StepButton>
				) : null}
				{pageFieldNode}
				{inline ? (
					<StepButton
						label={t("pdf.nextPage")}
						disabled={!onGoToPage || shownPage >= totalPages}
						onClick={() => onGoToPage?.(shownPage + 1)}
					>
						<ChevronRight />
					</StepButton>
				) : null}
				<span aria-hidden className="mx-0.5 h-3.5 w-px shrink-0 bg-border" />
				{inline ? (
					<>
						<StepButton
							label={t("pdf.zoomOut")}
							disabled={zoomLevel <= PDF_ZOOM_MIN}
							onClick={() => onZoomChange(stepPdfZoom(zoomLevel, -1))}
						>
							<Minus />
						</StepButton>
						<span className="w-9 shrink-0 text-center text-muted-foreground tabular-nums">
							{formatPdfZoomPercentage(zoomLevel)}%
						</span>
						<StepButton
							label={t("pdf.zoomIn")}
							disabled={zoomLevel >= PDF_ZOOM_MAX}
							onClick={() => onZoomChange(stepPdfZoom(zoomLevel, 1))}
						>
							<Plus />
						</StepButton>
					</>
				) : (
					<div className="flex shrink-0 items-center gap-1.5 px-1">
						<input
							type="range"
							min={zoomMinPercent}
							max={zoomMaxPercent}
							step={1}
							value={zoomPercent}
							aria-label={t("pdf.zoomPercentage")}
							aria-valuemin={zoomMinPercent}
							aria-valuemax={zoomMaxPercent}
							aria-valuenow={zoomPercent}
							aria-valuetext={`${formatPdfZoomPercentage(zoomLevel)}%`}
							className="pdf-zoom-slider"
							onChange={(e) => onZoomChange(Number(e.target.value) / 100)}
						/>
						<span
							aria-hidden
							className="min-w-[3.25ch] text-right text-muted-foreground text-xs tabular-nums"
						>
							{formatPdfZoomPercentage(zoomLevel)}%
						</span>
					</div>
				)}
				{inline ? null : (
					<>
						<span
							aria-hidden
							className="mx-0.5 h-3.5 w-px shrink-0 bg-border"
						/>
						{tone}
					</>
				)}
			</div>
		</TooltipProvider>
	);

	if (variant === "inline") return chrome;
	return (
		<div className="pointer-events-none absolute bottom-3 left-1/2 z-20 max-w-[calc(100%-1rem)] -translate-x-1/2">
			{chrome}
		</div>
	);
});

export function PdfPaperToneButton({
	pdfTone,
	onSetPdfTone,
	side = "bottom",
	size = "icon-sm",
	open,
	onOpenChange,
}: {
	pdfTone: PdfPaperTone;
	onSetPdfTone: (tone: PdfPaperTone) => void;
	side?: "top" | "bottom";
	size?: "icon-xs" | "icon-sm";
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}) {
	const { t } = useTranslation("viewer");
	const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
	const pickerOpen = open ?? uncontrolledOpen;
	const setPickerOpen = onOpenChange ?? setUncontrolledOpen;

	return (
		<Popover open={pickerOpen} onOpenChange={setPickerOpen}>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<Button
							type="button"
							size={size}
							variant="ghost"
							className="shrink-0 text-muted-foreground"
							aria-label={t("pdf.paperTone")}
							title={t("pdf.paperTone")}
						>
							<Palette className="size-3.5" />
						</Button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent side={side}>{t("pdf.paperTone")}</TooltipContent>
			</Tooltip>
			<PopoverContent
				side={side}
				align="end"
				className="w-auto flex-row items-center gap-1.5 p-1.5"
			>
				{PDF_PAPER_TONES.map((paperTone) => {
					const label = t(`pdf.paperToneOption.${paperTone}`);
					return (
						<Tooltip key={paperTone}>
							<TooltipTrigger asChild>
								<button
									type="button"
									aria-label={label}
									aria-pressed={pdfTone === paperTone}
									className={cn(
										"size-5 shrink-0 rounded-full ring-1 ring-black/15 transition-transform duration-100 hover:scale-105 active:scale-95 dark:ring-white/25",
										PDF_PAPER_SWATCH_CLASS[paperTone],
										pdfTone === paperTone &&
											"ring-2 ring-foreground/70 ring-offset-1 ring-offset-popover",
									)}
									onClick={() => {
										onSetPdfTone(paperTone);
										setPickerOpen(false);
									}}
								/>
							</TooltipTrigger>
							<TooltipContent side="top">{label}</TooltipContent>
						</Tooltip>
					);
				})}
			</PopoverContent>
		</Popover>
	);
}

function StepButton({
	label,
	disabled,
	onClick,
	children,
}: {
	label: string;
	disabled: boolean;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			disabled={disabled}
			className="flex h-7 w-6 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5"
			onClick={onClick}
		>
			{children}
		</button>
	);
}
