import { useEffect } from "react";
import { useDebouncedCallback } from "@/hooks/use-debounce";
import { setHoveredPaperPath, uiStore } from "@/lib/shell/ui-store";

/** Keep the last intentional preview until the Library's browsing context ends. */
export function useLibraryPreview({
	active,
	vaultPath,
	scopePath,
	paths,
}: {
	active: boolean;
	vaultPath: string | null;
	scopePath: string | null;
	paths: ReadonlySet<string>;
}) {
	const preview = useDebouncedCallback((path: string | null) => {
		if (!active || !path || !paths.has(path)) return;
		// Leave focused editors and open menus alone, including portaled Info
		// popovers (their trigger stays expanded inside the panel).
		const panel = document.querySelector("[data-paper-info]");
		if (
			panel?.querySelector('[aria-expanded="true"][aria-haspopup]') ||
			(panel?.contains(document.activeElement) &&
				document.activeElement?.matches(
					'input, textarea, select, [contenteditable="true"]',
				)) ||
			document.querySelector('[role="dialog"], [role="menu"]')
		)
			return;
		setHoveredPaperPath(path);
	}, 180);

	// biome-ignore lint/correctness/useExhaustiveDependencies: folder and vault define the preview lifetime even if both contain the same paper path
	useEffect(() => {
		if (!active) return;
		// Each active folder/vault owns its preview; hidden Library instances
		// must not clear another instance's preview.
		setHoveredPaperPath(null);
		return () => {
			preview.cancel();
			setHoveredPaperPath(null);
		};
	}, [active, vaultPath, scopePath, preview]);

	useEffect(() => {
		if (!active) return;
		const path = uiStore.getState().hoveredPaperPath;
		if (path && !paths.has(path)) setHoveredPaperPath(null);
		// A filtered/removed row must not publish a pending preview later.
		return () => preview.cancel();
	}, [active, paths, preview]);

	return preview;
}
