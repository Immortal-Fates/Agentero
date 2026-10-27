//! Vault-wide full-text Markdown search (command palette "contents" tier).

use crate::core::blocking::run_blocking;
use crate::core::error::{map_err, ApiResult};
use crate::core::log_util::OpTimer;
use crate::features::markdown::search::{self, VaultSearchArgs, VaultSearchResult};

/// Full-text search over the Vault's Markdown files. See `services::search`.
///
/// Async + `run_blocking`: the walk reads every Markdown file, which must not
/// run on the main thread (Windows UI message pump).
#[tauri::command]
#[specta::specta]
pub async fn vault_search(args: VaultSearchArgs) -> ApiResult<VaultSearchResult> {
    run_blocking(move || {
        let op = OpTimer::start("vault_search");
        match search::vault_search(args) {
            Ok(result) => {
                let hits = result.hits.len();
                op.finish_ok_extra(format!("hits={hits}"));
                ApiResult::ok(result)
            }
            Err(e) => {
                op.finish_err(&e);
                map_err(e)
            }
        }
    })
    .await
}
