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
import { Input } from "@/components/ui/input";
import type { CustomProperty } from "@/lib/paper/custom-properties-store";
import {
	createCustomProperty,
	deleteCustomProperty,
	updateCustomProperty,
} from "@/lib/paper/custom-properties-store";

export function CreatePropertyDialog({
	open,
	onOpenChange,
	vaultPath,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	vaultPath?: string | null;
}) {
	const { t } = useTranslation("sidebar");
	const [name, setName] = useState("");
	const [submitting, setSubmitting] = useState(false);

	const handleCreate = async () => {
		const trimmed = name.trim();
		if (!trimmed) return;
		setSubmitting(true);
		try {
			await createCustomProperty(trimmed, [], vaultPath);
			setName("");
			onOpenChange(false);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{t("papersLibrary.customProperties.addProperty", "Add Property")}
					</DialogTitle>
					<DialogDescription>
						{t(
							"papersLibrary.customProperties.addPropertyDesc",
							"Create a new custom Select property for papers in your library.",
						)}
					</DialogDescription>
				</DialogHeader>
				<div className="py-2">
					<Input
						value={name}
						onChange={(e) => setName(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") void handleCreate();
						}}
						placeholder={t(
							"papersLibrary.customProperties.propertyNamePlaceholder",
							"Property name (e.g. Priority, Reading Status)",
						)}
						autoFocus
					/>
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={submitting}
					>
						{t("common.cancel", "Cancel")}
					</Button>
					<Button onClick={handleCreate} disabled={!name.trim() || submitting}>
						{t("common.create", "Create")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function RenamePropertyDialog({
	property,
	open,
	onOpenChange,
}: {
	property: CustomProperty | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { t } = useTranslation("sidebar");
	const [name, setName] = useState(property?.name ?? "");
	const [submitting, setSubmitting] = useState(false);

	const handleRename = async () => {
		if (!property) return;
		const trimmed = name.trim();
		if (!trimmed || trimmed === property.name) {
			onOpenChange(false);
			return;
		}
		setSubmitting(true);
		try {
			await updateCustomProperty({ ...property, name: trimmed });
			onOpenChange(false);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{t(
							"papersLibrary.customProperties.renameProperty",
							"Rename Property",
						)}
					</DialogTitle>
				</DialogHeader>
				<div className="py-2">
					<Input
						value={name}
						onChange={(e) => setName(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") void handleRename();
						}}
						placeholder={property?.name}
						autoFocus
					/>
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={submitting}
					>
						{t("common.cancel", "Cancel")}
					</Button>
					<Button onClick={handleRename} disabled={!name.trim() || submitting}>
						{t("common.save", "Save")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function DeletePropertyDialog({
	property,
	open,
	onOpenChange,
}: {
	property: CustomProperty | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { t } = useTranslation("sidebar");
	const [submitting, setSubmitting] = useState(false);

	const handleDelete = async () => {
		if (!property) return;
		setSubmitting(true);
		try {
			await deleteCustomProperty(property.id);
			onOpenChange(false);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{t(
							"papersLibrary.customProperties.deleteProperty",
							"Delete Property",
						)}
					</DialogTitle>
					<DialogDescription>
						{t(
							"papersLibrary.customProperties.deletePropertyConfirm",
							`Are you sure you want to delete "${property?.name}"? All assigned values across your papers will be permanently removed.`,
							{ name: property?.name },
						)}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={submitting}
					>
						{t("common.cancel", "Cancel")}
					</Button>
					<Button
						variant="destructive"
						onClick={handleDelete}
						disabled={submitting}
					>
						{t("common.delete", "Delete")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
