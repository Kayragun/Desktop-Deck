//! Dynamic deck keys: user-pinned app/URL shortcuts on the main grid.
//!
//! - `list_installed_apps` walks the Start Menu (machine + user) and resolves
//!   each .lnk to its target .exe via IShellLinkW, so the user can pick an app
//!   without hunting for a file path.
//! - `get_file_icon` extracts the file's own shell icon (HICON → RGBA → PNG)
//!   and returns it as a `data:image/png;base64,…` URL the webview can render.
//! - `get_url_icon` resolves the default http browser from the registry and
//!   returns that browser's icon for URL keys.

use core::ffi::c_void;
use serde::Serialize;
use std::path::{Path, PathBuf};
use winreg::{enums::*, RegKey};

// ─── Persistence (config.rs holds the struct + json io) ──────────────────────

#[tauri::command]
pub fn get_deck_keys() -> Vec<crate::config::DeckKey> {
    crate::config::load_deck_keys()
}

#[tauri::command]
pub fn save_deck_keys(keys: Vec<crate::config::DeckKey>) {
    crate::config::save_deck_keys(&keys);
}

// ─── Installed app enumeration ────────────────────────────────────────────────

#[derive(Serialize, Clone)]
pub struct InstalledApp {
    pub name: String,
    pub path: String,
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn start_menu_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Ok(pd) = std::env::var("ProgramData") {
        dirs.push(PathBuf::from(pd).join("Microsoft\\Windows\\Start Menu\\Programs"));
    }
    if let Ok(ad) = std::env::var("APPDATA") {
        dirs.push(PathBuf::from(ad).join("Microsoft\\Windows\\Start Menu\\Programs"));
    }
    dirs
}

fn collect_lnk_files(dir: &Path, depth: u32, out: &mut Vec<PathBuf>) {
    if depth > 3 { return; }
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_dir() {
            collect_lnk_files(&p, depth + 1, out);
        } else if p.extension().map(|e| e.eq_ignore_ascii_case("lnk")).unwrap_or(false) {
            out.push(p);
        }
    }
}

/// Shortcuts that aren't "apps" from the user's perspective.
fn is_noise(name_lower: &str) -> bool {
    const NOISE: &[&str] = &[
        "uninstall", "kaldır", "setup", "installer", "repair",
        "readme", "documentation", "help", "license", "web site", "website",
    ];
    NOISE.iter().any(|n| name_lower.contains(n))
}

#[tauri::command]
pub fn list_installed_apps() -> Vec<InstalledApp> {
    use windows::{
        core::{Interface, PCWSTR},
        Win32::Storage::FileSystem::WIN32_FIND_DATAW,
        Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, IPersistFile,
            CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, STGM_READ,
        },
        Win32::UI::Shell::{IShellLinkW, ShellLink},
    };

    let mut lnk_files = Vec::new();
    for dir in start_menu_dirs() {
        collect_lnk_files(&dir, 0, &mut lnk_files);
    }

    let mut apps: Vec<InstalledApp> = Vec::new();
    let mut seen_targets: std::collections::HashSet<String> = std::collections::HashSet::new();

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let link: IShellLinkW = match CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER) {
            Ok(l) => l,
            Err(_) => return apps,
        };
        let Ok(persist) = link.cast::<IPersistFile>() else { return apps };

        for lnk in lnk_files {
            let Some(stem) = lnk.file_stem().and_then(|s| s.to_str()) else { continue };
            let name_lower = stem.to_lowercase();
            if is_noise(&name_lower) { continue; }

            let Some(lnk_str) = lnk.to_str() else { continue };
            let w = wide(lnk_str);
            if persist.Load(PCWSTR(w.as_ptr()), STGM_READ).is_err() { continue; }

            let mut buf = [0u16; 520];
            if link.GetPath(&mut buf, std::ptr::null_mut::<WIN32_FIND_DATAW>(), 0).is_err() { continue; }
            let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
            let target = String::from_utf16_lossy(&buf[..len]);
            let target_lower = target.to_lowercase();

            if !target_lower.ends_with(".exe") { continue; }
            if target_lower.contains("unins") { continue; }
            if !Path::new(&target).exists() { continue; }
            if !seen_targets.insert(target_lower) { continue; }

            apps.push(InstalledApp { name: stem.to_string(), path: target });
        }
    }

    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps
}

// ─── Icon extraction: file → HICON → RGBA → PNG data URL ─────────────────────

fn base64_encode(data: &[u8]) -> String {
    const TBL: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = (b[0] as u32) << 16 | (b[1] as u32) << 8 | b[2] as u32;
        out.push(TBL[(n >> 18 & 63) as usize] as char);
        out.push(TBL[(n >> 12 & 63) as usize] as char);
        out.push(if chunk.len() > 1 { TBL[(n >> 6 & 63) as usize] as char } else { '=' });
        out.push(if chunk.len() > 2 { TBL[(n & 63) as usize] as char } else { '=' });
    }
    out
}

/// Read a 32bpp top-down RGBA buffer out of an HBITMAP. Returns (w, h, bgra).
unsafe fn bitmap_pixels(
    hdc: windows::Win32::Graphics::Gdi::HDC,
    hbm: windows::Win32::Graphics::Gdi::HBITMAP,
) -> Option<(u32, u32, Vec<u8>)> {
    use windows::Win32::Graphics::Gdi::{
        GetDIBits, GetObjectW, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
    };

    let mut bm = BITMAP::default();
    if GetObjectW(
        hbm,
        std::mem::size_of::<BITMAP>() as i32,
        Some(&mut bm as *mut BITMAP as *mut c_void),
    ) == 0 { return None; }

    let (w, h) = (bm.bmWidth as u32, bm.bmHeight as u32);
    if w == 0 || h == 0 || w > 512 || h > 512 { return None; }

    let mut bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: w as i32,
            biHeight: -(h as i32), // top-down
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };

    let mut buf = vec![0u8; (w * h * 4) as usize];
    let lines = GetDIBits(
        hdc, hbm, 0, h,
        Some(buf.as_mut_ptr() as *mut c_void),
        &mut bmi, DIB_RGB_COLORS,
    );
    if lines == 0 { return None; }
    Some((w, h, buf))
}

/// Convert an HICON into a PNG data URL. Destroys nothing — caller owns the icon.
unsafe fn hicon_to_data_url(hicon: windows::Win32::UI::WindowsAndMessaging::HICON) -> Option<String> {
    use windows::Win32::Graphics::Gdi::{DeleteObject, GetDC, ReleaseDC};
    use windows::Win32::UI::WindowsAndMessaging::{GetIconInfo, ICONINFO};

    let mut info = ICONINFO::default();
    GetIconInfo(hicon, &mut info).ok()?;

    let hdc = GetDC(None);
    let result = (|| {
        if info.hbmColor.is_invalid() { return None; } // monochrome icon — skip
        let (w, h, mut bgra) = bitmap_pixels(hdc, info.hbmColor)?;

        // Legacy icons without an alpha channel report all-zero alpha; derive
        // it from the AND mask (white mask pixel = transparent).
        if bgra.chunks_exact(4).all(|p| p[3] == 0) {
            if !info.hbmMask.is_invalid() {
                if let Some((mw, mh, mask)) = bitmap_pixels(hdc, info.hbmMask) {
                    if mw == w && mh >= h {
                        for (i, px) in bgra.chunks_exact_mut(4).enumerate() {
                            px[3] = if mask[i * 4] > 0 { 0 } else { 255 };
                        }
                    }
                }
            } else {
                for px in bgra.chunks_exact_mut(4) { px[3] = 255; }
            }
        }

        // BGRA → RGBA
        for px in bgra.chunks_exact_mut(4) { px.swap(0, 2); }

        let img = image::RgbaImage::from_raw(w, h, bgra)?;
        let mut png: Vec<u8> = Vec::new();
        image::DynamicImage::ImageRgba8(img)
            .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
            .ok()?;
        Some(format!("data:image/png;base64,{}", base64_encode(&png)))
    })();

    if !info.hbmColor.is_invalid() { let _ = DeleteObject(info.hbmColor); }
    if !info.hbmMask.is_invalid()  { let _ = DeleteObject(info.hbmMask); }
    ReleaseDC(None, hdc);
    result
}

/// Extract the shell icon of any file (exe, lnk, document) as a PNG data URL.
#[tauri::command]
pub fn get_file_icon(path: String) -> Option<String> {
    use windows::{
        core::PCWSTR,
        Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES,
        Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED},
        Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON},
        Win32::UI::WindowsAndMessaging::DestroyIcon,
    };

    if !Path::new(&path).exists() { return None; }

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let w = wide(&path);
        let mut sfi = SHFILEINFOW::default();
        let ok = SHGetFileInfoW(
            PCWSTR(w.as_ptr()),
            FILE_FLAGS_AND_ATTRIBUTES(0),
            Some(&mut sfi),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_LARGEICON,
        );
        if ok == 0 || sfi.hIcon.is_invalid() { return None; }
        let url = hicon_to_data_url(sfi.hIcon);
        let _ = DestroyIcon(sfi.hIcon);
        url
    }
}

// ─── Default browser icon (for URL keys) ─────────────────────────────────────

fn default_browser_exe() -> Option<String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let prog_id: String = hkcu
        .open_subkey(r"Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice")
        .ok()?
        .get_value("ProgId")
        .ok()?;

    let hkcr = RegKey::predef(HKEY_CLASSES_ROOT);
    let cmd: String = hkcr
        .open_subkey(format!(r"{}\shell\open\command", prog_id))
        .ok()?
        .get_value("")
        .ok()?;

    // `"C:\…\msedge.exe" --single-argument %1` → take the quoted path,
    // otherwise the first whitespace-separated token.
    let exe = if let Some(rest) = cmd.strip_prefix('"') {
        rest.split('"').next()?.to_string()
    } else {
        cmd.split_whitespace().next()?.to_string()
    };
    if exe.to_lowercase().ends_with(".exe") && Path::new(&exe).exists() {
        Some(exe)
    } else {
        None
    }
}

#[tauri::command]
pub fn get_url_icon() -> Option<String> {
    get_file_icon(default_browser_exe()?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_apps_and_extracts_icons() {
        let apps = list_installed_apps();
        println!("apps found: {}", apps.len());
        for a in apps.iter().take(5) { println!("  {} -> {}", a.name, a.path); }
        assert!(!apps.is_empty(), "no installed apps found");

        let icon = get_file_icon(r"C:\Windows\System32\notepad.exe".into());
        assert!(icon.is_some(), "notepad icon extraction failed");
        let url = icon.unwrap();
        // "iVBOR" is the base64 of the PNG magic bytes.
        assert!(url.starts_with("data:image/png;base64,iVBOR"), "not a PNG data url: {}", &url[..40.min(url.len())]);
        println!("notepad icon: {} chars", url.len());

        let burl = get_url_icon();
        println!("browser icon: {:?} chars", burl.as_ref().map(|s| s.len()));
    }
}
