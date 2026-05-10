use core::ffi::c_void;
use core::ptr::null_mut;

// ─── Recycle Bin ──────────────────────────────────────────────────────────────

#[link(name = "Shell32")]
extern "system" {
    fn SHEmptyRecycleBinW(hwnd: *mut c_void, path: *const u16, flags: u32) -> i32;
}

#[tauri::command]
pub fn empty_recycle_bin() {
    unsafe { SHEmptyRecycleBinW(null_mut(), core::ptr::null(), 0); }
}

// ─── Desktop path (SHGetKnownFolderPath handles OneDrive-redirected Desktops) ─

fn get_desktop_path() -> Result<String, String> {
    use windows::{
        core::GUID,
        Win32::Foundation::HANDLE,
        Win32::UI::Shell::{SHGetKnownFolderPath, KNOWN_FOLDER_FLAG},
    };
    const FOLDERID_DESKTOP: GUID = GUID {
        data1: 0xB4BFCC3A, data2: 0xDB2C, data3: 0x424C,
        data4: [0xB0, 0x29, 0x7F, 0xE9, 0x9A, 0x87, 0xC6, 0x41],
    };
    unsafe {
        let pwstr = SHGetKnownFolderPath(&FOLDERID_DESKTOP, KNOWN_FOLDER_FLAG(0), HANDLE::default())
            .map_err(|e| e.to_string())?;
        pwstr.to_string().map_err(|e| e.to_string())
    }
}

// ─── New Desktop Folder ───────────────────────────────────────────────────────

#[tauri::command]
pub fn new_desktop_folder() -> Result<(), String> {
    let desktop = get_desktop_path()?;
    let mut n = 1u32;
    loop {
        let path = if n == 1 {
            format!("{}\\New Folder", desktop)
        } else {
            format!("{}\\New Folder ({})", desktop, n)
        };
        if !std::path::Path::new(&path).exists() {
            return std::fs::create_dir(&path).map_err(|e| e.to_string());
        }
        n += 1;
        if n > 99 { return Err("Too many 'New Folder' entries on desktop".into()); }
    }
}

// ─── RAM Flush ────────────────────────────────────────────────────────────────

#[link(name = "Psapi")]
extern "system" {
    fn EnumProcesses(ids: *mut u32, cb: u32, needed: *mut u32) -> i32;
    fn EmptyWorkingSet(process: *mut c_void) -> i32;
}

extern "system" {
    fn OpenProcess(access: u32, inherit: i32, pid: u32) -> *mut c_void;
    fn CloseHandle(h: *mut c_void) -> i32;
}

#[tauri::command]
pub fn flush_ram() -> Result<(), String> {
    unsafe {
        let mut pids = vec![0u32; 1024];
        let mut needed = 0u32;
        if EnumProcesses(pids.as_mut_ptr(), (pids.len() * 4) as u32, &mut needed) == 0 {
            return Err("EnumProcesses failed".into());
        }
        let count = needed as usize / 4;
        for &pid in &pids[..count] {
            let h = OpenProcess(0x0500, 0, pid);
            if !h.is_null() { EmptyWorkingSet(h); CloseHandle(h); }
        }
    }
    Ok(())
}

// ─── Clipboard ────────────────────────────────────────────────────────────────

extern "system" {
    fn OpenClipboard(hwnd: *mut c_void) -> i32;
    fn EmptyClipboard() -> i32;
    fn CloseClipboard() -> i32;
    fn GlobalAlloc(flags: u32, bytes: usize) -> *mut c_void;
    fn GlobalLock(hmem: *mut c_void) -> *mut c_void;
    fn GlobalUnlock(hmem: *mut c_void) -> i32;
    fn SetClipboardData(format: u32, hmem: *mut c_void) -> *mut c_void;
}

#[tauri::command]
pub fn clear_clipboard() -> Result<(), String> {
    unsafe {
        if OpenClipboard(null_mut()) == 0 {
            return Err("Could not open clipboard".into());
        }
        EmptyClipboard();
        CloseClipboard();
    }
    Ok(())
}

#[tauri::command]
pub fn copy_to_clipboard(text: String) -> Result<(), String> {
    let wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
    let bytes = wide.len() * 2;
    unsafe {
        let hmem = GlobalAlloc(0x0002, bytes); // GMEM_MOVEABLE
        if hmem.is_null() { return Err("GlobalAlloc failed".into()); }
        let ptr = GlobalLock(hmem);
        if ptr.is_null() { return Err("GlobalLock failed".into()); }
        std::ptr::copy_nonoverlapping(wide.as_ptr() as *const u8, ptr as *mut u8, bytes);
        GlobalUnlock(hmem);
        if OpenClipboard(null_mut()) == 0 { return Err("OpenClipboard failed".into()); }
        EmptyClipboard();
        SetClipboardData(13, hmem); // CF_UNICODETEXT = 13
        CloseClipboard();
    }
    Ok(())
}

// ─── Snippets ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_snippets() -> Vec<crate::config::Snippet> {
    crate::config::load_snippets()
}

#[tauri::command]
pub fn save_snippets(snippets: Vec<crate::config::Snippet>) {
    crate::config::save_snippets(&snippets);
}

// ─── Move window (JS-driven drag, physical pixels) ───────────────────────────

#[tauri::command]
pub fn move_window(window: tauri::WebviewWindow, x: i32, y: i32) -> Result<(), String> {
    extern "system" {
        fn SetWindowPos(h: *mut c_void, ins: *mut c_void, x: i32, y: i32, cx: i32, cy: i32, f: u32) -> i32;
    }
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    unsafe {
        // SWP_NOSIZE=0x0001 | SWP_NOZORDER=0x0004 | SWP_NOACTIVATE=0x0010
        SetWindowPos(hwnd.0, null_mut(), x, y, 0, 0, 0x0015);
    }
    Ok(())
}

// ─── Resize window (bypasses resizable:false config) ────────────────────────

#[tauri::command]
pub fn resize_window(window: tauri::WebviewWindow, width: u32, height: u32) -> Result<(), String> {
    extern "system" {
        fn SetWindowPos(h: *mut c_void, ins: *mut c_void, x: i32, y: i32, cx: i32, cy: i32, f: u32) -> i32;
    }
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    unsafe {
        // SWP_NOMOVE=0x0002 | SWP_NOZORDER=0x0004 | SWP_NOACTIVATE=0x0010
        SetWindowPos(hwnd.0, null_mut(), 0, 0, width as i32, height as i32, 0x0016);
    }
    Ok(())
}

// ─── Display / Projection ────────────────────────────────────────────────────

#[tauri::command]
pub fn open_display() {
    use std::os::windows::process::CommandExt;
    std::process::Command::new("DisplaySwitch.exe")
        .creation_flags(0x08000000)
        .spawn()
        .ok();
}

// ─── Panic Button ─────────────────────────────────────────────────────────────

extern "system" {
    fn EnumWindows(proc: unsafe extern "system" fn(*mut c_void, isize) -> i32, param: isize) -> i32;
    fn IsWindowVisible(hwnd: *mut c_void) -> i32;
    fn ShowWindow(hwnd: *mut c_void, cmd: i32) -> i32;
    fn GetWindowLongA(hwnd: *mut c_void, index: i32) -> i32;
}

unsafe extern "system" fn minimize_proc(hwnd: *mut c_void, _: isize) -> i32 {
    if IsWindowVisible(hwnd) != 0 {
        let style    = GetWindowLongA(hwnd, -16); // GWL_STYLE
        let ex_style = GetWindowLongA(hwnd, -20); // GWL_EXSTYLE
        // Skip: already minimized (WS_MINIMIZE 0x20000000)
        // Skip: tool windows  (WS_EX_TOOLWINDOW 0x80) — preserves Desktop Deck
        if style & 0x20000000 == 0 && ex_style & 0x80 == 0 {
            ShowWindow(hwnd, 6); // SW_MINIMIZE
        }
    }
    1
}

#[tauri::command]
pub fn panic_button() -> Result<(), String> {
    unsafe { EnumWindows(minimize_proc, 0); }
    // Explicitly mute output audio (never unmute — use system controls to restore)
    use windows::{
        core::GUID,
        Win32::Foundation::BOOL,
        Win32::Media::Audio::{eConsole, eRender, IMMDeviceEnumerator},
        Win32::Media::Audio::Endpoints::IAudioEndpointVolume,
        Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
        },
    };
    const CLSID_MME: GUID = GUID {
        data1: 0xBCDE0395, data2: 0xE52F, data3: 0x467C,
        data4: [0x8E, 0x3D, 0xC4, 0x57, 0x92, 0x91, 0x69, 0x2E],
    };
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&CLSID_MME, None, CLSCTX_INPROC_SERVER).map_err(|e| e.to_string())?;
        let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole).map_err(|e| e.to_string())?;
        let vol: IAudioEndpointVolume = device.Activate(CLSCTX_INPROC_SERVER, None).map_err(|e| e.to_string())?;
        vol.SetMute(BOOL::from(true), core::ptr::null()).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ─── Mic ─────────────────────────────────────────────────────────────────────

const CLSID_MME: windows::core::GUID = windows::core::GUID {
    data1: 0xBCDE0395, data2: 0xE52F, data3: 0x467C,
    data4: [0x8E, 0x3D, 0xC4, 0x57, 0x92, 0x91, 0x69, 0x2E],
};

#[tauri::command]
pub fn get_mic_state() -> Result<bool, String> {
    use windows::{
        Win32::Media::Audio::{eCapture, eConsole, IMMDeviceEnumerator},
        Win32::Media::Audio::Endpoints::IAudioEndpointVolume,
        Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
        },
    };
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&CLSID_MME, None, CLSCTX_INPROC_SERVER).map_err(|e| e.to_string())?;
        let device = enumerator.GetDefaultAudioEndpoint(eCapture, eConsole).map_err(|e| e.to_string())?;
        let vol: IAudioEndpointVolume = device.Activate(CLSCTX_INPROC_SERVER, None).map_err(|e| e.to_string())?;
        Ok(vol.GetMute().map_err(|e| e.to_string())?.as_bool())
    }
}

#[tauri::command]
pub fn toggle_mic() -> Result<String, String> {
    use windows::{
        Win32::Foundation::BOOL,
        Win32::Media::Audio::{eCapture, eConsole, IMMDeviceEnumerator},
        Win32::Media::Audio::Endpoints::IAudioEndpointVolume,
        Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
        },
    };
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&CLSID_MME, None, CLSCTX_INPROC_SERVER).map_err(|e| e.to_string())?;
        let device = enumerator.GetDefaultAudioEndpoint(eCapture, eConsole).map_err(|e| e.to_string())?;
        let vol: IAudioEndpointVolume = device.Activate(CLSCTX_INPROC_SERVER, None).map_err(|e| e.to_string())?;
        let muted = vol.GetMute().map_err(|e| e.to_string())?.as_bool();
        let new_muted = !muted;
        vol.SetMute(BOOL::from(new_muted), core::ptr::null()).map_err(|e| e.to_string())?;
        Ok(if new_muted { "muted".into() } else { "unmuted".into() })
    }
}
