use crate::errors::{AppError, AppResult};
use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};

#[derive(Debug, Serialize, Clone)]
pub struct EnvCheckResult {
    pub node_installed: bool,
    pub node_version: Option<String>,
    pub npm_installed: bool,
    pub npm_version: Option<String>,
    pub brew_installed: bool,
    pub claude_installed: bool,
    pub claude_version: Option<String>,
    pub claude_install_method: Option<String>, // "npm" | "brew"
    pub platform: String,
}

/// Run a command and return trimmed stdout, or None if it fails.
fn run_version_cmd(program: &str, args: &[&str]) -> Option<String> {
    Command::new(program)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if s.is_empty() { None } else { Some(s) }
        })
}

/// Check if a global npm package is installed.
fn is_npm_global(package: &str) -> bool {
    Command::new("npm")
        .args(["list", "-g", package, "--depth=0"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Check if a brew formula is installed (macOS only).
fn is_brew_installed(formula: &str) -> bool {
    Command::new("brew")
        .args(["list", formula])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[tauri::command]
pub fn check_environment() -> AppResult<EnvCheckResult> {
    use std::thread;

    // Phase 1: run all version checks in parallel
    let h_node = thread::spawn(|| run_version_cmd("node", &["--version"]));
    let h_npm = thread::spawn(|| run_version_cmd("npm", &["--version"]));
    let h_brew = thread::spawn(|| {
        if cfg!(target_os = "macos") {
            run_version_cmd("brew", &["--version"])
        } else {
            None
        }
    });
    let h_claude = thread::spawn(|| run_version_cmd("claude", &["--version"]));

    let node_version = h_node.join().unwrap_or(None);
    let npm_version = h_npm.join().unwrap_or(None);
    let brew_installed = h_brew.join().unwrap_or(None).is_some();
    let claude_version = h_claude.join().unwrap_or(None);
    let claude_installed = claude_version.is_some();

    // Phase 2: detect install method only if CLI is present (parallel)
    let claude_install_method = if claude_installed {
        let h_npm_check = thread::spawn(|| is_npm_global("@anthropic-ai/claude-code"));
        let check_brew = cfg!(target_os = "macos") && brew_installed;
        let h_brew_check = thread::spawn(move || {
            if check_brew { is_brew_installed("claude") } else { false }
        });

        let via_npm = h_npm_check.join().unwrap_or(false);
        let via_brew = h_brew_check.join().unwrap_or(false);

        if via_npm {
            Some("npm".to_string())
        } else if via_brew {
            Some("brew".to_string())
        } else {
            None
        }
    } else {
        None
    };

    let platform = if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    }
    .to_string();

    Ok(EnvCheckResult {
        node_installed: node_version.is_some(),
        node_version,
        npm_installed: npm_version.is_some(),
        npm_version,
        brew_installed,
        claude_installed,
        claude_version,
        claude_install_method,
        platform,
    })
}

#[derive(Debug, Serialize, Clone)]
struct InstallOutput {
    line: String,
}

#[derive(Debug, Serialize, Clone)]
struct InstallDone {
    success: bool,
    error: Option<String>,
}

#[tauri::command]
pub async fn run_install_command(
    app: tauri::AppHandle,
    command_type: String,
    method: String,
) -> AppResult<()> {
    use tauri::Emitter;

    let (program, args): (&str, Vec<&str>) = match (command_type.as_str(), method.as_str()) {
        ("install_node", "brew") => ("brew", vec!["install", "node"]),
        ("install_cli", "npm") => ("npm", vec!["install", "-g", "@anthropic-ai/claude-code"]),
        ("install_cli", "brew") => ("brew", vec!["install", "claude"]),
        ("update_cli", _) => ("claude", vec!["update"]),
        _ => {
            return Err(AppError::General(format!(
                "Unknown command: {} / {}",
                command_type, method
            )));
        }
    };

    let display_cmd = format!("$ {} {}", program, args.join(" "));
    let _ = app.emit("install-output", InstallOutput { line: display_cmd });

    let mut child = Command::new(program)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::General(format!("Failed to spawn {}: {}", program, e)))?;

    // Stream stdout
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let app_out = app.clone();
    let app_err = app.clone();

    let stdout_handle = std::thread::spawn(move || {
        if let Some(out) = stdout {
            let reader = BufReader::new(out);
            for line in reader.lines() {
                if let Ok(line) = line {
                    let _ = app_out.emit("install-output", InstallOutput { line });
                }
            }
        }
    });

    let stderr_handle = std::thread::spawn(move || {
        let mut err_lines = Vec::new();
        if let Some(err) = stderr {
            let reader = BufReader::new(err);
            for line in reader.lines() {
                if let Ok(line) = line {
                    let _ = app_err.emit("install-output", InstallOutput { line: line.clone() });
                    err_lines.push(line);
                }
            }
        }
        err_lines
    });

    let _ = stdout_handle.join();
    let err_lines = stderr_handle.join().unwrap_or_default();

    let status = child
        .wait()
        .map_err(|e| AppError::General(format!("Failed to wait for process: {}", e)))?;

    let success = status.success();
    let error = if success {
        None
    } else {
        Some(
            err_lines
                .last()
                .cloned()
                .unwrap_or_else(|| format!("Process exited with code {}", status.code().unwrap_or(-1))),
        )
    };

    let _ = app.emit("install-done", InstallDone { success, error });

    Ok(())
}
