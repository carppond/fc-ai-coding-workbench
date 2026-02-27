use crate::errors::{AppError, AppResult};
use crate::providers::{ChatMessage, StreamChunk};
use futures_util::StreamExt;
use tauri::Emitter;
use tokio::sync::watch;

pub async fn stream_chat(
    app: tauri::AppHandle,
    client: reqwest::Client,
    api_key: &str,
    base_url: &str,
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

    let mut all_messages = vec![serde_json::json!({
        "role": "system",
        "content": system_prompt
    })];

    for msg in messages {
        all_messages.push(serde_json::json!({
            "role": msg.role,
            "content": msg.content
        }));
    }

    let body = serde_json::json!({
        "model": model,
        "messages": all_messages,
        "stream": true,
        "temperature": 0.7,
    });

    let url = format!("{}/chat/completions", base_url);
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
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
            "API error {}: {}",
            status, text
        )));
    }

    let event_name = format!("stream-chunk-{}", thread_id);
    let mut stream = response.bytes_stream();

    let mut buffer = String::new();

    while let Some(chunk_result) = stream.next().await {
        // Check cancellation
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

        // Process complete SSE lines
        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim().to_string();
            buffer = buffer[line_end + 1..].to_string();

            if line.is_empty() || line.starts_with(':') {
                continue;
            }

            if let Some(data) = line.strip_prefix("data: ") {
                if data.trim() == "[DONE]" {
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

                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(delta) = parsed["choices"][0]["delta"]["content"].as_str() {
                        let _ = app.emit(
                            &event_name,
                            StreamChunk {
                                delta: delta.to_string(),
                                done: false,
                                error: None,
                            },
                        );
                    }
                }
            }
        }
    }

    // Final done signal
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

pub async fn test_connection(
    client: &reqwest::Client,
    api_key: &str,
    base_url: &str,
) -> AppResult<bool> {
    let url = format!("{}/models", base_url);
    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| AppError::Provider(e.to_string()))?;

    Ok(response.status().is_success())
}
