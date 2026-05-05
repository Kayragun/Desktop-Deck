/// Windows başlangıcına Desktop Deck'i ekler (HKCU Run anahtarı).
/// Admin yetkisi gerektirmez; Task Manager üzerinden devre dışı bırakılabilir.
#[cfg(target_os = "windows")]
pub fn register() {
    use std::os::windows::process::CommandExt;
    let Ok(exe) = std::env::current_exe() else { return };
    let _ = std::process::Command::new("reg")
        .args([
            "add",
            r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
            "/v", "Desktop Deck",
            "/t", "REG_SZ",
            "/d", &format!("\"{}\"", exe.display()),
            "/f",
        ])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW — konsol penceresi açma
        .output();
}

#[cfg(not(target_os = "windows"))]
pub fn register() {}
