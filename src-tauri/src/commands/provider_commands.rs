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
            providers::anthropic::stream_chat(
                app, client, &api_key, &model, &mode, &messages, &thread_id, rx,
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
            providers::anthropic::test_connection(&client, &api_key).await
        }
        _ => {
            let url = base_url.unwrap_or_else(|| providers::default_base_url(&provider));
            providers::openai::test_connection(&client, &api_key, &url).await
        }
    }
}

#[tauri::command]
pub async fn generate_commit_message(
    state: State<'_, AppState>,
    project_path: String,
    provider: String,
    model: String,
    base_url: Option<String>,
) -> AppResult<String> {
    let diff = crate::git::diff_staged(&project_path)?;
    if diff.trim().is_empty() {
        return Err(AppError::Provider("No staged changes".to_string()));
    }

    // Truncate very large diffs to avoid exceeding token limits
    let max_len = 15000;
    let truncated_diff = if diff.len() > max_len {
        format!("{}...\n\n(diff truncated)", &diff[..max_len])
    } else {
        diff
    };

    let system_prompt = "You are a commit message generator. Output ONLY the commit message, nothing else. No quotes, no explanation, no markdown.";
    let user_message = format!(
        "Generate a concise git commit message for the following staged changes.\n\
         Rules:\n\
         - Use Conventional Commits format (feat:, fix:, refactor:, docs:, chore:, test:, style:, perf:, ci:, build:)\n\
         - Keep the subject line under 72 characters\n\
         - Write in English\n\
         - Use the most relevant type prefix based on the primary change\n\
         - Add a short body (separated by blank line) only if the changes are complex\n\
         - Output ONLY the commit message text\n\n\
         Staged diff:\n```\n{}\n```",
        truncated_diff
    );

    let api_key = crate::keychain::get_api_key(&provider)?;
    let client = state.http_client.read().unwrap().clone();

    let result = match provider.as_str() {
        "anthropic" => {
            providers::anthropic::generate_text(
                &client, &api_key, &model, system_prompt, &user_message,
            )
            .await?
        }
        _ => {
            let url = base_url.unwrap_or_else(|| providers::default_base_url(&provider));
            providers::openai::generate_text(
                &client, &api_key, &url, &model, system_prompt, &user_message,
            )
            .await?
        }
    };

    Ok(result.trim().to_string())
}
