use super::command_output_with_timeout;
use crate::coding_cli::{executable_command, resolve_program, CodingCli};
use crate::errors::{AppError, AppResult};
use crate::providers;
use crate::state::AppState;
use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::Duration;
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
    let shell_name = std::path::Path::new(&shell)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("sh");
    // fish 使用不同的参数格式
    let args: Vec<&str> = if shell_name == "fish" {
        vec!["--login", "-c", "env"]
    } else {
        vec!["-lc", "env"]
    };
    // This initializer runs only on the preload thread or a blocking worker.
    // Bound shell startup too: a hung rc script must not hold the cache forever.
    let mut command = tokio::process::Command::new(&shell);
    command.args(&args).env("HOME", &home).env("TERM", "dumb");
    let output = tauri::async_runtime::block_on(command_output_with_timeout(
        &mut command,
        Duration::from_secs(5),
        None,
    ));

    match output {
        Ok(o) if o.status.success() => {
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
            env.entry("HOME".to_string())
                .or_insert_with(|| home.display().to_string());
            env.entry("TERM".to_string())
                .or_insert_with(|| "dumb".to_string());
            env
        }
        _ => std::env::vars().collect(),
    }
}

/// 获取缓存的 shell 环境；首次初始化或等待预加载时使用阻塞线程。
async fn cached_shell_env() -> AppResult<&'static HashMap<String, String>> {
    if let Some(env) = SHELL_ENV.get() {
        return Ok(env);
    }
    super::run_blocking(|| Ok(SHELL_ENV.get_or_init(capture_shell_env))).await
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

    // Create cancel token; purge any stale tokens from previous sessions
    let (tx, rx) = tokio::sync::watch::channel(false);
    {
        let mut tokens = state.cancel_tokens.lock().unwrap();
        tokens.retain(|_, t| !t.is_closed());
        tokens.insert(thread_id.clone(), tx);
    }

    state.ensure_http_client();
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
    state.ensure_http_client();
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
pub async fn generate_commit_message(project_path: String, cli: CodingCli) -> AppResult<String> {
    let shell_env = cached_shell_env().await?;
    let (project_path, mut diff, executable, path) = super::run_blocking(move || {
        let diff = crate::git::diff_staged(&project_path)?;
        if diff.trim().is_empty() {
            return Err(AppError::Provider("No staged changes".to_string()));
        }
        let discovered_path = crate::commands::setup_commands::user_shell_path();
        let path = match shell_env.get("PATH") {
            Some(path) => format!(
                "{path}{}{discovered_path}",
                if cfg!(windows) { ";" } else { ":" }
            ),
            None => discovered_path.to_string(),
        };
        let executable = resolve_program(cli.executable(), &path)?;
        Ok((project_path, diff, executable, path))
    })
    .await?;

    // 截断过大的 diff，减少 API 响应时间
    if diff.len() > 6000 {
        let mut end = 6000;
        while !diff.is_char_boundary(end) {
            end -= 1;
        }
        diff.truncate(end);
        diff.push_str("...\n\n(diff truncated)");
    }

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
        diff
    );

    // Ephemeral, tool-free generation uses only the selected CLI's own configuration.
    // Reuse the lazy shell environment cache without copying keys between CLIs.
    let mut cmd = executable_command(&executable);
    cmd.args(["--print", "--no-session", "--no-tools", "--no-extensions"])
        .current_dir(&project_path)
        .env_clear()
        .envs(shell_env)
        .env("PATH", path)
        .env("TERM", "dumb");
    for (k, v) in crate::proxy::env_pairs() {
        cmd.env(k, v);
    }
    let output =
        command_output_with_timeout(&mut cmd, Duration::from_secs(60), Some(prompt.as_bytes()))
            .await
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::TimedOut {
                    AppError::Provider(format!("{} CLI timed out (60s)", cli.executable()))
                } else {
                    AppError::Provider(format!("Failed to run {} CLI: {}", cli.executable(), e))
                }
            })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if !stderr.is_empty() { stderr } else { stdout };
        return Err(AppError::Provider(format!(
            "{} CLI error: {}",
            cli.executable(),
            detail.trim()
        )));
    }

    let raw = String::from_utf8_lossy(&output.stdout).to_string();
    // 清除残余 ANSI 转义序列 (ESC[...X, ESC]...BEL, ESC]...ST 等)
    let cleaned = strip_ansi(&raw);
    let result = cleaned.trim().to_string();
    if result.is_empty() {
        return Err(AppError::Provider(format!(
            "{} CLI returned no commit message",
            cli.executable()
        )));
    }
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
                        if ('\x40'..='\x7e').contains(&ch) {
                            break;
                        }
                    }
                }
                // OSC 序列: ESC ] ... 终止于 BEL(\x07) 或 ST(ESC \)
                Some(']') => {
                    chars.next();
                    while let Some(&ch) = chars.peek() {
                        if ch == '\x07' {
                            chars.next();
                            break;
                        }
                        if ch == '\x1b' {
                            chars.next();
                            if chars.peek() == Some(&'\\') {
                                chars.next();
                            }
                            break;
                        }
                        chars.next();
                    }
                }
                // 其他单字符转义: ESC X
                Some(_) => {
                    chars.next();
                }
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
