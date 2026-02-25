use std::sync::RwLock;

static PROXY_URL: RwLock<Option<String>> = RwLock::new(None);

/// Set the global proxy URL. `None` or empty string clears the proxy.
pub fn set_url(url: Option<String>) {
    let url = url.filter(|s| !s.trim().is_empty());
    let mut guard = PROXY_URL.write().unwrap();
    *guard = url;
}

/// Get the current proxy URL, or `None` if unset.
pub fn get_url() -> Option<String> {
    PROXY_URL.read().unwrap().clone()
}

/// Return proxy environment variable pairs for subprocess injection.
/// Covers http_proxy, https_proxy (lowercase), HTTP_PROXY, HTTPS_PROXY, ALL_PROXY.
/// Returns an empty vec when no proxy is configured.
pub fn env_pairs() -> Vec<(&'static str, String)> {
    let url = match get_url() {
        Some(u) => u,
        None => return Vec::new(),
    };
    vec![
        ("http_proxy", url.clone()),
        ("https_proxy", url.clone()),
        ("HTTP_PROXY", url.clone()),
        ("HTTPS_PROXY", url.clone()),
        ("ALL_PROXY", url),
    ]
}

/// Build a `reqwest::Client` with optional proxy.
pub fn build_http_client(proxy_url: Option<&str>) -> Result<reqwest::Client, reqwest::Error> {
    let mut builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120));

    if let Some(url) = proxy_url.filter(|s| !s.trim().is_empty()) {
        builder = builder.proxy(reqwest::Proxy::all(url)?);
    }

    builder.build()
}
