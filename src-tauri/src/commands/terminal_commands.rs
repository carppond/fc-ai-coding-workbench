use crate::errors::{AppError, AppResult};
use crate::terminal::TerminalSession;
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use sysinfo::{Pid, ProcessRefreshKind, RefreshKind, System};
use tauri::{AppHandle, State};

/// 预热终端池大小：连续开多个 tab / 分屏时也能秒开
const WARMUP_POOL_SIZE: usize = 3;

pub struct TerminalState {
    pub sessions: Mutex<HashMap<String, TerminalSession>>,
    pub warmup: Arc<Mutex<VecDeque<TerminalSession>>>,
}

/// 跨平台进程检测：枚举 `pid` 的直接子进程。
/// 返回 (子进程数量, 是否存在命令行包含 "claude" 的子进程)。
/// 取代旧的 pgrep 实现 —— pgrep 仅 Unix 可用，Windows 上静默失败。
fn inspect_children(pid: u32) -> (usize, bool) {
    let sys = System::new_with_specifics(
        RefreshKind::new().with_processes(ProcessRefreshKind::everything()),
    );
    let target = Pid::from_u32(pid);
    let mut count = 0usize;
    let mut has_claude = false;
    for (_, proc_) in sys.processes() {
        if proc_.parent() == Some(target) {
            count += 1;
            // 命令行或进程名包含 "claude" 即判定为 Claude CLI 在运行
            let in_name = proc_.name().to_string_lossy().to_lowercase().contains("claude");
            let in_cmd = proc_
                .cmd()
                .iter()
                .any(|s| s.to_string_lossy().to_lowercase().contains("claude"));
            if in_name || in_cmd {
                has_claude = true;
            }
        }
    }
    (count, has_claude)
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

/// 关闭终端。如果检测到 Claude CLI 正在运行，先发送 /exit 让其优雅退出。
#[tauri::command]
pub async fn kill_terminal(
    state: State<'_, TerminalState>,
    session_id: String,
) -> AppResult<()> {
    let mut need_wait = false;

    // 检测是否有 claude 在运行，如果有则发 /exit（跨平台，用 sysinfo）
    {
        // 先取出 pid，释放锁后扫描进程，再短暂持锁写入 /exit
        let pid = {
            let sessions = state
                .sessions
                .lock()
                .map_err(|_| AppError::General("Terminal state lock poisoned".to_string()))?;
            sessions.get(&session_id).and_then(|s| s.child_pid())
        };
        if let Some(pid) = pid {
            let (_, has_claude) = inspect_children(pid);
            if has_claude {
                let sessions = state
                    .sessions
                    .lock()
                    .map_err(|_| AppError::General("Terminal state lock poisoned".to_string()))?;
                if let Some(session) = sessions.get(&session_id) {
                    let _ = session.write("/exit\r");
                    need_wait = true;
                }
            }
        }
    } // 释放锁

    // 等待 claude 处理 /exit 命令
    if need_wait {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }

    // 移除 session，触发 Drop → child.kill()
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| AppError::General("Terminal state lock poisoned".to_string()))?;
    sessions.remove(&session_id);
    Ok(())
}

/// 检查终端是否空闲（shell 无子进程）。
/// 用 sysinfo 跨平台枚举子进程，取代仅 Unix 可用的 pgrep。
#[tauri::command]
pub fn is_terminal_idle(
    state: State<TerminalState>,
    session_id: String,
) -> AppResult<bool> {
    let pid = {
        let sessions = state
            .sessions
            .lock()
            .map_err(|_| AppError::General("Terminal state lock poisoned".to_string()))?;
        let session = sessions
            .get(&session_id)
            .ok_or_else(|| AppError::General("session not found".into()))?;
        session.child_pid().ok_or_else(|| AppError::General("no pid".into()))?
    };
    // 释放 sessions 锁后再做进程扫描（扫描较慢，避免长时间持锁）
    let (child_count, _) = inspect_children(pid);
    Ok(child_count == 0)
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
    // 计算还需预热几个，把池补满到 WARMUP_POOL_SIZE
    let need = {
        let warmup = state
            .warmup
            .lock()
            .map_err(|_| AppError::General("Terminal state lock poisoned".to_string()))?;
        WARMUP_POOL_SIZE.saturating_sub(warmup.len())
    };
    if need == 0 {
        return Ok(());
    }

    // 每个缺额各起一个后台线程预热，命令立即返回
    for _ in 0..need {
        let app = app.clone();
        let dir = initial_dir.clone();
        let warmup_arc = Arc::clone(&state.warmup);
        tauri::async_runtime::spawn_blocking(move || {
            if let Ok(session) = TerminalSession::spawn(app, dir.as_deref(), 24, 80) {
                if let Ok(mut warmup) = warmup_arc.lock() {
                    // 二次确认未超额（并发预热可能多起，超了就丢弃触发 Drop）
                    if warmup.len() < WARMUP_POOL_SIZE {
                        warmup.push_back(session);
                    }
                }
            }
        });
    }

    Ok(())
}

#[tauri::command]
pub fn claim_warmup_terminal(
    state: State<TerminalState>,
    _initial_dir: Option<String>,
    rows: Option<u16>,
    cols: Option<u16>,
) -> AppResult<Option<(String, String)>> {
    // Take a warmup session out of the pool
    let session = {
        let mut warmup = state
            .warmup
            .lock()
            .map_err(|_| AppError::General("Terminal state lock poisoned".to_string()))?;
        warmup.pop_front()
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

/// Flush buffered output and enable direct event emission for this session.
/// Must be called after the frontend has registered its event listeners.
#[tauri::command]
pub fn terminal_subscribe(
    app: AppHandle,
    state: State<TerminalState>,
    session_id: String,
) -> AppResult<()> {
    use crate::terminal::PendingItem;
    use tauri::Emitter;

    let sessions = state
        .sessions
        .lock()
        .map_err(|_| AppError::General("Terminal state lock poisoned".to_string()))?;
    if let Some(session) = sessions.get(&session_id) {
        let output_event = format!("terminal-output-{}", session_id);
        let exit_event = format!("terminal-exit-{}", session_id);

        let (combined, has_exit) = {
            let mut buf = session
                .pending_output
                .lock()
                .map_err(|_| AppError::General("pending_output lock poisoned".to_string()))?;
            let mut output = String::new();
            let mut exited = false;
            for item in buf.drain(..) {
                match item {
                    PendingItem::Output(s) => output.push_str(&s),
                    PendingItem::Exited => exited = true,
                }
            }
            session
                .subscribed
                .store(true, std::sync::atomic::Ordering::Release);
            (output, exited)
        };

        if !combined.is_empty() {
            let _ = app.emit(&output_event, &combined);
        }
        if has_exit {
            let _ = app.emit(&exit_event, &session_id);
        }
    }
    Ok(())
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
