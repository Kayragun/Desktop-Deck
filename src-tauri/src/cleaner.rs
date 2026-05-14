use core::{ffi::c_void, ptr::null_mut};
use std::mem::size_of;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering};
use std::time::Duration;

pub(crate) static CLEANER_ACTIVE: AtomicBool = AtomicBool::new(false);
static HOOK_THREAD_ID: AtomicU32 = AtomicU32::new(0);
static MAIN_HWND: AtomicUsize = AtomicUsize::new(0);

pub fn set_hwnd(hwnd: usize) {
    MAIN_HWND.store(hwnd, Ordering::SeqCst);
}

// ─── Win32 ───────────────────────────────────────────────────────────────────

extern "system" {
    fn SetWindowsHookExA(
        id_hook: i32,
        lpfn: unsafe extern "system" fn(i32, usize, isize) -> isize,
        hmod: *mut c_void,
        thread_id: u32,
    ) -> *mut c_void;
    fn UnhookWindowsHookEx(hook: *mut c_void) -> i32;
    fn CallNextHookEx(hook: *mut c_void, code: i32, wp: usize, lp: isize) -> isize;
    fn GetMessageA(msg: *mut c_void, hwnd: *mut c_void, min: u32, max: u32) -> i32;
    fn PostThreadMessageA(tid: u32, msg: u32, wp: usize, lp: isize) -> i32;
    fn GetCurrentThreadId() -> u32;
    fn RegisterRawInputDevices(devices: *const RawInputDevice, count: u32, size: u32) -> i32;
    fn RegisterHotKey(hwnd: *mut c_void, id: i32, modifiers: u32, vk: u32) -> i32;
    fn UnregisterHotKey(hwnd: *mut c_void, id: i32) -> i32;
}

#[repr(C)]
struct RawInputDevice {
    usage_page: u16,
    usage: u16,
    flags: u32,
    hwnd_target: *mut c_void,
}

// ─── Raw input blocking ───────────────────────────────────────────────────────

// Flag combinations:
// RIDEV_NOLEGACY(0x30) | RIDEV_INPUTSINK(0x100) = 0x130
//   → directs HID input to our window as WM_INPUT, suppresses legacy WM_KEYDOWN / WM_APPCOMMAND
// RIDEV_PAGEONLY(0x20) | RIDEV_NOLEGACY(0x30) | RIDEV_INPUTSINK(0x100) = 0x130 | 0x20 = 0x130
//   Wait: RIDEV_NOLEGACY already includes 0x20, so PAGEONLY+NOLEGACY+INPUTSINK = 0x130
//   Actually RIDEV_PAGEONLY = 0x20, RIDEV_EXCLUDE = 0x10, RIDEV_NOLEGACY = 0x30 (EXCLUDE|PAGEONLY)
//   PAGEONLY+INPUTSINK (without NOLEGACY) = 0x120 — match all usages in page, no legacy suppression
//   We want full suppression: 0x130 (NOLEGACY+INPUTSINK) per device, plus extra devices below.
const RIDEV_BLOCK:  u32 = 0x0130; // NOLEGACY | INPUTSINK
const RIDEV_REMOVE: u32 = 0x0001;

fn register_raw_blocking(hwnd: *mut c_void) {
    let devices = [
        // Standard HID keyboard — page 0x01, usage 0x06
        RawInputDevice { usage_page: 0x0001, usage: 0x0006, flags: RIDEV_BLOCK, hwnd_target: hwnd },
        // System Controls (sleep, wake, power buttons; some Fn+key combos) — page 0x01, usage 0x80
        RawInputDevice { usage_page: 0x0001, usage: 0x0080, flags: RIDEV_BLOCK, hwnd_target: hwnd },
        // Consumer Controls — entire page 0x0C (volume, brightness, media, mic, OEM fn-keys).
        // usage=0x01 is the top-level collection; all sub-collections are included.
        RawInputDevice { usage_page: 0x000C, usage: 0x0001, flags: RIDEV_BLOCK, hwnd_target: hwnd },
    ];
    unsafe {
        RegisterRawInputDevices(devices.as_ptr(), devices.len() as u32, size_of::<RawInputDevice>() as u32);
    }
}

fn unregister_raw_blocking() {
    let devices = [
        RawInputDevice { usage_page: 0x0001, usage: 0x0006, flags: RIDEV_REMOVE, hwnd_target: null_mut() },
        RawInputDevice { usage_page: 0x0001, usage: 0x0080, flags: RIDEV_REMOVE, hwnd_target: null_mut() },
        RawInputDevice { usage_page: 0x000C, usage: 0x0001, flags: RIDEV_REMOVE, hwnd_target: null_mut() },
    ];
    unsafe {
        RegisterRawInputDevices(devices.as_ptr(), devices.len() as u32, size_of::<RawInputDevice>() as u32);
    }
}

// ─── Win+ hotkey stealing ─────────────────────────────────────────────────────
// Apps like Xbox Game Bar (Win+G) and NVIDIA overlay register their shortcuts via
// RegisterHotKey so they receive WM_HOTKEY even when a keyboard hook blocks the key.
// By calling RegisterHotKey ourselves first (hwnd=NULL → goes to our thread queue),
// we consume those slots; our GetMessageA loop discards the WM_HOTKEY messages.

const MOD_SHIFT:    u32 = 0x0004;
const MOD_WIN:      u32 = 0x0008;
const MOD_NOREPEAT: u32 = 0x4000;

unsafe fn register_win_hotkeys() {
    let mut id = 0i32;
    // Win+A … Win+Z
    for c in b'A'..=b'Z' {
        RegisterHotKey(null_mut(), id, MOD_WIN | MOD_NOREPEAT, c as u32);
        id += 1;
    }
    // Win+0 … Win+9
    for c in b'0'..=b'9' {
        RegisterHotKey(null_mut(), id, MOD_WIN | MOD_NOREPEAT, c as u32);
        id += 1;
    }
    // Win+F1 … Win+F24
    for f in 0x70u32..=0x87 {
        RegisterHotKey(null_mut(), id, MOD_WIN | MOD_NOREPEAT, f);
        id += 1;
    }
    // Win+Tab, Win+Space, Win+Enter
    RegisterHotKey(null_mut(), id, MOD_WIN | MOD_NOREPEAT, 0x09); id += 1;
    RegisterHotKey(null_mut(), id, MOD_WIN | MOD_NOREPEAT, 0x20); id += 1;
    RegisterHotKey(null_mut(), id, MOD_WIN | MOD_NOREPEAT, 0x0D); id += 1;
    // Win+Shift+S (Snipping Tool), Win+Shift+Z (Snap Layouts)
    RegisterHotKey(null_mut(), id, MOD_WIN | MOD_SHIFT | MOD_NOREPEAT, b'S' as u32); id += 1;
    RegisterHotKey(null_mut(), id, MOD_WIN | MOD_SHIFT | MOD_NOREPEAT, b'Z' as u32);
}

unsafe fn unregister_win_hotkeys() {
    // Unregister all IDs we may have registered (failures are silently ignored)
    for id in 0..80i32 {
        UnregisterHotKey(null_mut(), id);
    }
}

// ─── LL keyboard hook callback ────────────────────────────────────────────────

unsafe extern "system" fn keyboard_proc(code: i32, wp: usize, lp: isize) -> isize {
    if code >= 0 && CLEANER_ACTIVE.load(Ordering::SeqCst) {
        return 1; // block all key events
    }
    CallNextHookEx(null_mut(), code, wp, lp)
}

// ─── Internal stop ────────────────────────────────────────────────────────────

fn stop_internal() {
    if !CLEANER_ACTIVE.swap(false, Ordering::SeqCst) { return; }
    unregister_raw_blocking();
    let tid = HOOK_THREAD_ID.load(Ordering::SeqCst);
    if tid != 0 {
        unsafe { PostThreadMessageA(tid, 0x0012 /* WM_QUIT */, 0, 0); }
    }
}

// ─── Tauri commands ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn start_cleaner() {
    if CLEANER_ACTIVE.swap(true, Ordering::SeqCst) { return; }

    // Register raw input BEFORE the hook so no key slips through the gap.
    let hwnd = MAIN_HWND.load(Ordering::SeqCst) as *mut c_void;
    if !hwnd.is_null() {
        register_raw_blocking(hwnd);
    }

    std::thread::spawn(|| unsafe {
        HOOK_THREAD_ID.store(GetCurrentThreadId(), Ordering::SeqCst);

        // Steal Win+ hotkeys (must be called from the thread that pumps messages
        // because hwnd=NULL → WM_HOTKEY goes to this thread's queue).
        register_win_hotkeys();

        let hook = SetWindowsHookExA(13 /* WH_KEYBOARD_LL */, keyboard_proc, null_mut(), 0);
        if hook.is_null() {
            unregister_win_hotkeys();
            unregister_raw_blocking();
            CLEANER_ACTIVE.store(false, Ordering::SeqCst);
            HOOK_THREAD_ID.store(0, Ordering::SeqCst);
            return;
        }

        // Auto-stop after 60 s
        std::thread::spawn(|| {
            std::thread::sleep(Duration::from_secs(60));
            if CLEANER_ACTIVE.load(Ordering::SeqCst) { stop_internal(); }
        });

        // Message loop — processes WM_HOTKEY (discarded) and keeps LL hook alive.
        // Exits on WM_QUIT posted by stop_internal().
        let mut msg = [0u8; 56];
        while GetMessageA(msg.as_mut_ptr() as *mut c_void, null_mut(), 0, 0) > 0 {}

        unregister_win_hotkeys();
        UnhookWindowsHookEx(hook);
        HOOK_THREAD_ID.store(0, Ordering::SeqCst);
        CLEANER_ACTIVE.store(false, Ordering::SeqCst);
    });
}

#[tauri::command]
pub fn stop_cleaner() {
    stop_internal();
}

#[tauri::command]
pub fn get_cleaner_active() -> bool {
    CLEANER_ACTIVE.load(Ordering::SeqCst)
}
