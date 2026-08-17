use serde::Serialize;
use std::path::{Path, PathBuf};

mod ai;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolCandidate {
    name: String,
    path: String,
    kind: String,
    extension: String,
}

#[derive(Serialize)]
struct ToolImportResult {
    accepted: Vec<ToolCandidate>,
    rejected: Vec<String>,
}

#[tauri::command]
fn close_app(app: tauri::AppHandle) {
    app.exit(0);
}

fn inspect_tool(path: PathBuf) -> Result<ToolCandidate, String> {
    if !path.exists() {
        return Err(format!("{}：文件不存在", path.display()));
    }

    let is_folder = path.is_dir();
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let kind = if is_folder {
        "folder"
    } else {
        match extension.as_str() {
            "exe" => "application",
            "lnk" => "shortcut",
            "bat" | "cmd" | "ps1" | "vbs" => "script",
            "url" => "link",
            "msc" => "system",
            _ => return Err(format!("{}：不支持此类型", path.display())),
        }
    };
    let name = if is_folder {
        path.file_name()
    } else {
        path.file_stem()
    }
    .and_then(|value| value.to_str())
    .filter(|value| !value.trim().is_empty())
    .unwrap_or("未命名工具")
    .to_string();

    Ok(ToolCandidate {
        name,
        path: path.to_string_lossy().into_owned(),
        kind: kind.to_string(),
        extension: if is_folder {
            "folder".to_string()
        } else {
            extension
        },
    })
}

#[tauri::command]
fn inspect_tool_paths(paths: Vec<String>) -> ToolImportResult {
    let mut accepted = Vec::new();
    let mut rejected = Vec::new();
    for raw_path in paths {
        match inspect_tool(PathBuf::from(&raw_path)) {
            Ok(tool) => accepted.push(tool),
            Err(error) => rejected.push(error),
        }
    }
    ToolImportResult { accepted, rejected }
}

#[cfg(windows)]
fn powershell_picker(script: &str) -> Result<Vec<String>, String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let output = std::process::Command::new("powershell.exe")
        .args([
            "-NoLogo",
            "-NoProfile",
            "-STA",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|error| format!("无法打开 Windows 选择器：{error}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect())
}

#[cfg(windows)]
#[tauri::command]
fn pick_tool_paths(mode: String) -> Result<Vec<String>, String> {
    let script = match mode.as_str() {
        "files" => {
            r#"[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); Add-Type -AssemblyName System.Windows.Forms; $dialog=New-Object System.Windows.Forms.OpenFileDialog; $dialog.Title='选择要添加到工作台的工具'; $dialog.Multiselect=$true; $dialog.Filter='支持的工具|*.exe;*.lnk;*.bat;*.cmd;*.ps1;*.vbs;*.url;*.msc|应用程序 (*.exe)|*.exe|快捷方式 (*.lnk)|*.lnk|脚本 (*.bat;*.cmd;*.ps1;*.vbs)|*.bat;*.cmd;*.ps1;*.vbs|网页快捷方式 (*.url)|*.url|系统工具 (*.msc)|*.msc'; if($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){$dialog.FileNames | ForEach-Object {[Console]::WriteLine($_)}}"#
        }
        "folder" => {
            r#"[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); Add-Type -AssemblyName System.Windows.Forms; $dialog=New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description='选择要添加到工作台的文件夹'; $dialog.ShowNewFolderButton=$false; if($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){[Console]::WriteLine($dialog.SelectedPath)}"#
        }
        _ => return Err("未知的选择类型".to_string()),
    };
    powershell_picker(script)
}

#[cfg(not(windows))]
#[tauri::command]
fn pick_tool_paths(_mode: String) -> Result<Vec<String>, String> {
    Err("工具选择仅支持 Windows 桌面版".to_string())
}

#[tauri::command]
fn pick_project_directory() -> Result<Option<String>, String> {
    let mut paths = pick_tool_paths("folder".to_string())?;
    Ok(paths.pop())
}

#[cfg(windows)]
fn shell_open(path: &Path) -> Result<(), String> {
    use std::iter::once;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    let operation: Vec<u16> = "open".encode_utf16().chain(once(0)).collect();
    let target: Vec<u16> = path.as_os_str().encode_wide().chain(once(0)).collect();
    let working_directory: Vec<u16> = path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .as_os_str()
        .encode_wide()
        .chain(once(0))
        .collect();
    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            operation.as_ptr(),
            target.as_ptr(),
            std::ptr::null(),
            working_directory.as_ptr(),
            SW_SHOWNORMAL,
        )
    } as isize;
    if result <= 32 {
        Err(format!("Windows 无法打开此项目（错误代码 {result}）"))
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn shell_open(_path: &Path) -> Result<(), String> {
    Err("工具启动仅支持 Windows 桌面版".to_string())
}

fn launch_script(path: &Path, extension: &str) -> Result<(), String> {
    if matches!(extension, "bat" | "cmd" | "vbs") {
        return shell_open(path);
    }
    let mut command = std::process::Command::new("powershell.exe");
    command.args(["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass"]);
    command.arg("-File").arg(path);
    if let Some(parent) = path.parent() {
        command.current_dir(parent);
    }
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("脚本启动失败：{error}"))
}

#[tauri::command]
fn launch_tool(path: String) -> Result<(), String> {
    let target = PathBuf::from(path);
    let tool = inspect_tool(target.clone())?;
    if tool.kind == "script" {
        launch_script(&target, &tool.extension)
    } else {
        shell_open(&target)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ai::CodexState::default())
        .invoke_handler(tauri::generate_handler![
            close_app,
            inspect_tool_paths,
            pick_tool_paths,
            pick_project_directory,
            launch_tool,
            ai::codex_status,
            ai::codex_start,
            ai::codex_send,
            ai::codex_stop,
            ai::ai_chat,
            ai::ai_secret_status,
            ai::ai_secret_set,
            ai::ai_secret_delete,
            ai::open_external_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running terminal workbench");
}
