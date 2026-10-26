//! Guarded replacement of a local PDF after editing its outline in a worker.
use crate::core::blocking::run_blocking;
use crate::core::error::{map_err, ApiResult, AppError};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use sha2::{Digest, Sha256};
use std::{path::Path, sync::Mutex};

static SAVE_LOCK: Mutex<()> = Mutex::new(());

fn replace_pdf(path: &Path, expected_hash: &str, bytes: &[u8]) -> Result<(), AppError> {
    let _lock = SAVE_LOCK
        .lock()
        .map_err(|_| AppError::message("save_failed"))?;
    let path = std::fs::canonicalize(path)?;
    if !path
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("pdf"))
        || !bytes.starts_with(b"%PDF-")
    {
        return Err(AppError::message("invalid"));
    }
    let metadata = std::fs::metadata(&path)?;
    if metadata.permissions().readonly() {
        return Err(AppError::message("protected"));
    }
    let current = std::fs::read(&path)?;
    if Sha256::digest(&current)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>()
        != expected_hash
    {
        return Err(AppError::message("conflict"));
    }
    #[cfg(unix)]
    let unix_mode = {
        use std::os::unix::fs::PermissionsExt;
        Some(metadata.permissions().mode())
    };
    #[cfg(not(unix))]
    let unix_mode = None;
    agentero_core::fs::atomic_write_with(
        &path,
        bytes,
        &agentero_core::fs::AtomicOpts {
            sync_file: true,
            unix_mode,
            ..Default::default()
        },
    )?;
    Ok(())
}

/// Replace only the exact PDF revision the outline editor read.
#[tauri::command]
#[specta::specta]
pub async fn pdf_save_bookmarks(
    path: String,
    expected_hash: String,
    bytes_base64: String,
) -> ApiResult<()> {
    run_blocking(move || {
        let result = STANDARD
            .decode(bytes_base64)
            .map_err(|_| AppError::message("invalid"))
            .and_then(|bytes| replace_pdf(Path::new(&path), &expected_hash, &bytes));
        match result {
            Ok(()) => ApiResult::ok(()),
            Err(e) => map_err(e),
        }
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bookmark_save_rejects_stale_revision_without_changing_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("book.pdf");
        let original = b"%PDF-original";
        std::fs::write(&path, original).unwrap();
        assert!(replace_pdf(&path, "stale", b"%PDF-new").is_err());
        assert_eq!(std::fs::read(&path).unwrap(), original);
        let hash = Sha256::digest(original)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>();
        assert!(replace_pdf(&path, &hash, b"not a pdf").is_err());
        replace_pdf(&path, &hash, b"%PDF-new").unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"%PDF-new");
    }
}
