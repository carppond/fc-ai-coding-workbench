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

// --- Claude Resume Auto-Save ---

const RESUME_BEGIN: &str = "# ShiGuang: claude resume auto-save BEGIN";
const RESUME_END: &str = "# ShiGuang: claude resume auto-save END";

fn claude_resume_function_bash() -> &'static str {
    r#"claude() {
    local log=$(mktemp /tmp/claude_resume_XXXXXX)
    script -q "$log" command claude "$@"
    local resume=$(grep -oE 'claude --resume [a-zA-Z0-9_-]+' "$log" | tail -1)
    if [[ -n "$resume" ]]; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') | $resume" >> "$PWD/.claude_resumes.txt"
    fi
    rm -f "$log"
}"#
}

fn claude_resume_function_fish() -> &'static str {
    r#"function claude --wraps='command claude'
    set -l log (mktemp /tmp/claude_resume_XXXXXX)
    script -q $log command claude $argv
    set -l resume (grep -oE 'claude --resume [a-zA-Z0-9_-]+' $log | tail -1)
    if test -n "$resume"
        echo (date '+%Y-%m-%d %H:%M')" | $resume" >> "$PWD/.claude_resumes.txt"
    end
    rm -f $log
end"#
}

/// Check if the claude resume wrapper is installed in the user's shell config.
#[tauri::command]
pub fn get_claude_resume_enabled() -> AppResult<bool> {
    if cfg!(target_os = "windows") {
        return Ok(false);
    }
    let config_path = unix_shell_config_path().map_err(AppError::General)?;
    let content = std::fs::read_to_string(&config_path).unwrap_or_default();
    Ok(content.contains(RESUME_BEGIN))
}

/// Enable or disable the claude resume auto-save wrapper.
#[tauri::command]
pub fn set_claude_resume_enabled(enabled: bool) -> AppResult<String> {
    if cfg!(target_os = "windows") {
        return Err(AppError::General("Not supported on Windows".to_string()));
    }

    let config_path = unix_shell_config_path().map_err(AppError::General)?;
    let path = std::path::Path::new(&config_path);
    let existing = std::fs::read_to_string(path).unwrap_or_default();

    // Remove existing block if present
    let cleaned = remove_resume_block(&existing);

    let new_content = if enabled {
        let shell = std::env::var("SHELL").unwrap_or_default();
        let shell_name = std::path::Path::new(&shell)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("zsh");

        let func = if shell_name == "fish" {
            claude_resume_function_fish()
        } else {
            claude_resume_function_bash()
        };

        let mut result = cleaned.clone();
        if !result.ends_with('\n') && !result.is_empty() {
            result.push('\n');
        }
        if !result.is_empty() {
            result.push('\n');
        }
        result.push_str(RESUME_BEGIN);
        result.push('\n');
        result.push_str(func);
        result.push('\n');
        result.push_str(RESUME_END);
        result.push('\n');
        result
    } else {
        cleaned
    };

    std::fs::write(path, &new_content)
        .map_err(|e| AppError::General(format!("Failed to write {}: {}", config_path, e)))?;

    Ok(config_path.to_string())
}

/// Remove the resume block (between BEGIN and END markers) from content.
fn remove_resume_block(content: &str) -> String {
    let mut result = Vec::new();
    let mut inside_block = false;

    for line in content.lines() {
        if line.trim() == RESUME_BEGIN {
            inside_block = true;
            continue;
        }
        if line.trim() == RESUME_END {
            inside_block = false;
            continue;
        }
        if !inside_block {
            result.push(line);
        }
    }

    // Remove trailing empty lines left by block removal
    while result.last().map_or(false, |l| l.is_empty()) {
        result.pop();
    }

    let mut out = result.join("\n");
    if !out.is_empty() && !out.ends_with('\n') {
        out.push('\n');
    }
    out
}

/// 通过后端 HTTP client 请求指定 URL，返回文本内容
#[tauri::command]
pub async fn fetch_url(state: tauri::State<'_, crate::state::AppState>, url: String) -> AppResult<String> {
    state.ensure_http_client();
    let client = state.http_client.read().unwrap().clone();
    let resp = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| AppError::General(format!("Request failed: {}", e)))?;
    let text = resp
        .text()
        .await
        .map_err(|e| AppError::General(format!("Read body failed: {}", e)))?;
    Ok(text)
}
