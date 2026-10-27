//! Optional performance trace.
//!
//! Off unless `AGENTERO_PERF_TRACE` is set. `AGENTERO_PERF=1` additionally
//! asks the desktop shell to skip restore / background work and exit after
//! one open. Neither path changes behavior when the variables are unset.
//!
//! Each finished span is one JSON line:
//! `{"trace","side","name","dur_us","ok","fields"}`.

use serde_json::{json, Value};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

const UI_PREFIX: &str = "PERF ";

/// `AGENTERO_PERF=1` (or `true`). Startup isolation only; does not write a file.
pub fn enabled() -> bool {
    env_flag("AGENTERO_PERF")
}

/// `AGENTERO_PERF_TRACE` is set to a non-empty path.
pub fn tracing() -> bool {
    trace_path().is_some()
}

/// Absolute vault to open when [`enabled`] (empty if unset).
pub fn vault() -> Option<String> {
    env_nonempty("AGENTERO_PERF_VAULT")
}

/// Vault-relative file or folder to open after the vault is interactive.
pub fn open_target() -> Option<String> {
    env_nonempty("AGENTERO_PERF_OPEN")
}

/// Script injected before page JS. `None` when perf mode and tracing are both off.
pub fn init_script() -> Option<String> {
    if !enabled() && trace_path().is_none() {
        return None;
    }
    Some(script_for(
        enabled(),
        trace_path().is_some(),
        trace_id(),
        vault(),
        open_target(),
    ))
}

/// Host span. No-op when `AGENTERO_PERF_TRACE` is unset.
pub fn record(name: &str, dur_us: u128, ok: bool, side: &str, fields: &str) {
    let Some(path) = trace_path() else {
        return;
    };
    append_span(&path, name, dur_us, ok, side, fields);
}

/// Frontend log line `PERF {json}` forwarded by the log plugin.
pub fn capture_log_line(message: &str) {
    let Some(rest) = message.strip_prefix(UI_PREFIX) else {
        return;
    };
    let Some(path) = trace_path() else {
        return;
    };
    let Some(span) = parse_ui_span(rest) else {
        return;
    };
    append_span(&path, &span.0, span.1, span.2, "ui", &span.3);
}

fn script_for(
    perf: bool,
    trace: bool,
    trace_id: &str,
    vault: Option<String>,
    open: Option<String>,
) -> String {
    let cfg = json!({
        "perf": perf,
        "trace": trace,
        "traceId": trace_id,
        "vault": vault,
        "open": open,
    });
    let literal = serde_json::to_string(&cfg.to_string()).unwrap_or_else(|_| "\"{}\"".to_string());
    format!("globalThis.__AGENTERO_PERF__=JSON.parse({literal});")
}

fn append_span(path: &Path, name: &str, dur_us: u128, ok: bool, side: &str, fields: &str) {
    if name.is_empty() {
        return;
    }
    let line = json!({
        "trace": trace_id(),
        "side": side,
        "name": name,
        "dur_us": dur_us,
        "ok": ok,
        "fields": fields,
    });
    let Ok(text) = serde_json::to_string(&line) else {
        return;
    };
    static LOCK: Mutex<()> = Mutex::new(());
    let _guard = LOCK.lock().unwrap_or_else(|poison| poison.into_inner());
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            let _ = fs::create_dir_all(parent);
        }
    }
    let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) else {
        return;
    };
    let _ = writeln!(file, "{text}");
    let _ = file.flush();
}

fn parse_ui_span(rest: &str) -> Option<(String, u128, bool, String)> {
    let value: Value = serde_json::from_str(rest.trim()).ok()?;
    let name = value.get("name")?.as_str()?.trim().to_string();
    if name.is_empty() {
        return None;
    }
    let dur_us = value.get("dur_us").and_then(Value::as_u64).unwrap_or(0) as u128;
    let ok = value.get("ok").and_then(Value::as_bool).unwrap_or(true);
    let fields = value
        .get("fields")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    Some((name, dur_us, ok, fields))
}

fn trace_path() -> Option<PathBuf> {
    env_nonempty("AGENTERO_PERF_TRACE").map(PathBuf::from)
}

fn trace_id() -> &'static str {
    static ID: OnceLock<String> = OnceLock::new();
    ID.get_or_init(|| {
        env_nonempty("AGENTERO_PERF_TRACE_ID").unwrap_or_else(|| {
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0);
            format!("{:x}-{nanos:x}", std::process::id())
        })
    })
    .as_str()
}

fn env_flag(key: &str) -> bool {
    match std::env::var(key) {
        Ok(value) => {
            let value = value.trim();
            value == "1" || value.eq_ignore_ascii_case("true")
        }
        Err(_) => false,
    }
}

fn env_nonempty(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn append_span_writes_one_json_line() {
        let path =
            std::env::temp_dir().join(format!("agentero-perf-{}-span.jsonl", std::process::id()));
        let _ = fs::remove_file(&path);
        append_span(&path, "vault_tree_build", 1500, true, "host", "count=2");
        let text = fs::read_to_string(&path).expect("trace");
        let value: Value = serde_json::from_str(text.trim()).expect("json");
        assert_eq!(value["name"], "vault_tree_build");
        assert_eq!(value["dur_us"], 1500);
        assert_eq!(value["side"], "host");
        assert_eq!(value["ok"], true);
        assert_eq!(value["fields"], "count=2");
        assert!(!value["trace"].as_str().unwrap_or("").is_empty());
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn parse_ui_span_reads_frontend_payload() {
        let span = parse_ui_span(r#"{"name":"boot.entry","dur_us":20,"ok":true,"fields":""}"#)
            .expect("span");
        assert_eq!(span.0, "boot.entry");
        assert_eq!(span.1, 20);
        assert!(span.2);
        assert!(parse_ui_span("not json").is_none());
        assert!(parse_ui_span(r#"{"dur_us":1}"#).is_none());
    }

    #[test]
    fn init_script_round_trips_quotes() {
        let script = script_for(
            true,
            true,
            "tid",
            Some(r#"va"ult"#.to_string()),
            Some("papers/x".to_string()),
        );
        assert!(script.starts_with("globalThis.__AGENTERO_PERF__=JSON.parse("));
        assert!(script.contains("va\\\"ult") || script.contains("va\\\\\\\"ult"));
        assert!(script.ends_with(");"));
    }
}
