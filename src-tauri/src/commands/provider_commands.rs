use crate::errors::{AppError, AppResult};
use crate::providers;
use crate::state::AppState;
use tauri::{AppHandle, State};

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

    // 截断过大的 diff，避免超出 token 限制
    let max_len = 15000;
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
    // macOS 打包 .app 从 Finder/Dock 启动时环境变量不完整，
    // 通过登录 shell (-l) 运行，自动 source 用户的 shell 配置文件以获取完整环境
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let mut cmd = tokio::process::Command::new(&shell);
    // 将 prompt 通过环境变量传递，避免 shell 转义问题
    cmd.args(["-l", "-c", "claude -p \"$__CLAUDE_PROMPT__\""])
        .current_dir(&project_path)
        .env("__CLAUDE_PROMPT__", &prompt)
        .env("HOME", dirs::home_dir().unwrap_or_default())
        .env("TERM", "xterm-256color");
    for (k, v) in crate::proxy::env_pairs() {
        cmd.env(k, v);
    }
    let output = cmd.output()
        .await
        .map_err(|e| AppError::Provider(format!("Failed to run claude CLI: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if !stderr.is_empty() { stderr } else { stdout };
        let home = dirs::home_dir().map(|p| p.display().to_string()).unwrap_or_else(|| "(none)".into());
        let diag = format!(
            "claude CLI error: {}\n\n[诊断信息]\nSHELL: {}\nHOME: {}\nPATH: {}\nexit_code: {:?}",
            detail.trim(),
            shell,
            home,
            crate::commands::setup_commands::user_shell_path(),
            output.status.code(),
        );
        return Err(AppError::Provider(diag));
    }

    let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(result)
}
