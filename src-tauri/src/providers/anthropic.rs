use crate::errors::{AppError, AppResult};
use crate::providers::{ChatMessage, StreamChunk};
use futures_util::StreamExt;
use tauri::Emitter;
use tokio::sync::watch;

pub async fn stream_chat(
    app: tauri::AppHandle,
    client: reqwest::Client,
    api_key: &str,
    model: &str,
    mode: &str,
    messages: &[ChatMessage],
    thread_id: &str,
    cancel_rx: watch::Receiver<bool>,
) -> AppResult<()> {
    let system_prompt = match mode {
        "code" => "You are an expert coding assistant. Provide clear, well-structured code with explanations.",
        "ask" => "You are a helpful assistant. Answer questions clearly and concisely.",
        "architect" => "You are a software architect. Focus on design patterns, architecture decisions, and high-level planning.",
        _ => "You are a helpful assistant.",
    };

    let api_messages: Vec<serde_json::Value> = messages
        .iter()
        .map(|msg| {
            serde_json::json!({
                "role": msg.role,
                "content": msg.content
            })
        })
        .collect();

    let body = serde_json::json!({
        "model": model,
        "max_tokens": 8192,
        "system": system_prompt,
        "messages": api_messages,
        "stream": true,
    });

    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Provider(e.to_string()))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Err(AppError::Provider(format!(
            "Anthropic API error {}: {}",
            status, text
        )));
    }

    let event_name = format!("stream-chunk-{}", thread_id);
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk_result) = stream.next().await {
        if *cancel_rx.borrow() {
            let _ = app.emit(
                &event_name,
                StreamChunk {
                    delta: String::new(),
                    done: true,
                    error: Some("Cancelled".to_string()),
                },
            );
            return Ok(());
        }

        let chunk = chunk_result.map_err(|e| AppError::Provider(e.to_string()))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim().to_string();
            buffer = buffer[line_end + 1..].to_string();

            if line.is_empty() || line.starts_with(':') {
                continue;
            }

            if let Some(data) = line.strip_prefix("data: ") {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                    let event_type = parsed["type"].as_str().unwrap_or("");

                    match event_type {
                        "content_block_delta" => {
                            if let Some(text) = parsed["delta"]["text"].as_str() {
                                let _ = app.emit(
                                    &event_name,
                                    StreamChunk {
                                        delta: text.to_string(),
                                        done: false,
                                        error: None,
                                    },
                                );
                            }
                        }
                        "message_stop" => {
                            let _ = app.emit(
                                &event_name,
                                StreamChunk {
                                    delta: String::new(),
                                    done: true,
                                    error: None,
                                },
                            );
                            return Ok(());
                        }
                        "error" => {
                            let msg = parsed["error"]["message"]
                                .as_str()
                                .unwrap_or("Unknown error");
                            let _ = app.emit(
                                &event_name,
                                StreamChunk {
                                    delta: String::new(),
                                    done: true,
                                    error: Some(msg.to_string()),
                                },
                            );
                            return Ok(());
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    let _ = app.emit(
        &event_name,
        StreamChunk {
            delta: String::new(),
            done: true,
            error: None,
        },
    );

    Ok(())
}

pub async fn generate_text(
    client: &reqwest::Client,
    api_key: &str,
    model: &str,
    system_prompt: &str,
    user_message: &str,
) -> AppResult<String> {
    let body = serde_json::json!({
        "model": model,
        "max_tokens": 1024,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_message}],
    });

    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Provider(e.to_string()))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Err(AppError::Provider(format!(
            "Anthropic API error {}: {}",
            status, text
        )));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| AppError::Provider(e.to_string()))?;

    let text = json["content"][0]["text"]
        .as_str()
        .unwrap_or("")
        .to_string();

    Ok(text)
}

pub async fn test_connection(
    client: &reqwest::Client,
    api_key: &str,
) -> AppResult<bool> {
    let body = serde_json::json!({
        "model": "claude-haiku-3.5",
        "max_tokens": 1,
        "messages": [{"role": "user", "content": "hi"}]
    });

    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Provider(e.to_string()))?;

    Ok(response.status().is_success())
}
