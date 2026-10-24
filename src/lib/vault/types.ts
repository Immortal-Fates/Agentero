export type CreateVaultResult = {
	path: string;
	created: string[];
	updated: string[];
	openPath: string;
};

export type FileNode = {
	id: string;
	name: string;
	path: string;
	kind: "file" | "directory";
	children?: FileNode[];
	/**
	 * Directory whose children have not been listed yet (lazy tree).
	 * `true` → show as folder; load on expand. Omit / `false` when loaded
	 * (including empty dirs, which use `children: []`).
	 */
	childrenPending?: boolean;
	/**
	 * Host-validated TeX manuscript on paper rows and lazy source shells.
	 * File names alone cannot validate the main document and its dependencies.
	 */
	hasTex?: boolean;
	/** Host source-acquisition decision for a paper, independent of OCR Markdown. */
	needsSource?: boolean;
};
