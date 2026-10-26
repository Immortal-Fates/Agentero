use agentero_core::features::catalog::papers::PaperRecord;
use hayagriva::{
    archive, BibliographyDriver, BibliographyRequest, BufWriteFormat, CitationItem, CitationRequest,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub const PREFIX: &str = "ADDIN ZOTERO_ITEM CSL_CITATION ";
pub const BIB_PREFIX: &str = "ADDIN ZOTERO_BIBL ";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Citation {
    #[serde(rename = "citationID")]
    pub citation_id: String,
    pub citation_items: Vec<Item>,
    pub properties: Value,
    pub agentero: Metadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Metadata {
    pub version: u8,
    pub style: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: String,
    pub item_data: Value,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub locator: String,
    pub label: String,
}

pub fn csl(paper: &PaperRecord) -> Value {
    let authors: Vec<Value> = paper
        .authors
        .iter()
        .map(|name| {
            if let Some((family, given)) = name.split_once(',') {
                json!({"family":family.trim(),"given":given.trim()})
            } else if let Some((given, family)) = name.rsplit_once(' ') {
                json!({"family":family,"given":given})
            } else {
                json!({"literal":name})
            }
        })
        .collect();
    let mut value = json!({"id":format!("agentero:{}",paper.id), "type":"article-journal", "title":paper.title,"author":authors});
    for (key, v) in [
        ("DOI", &paper.doi),
        ("container-title", &paper.publication),
        ("volume", &paper.volume),
        ("issue", &paper.issue),
        ("page", &paper.pages),
        ("publisher", &paper.publisher),
        ("URL", &paper.source_url),
    ] {
        if let Some(v) = v {
            value[key] = json!(v);
        }
    }
    if let Some(year) = paper.year {
        value["issued"] = json!({"date-parts":[[year]]});
    }
    value
}

pub fn decode(code: &str) -> Result<Option<Citation>, String> {
    let code = code.trim();
    if let Some(payload) = code.strip_prefix(PREFIX) {
        let citation: Citation = serde_json::from_str(payload).map_err(|_| "word.foreignFields")?;
        if citation.agentero.version != 1 || citation.citation_items.is_empty() {
            return Err("word.foreignFields".into());
        }
        style(&citation.agentero.style)?;
        Ok(Some(citation))
    } else if code.starts_with(BIB_PREFIX) {
        let data: Value = serde_json::from_str(code.trim_start_matches(BIB_PREFIX))
            .map_err(|_| "word.foreignFields")?;
        if data["agentero"]["version"] != 1 {
            return Err("word.foreignFields".into());
        }
        Ok(None)
    } else if code.contains("ZOTERO_") {
        Err("word.foreignFields".into())
    } else {
        Ok(None)
    }
}

pub fn encode(citation: &Citation) -> Result<String, String> {
    Ok(format!(
        " {PREFIX}{} ",
        serde_json::to_string(citation).map_err(|e| e.to_string())?
    ))
}

pub fn style(id: &str) -> Result<hayagriva::citationberg::IndependentStyle, String> {
    let archived = match id {
        "apa" => archive::ArchivedStyle::AmericanPsychologicalAssociation,
        "ieee" => archive::ArchivedStyle::InstituteOfElectricalAndElectronicsEngineers,
        "chicago-author-date" => archive::ArchivedStyle::ChicagoAuthorDate,
        _ => return Err("word.unknownStyle".into()),
    };
    match archived.get() {
        hayagriva::citationberg::Style::Independent(s) => Ok(s),
        _ => Err("word.unknownStyle".into()),
    }
}

pub fn render(citations: &[Citation], style_id: &str) -> Result<(Vec<String>, String), String> {
    let style = style(style_id)?;
    let locales = archive::locales();
    // Hayagriva identifies entries by reference identity. Repeated citations
    // must refer to one canonical entry, not separately deserialized copies.
    let mut entries =
        std::collections::HashMap::<String, hayagriva::citationberg::json::Item>::new();
    for item in citations.iter().flat_map(|c| &c.citation_items) {
        entries.insert(
            item.id.clone(),
            serde_json::from_value(item.item_data.clone()).map_err(|e| e.to_string())?,
        );
    }
    let mut driver = BibliographyDriver::new();
    for citation in citations {
        let items = citation
            .citation_items
            .iter()
            .map(|item| {
                let entry = &entries[&item.id];
                let locator = (!item.locator.is_empty()).then_some(hayagriva::SpecificLocator(
                    hayagriva::citationberg::taxonomy::Locator::Page,
                    hayagriva::LocatorPayload::Str(&item.locator),
                ));
                CitationItem::with_locator(entry, locator)
            })
            .collect();
        driver.citation(CitationRequest::from_items(items, &style, &locales));
    }
    let result = driver.finish(BibliographyRequest::new(&style, None, &locales));
    let texts = result
        .citations
        .iter()
        .map(|c| {
            let mut s = String::new();
            c.citation
                .write_buf(&mut s, BufWriteFormat::Plain)
                .expect("string formatting");
            s
        })
        .collect();
    let bibliography = result
        .bibliography
        .map(|b| {
            b.items
                .iter()
                .map(|item| {
                    let mut s = String::new();
                    if let Some(first) = &item.first_field {
                        first
                            .write_buf(&mut s, BufWriteFormat::Plain)
                            .expect("string formatting");
                        s.push(' ');
                    }
                    item.content
                        .write_buf(&mut s, BufWriteFormat::Plain)
                        .expect("string formatting");
                    s
                })
                .collect::<Vec<_>>()
                .join("\r")
        })
        .unwrap_or_default();
    Ok((texts, bibliography))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(id: &str, title: &str) -> Citation {
        Citation {
            citation_id: format!("cite-{id}"),
            citation_items: vec![Item {
                id: id.into(),
                item_data: json!({"id":id,"type":"article-journal","title":title,"author":[{"family":"Smith","given":"Jane"}],"issued":{"date-parts":[[2024]]}}),
                locator: String::new(),
                label: "page".into(),
            }],
            properties: json!({"noteIndex":0}),
            agentero: Metadata {
                version: 1,
                style: "ieee".into(),
            },
        }
    }

    #[test]
    fn snapshots_round_trip_without_catalog_and_render_all_styles() {
        let original = sample("paper-a", "Persistent snapshot");
        let restored = decode(&encode(&original).unwrap()).unwrap().unwrap();
        assert_eq!(
            restored.citation_items[0].item_data["title"],
            "Persistent snapshot"
        );
        for style in ["apa", "ieee", "chicago-author-date"] {
            let (citations, bibliography) = render(std::slice::from_ref(&restored), style).unwrap();
            assert!(!citations[0].is_empty());
            assert!(bibliography.to_lowercase().contains("persistent snapshot"));
        }
    }

    #[test]
    fn numeric_refresh_renumbers_and_deduplicates_bibliography() {
        let a = sample("paper-a", "Alpha study");
        let b = sample("paper-b", "Beta study");
        let (texts, bibliography) = render(&[b, a.clone(), a], "ieee").unwrap();
        assert_eq!(texts, ["[1]", "[2]", "[2]"]);
        assert_eq!(
            bibliography.to_lowercase().matches("alpha study").count(),
            1
        );
        assert!(
            bibliography.to_lowercase().find("beta study").unwrap()
                < bibliography.to_lowercase().find("alpha study").unwrap()
        );
    }

    #[test]
    fn refuses_foreign_or_corrupt_fields_before_any_writes() {
        assert!(decode(" ADDIN ZOTERO_ITEM CSL_CITATION {} ").is_err());
        assert!(decode(" ADDIN ZOTERO_BIBL {} ").is_err());
        assert!(decode(" ADDIN ZOTERO_ITEM CSL_CITATION broken ").is_err());
        assert!(decode(" PAGE ").unwrap().is_none());
        let mut future = sample("a", "Future");
        future.agentero.version = 2;
        assert!(decode(&encode(&future).unwrap()).is_err());
    }
}
