use std::env;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use tauri::{Manager, State};

struct SidecarState(Mutex<Option<Child>>);

#[tauri::command]
fn sidecar_status() -> &'static str {
    "managed"
}

fn portable_root() -> Option<PathBuf> {
    env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|parent| parent.to_path_buf()))
}

fn spawn_sidecar(app: &tauri::AppHandle) -> Option<Child> {
    let resource_dir = app.path().resource_dir().ok();
    let root = portable_root().or_else(|| resource_dir.clone());
    let bundled_sidecar = root
        .as_ref()
        .map(|dir| dir.join("sidecar").join("instradoc-sidecar.exe"))
        .filter(|path| path.is_file());

    let mut command = if let Some(sidecar) = bundled_sidecar {
        Command::new(sidecar)
    } else {
        let mut cmd = Command::new("python");
        cmd.arg("sidecar_main.py");
        if let Some(dir) = resource_dir {
            cmd.current_dir(dir);
        }
        cmd
    };

    command
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg("8765");

    if let Some(dir) = root {
        let _ = std::fs::create_dir_all(dir.join("Projects"));
        let _ = std::fs::create_dir_all(dir.join("Export"));
        let _ = std::fs::create_dir_all(dir.join("config"));
        let _ = std::fs::create_dir_all(dir.join("logs"));
        command.arg("--base-dir").arg(dir);
    }

    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    command.spawn().ok()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarState(Mutex::new(None)))
        .setup(|app| {
            let handle = app.handle().clone();
            if let Some(child) = spawn_sidecar(&handle) {
                let state: State<SidecarState> = app.state();
                *state.0.lock().expect("sidecar mutex poisoned") = Some(child);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                let state: State<SidecarState> = window.state();
                if let Some(mut child) = state.0.lock().expect("sidecar mutex poisoned").take() {
                    let _ = child.kill();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![sidecar_status])
        .run(tauri::generate_context!())
        .expect("error while running InstraDoc Beta v.2");
}
