use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicI32, Ordering},
};

// ─── Snippet ──────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct Snippet {
    pub id: String,
    pub label: String,
    pub text: String,
}

fn snippets_path() -> PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
    PathBuf::from(appdata).join("Desktop Deck").join("snippets.json")
}

pub fn load_snippets() -> Vec<Snippet> {
    let defaults = vec![
        Snippet { id: "s1".into(), label: "Email".into(), text: "yourname@example.com".into() },
        Snippet { id: "s2".into(), label: "Phone".into(), text: "+90 555 000 00 00".into() },
        Snippet { id: "s3".into(), label: "IBAN".into(),  text: "TR00 0000 0000 0000 0000 0000 00".into() },
    ];
    let path = snippets_path();
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str::<Vec<Snippet>>(&s).ok())
        .unwrap_or(defaults)
}

pub fn save_snippets(snippets: &[Snippet]) {
    let path = snippets_path();
    if let Some(p) = path.parent() { let _ = fs::create_dir_all(p); }
    if let Ok(json) = serde_json::to_string(snippets) { let _ = fs::write(path, json); }
}

static LAST_X: AtomicI32 = AtomicI32::new(50);
static LAST_Y: AtomicI32 = AtomicI32::new(100);

#[derive(Serialize, Deserialize)]
pub struct Config {
    pub x: i32,
    pub y: i32,
}

fn config_path() -> PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
    PathBuf::from(appdata).join("Desktop Deck").join("config.json")
}

pub fn load() -> Config {
    let path = config_path();
    let cfg = fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str::<Config>(&s).ok())
        .unwrap_or(Config { x: 50, y: 100 });

    LAST_X.store(cfg.x, Ordering::Relaxed);
    LAST_Y.store(cfg.y, Ordering::Relaxed);
    cfg
}

// Sürükleme sırasında her piksel hareketinde diske yazmaktan kaçın;
// konumu sadece atomik değişkende tut.
pub fn update_position(x: i32, y: i32) {
    LAST_X.store(x, Ordering::Relaxed);
    LAST_Y.store(y, Ordering::Relaxed);
}

pub fn save_current() {
    let path = config_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let cfg = Config {
        x: LAST_X.load(Ordering::Relaxed),
        y: LAST_Y.load(Ordering::Relaxed),
    };
    if let Ok(json) = serde_json::to_string(&cfg) {
        let _ = fs::write(path, json);
    }
}
