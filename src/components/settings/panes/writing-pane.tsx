/**
 * Writing preferences: the open project's engine, and the GitHub repository
 * for this vault's writing folder.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	PageTitle,
	SettingsGroup,
	SettingsRow,
	SettingsSectionLabel,
} from "@/components/settings/settings-layout";
import { LatexProjectSettings } from "@/components/sidebar/latex-project-settings";
import { TexEngineForm } from "@/components/sidebar/tex-engine-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { notifySuccess } from "@/lib/core/notify";
import { explicitTexRoot } from "@/lib/tex/config";
import { initTexEngines } from "@/lib/workspace/tex-compile";
import {
	normalizeBranch,
	parseGitHubRemote,
	readWritingGitHub,
	writeWritingGitHub,
} from "@/lib/writing/github";
import { readWritingPrefs } from "@/lib/writing/session";
import {
	readWritingSyncPrefs,
	WRITING_SYNC_INTERVALS,
	type WritingSyncMode,
	writeWritingSyncPrefs,
} from "@/lib/writing/sync-prefs";

export function WritingSettingsPane({
	vaultPath,
}: {
	vaultPath: string | null;
}) {
	const { t } = useTranslation(["settings", "sidebar"]);
	const [project, setProject] = useState<string | null>(null);
	const saved = vaultPath ? readWritingGitHub(vaultPath) : null;
	const [remote, setRemote] = useState(
		saved ? `https://github.com/${saved.label}` : "",
	);
	const [branch, setBranch] = useState(saved?.branch ?? "main");
	const [invalid, setInvalid] = useState(false);
	const storedSync = vaultPath ? readWritingSyncPrefs(vaultPath) : null;
	const [syncMode, setSyncMode] = useState<WritingSyncMode>(
		storedSync?.mode ?? "onCompile",
	);
	const [syncMinutes, setSyncMinutes] = useState(
		storedSync?.intervalMinutes ?? 15,
	);

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

	function saveGitHub() {
		if (!vaultPath) return;
		const parsed = parseGitHubRemote(remote);
		const nextBranch = normalizeBranch(branch);
		if (!parsed || !nextBranch) {
			setInvalid(true);
			return;
		}
		writeWritingGitHub(vaultPath, {
			remote: parsed.remote,
			branch: nextBranch,
			label: parsed.label,
		});
		notifySuccess(t("writing.saved"));
	}

	function saveSyncMode(mode: WritingSyncMode, minutes = syncMinutes) {
		if (!vaultPath) return;
		setSyncMode(mode);
		setSyncMinutes(minutes);
		writeWritingSyncPrefs(vaultPath, { mode, intervalMinutes: minutes });
	}

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
					<LatexProjectSettings texPath={project} vaultPath={vaultPath} />
				</>
			) : (
				<p className="text-muted-foreground mb-5 px-1 text-sm">
					{t("writing.noProject")}
				</p>
			)}
			<SettingsSectionLabel>{t("writing.github")}</SettingsSectionLabel>
			<SettingsGroup>
				<SettingsRow label={t("sidebar:writing.syncRemote")}>
					<Input
						value={remote}
						placeholder={t("sidebar:writing.syncRemotePlaceholder")}
						className="w-72"
						autoCapitalize="off"
						autoCorrect="off"
						spellCheck={false}
						disabled={!vaultPath}
						onChange={(event) => {
							setRemote(event.target.value);
							setInvalid(false);
						}}
					/>
				</SettingsRow>
				<SettingsRow label={t("sidebar:writing.syncBranch")}>
					<Input
						value={branch}
						className="w-40"
						autoCapitalize="off"
						autoCorrect="off"
						spellCheck={false}
						disabled={!vaultPath}
						onChange={(event) => {
							setBranch(event.target.value);
							setInvalid(false);
						}}
					/>
				</SettingsRow>
				<SettingsRow label={t("writing.uploadMode")}>
					<Select
						value={syncMode}
						disabled={!vaultPath}
						onValueChange={(value) => {
							if (
								value === "manual" ||
								value === "onCompile" ||
								value === "interval"
							) {
								saveSyncMode(value);
							}
						}}
					>
						<SelectTrigger size="sm" className="w-44">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="manual">
								{t("writing.uploadManual")}
							</SelectItem>
							<SelectItem value="onCompile">
								{t("writing.uploadOnCompile")}
							</SelectItem>
							<SelectItem value="interval">
								{t("writing.uploadInterval")}
							</SelectItem>
						</SelectContent>
					</Select>
				</SettingsRow>
				{syncMode === "interval" ? (
					<SettingsRow label={t("writing.uploadEvery")}>
						<Select
							value={String(syncMinutes)}
							disabled={!vaultPath}
							onValueChange={(value) => {
								const minutes = Number(value);
								if (WRITING_SYNC_INTERVALS.some((item) => item === minutes)) {
									saveSyncMode("interval", minutes);
								}
							}}
						>
							<SelectTrigger size="sm" className="w-44">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{WRITING_SYNC_INTERVALS.map((minutes) => (
									<SelectItem key={minutes} value={String(minutes)}>
										{t("writing.uploadMinutes", { count: minutes })}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</SettingsRow>
				) : null}
				<div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
					<p className="text-muted-foreground text-xs">
						{invalid
							? t("sidebar:writing.syncInvalid")
							: t("writing.githubHint")}
					</p>
					<Button
						type="button"
						size="sm"
						disabled={!vaultPath}
						onClick={saveGitHub}
					>
						{t("writing.save")}
					</Button>
				</div>
			</SettingsGroup>
		</div>
	);
}
