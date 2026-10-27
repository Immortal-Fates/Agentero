/**
 * Upload tab: connect GitHub and push the writing folder without leaving the
 * canvas. The toolbar opens it when no repository is linked yet.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SiGithub } from "react-icons/si";
import { SettingsGroup } from "@/components/settings/settings-layout";
import { WritingSyncForm } from "@/components/writing/writing-sync-form";
import type { WritingGitHubLink } from "@/lib/writing/github";
import { uploadWritingProject } from "@/lib/writing/upload";

export function WritingSyncTab({ vaultPath }: { vaultPath: string }) {
	const { t } = useTranslation("sidebar");
	const [syncing, setSyncing] = useState(false);

	async function saveAndUpload(link: WritingGitHubLink) {
		// Writes in this window do not fire a real storage event, but the
		// toolbar reads the link from storage and needs to refresh.
		window.dispatchEvent(new Event("storage"));
		setSyncing(true);
		try {
			await uploadWritingProject(link);
		} finally {
			setSyncing(false);
		}
	}

	return (
		<div className="h-full overflow-y-auto">
			<div className="mx-auto flex w-full max-w-xl flex-col px-6 py-8">
				<h2 className="flex items-center gap-2 font-semibold text-base">
					<SiGithub className="size-4 shrink-0" aria-hidden />
					{t("writing.syncSetup")}
				</h2>
				<p className="mt-1 mb-6 text-muted-foreground text-sm">
					{t("writing.syncSetupHint")}
				</p>
				<SettingsGroup>
					<WritingSyncForm
						vaultPath={vaultPath}
						submitLabel={t("writing.syncSave")}
						busy={syncing}
						onSaved={(link) => void saveAndUpload(link)}
					/>
				</SettingsGroup>
			</div>
		</div>
	);
}
