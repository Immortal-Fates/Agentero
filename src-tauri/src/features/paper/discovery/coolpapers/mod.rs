//! Cool Papers (papers.cool) integration.
//!
//! The tauri-free note-fetch body (resolving a paper, pulling its Kimi FAQ
//! analysis, appending to `NOTES.md`) lives in
//! `agentero_core::features::paper::discovery::coolpapers` so the headless CLI
//! shares it. This crate keeps the desktop-only shells: [`page`] imports a row
//! straight from its page metadata (no Translator), [`proxy`] serves the site
//! under our own scheme for the 广场 panel, and [`commands`] exposes both over
//! IPC.

#[cfg(feature = "desktop")]
pub mod commands;
#[cfg(feature = "desktop")]
pub mod page;
#[cfg(feature = "desktop")]
pub mod proxy;

pub use agentero_core::features::paper::discovery::coolpapers::{
    decode_entities, fetch_notes, http_client, CoolPapersNotes, FetchNotesRequest, ORIGIN,
    USER_AGENT,
};
