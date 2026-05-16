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
mod cleaner;
mod commands;
mod config;
mod desktop;

// ─── State ───────────────────────────────────────────────────────────────────

struct HiddenState(Arc<AtomicBool>);

static ALLOW_HIDE: AtomicBool = AtomicBool::new(false);

// ─── Win32 helpers ────────────────────────────────────────────────────────────

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

// ─── DWM / Subclass ──────────────────────────────────────────────────────────

#[link(name = "Dwmapi")]
extern "system" {
    fn DwmSetWindowAttribute(hwnd: *mut c_void, attr: u32, pv: *const c_void, cb: u32) -> i32;
}

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
    // WM_SYSCOMMAND = 0x0112: block SC_MINIMIZE (0xF020)
    if msg == 0x0112 && !ALLOW_HIDE.load(Ordering::SeqCst) {
        if wp & 0xFFF0 == 0xF020 { return 0; }
    }

    // WM_WINDOWPOSCHANGING = 0x0046: strip SWP_HIDEWINDOW (0x80)
    if msg == 0x0046 && !ALLOW_HIDE.load(Ordering::SeqCst) {
        let pos = &mut *(lp as *mut WindowPos);
        pos.flags &= !0x80u32;
    }

    DefSubclassProc(hwnd, msg, wp, lp)
}

// ─── pin_to_desktop ──────────────────────────────────────────────────────────

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

fn configure_dwm(win: &tauri::WebviewWindow) {
    if let Ok(hwnd) = win.hwnd() {
        let val: u32 = 1;
        unsafe {
            // DWMWA_TRANSITIONS_FORCEDISABLED = 3
            DwmSetWindowAttribute(hwnd.0, 3, &val as *const u32 as *const c_void, 4);
        }
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
                configure_dwm(&win);

                if let Ok(hwnd_val) = win.hwnd() {
                    cleaner::set_hwnd(hwnd_val.0 as usize);
                    unsafe { desktop::attach_to_desktop(hwnd_val.0); }
                }

                if let Ok(hwnd_val) = win.hwnd() {
                    let hwnd_usize = hwnd_val.0 as usize;
                    let hidden_flag = user_hidden.clone();
                    std::thread::spawn(move || loop {
                        std::thread::sleep(std::time::Duration::from_millis(80));
                        if hidden_flag.load(Ordering::Relaxed) { continue; }
                        let hwnd = hwnd_usize as *mut c_void;
                        unsafe {
                            if IsWindowVisible(hwnd) == 0 { ShowWindow(hwnd, 5); }
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
                                let is_visible   = unsafe { IsWindowVisible(hwnd) != 0 };
                                let is_minimized = unsafe { IsIconic(hwnd) != 0 };

                                if is_visible && !is_minimized {
                                    state.0.store(true, Ordering::Relaxed);
                                    ALLOW_HIDE.store(true, Ordering::SeqCst);
                                    unsafe { ShowWindow(hwnd, 0); }
                                    std::thread::spawn(|| {
                                        std::thread::sleep(std::time::Duration::from_millis(100));
                                        ALLOW_HIDE.store(false, Ordering::SeqCst);
                                    });
                                } else {
                                    state.0.store(false, Ordering::Relaxed);
                                    unsafe { ShowWindow(hwnd, 5); }
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
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::Moved(pos) => {
                if window.label() == "main" {
                    config::update_position(pos.x, pos.y);
                } else if window.label().starts_with("note-") {
                    let id = window.label().trim_start_matches("note-").to_string();
                    commands::save_note_position(id, pos.x, pos.y);
                }
            }
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
            commands::move_window,
            commands::get_snippets,
            commands::save_snippets,
            commands::get_notes,
            commands::save_notes,
            commands::get_note,
            commands::save_note_position,
            commands::save_note_size,
            commands::save_note_font_size,
            commands::save_note_opacity,
            commands::update_note_content,
            commands::open_note_window,
            commands::close_note_window,
            commands::resize_note_window,
            commands::open_file,
            commands::open_file_location,
            commands::pick_output_folder,
            commands::convert_image_file,
            cleaner::start_cleaner,
            cleaner::stop_cleaner,
            cleaner::get_cleaner_active,
            hide_window,
        ])
        .run(tauri::generate_context!())
        .expect("Desktop Deck başlatılamadı");
}
