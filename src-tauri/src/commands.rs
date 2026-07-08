use core::ffi::c_void;
use core::ptr::null_mut;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::Manager;
use winreg::{enums::*, RegKey};

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

// ─── Shortcuts ───────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_shortcuts() -> Vec<crate::config::Shortcut> {
    crate::config::load_shortcuts()
}

#[tauri::command]
pub fn save_shortcuts(shortcuts: Vec<crate::config::Shortcut>) {
    crate::config::save_shortcuts(&shortcuts);
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

// ─── Notes (drawer CRUD) ─────────────────────────────────────────────────────

#[tauri::command]
pub fn get_notes() -> Vec<crate::config::Note> {
    crate::config::load_notes()
}

#[tauri::command]
pub fn save_notes(notes: Vec<crate::config::Note>) {
    crate::config::save_notes(&notes);
}

#[tauri::command]
pub fn get_note(id: String) -> Option<crate::config::Note> {
    crate::config::load_notes().into_iter().find(|n| n.id == id)
}

#[tauri::command]
pub fn save_note_position(id: String, x: i32, y: i32) {
    let mut notes = crate::config::load_notes();
    if let Some(n) = notes.iter_mut().find(|n| n.id == id) {
        n.x = x;
        n.y = y;
    }
    crate::config::save_notes(&notes);
}

#[tauri::command]
pub fn save_note_size(id: String, w: u32, h: u32) {
    let mut notes = crate::config::load_notes();
    if let Some(n) = notes.iter_mut().find(|n| n.id == id) {
        n.w = w.max(150);
        n.h = h.max(120);
    }
    crate::config::save_notes(&notes);
}

#[tauri::command]
pub fn save_note_font_size(id: String, font_size: f64) {
    let mut notes = crate::config::load_notes();
    if let Some(n) = notes.iter_mut().find(|n| n.id == id) {
        n.font_size = font_size.clamp(9.0, 20.0);
    }
    crate::config::save_notes(&notes);
}

#[tauri::command]
pub fn save_note_opacity(id: String, opacity: f64) {
    let mut notes = crate::config::load_notes();
    if let Some(n) = notes.iter_mut().find(|n| n.id == id) {
        n.opacity = opacity.clamp(0.05, 1.0);
    }
    crate::config::save_notes(&notes);
}

#[tauri::command]
pub fn update_note_content(id: String, content: String) {
    let mut notes = crate::config::load_notes();
    if let Some(n) = notes.iter_mut().find(|n| n.id == id) {
        n.content = content;
    }
    crate::config::save_notes(&notes);
}

// ─── Note windows (desktop sticky notes) ────────────────────────────────────

unsafe fn setup_note_hwnd(hwnd: *mut c_void) {
    extern "system" {
        fn GetWindowLongPtrA(hwnd: *mut c_void, index: i32) -> isize;
        fn SetWindowLongPtrA(hwnd: *mut c_void, index: i32, new_long: isize) -> isize;
    }
    // WS_EX_TOOLWINDOW (0x80): exclude from taskbar and Alt-Tab
    let ex = GetWindowLongPtrA(hwnd, -20);
    SetWindowLongPtrA(hwnd, -20, ex | 0x80);
}

#[tauri::command]
pub async fn open_note_window(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let notes = crate::config::load_notes();
    let note = notes.iter().find(|n| n.id == id).cloned().ok_or("Note not found")?;
    let label = format!("note-{}", id);

    // If window already exists just show it
    if let Some(win) = app.get_webview_window(&label) {
        let _ = win.show();
        return Ok(());
    }

    let win = tauri::WebviewWindowBuilder::new(
        &app,
        label,
        tauri::WebviewUrl::App("note.html".into()),
    )
    .title("")
    .decorations(false)
    .transparent(true)
    .resizable(true)
    .shadow(false)
    .skip_taskbar(true)
    .always_on_top(false)
    .inner_size(note.w as f64, note.h as f64)
    .min_inner_size(200.0, 160.0)
    .position(note.x as f64, note.y as f64)
    .build()
    .map_err(|e| e.to_string())?;

    if let Ok(hwnd) = win.hwnd() {
        unsafe { setup_note_hwnd(hwnd.0); }
    }

    Ok(())
}

#[tauri::command]
pub fn close_note_window(app: tauri::AppHandle, id: String) {
    let label = format!("note-{}", id);
    if let Some(win) = app.get_webview_window(&label) {
        let _ = win.close();
    }
}


// ─── Resize note window (note-specific minimums, physical pixels) ────────────

#[tauri::command]
pub fn resize_note_window(window: tauri::WebviewWindow, width: u32, height: u32) -> Result<(), String> {
    extern "system" {
        fn SetWindowPos(h: *mut c_void, ins: *mut c_void, x: i32, y: i32, cx: i32, cy: i32, f: u32) -> i32;
        fn GetDpiForWindow(hwnd: *mut c_void) -> u32;
    }
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    let dpi = unsafe { GetDpiForWindow(hwnd.0) };
    let scale = dpi as f64 / 96.0;
    let min_w = (200.0 * scale).round() as u32;
    let min_h = (160.0 * scale).round() as u32;
    let w = width.max(min_w);
    let h = height.max(min_h);
    unsafe {
        // SWP_NOMOVE=0x0002 | SWP_NOZORDER=0x0004 | SWP_NOACTIVATE=0x0010
        SetWindowPos(hwnd.0, null_mut(), 0, 0, w as i32, h as i32, 0x0016);
    }
    Ok(())
}

// ─── Move window (JS-driven drag, physical pixels) ───────────────────────────

#[tauri::command]
pub fn move_window(window: tauri::WebviewWindow, x: i32, y: i32) -> Result<(), String> {
    #[repr(C)]
    struct Point { x: i32, y: i32 }
    extern "system" {
        fn SetWindowPos(h: *mut c_void, ins: *mut c_void, x: i32, y: i32, cx: i32, cy: i32, f: u32) -> i32;
        fn GetAncestor(hwnd: *mut c_void, flags: u32) -> *mut c_void;
        fn GetDesktopWindow() -> *mut c_void;
        fn MapWindowPoints(from: *mut c_void, to: *mut c_void, points: *mut Point, count: u32) -> i32;
    }
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    let mut pt = Point { x, y };
    unsafe {
        // The widget is reparented under WorkerW/Progman (desktop::attach_to_desktop),
        // so SetWindowPos expects parent-client coordinates while the JS drag sends
        // screen coordinates (outerPosition). Map screen → parent client.
        let parent = GetAncestor(hwnd.0, 1); // GA_PARENT
        if !parent.is_null() && parent != GetDesktopWindow() {
            MapWindowPoints(null_mut(), parent, &mut pt, 1);
        }
        // SWP_NOSIZE=0x0001 | SWP_NOZORDER=0x0004 | SWP_NOACTIVATE=0x0010
        SetWindowPos(hwnd.0, null_mut(), pt.x, pt.y, 0, 0, 0x0015);
    }
    Ok(())
}

// ─── Resize window (bypasses resizable:false config) ────────────────────────

#[tauri::command]
pub fn resize_window(window: tauri::WebviewWindow, width: u32, height: u32) -> Result<(), String> {
    extern "system" {
        fn SetWindowPos(h: *mut c_void, ins: *mut c_void, x: i32, y: i32, cx: i32, cy: i32, f: u32) -> i32;
        fn GetDpiForWindow(hwnd: *mut c_void) -> u32;
    }
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    let dpi = unsafe { GetDpiForWindow(hwnd.0) };
    let scale = dpi as f64 / 96.0;
    // Logical-px limits — keep in sync with MIN_W/MAX_W etc. in src/App.tsx.
    let min_w = (350.0 * scale).round() as u32;
    let min_h = (580.0 * scale).round() as u32;
    let max_w = (640.0 * scale).round() as u32;
    let max_h = (960.0 * scale).round() as u32;
    let w = width.clamp(min_w, max_w);
    let h = height.clamp(min_h, max_h);
    unsafe {
        // SWP_NOMOVE=0x0002 | SWP_NOZORDER=0x0004 | SWP_NOACTIVATE=0x0010
        SetWindowPos(hwnd.0, null_mut(), 0, 0, w as i32, h as i32, 0x0016);
    }
    Ok(())
}

// ─── Image Converter ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn pick_output_folder() -> Option<String> {
    use windows::{
        Win32::Foundation::HWND,
        Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
        },
        Win32::UI::Shell::{
            FileOpenDialog, IFileOpenDialog, FILEOPENDIALOGOPTIONS, SIGDN_FILESYSPATH,
        },
    };
    const FOS_PICKFOLDERS: FILEOPENDIALOGOPTIONS = FILEOPENDIALOGOPTIONS(0x20);

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let dialog: IFileOpenDialog =
            CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER).ok()?;
        let opts = dialog.GetOptions().ok()?;
        dialog.SetOptions(opts | FOS_PICKFOLDERS).ok()?;
        dialog.Show(HWND(null_mut())).ok()?;
        let item = dialog.GetResult().ok()?;
        let pwstr = item.GetDisplayName(SIGDN_FILESYSPATH).ok()?;
        pwstr.to_string().ok()
    }
}

#[tauri::command]
pub fn convert_image_file(src: String, dst: String) -> Result<(), String> {
    let img = image::open(&src).map_err(|e| e.to_string())?;
    img.save(&dst).map_err(|e| e.to_string())
}

// ─── Open file / Show in Explorer ────────────────────────────────────────────

#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    // cmd /c start "" "path" opens with the default application
    std::process::Command::new("cmd")
        .args(["/c", "start", "", &path])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn open_file_location(path: String) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    // explorer /select,"path" highlights the file in its folder
    std::process::Command::new("explorer.exe")
        .raw_arg(format!("/select,\"{}\"", path.replace('"', "\"\"")))
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ─── CPU Usage ────────────────────────────────────────────────────────────────

static CPU_PREV_IDLE:  AtomicU64 = AtomicU64::new(0);
static CPU_PREV_TOTAL: AtomicU64 = AtomicU64::new(0);

#[repr(C)]
struct FileTime { low: u32, high: u32 }
impl FileTime { fn as_u64(&self) -> u64 { (self.high as u64) << 32 | self.low as u64 } }

extern "system" {
    fn GetSystemTimes(idle: *mut FileTime, kernel: *mut FileTime, user: *mut FileTime) -> i32;
}

#[tauri::command]
pub async fn get_cpu_usage() -> Option<f64> {
    let mut idle   = FileTime { low: 0, high: 0 };
    let mut kernel = FileTime { low: 0, high: 0 };
    let mut user   = FileTime { low: 0, high: 0 };
    unsafe { if GetSystemTimes(&mut idle, &mut kernel, &mut user) == 0 { return None; } }
    let idle_v  = idle.as_u64();
    let total_v = kernel.as_u64() + user.as_u64();
    let prev_idle  = CPU_PREV_IDLE.swap(idle_v,  Ordering::Relaxed);
    let prev_total = CPU_PREV_TOTAL.swap(total_v, Ordering::Relaxed);
    if prev_total == 0 { return None; }
    let d_idle  = idle_v.saturating_sub(prev_idle);
    let d_total = total_v.saturating_sub(prev_total);
    if d_total == 0 { return Some(0.0); }
    Some(((1.0 - d_idle as f64 / d_total as f64) * 100.0).clamp(0.0, 100.0))
}

#[tauri::command]
pub fn open_task_manager() {
    use std::os::windows::process::CommandExt;
    std::process::Command::new("taskmgr.exe")
        .creation_flags(0x08000000)
        .spawn()
        .ok();
}

// ─── GPU Usage (PDH) ──────────────────────────────────────────────────────────

#[link(name = "Pdh")]
extern "system" {
    fn PdhOpenQueryW(src: *const u16, data: usize, phq: *mut *mut c_void) -> u32;
    fn PdhAddEnglishCounterW(hq: *mut c_void, path: *const u16, data: usize, phc: *mut *mut c_void) -> u32;
    fn PdhCollectQueryData(hq: *mut c_void) -> u32;
    fn PdhGetFormattedCounterArrayW(hc: *mut c_void, fmt: u32, sz: *mut u32, cnt: *mut u32, buf: *mut u8) -> u32;
}

const PDH_FMT_DOUBLE: u32 = 0x00000200;
const PDH_MORE_DATA:  u32 = 0x800007D2;

#[repr(C)] struct PdhFmtValue { status: u32, _pad: u32, val: f64 }
#[repr(C)] struct PdhFmtItem  { _name: usize, fv: PdhFmtValue }

struct GpuPdh { query: *mut c_void, counter: *mut c_void }
unsafe impl Send for GpuPdh {}

static GPU_PDH: OnceLock<Mutex<Option<GpuPdh>>> = OnceLock::new();

fn gpu_pdh_handle() -> &'static Mutex<Option<GpuPdh>> {
    GPU_PDH.get_or_init(|| unsafe {
        let path: Vec<u16> = "\\GPU Engine(*engtype_3D)\\Utilization Percentage\0"
            .encode_utf16().collect();
        let mut query: *mut c_void = null_mut();
        if PdhOpenQueryW(null_mut(), 0, &mut query) != 0 { return Mutex::new(None); }
        let mut counter: *mut c_void = null_mut();
        if PdhAddEnglishCounterW(query, path.as_ptr(), 0, &mut counter) != 0 {
            return Mutex::new(None);
        }
        PdhCollectQueryData(query); // prime — sets t0
        Mutex::new(Some(GpuPdh { query, counter }))
    })
}

#[tauri::command]
pub async fn get_gpu_usage() -> Option<f64> {
    let guard = gpu_pdh_handle().lock().ok()?;
    let pdh = guard.as_ref()?;
    unsafe {
        if PdhCollectQueryData(pdh.query) != 0 { return None; }
        let mut buf_size: u32 = 0;
        let mut cnt: u32 = 0;
        let r1 = PdhGetFormattedCounterArrayW(pdh.counter, PDH_FMT_DOUBLE, &mut buf_size, &mut cnt, null_mut());
        if r1 == PDH_MORE_DATA && buf_size > 0 {
            let mut buf = vec![0u8; buf_size as usize];
            let r2 = PdhGetFormattedCounterArrayW(pdh.counter, PDH_FMT_DOUBLE, &mut buf_size, &mut cnt, buf.as_mut_ptr());
            if r2 != 0 { return None; }
            let items = std::slice::from_raw_parts(buf.as_ptr() as *const PdhFmtItem, cnt as usize);
            let total: f64 = items.iter().filter(|i| i.fv.status == 0).map(|i| i.fv.val).sum();
            return Some(total.clamp(0.0, 100.0));
        }
        if cnt == 0 { Some(0.0) } else { None }
    }
}

// ─── RAM Usage ────────────────────────────────────────────────────────────────

#[repr(C)]
struct MemStatusEx { dw_length: u32, dw_memory_load: u32, _rest: [u64; 7] }

extern "system" { fn GlobalMemoryStatusEx(buf: *mut MemStatusEx) -> i32; }

#[tauri::command]
pub async fn get_ram_usage() -> Option<f64> {
    let mut ms = MemStatusEx {
        dw_length: std::mem::size_of::<MemStatusEx>() as u32,
        dw_memory_load: 0,
        _rest: [0; 7],
    };
    unsafe { if GlobalMemoryStatusEx(&mut ms) == 0 { return None; } }
    Some(ms.dw_memory_load as f64)
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

// DEPRECATED: use get_mic_privacy_state / set_mic_privacy
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

// DEPRECATED: use set_mic_privacy
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

// ─── Audio Output Switcher ───────────────────────────────────────────────────

// Undocumented-but-stable COM interface Windows' own Sound settings use to
// change the default endpoint. Only SetDefaultEndpoint is ever called; the
// leading methods are placeholders that keep the vtable slots aligned.
#[windows::core::interface("f8679f50-850a-41cf-9c72-430f290290c8")]
unsafe trait IPolicyConfig: windows::core::IUnknown {
    fn GetMixFormat(
        &self,
        device_id: windows::core::PCWSTR,
        format: *mut *mut c_void,
    ) -> windows::core::HRESULT;
    fn _GetDeviceFormat(&self) -> windows::core::HRESULT;
    fn _ResetDeviceFormat(&self) -> windows::core::HRESULT;
    fn _SetDeviceFormat(&self) -> windows::core::HRESULT;
    fn _GetProcessingPeriod(&self) -> windows::core::HRESULT;
    fn _SetProcessingPeriod(&self) -> windows::core::HRESULT;
    fn _GetShareMode(&self) -> windows::core::HRESULT;
    fn _SetShareMode(&self) -> windows::core::HRESULT;
    fn _GetPropertyValue(&self) -> windows::core::HRESULT;
    fn _SetPropertyValue(&self) -> windows::core::HRESULT;
    fn SetDefaultEndpoint(
        &self,
        device_id: windows::core::PCWSTR,
        role: windows::Win32::Media::Audio::ERole,
    ) -> windows::core::HRESULT;
    fn _SetEndpointVisibility(&self) -> windows::core::HRESULT;
}

/// Friendly name from the MMDevices registry mirror — avoids the
/// IPropertyStore/PROPVARIANT dance. `endpoint_id` looks like
/// "{0.0.0.00000000}.{guid}"; the registry key is the trailing {guid}.
/// Composed as "desc (adapter)" like the Sound settings UI — the precomposed
/// PKEY_Device_FriendlyName (",14") value is absent on recent Win11 builds.
fn render_device_name(endpoint_id: &str) -> String {
    let guid = endpoint_id.rsplit('.').next().unwrap_or(endpoint_id);
    let path = format!(
        "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\MMDevices\\Audio\\Render\\{}\\Properties",
        guid
    );
    let key = match RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey(&path) {
        Ok(k) => k,
        Err(_) => return "audio device".into(),
    };
    let desc: Option<String> = key.get_value("{a45c254e-df1c-4efd-8020-67d146a850e0},2").ok();
    let adapter: Option<String> = key.get_value("{b3f8fa53-0004-438e-9003-51a46e139bfc},6").ok();
    match (desc, adapter) {
        (Some(d), Some(a)) => format!("{d} ({a})"),
        (Some(d), None)    => d,
        (None, Some(a))    => a,
        (None, None)       => "audio device".into(),
    }
}

#[tauri::command]
pub fn switch_audio_output() -> Result<String, String> {
    use windows::{
        core::PCWSTR,
        Win32::Media::Audio::{
            eCommunications, eConsole, eMultimedia, eRender, IMMDevice, IMMDeviceEnumerator,
            DEVICE_STATE_ACTIVE,
        },
        Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_INPROC_SERVER,
            COINIT_APARTMENTTHREADED,
        },
    };
    const CLSID_POLICY_CONFIG: windows::core::GUID =
        windows::core::GUID::from_u128(0x870af99c_171d_4f9e_af0d_e63df40c2bc9);

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&CLSID_MME, None, CLSCTX_INPROC_SERVER).map_err(|e| e.to_string())?;

        let read_id = |dev: &IMMDevice| -> Result<String, String> {
            let pw = dev.GetId().map_err(|e| e.to_string())?;
            let s = pw.to_string().map_err(|e| e.to_string())?;
            CoTaskMemFree(Some(pw.as_ptr() as *const c_void));
            Ok(s)
        };

        let devices = enumerator
            .EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)
            .map_err(|e| format!("EnumAudioEndpoints: {e}"))?;
        let count = devices.GetCount().map_err(|e| format!("GetCount: {e}"))?;
        if count < 2 {
            return Err("No other audio output device found".into());
        }

        let current_id = read_id(
            &enumerator
                .GetDefaultAudioEndpoint(eRender, eConsole)
                .map_err(|e| e.to_string())?,
        )?;
        let mut ids: Vec<String> = Vec::with_capacity(count as usize);
        for i in 0..count {
            ids.push(read_id(&devices.Item(i).map_err(|e| e.to_string())?)?);
        }
        let cur = ids.iter().position(|id| *id == current_id).unwrap_or(0);

        let policy: IPolicyConfig = CoCreateInstance(&CLSID_POLICY_CONFIG, None, CLSCTX_INPROC_SERVER)
            .map_err(|e| format!("PolicyConfig create: {e}"))?;

        // Cycle to the next endpoint Windows will actually accept. Vendor
        // virtual endpoints (e.g. ASUS Utility's noise-cancelling output)
        // enumerate as active yet are rejected with E_FAIL — skip those.
        for step in 1..ids.len() {
            let candidate = &ids[(cur + step) % ids.len()];
            let wide: Vec<u16> = candidate.encode_utf16().chain(std::iter::once(0)).collect();
            if policy.SetDefaultEndpoint(PCWSTR(wide.as_ptr()), eConsole).is_err() {
                continue;
            }
            for role in [eMultimedia, eCommunications] {
                let _ = policy.SetDefaultEndpoint(PCWSTR(wide.as_ptr()), role);
            }
            return Ok(format!("Output: {}", render_device_name(candidate)));
        }
        Err("No other switchable audio output found".into())
    }
}

#[cfg(test)]
mod audio_switch_test {
    // Actually changes the system default output when another usable device
    // exists — run explicitly: cargo test cycle_output -- --ignored --nocapture
    #[test]
    #[ignore = "switches the system default audio device"]
    fn cycle_output() {
        println!("switch_audio_output → {:?}", super::switch_audio_output());
    }
}

// ─── Privacy Kill-Switch (ConsentStore) ──────────────────────────────────────

const CONSENT_BASE: &str =
    "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore";

// Windows stores consent in the named value "Value" (not the key's default
// value). Packaged (Store) apps read the device key itself; classic desktop
// apps read the NonPackaged subkey — block/allow must cover both.
fn read_consent(subkey: &str) -> Option<String> {
    let path = format!("{}\\{}", CONSENT_BASE, subkey);
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key = hkcu.open_subkey(&path).ok()?;
    key.get_value::<String, _>("Value").ok()
}

fn write_consent(subkey: &str, value: &str) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    for path in [
        format!("{}\\{}", CONSENT_BASE, subkey),
        format!("{}\\{}\\NonPackaged", CONSENT_BASE, subkey),
    ] {
        let key = match hkcu.open_subkey_with_flags(&path, KEY_WRITE) {
            Ok(k) => k,
            Err(_) => hkcu.create_subkey(&path).map_err(|e| e.to_string())?.0,
        };
        key.set_value("Value", &value.to_string()).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[link(name = "CfgMgr32")]
extern "system" {
    fn CM_Get_Device_Interface_List_SizeW(
        size: *mut u32,
        interface_class: *const windows::core::GUID,
        device_id: *const u16,
        flags: u32,
    ) -> u32;
}

fn detect_camera() -> bool {
    // KSCATEGORY_VIDEO_CAMERA — every UVC/MF camera registers this interface.
    const VIDEO_CAMERA: windows::core::GUID =
        windows::core::GUID::from_u128(0xE5323777_F976_4F5B_9B55_B94699C46E44);
    const CM_GET_DEVICE_INTERFACE_LIST_PRESENT: u32 = 0;
    let mut len: u32 = 0;
    let cr = unsafe {
        CM_Get_Device_Interface_List_SizeW(
            &mut len,
            &VIDEO_CAMERA,
            core::ptr::null(),
            CM_GET_DEVICE_INTERFACE_LIST_PRESENT,
        )
    };
    // len == 1 is an empty list (only the terminating NUL).
    cr == 0 && len > 1
}

#[tauri::command]
pub async fn get_camera_privacy_state() -> String {
    if !detect_camera() {
        return "no_device".into();
    }
    match read_consent("webcam").as_deref() {
        Some("Deny") => "denied",
        _ => "allowed",
    }
    .into()
}

#[tauri::command]
pub fn set_camera_privacy(allow: bool) -> Result<String, String> {
    write_consent("webcam", if allow { "Allow" } else { "Deny" })?;
    Ok(if allow { "allowed" } else { "denied" }.into())
}

#[tauri::command]
pub async fn get_mic_privacy_state() -> String {
    match read_consent("microphone").as_deref() {
        Some("Deny") => "denied",
        _ => "allowed",
    }
    .into()
}

#[tauri::command]
pub fn set_mic_privacy(allow: bool) -> Result<String, String> {
    write_consent("microphone", if allow { "Allow" } else { "Deny" })?;
    Ok(if allow { "allowed" } else { "denied" }.into())
}
