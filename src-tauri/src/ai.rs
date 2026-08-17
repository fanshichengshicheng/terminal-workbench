use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    thread,
};
use tauri::{AppHandle, Emitter, Manager, State};

const CREDENTIAL_PREFIX: &str = "terminal-workbench/ai/";

#[derive(Default)]
pub struct CodexState {
    process: Mutex<Option<ManagedCodex>>,
    generation: AtomicU64,
}

struct ManagedCodex {
    child: Child,
    stdin: Arc<Mutex<ChildStdin>>,
}

impl Drop for ManagedCodex {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[derive(Debug, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct AiChatRequest {
    pub provider: String,
    pub model: String,
    pub base_url: Option<String>,
    pub messages: Vec<ChatMessage>,
}

#[derive(Debug, Serialize)]
pub struct AiChatResponse {
    pub content: String,
    pub provider: String,
    pub model: String,
}

#[derive(Debug, Serialize)]
pub struct CodexStatus {
    pub running: bool,
    pub executable: Option<String>,
    pub generation: u64,
}

#[derive(Clone, Serialize)]
struct CodexMessageEvent {
    generation: u64,
    message: String,
}

#[derive(Clone, Serialize)]
struct CodexGenerationEvent {
    generation: u64,
}

fn is_current_generation(app: &AppHandle, generation: u64) -> bool {
    app.state::<CodexState>().generation.load(Ordering::Acquire) == generation
}

fn codex_candidates(app: &AppHandle) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("resources").join("codex.exe"));
        candidates.push(resource_dir.join("codex.exe"));
    }
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("codex.exe"),
    );
    candidates
}

fn resolve_codex(app: &AppHandle) -> Result<PathBuf, String> {
    let executable = codex_candidates(app)
        .into_iter()
        .find(|path| path.is_file())
        .ok_or_else(|| "未找到内置 Codex，请重新安装终端工作台。".to_string())?;
    for companion in [
        "codex-code-mode-host.exe",
        "codex-command-runner.exe",
        "codex-windows-sandbox-setup.exe",
    ] {
        if !executable.with_file_name(companion).is_file() {
            return Err(format!(
                "内置 Codex 资源不完整：缺少 {companion}，请重新安装终端工作台。"
            ));
        }
    }
    Ok(executable)
}

#[tauri::command]
pub fn codex_status(app: AppHandle, state: State<'_, CodexState>) -> Result<CodexStatus, String> {
    let mut guard = state
        .process
        .lock()
        .map_err(|_| "Codex 状态锁定失败".to_string())?;
    let running = if let Some(process) = guard.as_mut() {
        match process.child.try_wait() {
            Ok(None) => true,
            Ok(Some(_)) | Err(_) => {
                guard.take();
                false
            }
        }
    } else {
        false
    };
    let executable = codex_candidates(&app)
        .into_iter()
        .find(|path| path.is_file())
        .map(|path| path.to_string_lossy().into_owned());
    Ok(CodexStatus {
        running,
        executable,
        generation: state.generation.load(Ordering::Acquire),
    })
}

#[tauri::command]
pub fn codex_start(app: AppHandle, state: State<'_, CodexState>) -> Result<CodexStatus, String> {
    let generation = state.generation.fetch_add(1, Ordering::AcqRel) + 1;
    {
        let mut guard = state
            .process
            .lock()
            .map_err(|_| "Codex 状态锁定失败".to_string())?;
        guard.take();
    }

    let executable = resolve_codex(&app)?;
    let mut command = Command::new(&executable);
    command
        .arg("app-server")
        .arg("--stdio")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }

    let mut child = command
        .spawn()
        .map_err(|error| format!("无法启动 Codex：{error}"))?;
    let stdin = Arc::new(Mutex::new(
        child.stdin.take().ok_or("Codex 输入通道创建失败")?,
    ));
    let stdout = child.stdout.take().ok_or("Codex 输出通道创建失败")?;
    let stderr = child.stderr.take().ok_or("Codex 日志通道创建失败")?;

    let app_for_stdout = app.clone();
    thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            if !is_current_generation(&app_for_stdout, generation) {
                break;
            }
            match line {
                Ok(line) => {
                    let _ = app_for_stdout.emit(
                        "codex-message",
                        CodexMessageEvent {
                            generation,
                            message: line,
                        },
                    );
                }
                Err(error) => {
                    let _ = app_for_stdout.emit(
                        "codex-stderr",
                        CodexMessageEvent {
                            generation,
                            message: error.to_string(),
                        },
                    );
                    break;
                }
            }
        }
        if is_current_generation(&app_for_stdout, generation) {
            let _ = app_for_stdout.emit("codex-disconnected", CodexGenerationEvent { generation });
        }
    });

    let app_for_stderr = app.clone();
    thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            if !is_current_generation(&app_for_stderr, generation) {
                break;
            }
            let _ = app_for_stderr.emit(
                "codex-stderr",
                CodexMessageEvent {
                    generation,
                    message: line,
                },
            );
        }
    });

    let executable_text = executable.to_string_lossy().into_owned();
    state
        .process
        .lock()
        .map_err(|_| "Codex 状态锁定失败".to_string())?
        .replace(ManagedCodex { child, stdin });
    Ok(CodexStatus {
        running: true,
        executable: Some(executable_text),
        generation,
    })
}

#[tauri::command]
pub fn codex_send(message: String, state: State<'_, CodexState>) -> Result<(), String> {
    let guard = state
        .process
        .lock()
        .map_err(|_| "Codex 状态锁定失败".to_string())?;
    let process = guard.as_ref().ok_or("Codex 尚未启动")?;
    let mut stdin = process
        .stdin
        .lock()
        .map_err(|_| "Codex 输入通道锁定失败".to_string())?;
    stdin
        .write_all(message.as_bytes())
        .and_then(|_| stdin.write_all(b"\n"))
        .and_then(|_| stdin.flush())
        .map_err(|error| format!("Codex 消息发送失败：{error}"))
}

#[tauri::command]
pub fn codex_stop(state: State<'_, CodexState>) -> Result<(), String> {
    state.generation.fetch_add(1, Ordering::AcqRel);
    state
        .process
        .lock()
        .map_err(|_| "Codex 状态锁定失败".to_string())?
        .take();
    Ok(())
}

fn allowed_provider(provider: &str) -> bool {
    matches!(provider, "openai" | "anthropic" | "deepseek" | "ollama")
}

fn credential_target(provider: &str) -> Result<String, String> {
    if !allowed_provider(provider) || provider == "ollama" {
        return Err("该服务商不支持保存 API Key".to_string());
    }
    Ok(format!("{CREDENTIAL_PREFIX}{provider}"))
}

#[cfg(windows)]
fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(windows)]
fn write_credential(provider: &str, secret: &str) -> Result<(), String> {
    use windows_sys::Win32::Security::Credentials::{
        CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC,
    };

    let mut target = wide(&credential_target(provider)?);
    let mut username = wide("terminal-workbench");
    let mut blob = secret.as_bytes().to_vec();
    let credential = CREDENTIALW {
        Type: CRED_TYPE_GENERIC,
        TargetName: target.as_mut_ptr(),
        CredentialBlobSize: blob.len() as u32,
        CredentialBlob: blob.as_mut_ptr(),
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        UserName: username.as_mut_ptr(),
        ..Default::default()
    };
    if unsafe { CredWriteW(&credential, 0) } == 0 {
        return Err(format!(
            "Windows 凭据写入失败：{}",
            std::io::Error::last_os_error()
        ));
    }
    Ok(())
}

#[cfg(not(windows))]
fn write_credential(_provider: &str, _secret: &str) -> Result<(), String> {
    Err("当前版本仅支持在 Windows 凭据管理器中保存 API Key".to_string())
}

#[cfg(windows)]
fn read_credential(provider: &str) -> Result<Option<String>, String> {
    use std::{ffi::c_void, slice};
    use windows_sys::Win32::{
        Foundation::ERROR_NOT_FOUND,
        Security::Credentials::{CredFree, CredReadW, CREDENTIALW, CRED_TYPE_GENERIC},
    };

    let target = wide(&credential_target(provider)?);
    let mut credential: *mut CREDENTIALW = std::ptr::null_mut();
    if unsafe { CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut credential) } == 0 {
        let error = std::io::Error::last_os_error();
        if error.raw_os_error() == Some(ERROR_NOT_FOUND as i32) {
            return Ok(None);
        }
        return Err(format!("Windows 凭据读取失败：{error}"));
    }
    if credential.is_null() {
        return Ok(None);
    }
    let bytes = unsafe {
        slice::from_raw_parts(
            (*credential).CredentialBlob,
            (*credential).CredentialBlobSize as usize,
        )
        .to_vec()
    };
    unsafe { CredFree(credential.cast::<c_void>()) };
    String::from_utf8(bytes)
        .map(Some)
        .map_err(|_| "保存的 API Key 编码无效".to_string())
}

#[cfg(not(windows))]
fn read_credential(_provider: &str) -> Result<Option<String>, String> {
    Ok(None)
}

#[cfg(windows)]
fn delete_credential(provider: &str) -> Result<(), String> {
    use windows_sys::Win32::{
        Foundation::ERROR_NOT_FOUND,
        Security::Credentials::{CredDeleteW, CRED_TYPE_GENERIC},
    };

    let target = wide(&credential_target(provider)?);
    if unsafe { CredDeleteW(target.as_ptr(), CRED_TYPE_GENERIC, 0) } == 0 {
        let error = std::io::Error::last_os_error();
        if error.raw_os_error() != Some(ERROR_NOT_FOUND as i32) {
            return Err(format!("Windows 凭据删除失败：{error}"));
        }
    }
    Ok(())
}

#[cfg(not(windows))]
fn delete_credential(_provider: &str) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn ai_secret_status(provider: String) -> Result<bool, String> {
    Ok(read_credential(&provider)?.is_some())
}

#[tauri::command]
pub fn ai_secret_set(provider: String, secret: String) -> Result<(), String> {
    let secret = secret.trim();
    if secret.is_empty() {
        return Err("API Key 不能为空".to_string());
    }
    write_credential(&provider, secret)
}

#[tauri::command]
pub fn ai_secret_delete(provider: String) -> Result<(), String> {
    delete_credential(&provider)
}

fn normalize_base_url(provider: &str, base_url: Option<String>) -> String {
    let given = base_url
        .unwrap_or_default()
        .trim()
        .trim_end_matches('/')
        .to_string();
    if !given.is_empty() {
        return given;
    }
    match provider {
        "openai" => "https://api.openai.com/v1".to_string(),
        "anthropic" => "https://api.anthropic.com/v1".to_string(),
        "deepseek" => "https://api.deepseek.com/v1".to_string(),
        "ollama" => "http://127.0.0.1:11434/v1".to_string(),
        _ => String::new(),
    }
}

fn chat_message_json(messages: &[ChatMessage]) -> Vec<Value> {
    messages
        .iter()
        .map(|message| json!({ "role": message.role, "content": message.content }))
        .collect()
}

fn anthropic_messages(messages: &[ChatMessage]) -> (Option<String>, Vec<Value>) {
    let system = messages
        .iter()
        .filter(|message| message.role == "system")
        .map(|message| message.content.as_str())
        .collect::<Vec<_>>()
        .join("\n\n");
    let chat = messages
        .iter()
        .filter(|message| message.role != "system")
        .map(|message| json!({ "role": message.role, "content": message.content }))
        .collect();
    ((!system.is_empty()).then_some(system), chat)
}

fn response_content(provider: &str, value: &Value) -> String {
    if provider == "anthropic" {
        return value
            .get("content")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.get("text").and_then(Value::as_str))
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .unwrap_or_default();
    }
    if let Some(content) = value
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
    {
        return content.to_string();
    }
    if let Some(content) = value.get("output_text").and_then(Value::as_str) {
        return content.to_string();
    }
    value
        .get("output")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .flat_map(|item| {
                    item.get("content")
                        .and_then(Value::as_array)
                        .into_iter()
                        .flatten()
                })
                .filter_map(|item| item.get("text").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default()
}

fn error_detail(value: &Value) -> String {
    value
        .get("error")
        .and_then(|error| {
            error
                .get("message")
                .and_then(Value::as_str)
                .or_else(|| error.as_str())
        })
        .or_else(|| value.get("message").and_then(Value::as_str))
        .unwrap_or("服务商返回错误")
        .to_string()
}

#[cfg(windows)]
struct WinHttpHandle(*mut std::ffi::c_void);

#[cfg(windows)]
impl Drop for WinHttpHandle {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { windows_sys::Win32::Networking::WinHttp::WinHttpCloseHandle(self.0) };
        }
    }
}

#[cfg(windows)]
fn parse_http_url(url: &str) -> Result<(bool, String, u16, String), String> {
    let (scheme, remainder) = url
        .split_once("://")
        .ok_or_else(|| "服务地址格式无效".to_string())?;
    let secure = match scheme.to_ascii_lowercase().as_str() {
        "https" => true,
        "http" => false,
        _ => return Err("服务地址只支持 HTTP 或 HTTPS".to_string()),
    };
    let (authority, path) = remainder
        .split_once('/')
        .map(|(authority, path)| (authority, format!("/{path}")))
        .unwrap_or((remainder, "/".to_string()));
    if authority.is_empty() {
        return Err("服务地址缺少主机名".to_string());
    }
    let default_port = if secure { 443 } else { 80 };
    let (host, port) = if authority.starts_with('[') {
        let end = authority
            .find(']')
            .ok_or_else(|| "IPv6 服务地址格式无效".to_string())?;
        let host = authority[1..end].to_string();
        let port = authority[end + 1..]
            .strip_prefix(':')
            .map(|value| value.parse::<u16>())
            .transpose()
            .map_err(|_| "服务地址端口无效".to_string())?
            .unwrap_or(default_port);
        (host, port)
    } else if let Some((host, port)) = authority.rsplit_once(':') {
        if port.chars().all(|character| character.is_ascii_digit()) {
            (
                host.to_string(),
                port.parse::<u16>()
                    .map_err(|_| "服务地址端口无效".to_string())?,
            )
        } else {
            (authority.to_string(), default_port)
        }
    } else {
        (authority.to_string(), default_port)
    };
    if host.is_empty() {
        return Err("服务地址缺少主机名".to_string());
    }
    Ok((secure, host, port, path))
}

#[cfg(windows)]
fn winhttp_post_json(
    url: &str,
    headers: &[(String, String)],
    body: &Value,
) -> Result<(u16, Value), String> {
    use std::ffi::c_void;
    use windows_sys::Win32::Networking::WinHttp::{
        WinHttpConnect, WinHttpOpen, WinHttpOpenRequest, WinHttpQueryDataAvailable,
        WinHttpQueryHeaders, WinHttpReadData, WinHttpReceiveResponse, WinHttpSendRequest,
        WinHttpSetTimeouts, WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, WINHTTP_FLAG_SECURE,
        WINHTTP_QUERY_FLAG_NUMBER, WINHTTP_QUERY_STATUS_CODE,
    };

    let (secure, host, port, path) = parse_http_url(url)?;
    let agent = wide("TerminalWorkbench/0.2.6");
    let session = WinHttpHandle(unsafe {
        WinHttpOpen(
            agent.as_ptr(),
            WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
            std::ptr::null(),
            std::ptr::null(),
            0,
        )
    });
    if session.0.is_null() {
        return Err(format!(
            "WinHTTP 初始化失败：{}",
            std::io::Error::last_os_error()
        ));
    }
    if unsafe { WinHttpSetTimeouts(session.0, 15_000, 20_000, 30_000, 120_000) } == 0 {
        return Err(format!(
            "WinHTTP 超时设置失败：{}",
            std::io::Error::last_os_error()
        ));
    }

    let host = wide(&host);
    let connection = WinHttpHandle(unsafe { WinHttpConnect(session.0, host.as_ptr(), port, 0) });
    if connection.0.is_null() {
        return Err(format!("服务连接失败：{}", std::io::Error::last_os_error()));
    }

    let method = wide("POST");
    let path = wide(&path);
    let request = WinHttpHandle(unsafe {
        WinHttpOpenRequest(
            connection.0,
            method.as_ptr(),
            path.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            std::ptr::null(),
            if secure { WINHTTP_FLAG_SECURE } else { 0 },
        )
    });
    if request.0.is_null() {
        return Err(format!(
            "HTTP 请求创建失败：{}",
            std::io::Error::last_os_error()
        ));
    }

    let header_text = headers
        .iter()
        .map(|(name, value)| format!("{name}: {value}\r\n"))
        .collect::<String>();
    let header_text = wide(&header_text);
    let body = serde_json::to_vec(body).map_err(|error| format!("请求数据编码失败：{error}"))?;
    if unsafe {
        WinHttpSendRequest(
            request.0,
            header_text.as_ptr(),
            (header_text.len() - 1) as u32,
            body.as_ptr().cast::<c_void>(),
            body.len() as u32,
            body.len() as u32,
            0,
        )
    } == 0
    {
        return Err(format!(
            "HTTP 请求发送失败：{}",
            std::io::Error::last_os_error()
        ));
    }
    if unsafe { WinHttpReceiveResponse(request.0, std::ptr::null_mut()) } == 0 {
        return Err(format!(
            "HTTP 响应接收失败：{}",
            std::io::Error::last_os_error()
        ));
    }

    let mut status = 0u32;
    let mut status_size = std::mem::size_of::<u32>() as u32;
    if unsafe {
        WinHttpQueryHeaders(
            request.0,
            WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
            std::ptr::null(),
            (&mut status as *mut u32).cast::<c_void>(),
            &mut status_size,
            std::ptr::null_mut(),
        )
    } == 0
    {
        return Err(format!(
            "HTTP 状态读取失败：{}",
            std::io::Error::last_os_error()
        ));
    }

    let mut response_bytes = Vec::new();
    loop {
        let mut available = 0u32;
        if unsafe { WinHttpQueryDataAvailable(request.0, &mut available) } == 0 {
            return Err(format!(
                "HTTP 响应读取失败：{}",
                std::io::Error::last_os_error()
            ));
        }
        if available == 0 {
            break;
        }
        if response_bytes.len() + available as usize > 16 * 1024 * 1024 {
            return Err("AI 服务响应超过 16 MB 限制".to_string());
        }
        let start = response_bytes.len();
        response_bytes.resize(start + available as usize, 0);
        let mut read = 0u32;
        if unsafe {
            WinHttpReadData(
                request.0,
                response_bytes[start..].as_mut_ptr().cast::<c_void>(),
                available,
                &mut read,
            )
        } == 0
        {
            return Err(format!(
                "HTTP 响应读取失败：{}",
                std::io::Error::last_os_error()
            ));
        }
        response_bytes.truncate(start + read as usize);
        if read == 0 {
            break;
        }
    }

    let value = serde_json::from_slice(&response_bytes).map_err(|error| {
        let preview = String::from_utf8_lossy(&response_bytes);
        format!(
            "AI 服务返回数据无法解析：{error}；{}",
            preview.chars().take(180).collect::<String>()
        )
    })?;
    Ok((status as u16, value))
}

#[cfg(not(windows))]
fn winhttp_post_json(
    _url: &str,
    _headers: &[(String, String)],
    _body: &Value,
) -> Result<(u16, Value), String> {
    Err("当前版本仅支持 Windows 原生 AI 请求".to_string())
}

fn ai_chat_blocking(request: AiChatRequest) -> Result<AiChatResponse, String> {
    let provider = request.provider.trim().to_lowercase();
    if !allowed_provider(&provider) {
        return Err("不支持的 AI 服务商".to_string());
    }
    let model = request.model.trim().to_string();
    if model.is_empty() {
        return Err("请先填写模型名称".to_string());
    }
    if request.messages.is_empty() {
        return Err("对话内容不能为空".to_string());
    }

    let base = normalize_base_url(&provider, request.base_url);
    let mut headers = vec![("Content-Type".to_string(), "application/json".to_string())];
    let endpoint;
    let payload;
    if provider == "anthropic" {
        endpoint = format!("{base}/messages");
        headers.push(("anthropic-version".to_string(), "2023-06-01".to_string()));
        let key = read_credential(&provider)?.ok_or("Claude API Key 尚未保存")?;
        headers.push(("x-api-key".to_string(), key));
        let (system, messages) = anthropic_messages(&request.messages);
        payload =
            json!({ "model": model, "max_tokens": 4096, "system": system, "messages": messages });
    } else if provider == "openai" {
        endpoint = format!("{base}/responses");
        let key = read_credential(&provider)?.ok_or("OpenAI API Key 尚未保存")?;
        headers.push(("Authorization".to_string(), format!("Bearer {key}")));
        payload = json!({ "model": model, "input": chat_message_json(&request.messages) });
    } else {
        endpoint = format!("{base}/chat/completions");
        if provider == "deepseek" {
            let key = read_credential(&provider)?.ok_or("DeepSeek API Key 尚未保存")?;
            headers.push(("Authorization".to_string(), format!("Bearer {key}")));
        }
        payload = json!({ "model": model, "messages": chat_message_json(&request.messages), "stream": false });
    }

    let (status, body) = winhttp_post_json(&endpoint, &headers, &payload)?;
    if !(200..300).contains(&status) {
        return Err(format!(
            "{provider} 请求失败（{status}）：{}",
            error_detail(&body)
        ));
    }
    let content = response_content(&provider, &body);
    if content.trim().is_empty() {
        return Err(format!("{provider} 返回了空内容"));
    }
    Ok(AiChatResponse {
        content,
        provider,
        model,
    })
}

#[tauri::command]
pub async fn ai_chat(request: AiChatRequest) -> Result<AiChatResponse, String> {
    tauri::async_runtime::spawn_blocking(move || ai_chat_blocking(request))
        .await
        .map_err(|error| format!("AI 请求线程失败：{error}"))?
}

#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    let target = url.trim();
    if !(target.starts_with("https://") || target.starts_with("http://")) {
        return Err("只允许打开 HTTP 或 HTTPS 地址".to_string());
    }
    #[cfg(windows)]
    {
        use std::iter::once;
        use windows_sys::Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL};
        let operation: Vec<u16> = "open".encode_utf16().chain(once(0)).collect();
        let target: Vec<u16> = target.encode_utf16().chain(once(0)).collect();
        let result = unsafe {
            ShellExecuteW(
                std::ptr::null_mut(),
                operation.as_ptr(),
                target.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                SW_SHOWNORMAL,
            )
        } as isize;
        if result <= 32 {
            return Err(format!("Windows 无法打开登录页面（错误代码 {result}）"));
        }
        return Ok(());
    }
    #[cfg(not(windows))]
    Err("当前版本仅支持在 Windows 上打开外部链接".to_string())
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
    };

    #[test]
    fn parses_https_and_custom_ports() {
        assert_eq!(
            parse_http_url("https://api.example.com/v1/responses").unwrap(),
            (
                true,
                "api.example.com".to_string(),
                443,
                "/v1/responses".to_string()
            )
        );
        assert_eq!(
            parse_http_url("http://127.0.0.1:11434/v1/chat/completions").unwrap(),
            (
                false,
                "127.0.0.1".to_string(),
                11434,
                "/v1/chat/completions".to_string()
            )
        );
    }

    #[test]
    fn sends_ollama_compatible_request_through_winhttp() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request_bytes = Vec::new();
            let mut chunk = [0u8; 4096];
            loop {
                let read = stream.read(&mut chunk).unwrap();
                if read == 0 {
                    break;
                }
                request_bytes.extend_from_slice(&chunk[..read]);
                if let Some(header_end) = request_bytes
                    .windows(4)
                    .position(|part| part == b"\r\n\r\n")
                {
                    let headers = String::from_utf8_lossy(&request_bytes[..header_end]);
                    let content_length = headers
                        .lines()
                        .find_map(|line| {
                            line.split_once(':').and_then(|(name, value)| {
                                name.eq_ignore_ascii_case("content-length")
                                    .then(|| value.trim().parse::<usize>().ok())
                                    .flatten()
                            })
                        })
                        .unwrap_or(0);
                    if request_bytes.len() >= header_end + 4 + content_length {
                        break;
                    }
                }
            }
            let request = String::from_utf8_lossy(&request_bytes);
            assert!(request.starts_with("POST /v1/chat/completions HTTP/1.1"));
            assert!(request.contains("Content-Type: application/json"));

            let body = r#"{"choices":[{"message":{"content":"本地连接成功"}}]}"#;
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .unwrap();
            stream.flush().unwrap();
        });

        let response = ai_chat_blocking(AiChatRequest {
            provider: "ollama".to_string(),
            model: "local-test".to_string(),
            base_url: Some(format!("http://127.0.0.1:{port}/v1")),
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "ping".to_string(),
            }],
        })
        .unwrap();
        server.join().unwrap();
        assert_eq!(response.content, "本地连接成功");
    }
}
