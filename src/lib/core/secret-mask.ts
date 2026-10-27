/**
 * Settings secrets cross IPC only as the Host's redaction: the same number of
 * `*` characters as the stored value. Must match `mask_translate_api_key` /
 * `is_translate_api_key_mask` in `src-tauri/.../settings/mod.rs`.
 */

export function maskSecret(secret: string): string {
	const n = [...secret.trim()].length;
	return n === 0 ? "" : "*".repeat(n);
}

export function isSecretMask(secret: string | undefined): boolean {
	const value = secret?.trim() ?? "";
	return value.length > 0 && /^\*+$/.test(value);
}

/** True when a non-empty secret is stored (plaintext or Host `*`-mask). */
export function hasSecret(secret: string | undefined): boolean {
	return Boolean(secret?.trim());
}
