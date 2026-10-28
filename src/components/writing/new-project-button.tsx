import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { NewProjectForm } from "./new-project-form";

export function NewProjectButton({ vaultPath }: { vaultPath: string }) {
	const { t } = useTranslation("sidebar");
	const [open, setOpen] = useState(false);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					size="icon-xs"
					variant="ghost"
					className="mr-1 shrink-0 text-muted-foreground"
					aria-label={t("writing.newProject")}
					title={t("writing.newProject")}
				>
					<Plus className="size-3.5" aria-hidden />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-72">
				<NewProjectForm
					vaultPath={vaultPath}
					startOpen
					onCreated={() => setOpen(false)}
				/>
			</PopoverContent>
		</Popover>
	);
}
