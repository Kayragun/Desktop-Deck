#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    Manager,
};

mod autostart;
mod commands;
mod config;

// ─── State ───────────────────────────────────────────────────────────────────

struct HiddenState(Arc<AtomicBool>);

/// Lifted to a static so the subclass proc (a fn pointer) can read it.
static ALLOW_HIDE: AtomicBool = AtomicBool::new(false);

// ─── Win32 helpers (used in multiple places) ──────────────────────────────────

use core::ffi::c_void;
extern "system" {
    fn IsIconic(hwnd: *mut c_void) -> i32;
    fn IsWindowVisible(hwnd: *mut c_void) -> i32;
    fn ShowWindow(hwnd: *mut c_void, cmd: i32) -> i32;
    fn GetWindowLongPtrA(hwnd: *mut c_void, index: i32) -> isize;
    fn SetWindowLongPtrA(hwnd: *mut c_void, index: i32, new_long: isize) -> isize;
    fn SetWindowPos(
        h_wnd: *mut c_void, h_wnd_insert_after: *mut c_void,
        x: i32, y: i32, cx: i32, cy: i32, u_flags: u32,
    ) -> i32;
}

// ─── WINDOWPOS struct (for WM_WINDOWPOSCHANGING) ──────────────────────────────

#[repr(C)]
struct WindowPos {
    hwnd_insert_after: *mut c_void,
    hwnd: *mut c_void,
    x: i32, y: i32, cx: i32, cy: i32,
    flags: u32,
}

// ─── Subclass: intercept WM_WINDOWPOSCHANGING ─────────────────────────────────

#[link(name = "ComCtl32")]
extern "system" {
    fn SetWindowSubclass(
        hwnd: *mut c_void,
        pfn: unsafe extern "system" fn(*mut c_void, u32, usize, isize, usize, usize) -> isize,
        uid: usize, data: usize,
    ) -> i32;
    fn DefSubclassProc(hwnd: *mut c_void, msg: u32, wp: usize, lp: isize) -> isize;
}

unsafe extern "system" fn desktop_subclass(
    hwnd: *mut c_void, msg: u32, wp: usize, lp: isize,
    _uid: usize, _data: usize,
) -> isize {
    // WM_WINDOWPOSCHANGING = 0x0046
    if msg == 0x0046 && !ALLOW_HIDE.load(Ordering::SeqCst) {
        let pos = &mut *(lp as *mut WindowPos);
        // Block SWP_HIDEWINDOW (0x80)
        pos.flags &= !0x80u32;
        // Detect minimize: Windows moves minimized windows to (-32000, -32000)
        if pos.x == -32000 && pos.y == -32000 {
            // Override position back to something on screen and clear the minimize move
            pos.x = 50;
            pos.y = 50;
        }
    }
    DefSubclassProc(hwnd, msg, wp, lp)
}

// ─── pin_to_desktop ───────────────────────────────────────────────────────────

unsafe fn pin_raw(hwnd: *mut c_void) {
    // WS_EX_TOOLWINDOW (0x80) — excluded from alt-tab and taskbar
    let ex = GetWindowLongPtrA(hwnd, -20);
    SetWindowLongPtrA(hwnd, -20, ex | 0x80);
    // HWND_BOTTOM=1, SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE|SWP_FRAMECHANGED = 0x0033
    SetWindowPos(hwnd, 1_usize as *mut c_void, 0, 0, 0, 0, 0x0033);
}

fn pin_to_desktop(win: &tauri::WebviewWindow) {
    if let Ok(hwnd) = win.hwnd() {
        unsafe { pin_raw(hwnd.0); }
    }
}

fn install_subclass(win: &tauri::WebviewWindow) {
    if let Ok(hwnd) = win.hwnd() {
        unsafe { SetWindowSubclass(hwnd.0, desktop_subclass, 1, 0); }
    }
}

// ─── Commands ─────────────────────────────────────────────────────────────────

#[tauri::command]
fn hide_window(window: tauri::WebviewWindow, state: tauri::State<HiddenState>) {
    state.0.store(true, Ordering::Relaxed);
    ALLOW_HIDE.store(true, Ordering::SeqCst);
    let _ = window.hide();
    std::thread::spawn(|| {
        std::thread::sleep(std::time::Duration::from_millis(100));
        ALLOW_HIDE.store(false, Ordering::SeqCst);
    });
}

// ─── main ────────────────────────────────────────────────────────────────────

fn main() {
    let user_hidden = Arc::new(AtomicBool::new(false));

    tauri::Builder::default()
        .manage(HiddenState(user_hidden.clone()))
        .setup(move |app| {
            let saved = config::load();
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_position(tauri::PhysicalPosition::new(saved.x, saved.y));
                let _ = win.show();
                pin_to_desktop(&win);
                install_subclass(&win);

                // Get raw HWND once; store as usize (Send) for the monitoring thread
                if let Ok(hwnd_val) = win.hwnd() {
                    let hwnd_usize = hwnd_val.0 as usize;
                    let hidden_flag = user_hidden.clone();
                    std::thread::spawn(move || loop {
                        std::thread::sleep(std::time::Duration::from_millis(80));
                        if hidden_flag.load(Ordering::Relaxed) { continue; }
                        let hwnd = hwnd_usize as *mut c_void;
                        unsafe {
                            let minimized = IsIconic(hwnd) != 0;
                            let visible   = IsWindowVisible(hwnd) != 0;
                            if minimized || !visible {
                                // SW_RESTORE = 9 — unminimizes AND shows
                                ShowWindow(hwnd, 9);
                                pin_raw(hwnd);
                            }
                        }
                    });
                }
            }

            let tray_icon = Image::from_bytes(include_bytes!("../icons/32x32.png"))?;
            let toggle = MenuItem::with_id(app, "toggle", "Show / Hide", true, None::<&str>)?;
            let sep    = PredefinedMenuItem::separator(app)?;
            let quit   = MenuItem::with_id(app, "quit",   "Quit",        true, None::<&str>)?;
            let menu   = Menu::with_items(app, &[&toggle, &sep, &quit])?;

            TrayIconBuilder::new()
                .icon(tray_icon)
                .tooltip("Desktop Deck")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let state = app.state::<HiddenState>();
                            if let Ok(hwnd_val) = win.hwnd() {
                                let hwnd = hwnd_val.0;
                                let is_visible  = unsafe { IsWindowVisible(hwnd) != 0 };
                                let is_minimized = unsafe { IsIconic(hwnd) != 0 };

                                if is_visible && !is_minimized {
                                    // Fully shown → hide it
                                    state.0.store(true, Ordering::Relaxed);
                                    ALLOW_HIDE.store(true, Ordering::SeqCst);
                                    unsafe { ShowWindow(hwnd, 0); } // SW_HIDE = 0
                                    std::thread::spawn(|| {
                                        std::thread::sleep(std::time::Duration::from_millis(100));
                                        ALLOW_HIDE.store(false, Ordering::SeqCst);
                                    });
                                } else {
                                    // Hidden or minimized → restore
                                    state.0.store(false, Ordering::Relaxed);
                                    unsafe {
                                        ShowWindow(hwnd, 9); // SW_RESTORE
                                        pin_raw(hwnd);
                                    }
                                }
                            }
                        }
                    }
                    "quit" => { config::save_current(); app.exit(0); }
                    _ => {}
                })
                .build(app)?;

            autostart::register();
            Ok(())
        })
        .on_window_event(|_window, event| match event {
            tauri::WindowEvent::Moved(pos) => { config::update_position(pos.x, pos.y); }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            commands::empty_recycle_bin,
            commands::new_desktop_folder,
            commands::flush_ram,
            commands::clear_clipboard,
            commands::copy_to_clipboard,
            commands::open_display,
            commands::panic_button,
            commands::toggle_mic,
            commands::get_mic_state,
            commands::resize_window,
            hide_window,
        ])
        .run(tauri::generate_context!())
        .expect("Desktop Deck başlatılamadı");
}
