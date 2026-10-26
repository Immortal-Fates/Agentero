/**
 * Shared context-menu model for the writing rail and file tabs. One item
 * list and one renderer keep row and tab menus from drifting apart.
 */

import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import {
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { errorText } from "@/lib/core/error";
import { notifyError } from "@/lib/core/notify";
import { cn } from "@/lib/core/utils";
import { formatShortcutById } from "@/lib/shell/shortcuts";
import { revealInOsLabelKey } from "@/lib/vault/reveal";
import {
	addFilePathToChat,
	copyFilePath,
	openFilePathInTerminal,
	revealFilePath,
} from "@/lib/workspace/file-path-actions";

export type WritingMenuItem = {
	id: string;
	label: string;
	/** Platform-formatted hint, shown only when the shortcut really works. */
	shortcut?: string;
	disabled?: boolean;
	destructive?: boolean;
	/** Draw a separator above this item. */
	separatorBefore?: boolean;
	run: () => void;
};

function report(action: () => Promise<void>): void {
	void action().catch((error) => notifyError(errorText(error)));
}

/** Path actions every writing tab and file row offers. */
export function useWritingPathItems(path: string): WritingMenuItem[] {
	const { t } = useTranslation("sidebar");
	return [
		{
			id: "copy",
			label: t("fileTree.copyPath"),
			run: () => copyFilePath(path),
		},
		{
			id: "reveal",
			label: t(revealInOsLabelKey()),
			shortcut: formatShortcutById("revealInFinder"),
			run: () => report(() => revealFilePath(path)),
		},
		{
			id: "terminal",
			label: t("fileTree.openInTerminal"),
			shortcut: formatShortcutById("openInTerminal"),
			run: () => report(() => openFilePathInTerminal(path)),
		},
		{
			id: "chat",
			label: t("fileTree.addToChat"),
			run: () => addFilePathToChat(path),
		},
	];
}

export function WritingMenuContent({
	items,
}: {
	items: readonly WritingMenuItem[];
}) {
	return (
		<ContextMenuContent>
			{items.map((item) => (
				<Fragment key={item.id}>
					{item.separatorBefore ? <ContextMenuSeparator /> : null}
					<ContextMenuItem
						disabled={item.disabled}
						className={cn(
							"gap-4",
							item.shortcut && "justify-between",
							item.destructive && "text-destructive focus:text-destructive",
						)}
						onSelect={item.run}
					>
						<span className="min-w-0 flex-1 truncate">{item.label}</span>
						{item.shortcut ? (
							<span className="text-muted-foreground text-xs tracking-wide">
								{item.shortcut}
							</span>
						) : null}
					</ContextMenuItem>
				</Fragment>
			))}
		</ContextMenuContent>
	);
}
