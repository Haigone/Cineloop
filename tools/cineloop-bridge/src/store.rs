use crate::logic::State;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Impostazioni salvate su disco (il percorso dipende dal sistema).
#[derive(Default, Serialize, Deserialize)]
pub struct Config {
    /// Application ID Discord; se manca si usa quello incluso nell'app o la variabile d'ambiente.
    #[serde(default)]
    pub app_id: Option<String>,
    #[serde(default)]
    pub state: State,
}

pub fn config_path() -> Option<PathBuf> {
    let base = std::env::var_os("APPDATA")
        .or_else(|| std::env::var_os("XDG_CONFIG_HOME"))
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))?;
    Some(base.join("CineLoop Bridge").join("config.json"))
}

pub fn load() -> Config {
    config_path()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save(cfg: &Config) {
    let Some(p) = config_path() else { return };
    if let Some(dir) = p.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(json) = serde_json::to_string_pretty(cfg) {
        let _ = std::fs::write(p, json);
    }
}

/// Application ID: variabile d'ambiente, poi config, poi valore incluso in compilazione.
pub fn app_id(cfg: &Config) -> Option<String> {
    std::env::var("CINELOOP_DISCORD_APP_ID")
        .ok()
        .or_else(|| cfg.app_id.clone())
        .or_else(|| option_env!("CINELOOP_DISCORD_APP_ID").map(str::to_string))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && s != "INSERISCI_QUI_APPLICATION_ID")
}
