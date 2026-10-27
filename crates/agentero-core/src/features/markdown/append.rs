//! Idempotent Markdown block append (NOTES.md migrations, Cool Papers notes).

use std::fs;
use std::io::Write;
use std::path::Path;

/// Append Markdown blocks not already present in `path` (idempotent by
/// content). Returns true when it added something.
///
/// Missing or unwritable files return false; callers that care about the
/// distinction check the file first.
pub fn append_markdown_blocks(path: &Path, blocks: &[String]) -> bool {
    let existing = fs::read_to_string(path).unwrap_or_default();
    let to_add: Vec<&str> = blocks
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty() && !existing.contains(*s))
        .collect();
    if to_add.is_empty() {
        return false;
    }
    let block = to_add.join("\n\n---\n\n");
    match fs::OpenOptions::new().append(true).open(path) {
        Ok(mut f) => write!(f, "\n---\n\n{block}\n").is_ok(),
        Err(_) => false,
    }
}
