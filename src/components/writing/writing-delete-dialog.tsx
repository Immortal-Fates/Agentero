/**
 * Confirms moving one writing project into the vault recycle bin.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { errorText } from "@/lib/core/error";
import { notifyError } from "@/lib/core/notify";
import { trashWritingProject } from "@/lib/writing/trash";

export function WritingDeleteDialog({
	vaultPath,
	target,
	onClose,
}: {
	vaultPath: string;
	target: { rootFile: string; title: string } | null;
	onClose: () => void;
}) {
	const { t } = useTranslation(["sidebar", "common"]);
	const [busy, setBusy] = useState(false);

	return (
		<Dialog
			open={target != null}
			onOpenChange={(open) => {
				if (!open && !busy) onClose();
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("writing.deleteProject")}</DialogTitle>
					<DialogDescription>
						{t("writing.deleteConfirm", {
							name: target?.title || t("writing.untitled"),
						})}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						disabled={busy}
						onClick={onClose}
					>
						{t("common:cancel")}
					</Button>
					<Button
						type="button"
						variant="destructive"
						disabled={busy || target == null}
						onClick={() => {
							if (!target) return;
							setBusy(true);
							void trashWritingProject(vaultPath, target.rootFile)
								.then((ok) => {
									if (ok) onClose();
								})
								.catch((error) => {
									notifyError(errorText(error) || t("writing.deleteFailed"));
								})
								.finally(() => setBusy(false));
						}}
					>
						{t("writing.deleteProject")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
