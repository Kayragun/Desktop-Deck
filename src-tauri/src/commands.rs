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

// ─── Desktop path helper ──────────────────────────────────────────────────────

fn get_desktop_path() -> Result<String, String> {
    use windows::{
        core::GUID,
        Win32::Foundation::HANDLE,
        Win32::UI::Shell::{SHGetKnownFolderPath, KNOWN_FOLDER_FLAG},
    };

    // FOLDERID_Desktop = {B4BFCC3A-DB2C-424C-B029-7FE99A87C641}
    const FOLDERID_DESKTOP: GUID = GUID {
        data1: 0xB4BFCC3A,
        data2: 0xDB2C,
        data3: 0x424C,
        data4: [0xB0, 0x29, 0x7F, 0xE9, 0x9A, 0x87, 0xC6, 0x41],
    };

    unsafe {
        let pwstr = SHGetKnownFolderPath(
            &FOLDERID_DESKTOP,
            KNOWN_FOLDER_FLAG(0),
            HANDLE::default(),
        )
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
        if n > 99 {
            return Err("Too many 'New Folder' entries on desktop".into());
        }
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
        for &pid in pids[..count].iter() {
            // PROCESS_SET_QUOTA | PROCESS_QUERY_INFORMATION
            let h = OpenProcess(0x0500, 0, pid);
            if !h.is_null() {
                EmptyWorkingSet(h);
                CloseHandle(h);
            }
        }
    }
    Ok(())
}

// ─── Clipboard Clear ─────────────────────────────────────────────────────────

extern "system" {
    fn OpenClipboard(hwnd: *mut c_void) -> i32;
    fn EmptyClipboard() -> i32;
    fn CloseClipboard() -> i32;
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

// ─── Display / Projection ────────────────────────────────────────────────────

#[tauri::command]
pub fn open_display() {
    use std::os::windows::process::CommandExt;
    std::process::Command::new("DisplaySwitch.exe")
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .spawn()
        .ok();
}

// ─── Panic Button ─────────────────────────────────────────────────────────────

extern "system" {
    fn EnumWindows(
        proc: unsafe extern "system" fn(*mut c_void, isize) -> i32,
        param: isize,
    ) -> i32;
    fn IsWindowVisible(hwnd: *mut c_void) -> i32;
    fn ShowWindow(hwnd: *mut c_void, cmd: i32) -> i32;
    fn GetWindowLongA(hwnd: *mut c_void, index: i32) -> i32;
    fn keybd_event(vk: u8, scan: u8, flags: u32, extra: usize);
}

unsafe extern "system" fn minimize_proc(hwnd: *mut c_void, _: isize) -> i32 {
    if IsWindowVisible(hwnd) != 0 {
        let style = GetWindowLongA(hwnd, -16); // GWL_STYLE
        if style & 0x20000000 == 0 {           // skip already-minimized (WS_MINIMIZE)
            ShowWindow(hwnd, 6);               // SW_MINIMIZE
        }
    }
    1
}

#[tauri::command]
pub fn panic_button() {
    unsafe {
        EnumWindows(minimize_proc, 0);
        keybd_event(0xAD, 0, 0, 0); // VK_VOLUME_MUTE down
        keybd_event(0xAD, 0, 2, 0); // VK_VOLUME_MUTE up  (KEYEVENTF_KEYUP = 2)
    }
}

// ─── Mic Off ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn toggle_mic() -> Result<String, String> {
    use windows::{
        core::GUID,
        Win32::Foundation::BOOL,
        Win32::Media::Audio::{eCapture, eConsole, IMMDeviceEnumerator},
        Win32::Media::Audio::Endpoints::IAudioEndpointVolume,
        Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
        },
    };

    // CLSID_MMDeviceEnumerator = {BCDE0395-E52F-467C-8E3D-C4579291692E}
    const CLSID_MMENUMERATOR: GUID = GUID {
        data1: 0xBCDE0395,
        data2: 0xE52F,
        data3: 0x467C,
        data4: [0x8E, 0x3D, 0xC4, 0x57, 0x92, 0x91, 0x69, 0x2E],
    };

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&CLSID_MMENUMERATOR, None, CLSCTX_INPROC_SERVER)
                .map_err(|e| e.to_string())?;

        let device = enumerator
            .GetDefaultAudioEndpoint(eCapture, eConsole)
            .map_err(|e| e.to_string())?;

        let vol: IAudioEndpointVolume = device
            .Activate(CLSCTX_INPROC_SERVER, None)
            .map_err(|e| e.to_string())?;

        let currently_muted: bool = vol.GetMute().map_err(|e| e.to_string())?.as_bool();
        let new_muted = !currently_muted;
        vol.SetMute(BOOL::from(new_muted), core::ptr::null())
            .map_err(|e| e.to_string())?;

        Ok(if new_muted {
            "Microphone muted".into()
        } else {
            "Microphone unmuted".into()
        })
    }
}
