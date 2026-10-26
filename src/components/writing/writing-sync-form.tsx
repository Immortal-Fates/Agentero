/**
 * GitHub repository and upload schedule for the writing folder. App settings
 * and the upload tab share it so both edit the same preferences.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsRow } from "@/components/settings/settings-layout";
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
import {
	normalizeBranch,
	parseGitHubRemote,
	readWritingGitHub,
	type WritingGitHubLink,
	writeWritingGitHub,
} from "@/lib/writing/github";
import {
	readWritingSyncPrefs,
	WRITING_SYNC_INTERVALS,
	type WritingSyncMode,
	writeWritingSyncPrefs,
} from "@/lib/writing/sync-prefs";

export function WritingSyncForm({
	vaultPath,
	submitLabel,
	busy = false,
	onSaved,
}: {
	vaultPath: string | null;
	submitLabel?: string;
	busy?: boolean;
	onSaved?: (link: WritingGitHubLink) => void;
}) {
	const { t } = useTranslation(["settings", "sidebar"]);
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

	function save() {
		if (!vaultPath) return;
		const parsed = parseGitHubRemote(remote);
		const nextBranch = normalizeBranch(branch);
		if (!parsed || !nextBranch) {
			setInvalid(true);
			return;
		}
		const link = {
			remote: parsed.remote,
			branch: nextBranch,
			label: parsed.label,
		};
		writeWritingGitHub(vaultPath, link);
		notifySuccess(t("writing.saved"));
		onSaved?.(link);
	}

	function saveSyncMode(mode: WritingSyncMode, minutes = syncMinutes) {
		if (!vaultPath) return;
		setSyncMode(mode);
		setSyncMinutes(minutes);
		writeWritingSyncPrefs(vaultPath, { mode, intervalMinutes: minutes });
	}

	return (
		<>
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
						<SelectItem value="manual">{t("writing.uploadManual")}</SelectItem>
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
			<div className="flex items-center gap-3 px-3.5 py-2.5">
				{invalid ? (
					<p className="text-muted-foreground text-xs">
						{t("sidebar:writing.syncInvalid")}
					</p>
				) : null}
				<Button
					type="button"
					size="sm"
					className="ml-auto"
					disabled={!vaultPath || busy}
					onClick={save}
				>
					{submitLabel ?? t("writing.save")}
				</Button>
			</div>
		</>
	);
}
