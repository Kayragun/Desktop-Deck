#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    Manager,
};

mod autostart;
mod config;

// Pencereyi Windows Z-order'ının en altına sabitler (masaüstü seviyesi).
// Diğer normal pencereler bu pencerenin üzerine geçer; fullscreen uygulamalar
// tamamen örter. Odak kaybedildiğinde tekrar çağrılarak konum korunur.
#[cfg(target_os = "windows")]
fn pin_to_desktop(win: &tauri::WebviewWindow) {
    use core::ffi::c_void;
    extern "system" {
        fn SetWindowPos(
            h_wnd: *mut c_void,
            h_wnd_insert_after: *mut c_void,
            x: i32, y: i32,
            cx: i32, cy: i32,
            u_flags: u32,
        ) -> i32;
    }
    if let Ok(hwnd) = win.hwnd() {
        unsafe {
            // HWND_BOTTOM=1, SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE = 0x0013
            SetWindowPos(hwnd.0, 1_usize as *mut c_void, 0, 0, 0, 0, 0x0013);
        }
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let saved = config::load();
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_position(tauri::PhysicalPosition::new(saved.x, saved.y));
                let _ = win.show();
                #[cfg(target_os = "windows")]
                pin_to_desktop(&win);
            }

            let tray_icon = Image::from_bytes(include_bytes!("../icons/32x32.png"))?;
            let toggle = MenuItem::with_id(app, "toggle", "Göster / Gizle", true, None::<&str>)?;
            let sep    = PredefinedMenuItem::separator(app)?;
            let quit   = MenuItem::with_id(app, "quit", "Çıkış", true, None::<&str>)?;
            let menu   = Menu::with_items(app, &[&toggle, &sep, &quit])?;

            TrayIconBuilder::new()
                .icon(tray_icon)
                .tooltip("Desktop Deck")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle" => {
                        if let Some(win) = app.get_webview_window("main") {
                            match win.is_visible() {
                                Ok(true) => { let _ = win.hide(); }
                                _ => {
                                    let _ = win.show();
                                    let _ = win.set_focus();
                                }
                            }
                        }
                    }
                    "quit" => {
                        config::save_current();
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            autostart::register();
            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::Moved(pos) => {
                    config::update_position(pos.x, pos.y);
                }
                tauri::WindowEvent::Focused(false) => {
                    if let Some(win) = window.app_handle().get_webview_window("main") {
                        #[cfg(target_os = "windows")]
                        pin_to_desktop(&win);
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("Desktop Deck başlatılamadı");
}
