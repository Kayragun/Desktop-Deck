use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicI32, Ordering},
};

// ─── Shortcut ────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct Shortcut {
    pub id: String,
    pub label: String,
    pub target: String,
    pub icon: String,
}

fn shortcuts_path() -> PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
    PathBuf::from(appdata).join("Desktop Deck").join("shortcuts.json")
}

pub fn load_shortcuts() -> Vec<Shortcut> {
    let path = shortcuts_path();
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str::<Vec<Shortcut>>(&s).ok())
        .unwrap_or_default()
}

pub fn save_shortcuts(shortcuts: &[Shortcut]) {
    let path = shortcuts_path();
    if let Some(p) = path.parent() { let _ = fs::create_dir_all(p); }
    if let Ok(json) = serde_json::to_string(shortcuts) { let _ = fs::write(path, json); }
}

// ─── Deck Key (user-pinned app/URL shortcut on the main grid) ─────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct DeckKey {
    pub id: String,
    pub label: String,
    /// Either an absolute .exe path or a URL.
    pub target: String,
    /// "app" | "url"
    pub kind: String,
    /// data:image/png;base64,… extracted from the exe / default browser ("" = none).
    pub icon: String,
}

fn deck_keys_path() -> PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
    PathBuf::from(appdata).join("Desktop Deck").join("deck_keys.json")
}

pub fn load_deck_keys() -> Vec<DeckKey> {
    let path = deck_keys_path();
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str::<Vec<DeckKey>>(&s).ok())
        .unwrap_or_default()
}

pub fn save_deck_keys(keys: &[DeckKey]) {
    let path = deck_keys_path();
    if let Some(p) = path.parent() { let _ = fs::create_dir_all(p); }
    if let Ok(json) = serde_json::to_string(keys) { let _ = fs::write(path, json); }
}

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

// ─── Notes ───────────────────────────────────────────────────────────────────

fn default_note_x()         -> i32 { 300 }
fn default_note_y()         -> i32 { 200 }
fn default_note_opacity()   -> f64 { 0.92 }
fn default_note_w()         -> u32 { 220 }
fn default_note_h()         -> u32 { 180 }
fn default_note_font_size() -> f64 { 11.5 }

#[derive(Serialize, Deserialize, Clone)]
pub struct Note {
    pub id: String,
    pub content: String,
    pub color: String,
    #[serde(default = "default_note_x")]
    pub x: i32,
    #[serde(default = "default_note_y")]
    pub y: i32,
    #[serde(default = "default_note_opacity")]
    pub opacity: f64,
    #[serde(default = "default_note_w")]
    pub w: u32,
    #[serde(default = "default_note_h")]
    pub h: u32,
    #[serde(default = "default_note_font_size")]
    pub font_size: f64,
}

fn notes_path() -> PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
    PathBuf::from(appdata).join("Desktop Deck").join("notes.json")
}

pub fn load_notes() -> Vec<Note> {
    let path = notes_path();
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str::<Vec<Note>>(&s).ok())
        .unwrap_or_default()
}

pub fn save_notes(notes: &[Note]) {
    let path = notes_path();
    if let Some(p) = path.parent() { let _ = fs::create_dir_all(p); }
    if let Ok(json) = serde_json::to_string(notes) { let _ = fs::write(path, json); }
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
