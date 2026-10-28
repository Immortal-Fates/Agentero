import type { DockviewApi } from "dockview-react";
import { writingHistoryProjectRel } from "@/lib/writing/session";
import type { DocTab } from "./tabs";

export function isWritingSource(
	tab: DocTab | undefined,
	vault: string | null,
): boolean {
	return Boolean(
		vault && tab?.writingRoot && writingHistoryProjectRel(vault, tab.path),
	);
}

/** Temporarily fill the center with the project, preserving the reading split geometry. */
export function createWritingFocus() {
	let ownsMaximization = false;
	return (api: DockviewApi, tab: DocTab | undefined, vault: string | null) => {
		const panel = api.activePanel;
		if (panel && isWritingSource(tab, vault)) {
			ownsMaximization = true;
			if (!panel.api.isMaximized()) {
				api.maximizeGroup(panel);
			}
		} else if (ownsMaximization) {
			ownsMaximization = false;
			if (api.hasMaximizedGroup()) api.exitMaximizedGroup();
		}
	};
}
