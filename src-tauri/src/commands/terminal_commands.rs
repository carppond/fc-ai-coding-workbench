use crate::errors::{AppError, AppResult};
use crate::terminal::TerminalSession;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, State};

pub struct TerminalState {
    pub sessions: Mutex<HashMap<String, TerminalSession>>,
}

#[tauri::command]
pub fn spawn_terminal(
    app: AppHandle,
    state: State<TerminalState>,
    initial_dir: Option<String>,
    rows: Option<u16>,
    cols: Option<u16>,
) -> AppResult<(String, String)> {
    let r = rows.unwrap_or(24);
    let c = cols.unwrap_or(80);

    let session =
        TerminalSession::spawn(app, initial_dir.as_deref(), r, c).map_err(AppError::General)?;

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
        session
            .write(&data)
            .map_err(|e| AppError::General(e))?;
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
