use crate::errors::{AppError, AppResult};

const SERVICE_NAME: &str = "shiguang-ai-coding";

pub fn get_api_key(provider: &str) -> AppResult<String> {
    let entry = keyring::Entry::new(SERVICE_NAME, provider)
        .map_err(|e| AppError::Keychain(e.to_string()))?;
    entry
        .get_password()
        .map_err(|e| AppError::Keychain(format!("No API key found for {}: {}", provider, e)))
}
