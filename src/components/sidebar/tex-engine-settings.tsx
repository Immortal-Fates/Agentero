/**
 * Engine list for one TeX file. Writing shows this on its own in Settings.
 */

import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { cn } from "@/lib/core/utils";
import { texSettingsStore } from "@/lib/tex/config";
import { rememberTexEngine } from "@/lib/tex/engine";
import {
	initTexEngines,
	inspectTexEngine,
	type TexEngineChoice,
	texCompileStore,
} from "@/lib/workspace/tex-compile";

export function TexEngineForm({ texPath }: { texPath: string }) {
	const { t } = useTranslation("sidebar");
	const engines = useStore(texCompileStore, (state) => state.engines);
	const enginesLoading = useStore(
		texCompileStore,
		(state) => state.enginesLoading,
	);
	const explicitRoots = useStore(texSettingsStore, (state) => state.roots);
	const [engineChoice, setEngineChoice] = useState<TexEngineChoice | null>(
		null,
	);
	const hasEngines = !enginesLoading && engines.length > 0;

	useEffect(() => {
		initTexEngines();
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: inspectTexEngine reads persisted root overrides.
	useEffect(() => {
		if (enginesLoading && engines.length === 0) return;
		let cancelled = false;
		void inspectTexEngine(texPath).then((choice) => {
			if (!cancelled) setEngineChoice(choice);
		});
		return () => {
			cancelled = true;
		};
	}, [texPath, engines, enginesLoading, explicitRoots]);

	return (
		<div className="flex flex-col">
			{engineChoice?.locked ? (
				<p className="text-muted-foreground border-b border-border/50 px-3.5 py-2 text-xs">
					{t("latexPanel.engineFromFile")}
				</p>
			) : null}
			{enginesLoading ? (
				<p className="text-muted-foreground px-3.5 py-2.5 text-xs">
					{t("fileTree.detectingEngines")}
				</p>
			) : hasEngines ? (
				<div
					role="listbox"
					aria-label={t("fileTree.latexEngine")}
					className="flex flex-col"
				>
					{engines.map((engine) => {
						const selected = engineChoice?.engineId === engine.id;
						return (
							<button
								key={engine.id}
								type="button"
								role="option"
								aria-selected={selected}
								disabled={engineChoice?.locked}
								onClick={() => {
									if (!engineChoice || engineChoice.locked) return;
									rememberTexEngine(engineChoice.rootPath, engine.id);
									setEngineChoice({
										...engineChoice,
										engineId: engine.id,
									});
								}}
								className={cn(
									"flex w-full items-center gap-2 px-3.5 py-2 text-left text-sm",
									"hover:bg-muted/70",
									"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
									"disabled:cursor-default disabled:opacity-100 disabled:hover:bg-transparent",
									selected && "bg-muted/50",
								)}
							>
								<Check
									className={cn(
										"size-3.5 shrink-0",
										selected ? "opacity-100" : "opacity-0",
									)}
									aria-hidden
								/>
								<span className="min-w-0 flex-1 truncate">{engine.label}</span>
							</button>
						);
					})}
				</div>
			) : (
				<p className="text-muted-foreground px-3.5 py-2.5 text-xs">
					{t("fileTree.noLatexEngine")}
				</p>
			)}
		</div>
	);
}
