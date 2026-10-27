/**
 * Low-frequency configuration reminders (#658).
 *
 * Two triggers, both at most once per app session and each individually
 * dismissible ("don't remind again", persisted in
 * {@link AppSettings.dismissedReminders}):
 * - `layout-local-model`: startup hint that local ONNX layout analysis costs
 *   memory / CPU, surfaced from {@link maybeShowLayoutLocalModelReminder}.
 * - `network-proxy`: a failure that looks network-related while no proxy is
 *   configured, surfaced from {@link reportNetworkFailure} (called by the
 *   global notify funnel).
 *
 * Presentation is a top-right Sonner toast with two choices: jump to the fix,
 * or stop showing the reminder.
 */

import i18n from "@/i18n";
import { notifyReminder } from "@/lib/core/notify";
import { isTauri } from "@/lib/core/tauri";
import { getSettings, patchSettings } from "@/lib/settings/react-store";
import type { ConfigReminderId } from "@/lib/settings/types";
import { openSettingsWindow } from "@/lib/shell/settings-window";

/** Reminders already shown in this app session (module scope = one session). */
const shownThisSession = new Set<ConfigReminderId>();

export function isReminderDismissed(id: ConfigReminderId): boolean {
	return getSettings().dismissedReminders.includes(id);
}

/** Persist "don't remind me again" for one reminder id. */
export function dismissReminder(id: ConfigReminderId): void {
	const current = getSettings().dismissedReminders;
	if (current.includes(id)) return;
	patchSettings({ dismissedReminders: [...current, id] });
}

/**
 * Claim the one chance to show `id` this session. False when the app has not
 * booted Tauri, the id was dismissed, or it already fired this session.
 */
function claim(id: ConfigReminderId): boolean {
	if (!isTauri()) return false;
	if (shownThisSession.has(id) || isReminderDismissed(id)) return false;
	shownThisSession.add(id);
	return true;
}

/**
 * Startup hint (once per session): layout analysis runs a bundled local model,
 * which is heavier on memory / CPU than a cloud provider.
 */
export function maybeShowLayoutLocalModelReminder(): void {
	if (getSettings().layout.backend !== "local") return;
	if (!claim("layout-local-model")) return;
	notifyReminder(i18n.t("app:reminders.layoutLocalModel.title"), {
		id: "config-reminder-layout-local-model",
		description: i18n.t("app:reminders.layoutLocalModel.description"),
		actionLabel: i18n.t("app:reminders.layoutLocalModel.openSettings"),
		onAction: () => openSettingsWindow("layout"),
		dismissLabel: i18n.t("app:reminders.dismiss"),
		onDismiss: () => dismissReminder("layout-local-model"),
	});
}

/**
 * A user-visible failure looked network-related. Suggest proxy config when none
 * is enabled (once per session, dismissible).
 */
export function reportNetworkFailure(): void {
	if (getSettings().networkProxyEnabled) return;
	if (!claim("network-proxy")) return;
	notifyReminder(i18n.t("app:reminders.networkProxy.title"), {
		id: "config-reminder-network-proxy",
		description: i18n.t("app:reminders.networkProxy.description"),
		actionLabel: i18n.t("app:reminders.networkProxy.openSettings"),
		onAction: () => openSettingsWindow("general"),
		dismissLabel: i18n.t("app:reminders.dismiss"),
		onDismiss: () => dismissReminder("network-proxy"),
	});
}
