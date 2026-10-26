use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Field {
    pub index: usize,
    pub code: String,
    pub text: String,
    pub start: i64,
    pub end: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snapshot {
    pub name: String,
    pub path: String,
    pub content: String,
    pub fields: Vec<Field>,
    pub start: i64,
    pub end: i64,
    pub story: String,
}

#[cfg(target_os = "macos")]
pub async fn execute(input: serde_json::Value) -> Result<serde_json::Value, String> {
    use std::io::Write;
    use std::process::Stdio;
    use tokio::io::AsyncWriteExt;
    let mut file = tempfile::NamedTempFile::new().map_err(|e| e.to_string())?;
    file.write_all(&serde_json::to_vec(&input).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    let mut child = tokio::process::Command::new("/usr/bin/osascript")
        .args([
            "-l",
            "JavaScript",
            "-",
            file.path().to_str().ok_or("word.invalidPath")?,
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| e.to_string())?;
    child
        .stdin
        .take()
        .ok_or("word.driverFailed")?
        .write_all(include_bytes!("mac-word.js"))
        .await
        .map_err(|e| e.to_string())?;
    let output = tokio::time::timeout(std::time::Duration::from_secs(45), child.wait_with_output())
        .await
        .map_err(|_| "word.timeout".to_string())?
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())
}

#[cfg(not(target_os = "macos"))]
pub async fn execute(_: serde_json::Value) -> Result<serde_json::Value, String> {
    Err("word.platformUnsupported".into())
}

pub async fn read() -> Result<Snapshot, String> {
    serde_json::from_value(execute(serde_json::json!({"action":"read"})).await?)
        .map_err(|e| e.to_string())
}
