use crate::errors::{AppError, AppResult};
use std::collections::HashMap;

const SERVICE_NAME: &str = "shiguang-ai-coding";

#[tauri::command]
pub fn set_api_key(provider: String, api_key: String) -> AppResult<()> {
    let entry = keyring::Entry::new(SERVICE_NAME, &provider)
        .map_err(|e| AppError::Keychain(e.to_string()))?;
    entry
        .set_password(&api_key)
        .map_err(|e| AppError::Keychain(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub fn has_api_key(provider: String) -> AppResult<bool> {
    let entry = keyring::Entry::new(SERVICE_NAME, &provider)
        .map_err(|e| AppError::Keychain(e.to_string()))?;
    match entry.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => Err(AppError::Keychain(e.to_string())),
    }
}

#[tauri::command]
pub fn delete_api_key(provider: String) -> AppResult<()> {
    let entry = keyring::Entry::new(SERVICE_NAME, &provider)
        .map_err(|e| AppError::Keychain(e.to_string()))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::Keychain(e.to_string())),
    }
}

#[tauri::command]
pub fn detect_env_api_keys() -> AppResult<HashMap<String, String>> {
    let env_map = [
        ("openai", &["OPENAI_API_KEY", "OPENAI_KEY"][..]),
        ("openrouter", &["OPENROUTER_API_KEY", "OPENROUTER_KEY"][..]),
        ("anthropic", &["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"][..]),
    ];

    let mut found = HashMap::new();
    for (provider, vars) in env_map {
        for var in vars {
            if let Ok(val) = std::env::var(var) {
                if !val.is_empty() {
                    found.insert(provider.to_string(), val);
                    break;
                }
            }
        }
    }
    Ok(found)
}
