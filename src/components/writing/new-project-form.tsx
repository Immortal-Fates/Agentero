/**
 * Name, template, and create one writing project on the project home.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { notifyError } from "@/lib/core/notify";
import { discoverWritingProjects } from "@/lib/writing/discover";
import { createWritingProject } from "@/lib/writing/projects";
import {
	selectManuscript,
	setDiscoveredManuscripts,
} from "@/lib/writing/store";
import {
	isWritingTemplateId,
	WRITING_TEMPLATE_IDS,
	type WritingTemplateId,
} from "@/lib/writing/templates";

export function NewProjectForm({
	vaultPath,
	startOpen = false,
}: {
	vaultPath: string;
	startOpen?: boolean;
}) {
	const { t } = useTranslation("sidebar");
	const [open, setOpen] = useState(startOpen);
	const [name, setName] = useState("");
	const [template, setTemplate] = useState<WritingTemplateId>("blank");
	const [busy, setBusy] = useState(false);

	const submit = async () => {
		if (busy) return;
		setBusy(true);
		try {
			const result = await createWritingProject(vaultPath, name, template);
			if (!result.ok) {
				if (result.reason === "invalid") notifyError(t("fileTree.invalidName"));
				else if (result.reason === "exists") {
					notifyError(t("fileTree.alreadyExists", { name: name.trim() }));
				} else notifyError(result.message || t("writing.createFailed"));
				return;
			}
			const found = await discoverWritingProjects(vaultPath);
			setDiscoveredManuscripts(found);
			selectManuscript(result.rootFile);
			setName("");
			if (!startOpen) setOpen(false);
		} finally {
			setBusy(false);
		}
	};

	if (!open) {
		return (
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="text-muted-foreground hover:text-foreground flex h-7 w-full items-center rounded-md px-2 text-left text-xs outline-none hover:bg-sidebar-accent/80 focus-visible:ring-1 focus-visible:ring-ring/60"
			>
				{t("writing.newProject")}
			</button>
		);
	}

	return (
		<form
			className="flex flex-col gap-1.5"
			onSubmit={(event) => {
				event.preventDefault();
				void submit();
			}}
		>
			<Select
				value={template}
				disabled={busy}
				onValueChange={(value) => {
					if (isWritingTemplateId(value)) setTemplate(value);
				}}
			>
				<SelectTrigger
					className="h-8 w-full text-sm"
					aria-label={t("writing.template")}
				>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{WRITING_TEMPLATE_IDS.map((id) => (
						<SelectItem key={id} value={id}>
							{t(`writing.templates.${id}`)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<div className="flex items-center gap-1.5">
				<Input
					value={name}
					disabled={busy}
					placeholder={t("writing.projectName")}
					aria-label={t("writing.projectName")}
					onChange={(event) => setName(event.target.value)}
					className="h-8 min-w-0 flex-1 text-sm"
				/>
				<Button
					type="submit"
					size="sm"
					disabled={busy || name.trim().length === 0}
				>
					{t("writing.create")}
				</Button>
			</div>
		</form>
	);
}
