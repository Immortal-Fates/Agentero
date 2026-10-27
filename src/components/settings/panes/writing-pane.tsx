/**
 * Writing preferences: the open project's engine, and the GitHub repository
 * for this vault's writing folder.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	PageTitle,
	SettingsGroup,
	SettingsSectionLabel,
} from "@/components/settings/settings-layout";
import { LatexProjectSettings } from "@/components/sidebar/latex-project-settings";
import { TexEngineForm } from "@/components/sidebar/tex-engine-settings";
import { WritingSyncForm } from "@/components/writing/writing-sync-form";
import { explicitTexRoot } from "@/lib/tex/config";
import { initTexEngines } from "@/lib/workspace/tex-compile";
import { readWritingPrefs } from "@/lib/writing/session";

export function WritingSettingsPane({
	vaultPath,
}: {
	vaultPath: string | null;
}) {
	const { t } = useTranslation(["settings", "sidebar"]);
	const [project, setProject] = useState<string | null>(null);

	useEffect(() => {
		initTexEngines();
	}, []);

	useEffect(() => {
		const refresh = () => {
			const root = vaultPath ? readWritingPrefs(vaultPath).activeRoot : null;
			setProject(root ? (explicitTexRoot(root) ?? root) : null);
		};
		refresh();
		window.addEventListener("storage", refresh);
		return () => window.removeEventListener("storage", refresh);
	}, [vaultPath]);

	return (
		<div>
			<PageTitle title={t("writing.title")} />
			{project ? (
				<>
					<SettingsSectionLabel>{t("writing.engine")}</SettingsSectionLabel>
					<SettingsGroup>
						<TexEngineForm texPath={project} />
					</SettingsGroup>
					<SettingsSectionLabel>
						{t("writing.projectSettings")}
					</SettingsSectionLabel>
					<SettingsGroup>
						<LatexProjectSettings texPath={project} vaultPath={vaultPath} />
					</SettingsGroup>
				</>
			) : (
				<p className="text-muted-foreground mb-5 px-1 text-sm">
					{t("writing.noProject")}
				</p>
			)}
			<SettingsSectionLabel>{t("writing.github")}</SettingsSectionLabel>
			<SettingsGroup>
				<WritingSyncForm vaultPath={vaultPath} />
			</SettingsGroup>
		</div>
	);
}
