use crate::errors::{AppError, AppResult};

const MARKER: &str = "# Added by ShiGuang AI";

/// Get the shell config file path (macOS/Linux only).
fn unix_shell_config_path() -> Result<String, String> {
    let home = std::env::var("HOME")
        .map_err(|_| "Cannot determine HOME directory".to_string())?;
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let shell_name = std::path::Path::new(&shell)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("zsh");

    let config = match shell_name {
        "bash" => format!("{}/.bashrc", home),
        "fish" => format!("{}/.config/fish/config.fish", home),
        _ => format!("{}/.zshrc", home),
    };
    Ok(config)
}

#[tauri::command]
pub fn get_shell_config_path() -> AppResult<String> {
    if cfg!(target_os = "windows") {
        // Windows uses setx to write system env vars, no config file
        Ok("Windows 系统环境变量".to_string())
    } else {
        unix_shell_config_path().map_err(AppError::General)
    }
}

#[tauri::command]
pub fn detect_platform() -> AppResult<String> {
    let platform = if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    };
    Ok(platform.to_string())
}

#[tauri::command]
pub fn write_env_to_shell(base_url: String, auth_token: String) -> AppResult<String> {
    if cfg!(target_os = "windows") {
        write_env_windows(&base_url, &auth_token)
    } else {
        write_env_unix(&base_url, &auth_token)
    }
}

/// Windows: use `setx` to set permanent user-level environment variables.
/// These are visible in System Properties → Environment Variables.
fn write_env_windows(base_url: &str, auth_token: &str) -> AppResult<String> {
    // setx sets user-level env vars permanently (visible in system settings)
    let output1 = std::process::Command::new("setx")
        .args(["ANTHROPIC_BASE_URL", base_url])
        .output()
        .map_err(|e| AppError::General(format!("Failed to run setx: {}", e)))?;

    if !output1.status.success() {
        let err = String::from_utf8_lossy(&output1.stderr);
        return Err(AppError::General(format!("setx ANTHROPIC_BASE_URL failed: {}", err)));
    }

    let output2 = std::process::Command::new("setx")
        .args(["ANTHROPIC_AUTH_TOKEN", auth_token])
        .output()
        .map_err(|e| AppError::General(format!("Failed to run setx: {}", e)))?;

    if !output2.status.success() {
        let err = String::from_utf8_lossy(&output2.stderr);
        return Err(AppError::General(format!("setx ANTHROPIC_AUTH_TOKEN failed: {}", err)));
    }

    // Also set in current process so the app's terminal inherits them
    std::env::set_var("ANTHROPIC_BASE_URL", base_url);
    std::env::set_var("ANTHROPIC_AUTH_TOKEN", auth_token);

    Ok("Windows 系统环境变量".to_string())
}

/// macOS/Linux: append export lines to shell config file.
fn write_env_unix(base_url: &str, auth_token: &str) -> AppResult<String> {
    let config_path = unix_shell_config_path().map_err(AppError::General)?;
    let path = std::path::Path::new(&config_path);

    let existing = std::fs::read_to_string(path).unwrap_or_default();

    let base_url_line = format!("export ANTHROPIC_BASE_URL=\"{}\"", escape_dquote(base_url));
    let token_line = format!("export ANTHROPIC_AUTH_TOKEN=\"{}\"", escape_dquote(auth_token));

    let mut lines: Vec<String> = existing.lines().map(|l| l.to_string()).collect();
    let mut found_base_url = false;
    let mut found_token = false;

    for line in lines.iter_mut() {
        let trimmed = line.trim();
        if trimmed.starts_with("export ANTHROPIC_BASE_URL=") {
            *line = base_url_line.clone();
            found_base_url = true;
        } else if trimmed.starts_with("export ANTHROPIC_AUTH_TOKEN=") {
            *line = token_line.clone();
            found_token = true;
        }
    }

    if !found_base_url || !found_token {
        if !lines.is_empty() && !lines.last().map_or(true, |l| l.is_empty()) {
            lines.push(String::new());
        }
        lines.push(MARKER.to_string());
        if !found_base_url {
            lines.push(base_url_line);
        }
        if !found_token {
            lines.push(token_line);
        }
    }

    let mut content = lines.join("\n");
    if !content.ends_with('\n') {
        content.push('\n');
    }

    std::fs::write(path, &content)
        .map_err(|e| AppError::General(format!("Failed to write {}: {}", config_path, e)))?;

    // Also set in current process so the app's terminal inherits them
    std::env::set_var("ANTHROPIC_BASE_URL", base_url);
    std::env::set_var("ANTHROPIC_AUTH_TOKEN", auth_token);

    Ok(config_path)
}

fn escape_dquote(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}
