import i18n from "@/i18n";

export function wordError(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	const key = message.match(/word\.[A-Za-z]+/)?.[0];
	if (key && i18n.exists(key, { ns: "settings" }))
		return i18n.t(key, {
			ns: "settings",
			defaultValue: i18n.t("word.driverFailed", { ns: "settings" }),
		});
	if (message.includes("-1743"))
		return i18n.t("word.permission", { ns: "settings" });
	return i18n.t("word.failed", { ns: "settings", detail: message });
}
