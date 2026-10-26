/**
 * Read / Write switch for the left rail.
 * Two modes, one window: reading keeps the vault tree, writing keeps one manuscript.
 */

import { BookOpen, ScrollText } from "lucide-react";
import { type KeyboardEvent, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/core/utils";
import type { WorkspaceSurface } from "@/lib/writing/session";

const SURFACES: {
	value: WorkspaceSurface;
	icon: typeof BookOpen;
	labelKey: "writing.read" | "writing.write";
	hintKey: "writing.readHint" | "writing.writeHint";
}[] = [
	{
		value: "reading",
		icon: BookOpen,
		labelKey: "writing.read",
		hintKey: "writing.readHint",
	},
	{
		value: "writing",
		icon: ScrollText,
		labelKey: "writing.write",
		hintKey: "writing.writeHint",
	},
];

export function WorkspaceModeSwitch({
	value,
	onChange,
}: {
	value: WorkspaceSurface;
	onChange: (next: WorkspaceSurface) => void;
}) {
	const { t } = useTranslation("sidebar");
	const tabs = useRef<Partial<Record<WorkspaceSurface, HTMLButtonElement>>>({});

	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
		event.preventDefault();
		const next: WorkspaceSurface =
			event.key === "ArrowRight" ? "writing" : "reading";
		onChange(next);
		tabs.current[next]?.focus();
	};

	return (
		<div
			role="tablist"
			aria-orientation="horizontal"
			aria-label={t("writing.switch")}
			className="grid grid-cols-2 rounded-md bg-muted p-0.5"
			onKeyDown={onKeyDown}
		>
			{SURFACES.map(({ value: surface, icon: Icon, labelKey, hintKey }) => {
				const selected = value === surface;
				return (
					<button
						key={surface}
						ref={(node) => {
							tabs.current[surface] = node ?? undefined;
						}}
						type="button"
						role="tab"
						aria-selected={selected}
						title={t(hintKey)}
						tabIndex={selected ? 0 : -1}
						onClick={() => onChange(surface)}
						className={cn(
							"flex h-7 min-w-0 items-center justify-center gap-1.5 rounded-[5px] px-2 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
							selected
								? "bg-background text-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						<Icon className="size-3.5 shrink-0" aria-hidden />
						<span className="truncate">{t(labelKey)}</span>
					</button>
				);
			})}
		</div>
	);
}
