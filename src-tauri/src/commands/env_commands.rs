use crate::errors::{AppError, AppResult};

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

/// 通过后端 HTTP client 请求指定 URL，返回文本内容
#[tauri::command]
pub async fn fetch_url(
    state: tauri::State<'_, crate::state::AppState>,
    url: String,
) -> AppResult<String> {
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
