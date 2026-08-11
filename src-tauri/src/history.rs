use crate::models::HistoryEntry;
use anyhow::{Context, Result};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

const MAX_HISTORY: usize = 100;

pub struct HistoryStore {
    path: PathBuf,
    entries: Mutex<Vec<HistoryEntry>>,
}

impl HistoryStore {
    pub fn open() -> Result<Self> {
        let path = history_path()?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let entries = if path.exists() {
            let raw = fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))?;
            serde_json::from_str(&raw).unwrap_or_default()
        } else {
            Vec::new()
        };
        Ok(Self {
            path,
            entries: Mutex::new(entries),
        })
    }

    pub fn list(&self) -> Result<Vec<HistoryEntry>> {
        let entries = self.entries.lock().expect("history lock");
        Ok(entries.clone())
    }

    pub fn push(&self, entry: HistoryEntry) -> Result<HistoryEntry> {
        let mut entries = self.entries.lock().expect("history lock");
        entries.insert(0, entry.clone());
        if entries.len() > MAX_HISTORY {
            entries.truncate(MAX_HISTORY);
        }
        self.persist(&entries)?;
        Ok(entry)
    }

    pub fn delete(&self, id: &str) -> Result<()> {
        let mut entries = self.entries.lock().expect("history lock");
        entries.retain(|e| e.id != id);
        self.persist(&entries)
    }

    pub fn update_tag(&self, id: &str, tag: Option<String>) -> Result<HistoryEntry> {
        let mut entries = self.entries.lock().expect("history lock");
        let entry = entries
            .iter_mut()
            .find(|e| e.id == id)
            .context("History entry not found")?;
        entry.tag = tag
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let updated = entry.clone();
        self.persist(&entries)?;
        Ok(updated)
    }

    pub fn clear(&self) -> Result<()> {
        let mut entries = self.entries.lock().expect("history lock");
        entries.clear();
        self.persist(&entries)
    }

    fn persist(&self, entries: &[HistoryEntry]) -> Result<()> {
        let raw = serde_json::to_string_pretty(entries)?;
        atomic_write(&self.path, raw.as_bytes())
    }
}

fn history_path() -> Result<PathBuf> {
    let base = dirs::data_dir().context("Could not resolve user data directory")?;
    Ok(base.join("restool").join("history.json"))
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, bytes)?;
    fs::rename(tmp, path)?;
    Ok(())
}
