use crate::errors::{AppError, AppResult};
use crate::terminal::TerminalSession;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, State};

pub struct TerminalState {
    pub sessions: Mutex<HashMap<String, TerminalSession>>,
    pub warmup: Arc<Mutex<Option<TerminalSession>>>,
}

#[tauri::command]
pub async fn spawn_terminal(
    app: AppHandle,
    state: State<'_, TerminalState>,
    initial_dir: Option<String>,
    rows: Option<u16>,
    cols: Option<u16>,
) -> AppResult<(String, String)> {
    let r = rows.unwrap_or(24);
    let c = cols.unwrap_or(80);

    // 在后台线程创建 PTY，避免阻塞 UI
    let session = tauri::async_runtime::spawn_blocking(move || {
        TerminalSession::spawn(app, initial_dir.as_deref(), r, c)
    })
    .await
    .map_err(|e| AppError::General(format!("spawn task failed: {}", e)))?
    .map_err(AppError::General)?;

    let session_id = session.id.clone();
    let shell_name = session.shell_name.clone();
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| AppError::General("Terminal state lock poisoned".to_string()))?;
    sessions.insert(session_id.clone(), session);
    Ok((session_id, shell_name))
}

#[tauri::command]
pub fn write_terminal(
    state: State<TerminalState>,
    session_id: String,
    data: String,
) -> AppResult<()> {
    let sessions = state
        .sessions
        .lock()
        .map_err(|_| AppError::General("Terminal state lock poisoned".to_string()))?;
    if let Some(session) = sessions.get(&session_id) {
        session.write(&data).map_err(AppError::General)?;
    }
    Ok(())
}

#[tauri::command]
pub fn resize_terminal(
    state: State<TerminalState>,
    session_id: String,
    rows: u16,
    cols: u16,
) -> AppResult<()> {
    let sessions = state
        .sessions
        .lock()
        .map_err(|_| AppError::General("Terminal state lock poisoned".to_string()))?;
    if let Some(session) = sessions.get(&session_id) {
        session
            .resize(rows, cols)
            .map_err(|e| AppError::General(e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn kill_terminal(state: State<TerminalState>, session_id: String) -> AppResult<()> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| AppError::General("Terminal state lock poisoned".to_string()))?;
    sessions.remove(&session_id); // Drop triggers child kill
    Ok(())
}

/// 检查终端是否空闲（shell 无子进程）
#[tauri::command]
pub fn is_terminal_idle(
    state: State<TerminalState>,
    session_id: String,
) -> AppResult<bool> {
    let sessions = state
        .sessions
        .lock()
        .map_err(|_| AppError::General("Terminal state lock poisoned".to_string()))?;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| AppError::General("session not found".into()))?;
    let pid = session.child_pid().ok_or_else(|| AppError::General("no pid".into()))?;

    // pgrep -P <pid> 查找子进程，stdout 为空则空闲
    let output = std::process::Command::new("pgrep")
        .args(["-P", &pid.to_string()])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .output();
    match output {
        Ok(o) => Ok(o.stdout.is_empty()),
        Err(_) => Ok(true), // pgrep 不可用时默认空闲
    }
}

#[tauri::command]
pub fn terminal_cd(
    state: State<TerminalState>,
    session_id: String,
    path: String,
) -> AppResult<()> {
    let sessions = state
        .sessions
        .lock()
        .map_err(|_| AppError::General("Terminal state lock poisoned".to_string()))?;
    if let Some(session) = sessions.get(&session_id) {
        let cmd = build_cd_command(&session.shell_name, &path);
        session
            .write(&cmd)
            .map_err(|e| AppError::General(e))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn warmup_terminal(
    app: AppHandle,
    state: State<'_, TerminalState>,
    initial_dir: Option<String>,
) -> AppResult<()> {
    // Skip if a warmup session already exists
    {
        let warmup = state
            .warmup
            .lock()
            .map_err(|_| AppError::General("Terminal state lock poisoned".to_string()))?;
        if warmup.is_some() {
            return Ok(());
        }
    }

    // Spawn on a background thread so the command returns immediately
    let warmup_arc = Arc::clone(&state.warmup);
    tauri::async_runtime::spawn_blocking(move || {
        if let Ok(session) = TerminalSession::spawn(app, initial_dir.as_deref(), 24, 80) {
            if let Ok(mut warmup) = warmup_arc.lock() {
                *warmup = Some(session);
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn claim_warmup_terminal(
    state: State<TerminalState>,
    _initial_dir: Option<String>,
    rows: Option<u16>,
    cols: Option<u16>,
) -> AppResult<Option<(String, String)>> {
    // Take the warmup session out of the pool
    let session = {
        let mut warmup = state
            .warmup
            .lock()
            .map_err(|_| AppError::General("Terminal state lock poisoned".to_string()))?;
        warmup.take()
    };

    let session = match session {
        Some(s) => s,
        None => return Ok(None),
    };

    // Resize to the caller's dimensions
    let r = rows.unwrap_or(24);
    let c = cols.unwrap_or(80);
    session.resize(r, c).map_err(AppError::General)?;

    // 不在此处发送 cd 命令——前端需要先挂载 event listener，
    // 否则 cd+clear 的输出（包括 shell prompt）会在 listener 就绪前丢失。
    // 前端在 setupSession 后会调用 terminal_cd。

    let session_id = session.id.clone();
    let shell_name = session.shell_name.clone();

    // Move into active sessions
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| AppError::General("Terminal state lock poisoned".to_string()))?;
    sessions.insert(session_id.clone(), session);

    Ok(Some((session_id, shell_name)))
}

/// Build a cd + clear command appropriate for the given shell.
fn build_cd_command(shell_name: &str, path: &str) -> String {
    match shell_name {
        "cmd" | "cmd.exe" => {
            // cmd.exe: cd /d "path" & cls
            format!("cd /d \"{}\" & cls\n", path.replace('"', ""))
        }
        "pwsh" | "pwsh.exe" | "powershell" | "powershell.exe" => {
            // PowerShell: Set-Location then Clear-Host
            let escaped = path.replace('\'', "''");
            format!(" Set-Location '{}'; Clear-Host\n", escaped)
        }
        _ => {
            // Unix shells (zsh, bash, fish, sh)
            // Leading space prevents shell history entry
            let escaped = format!("'{}'", path.replace('\'', "'\\''"));
            format!(" cd {} && clear\n", escaped)
        }
    }
}
