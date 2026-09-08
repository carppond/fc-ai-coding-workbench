use super::run_blocking;
use crate::coding_cli::{
    build_launch_command, resolve_executable, CliLaunchAction, CodingCli, OmpApprovalMode,
};
use crate::errors::{AppError, AppResult};
use crate::terminal::TerminalSession;
use std::collections::{HashMap, VecDeque};
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
use tauri::{AppHandle, State};

/// 预热终端池大小：连续开多个 tab / 分屏时也能秒开
const WARMUP_POOL_SIZE: usize = 3;

pub struct TerminalState {
    pub sessions: Mutex<HashMap<String, TerminalSession>>,
    pub warmup: Arc<Mutex<VecDeque<TerminalSession>>>,
}

/// Match an actual executable or its Node/Bun entry script, never arbitrary
/// command arguments (\"pi\" also appears in unrelated names such as \"pip\").
fn matches_cli_process(
    executable: Option<&Path>,
    args: &[OsString],
    cli_paths: &[PathBuf],
) -> bool {
    if executable
        .and_then(|path| path.canonicalize().ok())
        .is_some_and(|path| cli_paths.contains(&path))
    {
        return true;
    }
    let name = executable
        .and_then(Path::file_name)
        .or_else(|| args.first().and_then(|arg| Path::new(arg).file_name()))
        .and_then(|name| name.to_str());
    let is_runtime = name.is_some_and(|name| {
        ["node", "node.exe", "bun", "bun.exe"]
            .iter()
            .any(|runtime| name.eq_ignore_ascii_case(runtime))
    });
    is_runtime
        && args
            .get(1)
            .and_then(|arg| Path::new(arg).canonicalize().ok())
            .is_some_and(|path| cli_paths.contains(&path))
}

/// Return the direct-child count and whether the sole foreground chain is a
/// known coding CLI. Ambiguous/background jobs never receive typed exit input.
fn inspect_children(pid: u32) -> AppResult<(usize, bool)> {
    let mut sys = System::new();
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::new()
            .with_cmd(UpdateKind::OnlyIfNotSet)
            .with_exe(UpdateKind::OnlyIfNotSet),
    );
    let target = Pid::from_u32(pid);
    let shell = sys
        .process(target)
        .ok_or_else(|| AppError::General("Terminal process is no longer running".into()))?;
    if shell.status() == sysinfo::ProcessStatus::Zombie {
        return Err(AppError::General("Terminal process has exited".into()));
    }
    let mut roots = sys
        .processes()
        .values()
        .filter(|process| process.parent() == Some(target));
    let first = roots.next().map(|process| process.pid());
    let count = usize::from(first.is_some()) + roots.count();
    if count != 1 {
        return Ok((count, false));
    }
    let cli_paths: Vec<PathBuf> = [CodingCli::Omp, CodingCli::Pi]
        .into_iter()
        .filter_map(|cli| resolve_executable(cli).ok()?.canonicalize().ok())
        .collect();
    let mut current = first;
    for _ in 0..8 {
        let Some(process) = current.and_then(|pid| sys.process(pid)) else {
            break;
        };
        if matches_cli_process(process.exe(), process.cmd(), &cli_paths) {
            return Ok((count, true));
        }
        // npm's Windows command shim can add a cmd.exe -> node.exe layer.
        let mut children = sys
            .processes()
            .values()
            .filter(|child| child.parent() == Some(process.pid()));
        current = children.next().map(|child| child.pid());
        if children.next().is_some() {
            break;
        }
    }
    Ok((count, false))
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
    let session = run_blocking(move || {
        TerminalSession::spawn(app, initial_dir.as_deref(), r, c).map_err(AppError::General)
    })
    .await?;

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

/// Give a recognized coding CLI a chance to cancel and exit before closing the PTY.
#[tauri::command]
pub async fn kill_terminal(state: State<'_, TerminalState>, session_id: String) -> AppResult<()> {
    // Transfer ownership before any process scan or wait; never hold the global
    // session lock while stopping a PTY or waiting for the child to exit.
    let session = {
        let mut sessions = state
            .sessions
            .lock()
            .map_err(|_| AppError::General("Terminal state lock poisoned".to_string()))?;
        sessions.remove(&session_id)
    };
    if let Some(session) = session {
        run_blocking(move || {
            if let Some(pid) = session.child_pid() {
                if inspect_children(pid).is_ok_and(|(_, coding_cli)| coding_cli) {
                    let _ = session.write("\u{3}");
                    std::thread::sleep(std::time::Duration::from_millis(100));
                    let _ = session.write("\u{4}");
                    std::thread::sleep(std::time::Duration::from_millis(400));
                }
            }
            drop(session);
            Ok(())
        })
        .await?;
    }
    Ok(())
}

/// CLI launches are whitelisted and rejected if terminal readiness cannot be verified.
#[tauri::command]
pub async fn launch_coding_cli(
    state: State<'_, TerminalState>,
    launch_config: State<'_, crate::coding_cli::CliLaunchConfig>,
    session_id: String,
    cli: CodingCli,
    action: CliLaunchAction,
    approval: OmpApprovalMode,
) -> AppResult<()> {
    let (pid, shell_name) = {
        let sessions = state
            .sessions
            .lock()
            .map_err(|_| AppError::General("Terminal state lock poisoned".into()))?;
        let session = sessions
            .get(&session_id)
            .ok_or_else(|| AppError::General("Terminal session not found".into()))?;
        if !session.is_alive() {
            return Err(AppError::General("Terminal process has exited".into()));
        }
        (
            session
                .child_pid()
                .ok_or_else(|| AppError::General("Terminal PID unavailable".into()))?,
            session.shell_name.clone(),
        )
    };
    let new_session_overlay = launch_config.new_session_overlay.clone();
    let command = run_blocking(move || {
        if inspect_children(pid)?.0 != 0 {
            return Err(AppError::General(
                "Terminal is busy; use an idle pane to start a CLI".into(),
            ));
        }
        build_launch_command(cli, action, approval, &shell_name, &new_session_overlay)
    })
    .await?;
    let sessions = state
        .sessions
        .lock()
        .map_err(|_| AppError::General("Terminal state lock poisoned".into()))?;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| AppError::General("Terminal session was closed".into()))?;
    if !session.is_alive() {
        return Err(AppError::General("Terminal process has exited".into()));
    }
    session
        .write(&format!("{command}\r"))
        .map_err(AppError::General)
}

#[tauri::command]
pub fn terminal_cd(state: State<TerminalState>, session_id: String, path: String) -> AppResult<()> {
    let sessions = state
        .sessions
        .lock()
        .map_err(|_| AppError::General("Terminal state lock poisoned".to_string()))?;
    if let Some(session) = sessions.get(&session_id) {
        let cmd = build_cd_command(&session.shell_name, &path);
        session.write(&cmd).map_err(|e| AppError::General(e))?;
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

    // Creation and excess-session cleanup share the bounded blocking executor.
    for _ in 0..need {
        let app = app.clone();
        let dir = initial_dir.clone();
        let warmup_arc = Arc::clone(&state.warmup);
        tauri::async_runtime::spawn(async move {
            let _ = run_blocking(move || {
                let session = TerminalSession::spawn(app, dir.as_deref(), 24, 80)
                    .map_err(AppError::General)?;
                let mut warmup = warmup_arc
                    .lock()
                    .map_err(|_| AppError::General("Terminal state lock poisoned".into()))?;
                if warmup.len() < WARMUP_POOL_SIZE {
                    warmup.push_back(session);
                }
                Ok(())
            })
            .await;
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

/// Start output only after the frontend has registered its event listeners.
#[tauri::command]
pub fn terminal_subscribe(state: State<TerminalState>, session_id: String) -> AppResult<()> {
    let sessions = state
        .sessions
        .lock()
        .map_err(|_| AppError::General("Terminal state lock poisoned".to_string()))?;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| AppError::General("session not found".into()))?;
    session.subscribe_output();
    Ok(())
}

#[tauri::command]
pub fn acknowledge_terminal_output(
    state: State<TerminalState>,
    session_id: String,
    sequence: u64,
) -> AppResult<()> {
    let sessions = state
        .sessions
        .lock()
        .map_err(|_| AppError::General("Terminal state lock poisoned".to_string()))?;
    if let Some(session) = sessions.get(&session_id) {
        session
            .acknowledge_output(sequence)
            .map_err(AppError::General)?;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cli_detection_matches_entrypoints_not_prompt_arguments_or_name_substrings() {
        let directory =
            std::env::temp_dir().join(format!("shiguang-cli-match-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&directory).unwrap();
        let entry = directory.join("pi");
        let server = directory.join("api-server.js");
        std::fs::write(&entry, "").unwrap();
        std::fs::write(&server, "").unwrap();
        let paths = [entry.canonicalize().unwrap()];
        let node = Path::new("node");
        let real_args = vec![OsString::from("node"), entry.clone().into_os_string()];
        let other_args = vec![
            OsString::from("node"),
            server.into_os_string(),
            entry.into_os_string(),
        ];
        let real_cli = matches_cli_process(Some(node), &real_args, &paths);
        let other_program = matches_cli_process(Some(node), &other_args, &paths);
        let misleading_name = matches_cli_process(Some(Path::new("pip")), &[], &paths);
        std::fs::remove_dir_all(directory).unwrap();
        assert!(real_cli);
        assert!(!other_program);
        assert!(!misleading_name);
    }
}
