import { useEffect, useState } from "react";
import { useStore } from "zustand";
import { texSettingsStore } from "@/lib/tex/config";
import { resolveTexRoot } from "@/lib/workspace/tex-compile";

/** Compile root for a TeX path, including a main file chosen in the file tree. */
export function useTexRoot(texPath: string | null): string | null {
	const roots = useStore(texSettingsStore, (state) => state.roots);
	const [root, setRoot] = useState(texPath);

	useEffect(() => {
		if (!texPath) {
			setRoot(null);
			return;
		}
		const stamp = roots;
		let cancelled = false;
		void resolveTexRoot(texPath).then((next) => {
			if (!cancelled && stamp === roots) setRoot(next);
		});
		return () => {
			cancelled = true;
		};
	}, [texPath, roots]);

	return root;
}
