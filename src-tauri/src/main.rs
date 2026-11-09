// Cat Clock: one transparent, always-on-top overlay window; the cats live in src/ (HTML/JS).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

/// settings.json in the OS app-config folder (Windows: %APPDATA%\com.catclock.app, macOS: ~/Library/Application Support/com.catclock.app).
/// CATCLOCK_CONFIG_DIR overrides it (tests use a scratch folder, never the real one).
fn config_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Ok(d) = std::env::var("CATCLOCK_CONFIG_DIR") {
        return Ok(PathBuf::from(d));
    }
    app.path().app_config_dir().map_err(|e| e.to_string())
}

/// Raw settings text ("" when there is none yet); validation happens in src/core.js.
#[tauri::command]
fn load_settings(app: tauri::AppHandle) -> Result<String, String> {
    let f = config_dir(&app)?.join("settings.json");
    match fs::read_to_string(f) {
        Ok(s) => Ok(s),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()), // first start
        Err(e) => Err(e.to_string()), // unreadable: the app then never overwrites it
    }
}

/// Write settings atomically (temp file + rename) so a crash never leaves a half-written file.
#[tauri::command]
fn save_settings(app: tauri::AppHandle, json: String) -> Result<(), String> {
    let dir = config_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let tmp = dir.join("settings.json.tmp");
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, dir.join("settings.json")).map_err(|e| e.to_string())
}

/// A private sound from the "sounds" folder next to settings.json (e.g. meow-fawn-1.wav); empty when missing.
/// Only plain file names of the form meow-<fawn|lilac>-<n>.wav are accepted.
#[tauri::command]
fn read_private_sound(app: tauri::AppHandle, name: String) -> Result<tauri::ipc::Response, String> {
    let ok = name.starts_with("meow-")
        && name.ends_with(".wav")
        && name.len() < 40
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.')
        && !name.contains("..");
    if !ok {
        return Err("bad sound name".into());
    }
    let f = config_dir(&app)?.join("sounds").join(&name);
    Ok(tauri::ipc::Response::new(fs::read(f).unwrap_or_default()))
}

/// Same WebView2 flags as the overlay (tauri.conf.json): Windows refuses webviews with different flags in one app.
const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required";

/// Show the settings panel (created on first use, next to the given point in screen px).
/// async: creating a window inside a synchronous command deadlocks on Windows.
#[tauri::command]
async fn open_panel(app: tauri::AppHandle, x: Option<f64>, y: Option<f64>) -> Result<(), String> {
    show_panel(&app, x, y).map_err(|e| e.to_string())
}

fn show_panel(app: &tauri::AppHandle, x: Option<f64>, y: Option<f64>) -> tauri::Result<()> {
    let w = match app.get_webview_window("panel") {
        Some(w) => w,
        None => match WebviewWindowBuilder::new(app, "panel", WebviewUrl::App("panel.html".into()))
            .additional_browser_args(BROWSER_ARGS)
            .title("Cat Clock · 设置")
            .inner_size(460.0, 740.0)
            .resizable(false)
            .maximizable(false)
            .minimizable(false)
            .always_on_top(true)
            .visible(false)
            .build()
        {
            Ok(w) => w,
            // a second click built it meanwhile: show that one
            Err(_) => match app.get_webview_window("panel") {
                Some(w) => w,
                None => return Ok(()),
            },
        },
    };
    if let (Some(x), Some(y)) = (x, y) {
        w.set_position(tauri::LogicalPosition::new(x, y))?;
    } else {
        w.center()?;
    }
    w.show()?;
    w.set_focus()?;
    Ok(())
}

/// Leave the app (from the panel).
#[tauri::command]
fn quit(app: tauri::AppHandle) {
    app.exit(0);
}

/// CATCLOCK_DEBUG=1 shows layout numbers on screen (for testing).
#[tauri::command]
fn debug_flag() -> bool {
    std::env::var("CATCLOCK_DEBUG").map(|v| v == "1").unwrap_or(false)
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // macOS: no Dock icon, and clicking a cat must not pull focus away from the user's app
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // tray (Windows) / menu bar (macOS) icon
            let settings = MenuItem::with_id(app, "settings", "Settings 设置", true, None::<&str>)?;
            let home = MenuItem::with_id(app, "home", "Cats back to the floor 回到底部", true, None::<&str>)?;
            let pause = CheckMenuItem::with_id(app, "pause", "Pause walking 暂停走动", true, false, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit 退出", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&settings, &home, &pause, &sep, &quit])?;
            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().cloned().expect("app icon"))
                .tooltip("Cat Clock")
                .menu(&menu)
                .show_menu_on_left_click(cfg!(target_os = "macos")) // Mac: menu-bar icons open their menu; Windows: left click = settings
                .on_menu_event(move |app, ev| match ev.id().as_ref() {
                    "settings" => { let _ = show_panel(app, None, None); }
                    "home" => { let _ = app.emit_to("overlay", "tray", "home"); }
                    "pause" => {
                        let on = pause.is_checked().unwrap_or(false);
                        let _ = app.emit_to("overlay", "tray", if on { "pause" } else { "resume" });
                    }
                    "quit" => {
                        // let the overlay save first (it quits itself); fallback after 2 s
                        let _ = app.emit_to("overlay", "tray", "quit");
                        let h = app.clone();
                        std::thread::spawn(move || {
                            std::thread::sleep(std::time::Duration::from_secs(2));
                            h.exit(0);
                        });
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, ev| {
                    if cfg!(target_os = "macos") {
                        return;
                    }
                    // left click on the icon opens the settings
                    if let tauri::tray::TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, button_state: tauri::tray::MouseButtonState::Up, .. } = ev {
                        let _ = show_panel(tray.app_handle(), None, None);
                    }
                })
                .build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![load_settings, save_settings, debug_flag, read_private_sound, open_panel, quit])
        .run(tauri::generate_context!())
        .expect("error while running Cat Clock");
}
