use crate::errors::{AppError, AppResult};
use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::sync::OnceLock;

#[derive(Debug, Serialize, Clone)]
pub struct EnvCheckResult {
    pub git_installed: bool,
    pub git_version: Option<String>,
    pub node_installed: bool,
    pub node_version: Option<String>,
    pub npm_installed: bool,
    pub npm_version: Option<String>,
    pub brew_installed: bool,
    pub claude_installed: bool,
    pub claude_version: Option<String>,
    pub claude_install_method: Option<String>, // "npm" | "brew"
    pub claude_latest_version: Option<String>,
    pub claude_update_available: bool,
    pub platform: String,
}

/// Get the user's full PATH by scanning the filesystem for common tool locations.
///
/// macOS GUI apps (.app) inherit only the minimal system PATH (/usr/bin:/bin:/usr/sbin:/sbin),
/// which doesn't include Homebrew, nvm, volta, fnm, or npm global bin paths.
/// Instead of running a shell (which can hang), we detect paths by checking the filesystem.
/// The result is cached via OnceLock.
pub fn user_shell_path() -> &'static str {
    static CACHED: OnceLock<String> = OnceLock::new();
    CACHED.get_or_init(|| {
        #[cfg(not(target_os = "windows"))]
        {
            let home = std::env::var("HOME").unwrap_or_default();
            let current = std::env::var("PATH").unwrap_or_default();
            let mut extra: Vec<String> = Vec::new();

            // Homebrew
            for p in &["/opt/homebrew/bin", "/opt/homebrew/sbin", "/usr/local/bin"] {
                if std::path::Path::new(p).is_dir() {
                    extra.push(p.to_string());
                }
            }

            // nvm — find the default node version's bin directory
            let nvm_dir = std::env::var("NVM_DIR")
                .unwrap_or_else(|_| format!("{}/.nvm", home));
            if std::path::Path::new(&nvm_dir).is_dir() {
                let alias = format!("{}/alias/default", nvm_dir);
                if let Ok(ver) = std::fs::read_to_string(&alias) {
                    let ver = ver.trim().to_string();
                    let versions_dir = format!("{}/versions/node", nvm_dir);
                    if let Ok(entries) = std::fs::read_dir(&versions_dir) {
                        // Sort entries descending so newest matching version wins
                        let mut dirs: Vec<_> = entries.flatten().collect();
                        dirs.sort_by(|a, b| b.file_name().cmp(&a.file_name()));
                        for entry in dirs {
                            let name = entry.file_name().to_string_lossy().to_string();
                            if name.starts_with(&format!("v{}", ver)) || name == ver {
                                let bin = entry.path().join("bin");
                                if bin.is_dir() {
                                    extra.push(bin.to_string_lossy().to_string());
                                    break;
                                }
                            }
                        }
                    }
                }
            }

            // volta
            let volta_bin = format!("{}/.volta/bin", home);
            if std::path::Path::new(&volta_bin).is_dir() {
                extra.push(volta_bin);
            }

            // fnm
            let fnm_bin = format!("{}/.fnm/aliases/default/bin", home);
            if std::path::Path::new(&fnm_bin).is_dir() {
                extra.push(fnm_bin);
            }

            // Cargo
            let cargo_bin = format!("{}/.cargo/bin", home);
            if std::path::Path::new(&cargo_bin).is_dir() {
                extra.push(cargo_bin);
            }

            // ~/.local/bin
            let local_bin = format!("{}/.local/bin", home);
            if std::path::Path::new(&local_bin).is_dir() {
                extra.push(local_bin);
            }

            if extra.is_empty() {
                current
            } else {
                format!("{}:{}", extra.join(":"), current)
            }
        }

        #[cfg(target_os = "windows")]
        {
            std::env::var("PATH").unwrap_or_default()
        }
    })
}

/// Extract a semver-like version string (e.g. "2.1.55") from text like "2.1.55 (Claude Code)"
fn extract_semver(s: &str) -> &str {
    // Take the first whitespace-delimited token, strip leading 'v'
    let token = s.split_whitespace().next().unwrap_or("");
    token.strip_prefix('v').unwrap_or(token)
}

/// Run a command with the user's full PATH and return trimmed stdout, or None if it fails.
/// This is used for local version checks (node --version, etc.) — no proxy needed.
fn run_version_cmd(program: &str, args: &[&str]) -> Option<String> {
    Command::new(program)
        .args(args)
        .env("PATH", user_shell_path())
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

/// Check if a global npm package is installed (local check, no proxy needed).
fn is_npm_global(package: &str) -> bool {
    Command::new("npm")
        .args(["list", "-g", package, "--depth=0"])
        .env("PATH", user_shell_path())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Check if a brew formula is installed (macOS only, local check, no proxy needed).
fn is_brew_installed(formula: &str) -> bool {
    Command::new("brew")
        .args(["list", formula])
        .env("PATH", user_shell_path())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[tauri::command]
pub fn check_environment() -> AppResult<EnvCheckResult> {
    use std::thread;

    // Resolve PATH once before spawning threads (cached after first call)
    let _ = user_shell_path();

    // Phase 1: run all version checks in parallel
    let h_git = thread::spawn(|| run_version_cmd("git", &["--version"]));
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

    let git_version = h_git.join().unwrap_or(None);
    let node_version = h_node.join().unwrap_or(None);
    let npm_version = h_npm.join().unwrap_or(None);
    let brew_installed = h_brew.join().unwrap_or(None).is_some();
    let claude_version = h_claude.join().unwrap_or(None);
    let claude_installed = claude_version.is_some();

    // Phase 2: detect install method + latest version (only if CLI is present, all parallel)
    let (claude_install_method, claude_latest_version) = if claude_installed {
        let h_npm_check = thread::spawn(|| is_npm_global("@anthropic-ai/claude-code"));
        let check_brew = cfg!(target_os = "macos") && brew_installed;
        let h_brew_check = thread::spawn(move || {
            if check_brew { is_brew_installed("claude") } else { false }
        });
        let h_latest = thread::spawn(|| {
            run_version_cmd("npm", &["view", "@anthropic-ai/claude-code", "version"])
        });

        let via_npm = h_npm_check.join().unwrap_or(false);
        let via_brew = h_brew_check.join().unwrap_or(false);
        let latest = h_latest.join().unwrap_or(None);

        let method = if via_npm {
            Some("npm".to_string())
        } else if via_brew {
            Some("brew".to_string())
        } else {
            None
        };
        (method, latest)
    } else {
        (None, None)
    };

    // Compare installed vs latest version
    // claude --version returns e.g. "2.1.55 (Claude Code)", npm view returns "2.1.55"
    let claude_update_available = match (&claude_version, &claude_latest_version) {
        (Some(installed), Some(latest)) => {
            let cur = extract_semver(installed);
            let lat = extract_semver(latest);
            !cur.is_empty() && !lat.is_empty() && cur != lat
        }
        _ => false,
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
        git_installed: git_version.is_some(),
        git_version,
        node_installed: node_version.is_some(),
        node_version,
        npm_installed: npm_version.is_some(),
        npm_version,
        brew_installed,
        claude_installed,
        claude_version,
        claude_install_method,
        claude_latest_version,
        claude_update_available,
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
        ("install_git", "brew") => ("brew", vec!["install", "git"]),
        ("install_git", "xcode") => ("xcode-select", vec!["--install"]),
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

    let mut cmd = Command::new(program);
    cmd.args(&args)
        .env("PATH", user_shell_path())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for (k, v) in crate::proxy::env_pairs() {
        cmd.env(k, v);
    }
    let mut child = cmd
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
