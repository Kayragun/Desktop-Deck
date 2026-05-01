#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    Manager,
};

mod autostart;
mod config;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Kaydedilmiş son konumu yükle ve pencereyi konumlandır
            let saved = config::load();
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_position(tauri::dpi::PhysicalPosition::new(saved.x, saved.y));
                let _ = win.show();
            }

            // Sistem tepsisi
            let tray_icon = Image::from_bytes(include_bytes!("../icons/32x32.png"))?;

            let toggle = MenuItem::with_id(app, "toggle", "Göster / Gizle", true, None::<&str>)?;
            let sep    = PredefinedMenuItem::separator(app)?;
            let quit   = MenuItem::with_id(app, "quit", "Çıkış", true, None::<&str>)?;
            let menu   = Menu::with_items(app, &[&toggle, &sep, &quit])?;

            TrayIconBuilder::new()
                .icon(tray_icon)
                .tooltip("DeskDeck")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle" => {
                        if let Some(win) = app.get_webview_window("main") {
                            match win.is_visible() {
                                Ok(true) => { let _ = win.hide(); }
                                _        => { let _ = win.show(); let _ = win.set_focus(); }
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
        .on_window_event(|_window, event| {
            // Sürükleme sırasında konumu bellekte tut (diske yazar: sadece çıkışta)
            if let tauri::WindowEvent::Moved(pos) = event {
                config::update_position(pos.x, pos.y);
            }
        })
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("DeskDeck başlatılamadı");
}
