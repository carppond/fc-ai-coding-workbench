use crate::errors::{AppError, AppResult};
use crate::providers;
use crate::state::AppState;
use std::collections::HashMap;
use std::sync::OnceLock;
use tauri::{AppHandle, State};

/// 后台预加载 shell 环境变量，应用启动时异步获取，使用时等待结果
static SHELL_ENV: OnceLock<HashMap<String, String>> = OnceLock::new();

/// 启动时调用，后台线程获取 shell 环境
pub fn preload_shell_env() {
    std::thread::spawn(|| {
        let _ = SHELL_ENV.get_or_init(capture_shell_env);
    });
}

fn capture_shell_env() -> HashMap<String, String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let home = dirs::home_dir().unwrap_or_default();
    let output = std::process::Command::new(&shell)
        .args(["-lc", "source ~/.zshrc >/dev/null 2>&1; env"])
        .env("HOME", &home)
        .env("TERM", "dumb")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .output();

    match output {
        Ok(o) => {
            let text = String::from_utf8_lossy(&o.stdout);
            let mut env = HashMap::new();
            for line in text.lines() {
                if let Some((k, v)) = line.split_once('=') {
                    if k == "_" || k == "SHLVL" || k == "PWD" || k == "OLDPWD" {
                        continue;
                    }
                    env.insert(k.to_string(), v.to_string());
                }
            }
            env.entry("HOME".to_string()).or_insert_with(|| home.display().to_string());
            env.entry("TERM".to_string()).or_insert_with(|| "dumb".to_string());
            env
        }
        Err(_) => std::env::vars().collect(),
    }
}

/// 获取缓存的 shell 环境，如果后台还没完成则等待
fn cached_shell_env() -> &'static HashMap<String, String> {
    SHELL_ENV.get_or_init(capture_shell_env)
}

#[tauri::command]
pub async fn send_message(
    app: AppHandle,
    state: State<'_, AppState>,
    thread_id: String,
    messages: Vec<providers::ChatMessage>,
    provider: String,
    model: String,
    mode: String,
    base_url: Option<String>,
) -> AppResult<()> {
    let api_key = crate::keychain::get_api_key(&provider)?;

    // Create cancel token
    let (tx, rx) = tokio::sync::watch::channel(false);
    {
        let mut tokens = state.cancel_tokens.lock().unwrap();
        tokens.insert(thread_id.clone(), tx);
    }

    let client = state.http_client.read().unwrap().clone();

    // Route to the correct provider adapter
    match provider.as_str() {
        "anthropic" => {
            let url = base_url.unwrap_or_else(|| providers::default_base_url("anthropic"));
            providers::anthropic::stream_chat(
                app, client, &api_key, &url, &model, &mode, &messages, &thread_id, rx,
            )
            .await?;
        }
        _ => {
            // OpenAI-compatible (openai, openrouter, etc.)
            let url = base_url.unwrap_or_else(|| providers::default_base_url(&provider));
            providers::openai::stream_chat(
                app, client, &api_key, &url, &model, &mode, &messages, &thread_id, rx,
            )
            .await?;
        }
    }

    // Clean up cancel token
    {
        let mut tokens = state.cancel_tokens.lock().unwrap();
        tokens.remove(&thread_id);
    }

    Ok(())
}

#[tauri::command]
pub fn stop_streaming(state: State<AppState>, thread_id: String) -> AppResult<()> {
    let tokens = state.cancel_tokens.lock().unwrap();
    if let Some(tx) = tokens.get(&thread_id) {
        let _ = tx.send(true);
    }
    Ok(())
}

#[tauri::command]
pub async fn test_api_key(
    state: State<'_, AppState>,
    provider: String,
    api_key: String,
    base_url: Option<String>,
) -> AppResult<bool> {
    let client = state.http_client.read().unwrap().clone();
    match provider.as_str() {
        "anthropic" => {
            let url = base_url.unwrap_or_else(|| providers::default_base_url("anthropic"));
            providers::anthropic::test_connection(&client, &api_key, &url).await
        }
        _ => {
            let url = base_url.unwrap_or_else(|| providers::default_base_url(&provider));
            providers::openai::test_connection(&client, &api_key, &url).await
        }
    }
}

#[tauri::command]
pub async fn generate_commit_message(
    project_path: String,
) -> AppResult<String> {
    let diff = crate::git::diff_staged(&project_path)?;
    if diff.trim().is_empty() {
        return Err(AppError::Provider("No staged changes".to_string()));
    }

    // 截断过大的 diff，减少 API 响应时间
    let max_len = 6000;
    let truncated_diff = if diff.len() > max_len {
        format!("{}...\n\n(diff truncated)", &diff[..max_len])
    } else {
        diff
    };

    let prompt = format!(
        "Generate a concise git commit message for the following staged changes.\n\
         Rules:\n\
         - Use Conventional Commits format (feat:, fix:, refactor:, docs:, chore:, test:, style:, perf:, ci:, build:)\n\
         - Keep the subject line under 72 characters\n\
         - Write in English\n\
         - Use the most relevant type prefix based on the primary change\n\
         - Add a short body (separated by blank line) only if the changes are complex\n\
         - Output ONLY the commit message text, nothing else. No quotes, no explanation, no markdown.\n\n\
         Staged diff:\n```\n{}\n```",
        truncated_diff
    );

    // 使用 claude -p 非交互模式，不创建对话历史
    // 使用懒加载的 shell 环境缓存，首次调用时获取一次，后续直接复用
    let mut cmd = tokio::process::Command::new("claude");
    cmd.args(["-p", &prompt])
        .current_dir(&project_path)
        .env_clear()
        .envs(cached_shell_env())
        .env("TERM", "dumb")
        .env_remove("CLAUDECODE");
    for (k, v) in crate::proxy::env_pairs() {
        cmd.env(k, v);
    }
    let output = tokio::time::timeout(
        std::time::Duration::from_secs(60),
        cmd.output(),
    )
    .await
    .map_err(|_| AppError::Provider("claude CLI timed out (60s)".to_string()))?
    .map_err(|e| AppError::Provider(format!("Failed to run claude CLI: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if !stderr.is_empty() { stderr } else { stdout };
        return Err(AppError::Provider(format!("claude CLI error: {}", detail.trim())));
    }

    let raw = String::from_utf8_lossy(&output.stdout).to_string();
    // 清除残余 ANSI 转义序列 (ESC[...X, ESC]...BEL, ESC]...ST 等)
    let cleaned = strip_ansi(&raw);
    // 清除 shell 初始化产生的 ^D 等杂余文本
    let result = cleaned.trim().trim_start_matches("^D").trim().to_string();
    Ok(result)
}

/// 清除字符串中的 ANSI 转义序列
fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            match chars.peek() {
                // CSI 序列: ESC [ ... 终止于 0x40-0x7E
                Some('[') => {
                    chars.next();
                    while let Some(&ch) = chars.peek() {
                        chars.next();
                        if ('\x40'..='\x7e').contains(&ch) { break; }
                    }
                }
                // OSC 序列: ESC ] ... 终止于 BEL(\x07) 或 ST(ESC \)
                Some(']') => {
                    chars.next();
                    while let Some(&ch) = chars.peek() {
                        if ch == '\x07' { chars.next(); break; }
                        if ch == '\x1b' {
                            chars.next();
                            if chars.peek() == Some(&'\\') { chars.next(); }
                            break;
                        }
                        chars.next();
                    }
                }
                // 其他单字符转义: ESC X
                Some(_) => { chars.next(); }
                None => {}
            }
        } else if c.is_control() && c != '\n' {
            // 跳过所有控制字符（保留换行）
        } else {
            out.push(c);
        }
    }
    out
}
