use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Git error: {0}")]
    Git(#[from] git2::Error),

    #[error("Keychain error: {0}")]
    Keychain(String),

    #[error("Provider error: {0}")]
    Provider(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("{0}")]
    General(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        #[derive(Serialize)]
        struct ErrorPayload {
            code: String,
            message: String,
        }

        let payload = ErrorPayload {
            code: match self {
                AppError::Database(_) => "DATABASE_ERROR",
                AppError::Git(_) => "GIT_ERROR",
                AppError::Keychain(_) => "KEYCHAIN_ERROR",
                AppError::Provider(_) => "PROVIDER_ERROR",
                AppError::Io(_) => "IO_ERROR",
                AppError::Network(_) => "NETWORK_ERROR",
                AppError::Json(_) => "JSON_ERROR",
                AppError::General(_) => "GENERAL_ERROR",
            }
            .to_string(),
            message: self.to_string(),
        };

        payload.serialize(serializer)
    }
}

pub type AppResult<T> = Result<T, AppError>;
