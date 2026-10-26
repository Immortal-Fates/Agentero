import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import { useTauriEvent } from "@/hooks/use-tauri-event";
import { commands, events, type WordStatus } from "@/lib/core/bindings";
import { callResult } from "@/lib/core/ipc";
import { notifyError } from "@/lib/core/notify";
import { isMacOS, isTauri } from "@/lib/core/tauri";
import { wordError } from "@/lib/word/errors";

export function WordSettings() {
	const { t } = useTranslation("settings");
	const [status, setStatus] = useState<WordStatus | null>(null);
	const [busy, setBusy] = useState(false);
	const refresh = useCallback(async () => {
		if (!isTauri() || !isMacOS()) return;
		try {
			setStatus(await commands.wordGetStatus());
		} catch (error) {
			notifyError(wordError(error));
		}
	}, []);
	useEffect(() => {
		void refresh();
	}, [refresh]);
	useTauriEvent(events.wordChanged, () => {
		void refresh();
	});
	if (!isMacOS()) return null;
	return (
		<div className="flex items-center justify-between gap-4 py-3">
			<div>
				<label htmlFor="word-enabled" className="text-sm font-medium">
					{t("word.label")}
				</label>
				<p className="max-w-md text-xs text-muted-foreground">
					{t("word.hint")}
				</p>
			</div>
			<Switch
				id="word-enabled"
				checked={status?.enabled ?? false}
				disabled={busy || status?.busy}
				onCheckedChange={async (enabled) => {
					setBusy(true);
					try {
						setStatus(await callResult(() => commands.wordSetEnabled(enabled)));
					} catch (error) {
						notifyError(wordError(error));
					} finally {
						setBusy(false);
					}
				}}
			/>
		</div>
	);
}
