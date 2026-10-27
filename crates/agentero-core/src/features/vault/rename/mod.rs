//! Vault path rename orchestration (moved up from `wiki::rename`, P2-18).
//!
//! A rename/move is inherently cross-domain: one filesystem move plus
//! link rewrites across Markdown and path-prefix updates in the catalog.
//! This module is the single orchestration point above the atomic
//! capabilities, so the domains no longer drive each other:
//!
//! - `wiki` supplies the semantic index and the preflighted link-rewrite
//!   transaction ([`WikiRenameTransaction`]) including rollback.
//! - `catalog` supplies paper path-prefix updates
//!   (`catalog::papers::move_under_path`), executed as the dependent commit
//!   while the filesystem transaction is still recoverable.
//!
//! Callers (shared application use cases or Host commands) pass the dependent
//! commit as a closure. This engine depends on wiki capabilities, while the
//! paper move use case owns Catalog and activity-log updates.

use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

// Facade: callers of the rename workflow name these wiki-owned types through
// this module, so vault/catalog/connector keep zero direct `wiki` edges.
pub use crate::features::wiki::index::WikiIndex;
pub use crate::features::wiki::models::{
    WikiExternalRenamePreview, WikiRenameErrorCode, WikiRenameResult, WikiRenameRollback,
};
pub use crate::features::wiki::rename::{WikiRenameError, WikiRenameTransaction};
pub use crate::features::wiki::WikiIndexState;

/// Host-owned short-lived external rename repair snapshots. Keeping the plan
/// here lets an `ask` confirmation survive a regular watcher-triggered index
/// rebuild without rediscovering old links from the already-renamed Vault.
///
/// Cloning yields another handle to the same shared map, so async commands can
/// move a clone into `spawn_blocking` closures.
#[derive(Clone)]
pub struct ExternalRenameRepairStore {
    inner: Arc<Mutex<HashMap<String, WikiRenameTransaction>>>,
}

impl ExternalRenameRepairStore {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn insert(&self, transaction: WikiRenameTransaction) -> Result<String, WikiRenameError> {
        let candidate_id = Uuid::new_v4().to_string();
        let mut guard = self.inner.lock().map_err(|_| {
            WikiRenameError::new(
                WikiRenameErrorCode::CommitFailed,
                "external rename repair store lock poisoned",
            )
        })?;
        // A bounded in-memory cache is sufficient: candidates are advisory and
        // each execution still rechecks every source hash.
        if guard.len() >= 32 {
            guard.clear();
        }
        guard.insert(candidate_id.clone(), transaction);
        Ok(candidate_id)
    }

    pub fn get(&self, candidate_id: &str) -> Result<WikiRenameTransaction, WikiRenameError> {
        let guard = self.inner.lock().map_err(|_| {
            WikiRenameError::new(
                WikiRenameErrorCode::CommitFailed,
                "external rename repair store lock poisoned",
            )
        })?;
        guard.get(candidate_id).cloned().ok_or_else(|| {
            WikiRenameError::new(
                WikiRenameErrorCode::IndexStale,
                "external rename repair candidate is no longer available",
            )
        })
    }

    pub fn remove(&self, candidate_id: &str) {
        if let Ok(mut guard) = self.inner.lock() {
            guard.remove(candidate_id);
        }
    }
}

impl Default for ExternalRenameRepairStore {
    fn default() -> Self {
        Self::new()
    }
}

/// Plan a local rename from the current index, then retarget that index to the
/// moved paths. A cold index is rebuilt once before planning. After a
/// successful move the index remaps the old path prefix and re-reads only the
/// Markdown the transaction changed, plus a listing of the destination — it
/// does not walk the rest of the vault. Callers can attach one dependent
/// commit while the filesystem transaction is still recoverable.
pub fn run_local_rename_transaction<F>(
    vault_root: &Path,
    index: &mut WikiIndex,
    from: &str,
    to: &str,
    dirty_paths: &[String],
    commit: F,
) -> Result<WikiRenameResult, WikiRenameError>
where
    F: FnOnce() -> Result<(), String>,
{
    let vault_path = vault_root.to_str().ok_or_else(|| {
        WikiRenameError::new(
            WikiRenameErrorCode::InvalidPath,
            "vault path is not valid UTF-8",
        )
    })?;
    if !index.is_warm_for(vault_path) {
        index.rebuild(vault_path).map_err(|error| {
            WikiRenameError::new(
                WikiRenameErrorCode::IndexStale,
                format!("could not build pre-move wiki snapshot: {error}"),
            )
        })?;
    } else {
        // Saved notes are not a vault walk: only paths recorded since the last
        // index update are re-read, then link rewrite is planned from that.
        index.refresh_pending_sources(vault_path).map_err(|error| {
            WikiRenameError::new(
                WikiRenameErrorCode::IndexStale,
                format!("could not refresh saved wiki sources: {error}"),
            )
        })?;
    }
    let transaction = WikiRenameTransaction::plan(vault_root, index, from, to)?;
    transaction.reject_dirty_paths(dirty_paths)?;
    let result = transaction.execute(commit)?;
    index
        .refresh_after_move(vault_path, from, to, &result.updated_sources)
        .map_err(|error| {
            WikiRenameError::new(
                WikiRenameErrorCode::CommitFailed,
                format!("move succeeded but wiki index update failed: {error}"),
            )
        })?;
    Ok(result)
}

/// Execute a prepared external repair against the preserved pre-rename index
/// snapshot. The operation writes only Markdown sources; it never moves the
/// externally renamed file or directory back.
pub fn run_prepared_external_rename_repair(
    vault_root: &Path,
    index: &mut WikiIndex,
    transaction: &WikiRenameTransaction,
    dirty_paths: &[String],
) -> Result<WikiRenameResult, WikiRenameError> {
    let vault_path = vault_root.to_str().ok_or_else(|| {
        WikiRenameError::new(
            WikiRenameErrorCode::InvalidPath,
            "vault path is not valid UTF-8",
        )
    })?;
    if transaction.vault_root() != vault_root || transaction.primary_move_pending() {
        return Err(WikiRenameError::new(
            WikiRenameErrorCode::InvalidPath,
            "invalid external rename repair transaction",
        ));
    }
    transaction.reject_dirty_paths(dirty_paths)?;
    let result = transaction.execute_external_repair()?;
    index.rebuild(vault_path).map_err(|error| {
        WikiRenameError::new(
            WikiRenameErrorCode::CommitFailed,
            format!("external repair succeeded but wiki index rebuild failed: {error}"),
        )
    })?;
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn temp_vault() -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("agentero-rename-orchestrator-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).expect("create vault");
        root
    }

    fn write(root: &Path, path: &str, content: &str) {
        let file = root.join(path);
        fs::create_dir_all(file.parent().expect("parent")).expect("create parent");
        fs::write(file, content).expect("write fixture");
    }

    fn snapshot(root: &Path) -> WikiIndex {
        let mut index = WikiIndex::default();
        index
            .rebuild(root.to_str().expect("utf8 vault"))
            .expect("rebuild");
        index
    }

    #[test]
    fn external_rename_repair_uses_the_old_snapshot_and_supports_consecutive_moves() {
        let root = temp_vault();
        write(
            &root,
            "notes/Source.md",
            "[[notes/Target#Overview|Alias]] [target](./Target.md#Overview)\n",
        );
        write(&root, "notes/Target.md", "# Overview\n");
        let mut index = snapshot(&root);

        fs::create_dir_all(root.join("archive")).expect("create archive");
        fs::rename(
            root.join("notes/Target.md"),
            root.join("archive/Renamed.md"),
        )
        .expect("external rename");
        let first = WikiRenameTransaction::plan_external_repair(
            &root,
            &index,
            "notes/Target.md",
            "archive/Renamed.md",
        )
        .expect("external plan");
        let result = run_prepared_external_rename_repair(&root, &mut index, &first, &[])
            .expect("external repair");
        assert_eq!(result.updated_sources, vec!["notes/Source.md"]);
        assert_eq!(
            fs::read_to_string(root.join("notes/Source.md")).unwrap(),
            "[[archive/Renamed#Overview|Alias]] [target](../archive/Renamed.md#Overview)\n"
        );
        assert!(!root.join("notes/Target.md").exists());

        fs::rename(
            root.join("archive/Renamed.md"),
            root.join("archive/Final.md"),
        )
        .expect("second external rename");
        let second = WikiRenameTransaction::plan_external_repair(
            &root,
            &index,
            "archive/Renamed.md",
            "archive/Final.md",
        )
        .expect("second external plan");
        run_prepared_external_rename_repair(&root, &mut index, &second, &[])
            .expect("second external repair");
        assert_eq!(
            fs::read_to_string(root.join("notes/Source.md")).unwrap(),
            "[[archive/Final#Overview|Alias]] [target](../archive/Final.md#Overview)\n"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn local_rename_rewrites_links_from_a_warm_index_and_sees_inner_pdf_rename() {
        let root = temp_vault();
        write(&root, "notes/Source.md", "[[papers/old/NOTES#Overview]]\n");
        write(&root, "papers/old/NOTES.md", "# Overview\n");
        write(&root, "papers/old/old.pdf", "%PDF-1.4\n");
        let mut index = snapshot(&root);
        let vault = root.to_str().expect("utf8 vault");
        assert!(index.is_warm_for(vault));

        fs::rename(
            root.join("papers/old/old.pdf"),
            root.join("papers/old/new.pdf"),
        )
        .expect("rename pdf inside the folder before the move");
        let result = run_local_rename_transaction(
            &root,
            &mut index,
            "papers/old",
            "papers/new",
            &[],
            || Ok(()),
        )
        .expect("rename folder");
        assert_eq!(result.updated_sources, vec!["notes/Source.md"]);
        assert_eq!(
            fs::read_to_string(root.join("notes/Source.md")).unwrap(),
            "[[papers/new/NOTES#Overview]]\n"
        );
        assert!(index.document("papers/new/NOTES.md").is_some());
        assert!(index.document("papers/new/new.pdf").is_some());
        assert!(index.document("papers/new/old.pdf").is_none());
        assert!(index.document("papers/old/NOTES.md").is_none());
        let outgoing = index.get_outgoing(vault, "notes/Source.md");
        assert_eq!(
            outgoing
                .outgoing
                .iter()
                .filter_map(|edge| edge.target_path.as_deref())
                .collect::<Vec<_>>(),
            vec!["papers/new/NOTES.md"]
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn warm_rename_rewrites_a_link_saved_after_the_index_was_built() {
        let root = temp_vault();
        write(&root, "notes/Source.md", "before\n");
        write(&root, "notes/Target.md", "# Overview\n");
        let mut index = snapshot(&root);
        let saved = root.join("notes/Source.md");
        fs::write(&saved, "[[notes/Target]]\n").unwrap();
        index.note_saved_source(root.to_str().unwrap(), &saved.to_string_lossy());
        run_local_rename_transaction(
            &root,
            &mut index,
            "notes/Target.md",
            "archive/Renamed.md",
            &[],
            || Ok(()),
        )
        .expect("rename sees the saved link");
        assert_eq!(fs::read_to_string(saved).unwrap(), "[[archive/Renamed]]\n");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rename_plan_accepts_a_canonical_spelling_of_the_same_vault() {
        let root = temp_vault();
        write(&root, "notes/Target.md", "# Overview\n");
        let index = snapshot(&root);
        let canonical = crate::fs::canonicalize_best_effort(&root);
        let canonical_text = canonical.to_str().expect("utf8 canonical vault");
        assert!(index.describes_vault(canonical_text));
        if canonical != root {
            WikiRenameTransaction::plan(
                &canonical,
                &index,
                "notes/Target.md",
                "archive/Renamed.md",
            )
            .expect("canonical vault spelling still describes this index");
        }
        let _ = fs::remove_dir_all(root);
    }
}
