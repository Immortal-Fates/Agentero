//! Literal TeX project helpers shared by paper reading and desktop compilation.

use std::path::{Path, PathBuf};

/// Strip `%`-comments line by line. A `%` preceded by an odd number of
/// backslashes (`\%`) is a literal percent sign, so the scan steps over
/// backslash + escaped-char pairs. Verbatim environments are NOT stripped (a
/// `\documentclass` inside verbatim would read as an indicator; the fallout —
/// compiling that file itself — is visible and recoverable, so the
/// simplification is accepted).
pub fn strip_comments(content: &str) -> String {
    content
        .lines()
        .map(truncate_at_comment)
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn truncate_at_comment(line: &str) -> &str {
    let bytes = line.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'\\' => {
                i += 1;
                // Skip the escaped char: `\\` is a literal backslash, `\%` a
                // literal percent — neither starts a comment.
                if i < bytes.len() {
                    i += 1;
                }
            }
            b'%' => return &line[..i],
            _ => i += 1,
        }
    }
    line
}

/// Root indicator on comment-stripped content: `\documentclass` or
/// `\begin{document}` with a word boundary after the match (so
/// `\documentclassfoo` does not count).
pub fn has_indicator(stripped: &str) -> bool {
    contains_word(stripped, "\\documentclass") || contains_word(stripped, "\\begin{document}")
}

fn contains_word(haystack: &str, needle: &str) -> bool {
    let mut start = 0;
    while let Some(pos) = haystack[start..].find(needle) {
        let abs = start + pos;
        let after = haystack[abs + needle.len()..].chars().next();
        if !after.is_some_and(|c| c.is_ascii_alphabetic()) {
            return true;
        }
        start = abs + needle.len();
    }
    false
}

/// Parse `\input{…}` / `\include{…}` arguments from comment-stripped
/// content. The command name must match exactly, which excludes
/// `\includegraphics` / `\includeonly` / `\includepdf` / `\includesvg`. The
/// bare form (`\input foo`) is not parsed, matching LaTeX Workshop's regex.
pub fn parse_input_refs(stripped: &str) -> Vec<String> {
    input_commands(stripped)
        .into_iter()
        .map(|(_, path)| path)
        .collect()
}

/// Byte ranges let the reader expand chapter files at their original position.
pub fn input_commands(stripped: &str) -> Vec<(std::ops::Range<usize>, String)> {
    let bytes = stripped.as_bytes();
    let mut refs = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] != b'\\' {
            i += 1;
            continue;
        }
        let start = i;
        i += 1;
        let name_start = i;
        while i < bytes.len() && bytes[i].is_ascii_alphabetic() {
            i += 1;
        }
        let name = &stripped[name_start..i];
        let count = match name {
            "input" | "include" | "subfile" => 1,
            "import" | "subimport" | "inputfrom" | "includefrom" => 2,
            _ => continue,
        };
        if bytes.get(i) == Some(&b'*') {
            i += 1;
        }
        i = skip_ws(bytes, i);
        if bytes.get(i) == Some(&b'[') {
            while i < bytes.len() && bytes[i] != b']' {
                i += 1;
            }
            i = skip_ws(bytes, (i + 1).min(bytes.len()));
        }
        let mut args = Vec::new();
        for _ in 0..count {
            if bytes.get(i) != Some(&b'{') {
                break;
            }
            let arg_start = i + 1;
            let Some(end) = stripped[arg_start..].find('}') else {
                break;
            };
            args.push(stripped[arg_start..arg_start + end].trim());
            i = skip_ws(bytes, arg_start + end + 1);
        }
        if args.len() == count {
            let path = if count == 1 {
                args[0].to_string()
            } else {
                Path::new(args[0])
                    .join(args[1])
                    .to_string_lossy()
                    .into_owned()
            };
            refs.push((start..i, path));
        }
    }
    refs
}

fn skip_ws(bytes: &[u8], mut i: usize) -> usize {
    while i < bytes.len() && bytes[i].is_ascii_whitespace() {
        i += 1;
    }
    i
}

/// Resolve an `\input`/`\include` argument relative to the declaring file's
/// directory: the argument as written, then with `.tex` appended (the bare
/// extension-less form), returning the candidate that exists on disk.
pub fn resolve_input(dir: &Path, arg: &str) -> Option<PathBuf> {
    let arg = arg.trim();
    if arg.is_empty() {
        return None;
    }
    let joined = if Path::new(arg).is_absolute() {
        PathBuf::from(arg)
    } else {
        dir.join(arg)
    };
    if joined.is_file() {
        return Some(joined);
    }
    let with_ext = {
        let mut s = joined.clone().into_os_string();
        s.push(".tex");
        PathBuf::from(s)
    };
    if with_ext.is_file() {
        return Some(with_ext);
    }
    None
}
