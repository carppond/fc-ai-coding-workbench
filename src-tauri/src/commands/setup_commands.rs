use super::command_output_with_timeout;
use crate::coding_cli::{executable_command, resolve_executable, resolve_program, CodingCli};
use crate::errors::{AppError, AppResult};
use serde::Serialize;
use std::path::Path;
#[cfg(windows)]
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::OnceLock;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

#[derive(Debug, Serialize, Clone)]
pub struct EnvCheckResult {
    pub git_installed: bool,
    pub git_version: Option<String>,
    pub node_installed: bool,
    pub node_version: Option<String>,
    pub npm_installed: bool,
    pub npm_version: Option<String>,
    pub brew_installed: bool,
    pub bun_installed: bool,
    pub bun_version: Option<String>,
    pub clis: CliStatuses,
    pub platform: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct CliStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub install_method: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct CliStatuses {
    pub omp: CliStatus,
    pub pi: CliStatus,
}

#[derive(Debug, Serialize, Clone)]
pub struct CliUpdateResult {
    pub latest_version: String,
    pub update_available: bool,
}

/// Get the user's full PATH by scanning the filesystem for common tool locations.
///
/// macOS GUI apps (.app) inherit only the minimal system PATH (/usr/bin:/bin:/usr/sbin:/sbin),
/// which doesn't include Homebrew, nvm, volta, fnm, or npm global bin paths.
/// Instead of running a shell (which can hang), we detect paths by checking the filesystem.
/// The result is cached via OnceLock.
pub fn user_shell_path() -> &'static str {
    static CACHED: OnceLock<String> = OnceLock::new();
    CACHED.get_or_init(|| {
        #[cfg(not(target_os = "windows"))]
        {
            let home = std::env::var("HOME").unwrap_or_default();
            let current = std::env::var("PATH").unwrap_or_default();
            let mut extra: Vec<String> = Vec::new();

            // Homebrew
            for p in &["/opt/homebrew/bin", "/opt/homebrew/sbin", "/usr/local/bin"] {
                if std::path::Path::new(p).is_dir() {
                    extra.push(p.to_string());
                }
            }

            // nvm — find the default node version's bin directory
            let nvm_dir = std::env::var("NVM_DIR").unwrap_or_else(|_| format!("{}/.nvm", home));
            if std::path::Path::new(&nvm_dir).is_dir() {
                let alias = format!("{}/alias/default", nvm_dir);
                if let Ok(ver) = std::fs::read_to_string(&alias) {
                    let ver = ver.trim().to_string();
                    let versions_dir = format!("{}/versions/node", nvm_dir);
                    if let Ok(entries) = std::fs::read_dir(&versions_dir) {
                        // Sort entries descending so newest matching version wins
                        let mut dirs: Vec<_> = entries.flatten().collect();
                        dirs.sort_by(|a, b| b.file_name().cmp(&a.file_name()));
                        for entry in dirs {
                            let name = entry.file_name().to_string_lossy().to_string();
                            if name.starts_with(&format!("v{}", ver)) || name == ver {
                                let bin = entry.path().join("bin");
                                if bin.is_dir() {
                                    extra.push(bin.to_string_lossy().to_string());
                                    break;
                                }
                            }
                        }
                    }
                }
            }

            // volta
            let volta_bin = format!("{}/.volta/bin", home);
            if std::path::Path::new(&volta_bin).is_dir() {
                extra.push(volta_bin);
            }

            // fnm
            let fnm_bin = format!("{}/.fnm/aliases/default/bin", home);
            if std::path::Path::new(&fnm_bin).is_dir() {
                extra.push(fnm_bin);
            }

            // Cargo
            let cargo_bin = format!("{}/.cargo/bin", home);
            if std::path::Path::new(&cargo_bin).is_dir() {
                extra.push(cargo_bin);
            }

            // Include installer locations even before the directory exists: the
            // cached PATH must discover an installation made later in this run.
            extra.push(format!("{home}/.local/bin"));
            let bun_home = std::env::var("BUN_INSTALL").unwrap_or_else(|_| format!("{home}/.bun"));
            extra.push(format!("{bun_home}/bin"));

            if extra.is_empty() {
                current
            } else {
                format!("{}:{}", extra.join(":"), current)
            }
        }

        #[cfg(target_os = "windows")]
        {
            let mut paths = Vec::new();
            if let Some(local) = std::env::var_os("LOCALAPPDATA") {
                paths.push(PathBuf::from(local).join("omp"));
            }
            if let Some(appdata) = std::env::var_os("APPDATA") {
                paths.push(PathBuf::from(appdata).join("npm"));
            }
            if let Some(bun) = std::env::var_os("BUN_INSTALL") {
                paths.push(PathBuf::from(bun).join("bin"));
            } else if let Some(home) = dirs::home_dir() {
                paths.push(home.join(".bun").join("bin"));
            }
            paths.extend(std::env::split_paths(
                &std::env::var_os("PATH").unwrap_or_default(),
            ));
            std::env::join_paths(paths)
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned()
        }
    })
}

/// CLI banners may prefix their semantic version with a product name or `v`.
fn extract_semver(text: &str) -> Option<&str> {
    text.split_whitespace().find_map(|token| {
        let version = token.strip_prefix('v').unwrap_or(token);
        let core = version.split(['-', '+']).next()?;
        let mut parts = core.split('.');
        for _ in 0..3 {
            parts.next()?.parse::<u64>().ok()?;
        }
        parts.next().is_none().then_some(version)
    })
}

async fn run_version_cmd(executable: Option<&Path>, path: &str, args: &[&str]) -> Option<String> {
    let mut command = executable_command(executable?);
    command.args(args).env("PATH", path);
    command_output_with_timeout(&mut command, Duration::from_secs(5), None)
        .await
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            (!version.is_empty()).then_some(version)
        })
}

fn install_method(cli: CodingCli, executable: Option<&Path>) -> Option<String> {
    let executable = executable?;
    let resolved = executable
        .canonicalize()
        .unwrap_or_else(|_| executable.to_path_buf());
    let path = resolved
        .to_string_lossy()
        .replace('\\', "/")
        .to_ascii_lowercase();
    let method = match cli {
        CodingCli::Omp if path.contains("/cellar/omp/") || path.contains("/homebrew/") => "brew",
        CodingCli::Omp if path.contains("/.bun/") || path.contains("/bun/install/") => "bun",
        CodingCli::Omp
            if resolved.extension().is_none()
                || resolved.extension().is_some_and(|extension| {
                    extension
                        .to_str()
                        .is_some_and(|extension| extension.eq_ignore_ascii_case("exe"))
                }) =>
        {
            "native"
        }
        CodingCli::Pi if path.contains("/node_modules/") || path.contains("/npm/") => "npm",
        _ => return None,
    };
    Some(method.to_string())
}

#[tauri::command]
pub async fn check_environment() -> AppResult<EnvCheckResult> {
    // Only filesystem work runs on the bounded blocking pool. Version commands
    // have independent five-second deadlines; no registry requests occur here.
    let (path, programs, omp_method, pi_method) = super::run_blocking(|| {
        let path = user_shell_path();
        let programs = ["git", "node", "npm", "brew", "bun", "omp", "pi"]
            .map(|program| resolve_program(program, path).ok());
        let omp_method = install_method(CodingCli::Omp, programs[5].as_deref());
        let pi_method = install_method(CodingCli::Pi, programs[6].as_deref());
        Ok((path, programs, omp_method, pi_method))
    })
    .await?;
    let (
        git_version,
        node_version,
        npm_version,
        brew_version,
        bun_version,
        omp_version,
        pi_version,
    ) = tokio::join!(
        run_version_cmd(programs[0].as_deref(), path, &["--version"]),
        run_version_cmd(programs[1].as_deref(), path, &["--version"]),
        run_version_cmd(programs[2].as_deref(), path, &["--version"]),
        async {
            if cfg!(target_os = "macos") {
                run_version_cmd(programs[3].as_deref(), path, &["--version"]).await
            } else {
                None
            }
        },
        run_version_cmd(programs[4].as_deref(), path, &["--version"]),
        run_version_cmd(programs[5].as_deref(), path, &["--version"]),
        run_version_cmd(programs[6].as_deref(), path, &["--version"]),
    );
    Ok(EnvCheckResult {
        git_installed: git_version.is_some(),
        git_version,
        node_installed: node_version.is_some(),
        node_version,
        npm_installed: npm_version.is_some(),
        npm_version,
        brew_installed: brew_version.is_some(),
        bun_installed: bun_version.is_some(),
        bun_version,
        clis: CliStatuses {
            omp: CliStatus {
                installed: omp_version.is_some(),
                install_method: omp_version.as_ref().and(omp_method),
                version: omp_version,
            },
            pi: CliStatus {
                installed: pi_version.is_some(),
                install_method: pi_version.as_ref().and(pi_method),
                version: pi_version,
            },
        },
        platform: if cfg!(target_os = "macos") {
            "macos"
        } else if cfg!(windows) {
            "windows"
        } else {
            "linux"
        }
        .to_string(),
    })
}

#[tauri::command]
pub async fn check_cli_update(
    cli: CodingCli,
    installed_version: String,
) -> AppResult<CliUpdateResult> {
    let url = match cli {
        CodingCli::Omp => "https://registry.npmjs.org/@oh-my-pi%2Fpi-coding-agent/latest",
        CodingCli::Pi => "https://registry.npmjs.org/@earendil-works%2Fpi-coding-agent/latest",
    };
    let proxy = crate::proxy::get_url();
    let client = crate::proxy::build_http_client(proxy.as_deref())?;
    let metadata: serde_json::Value = client
        .get(url)
        .timeout(Duration::from_secs(10))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let latest_version = metadata
        .get("version")
        .and_then(|value| value.as_str())
        .and_then(extract_semver)
        .ok_or_else(|| {
            AppError::General(format!(
                "{} update metadata contains no valid version",
                cli.executable()
            ))
        })?
        .to_string();
    let current = extract_semver(&installed_version).ok_or_else(|| {
        AppError::General(format!(
            "Unrecognized installed {} version: {installed_version}",
            cli.executable()
        ))
    })?;
    let core = |version: &str| -> [u64; 3] {
        let mut parts = version.split(['-', '+']).next().unwrap_or("").split('.');
        std::array::from_fn(|_| parts.next().and_then(|part| part.parse().ok()).unwrap_or(0))
    };
    let current_core = core(current);
    let latest_core = core(&latest_version);
    let update_available = latest_core > current_core
        || (latest_core == current_core && current.contains('-') && !latest_version.contains('-'));
    Ok(CliUpdateResult {
        latest_version,
        update_available,
    })
}

#[derive(Debug, Serialize, Clone)]
struct InstallOutput {
    line: String,
}

#[derive(Debug, Serialize, Clone)]
struct InstallDone {
    success: bool,
    error: Option<String>,
}

async fn install_native_omp(app: &tauri::AppHandle) -> AppResult<()> {
    use tauri::Emitter;
    let platform = if cfg!(target_os = "macos") {
        "darwin"
    } else if cfg!(windows) {
        "windows"
    } else if cfg!(target_os = "linux") {
        if cfg!(target_env = "musl") {
            "linux-musl"
        } else {
            "linux"
        }
    } else {
        return Err(AppError::General(
            "OMP native installation is unsupported on this platform".to_string(),
        ));
    };
    let architecture = match std::env::consts::ARCH {
        "aarch64" => "arm64",
        "x86_64" => "x64",
        other => {
            return Err(AppError::General(format!(
                "OMP native installation is unsupported on {other}"
            )))
        }
    };
    let suffix = if cfg!(windows) { ".exe" } else { "" };
    let asset_name = format!("omp-{platform}-{architecture}{suffix}");
    let proxy = crate::proxy::get_url();
    let client = crate::proxy::build_http_client(proxy.as_deref())?;
    let release: serde_json::Value = client
        .get("https://api.github.com/repos/can1357/oh-my-pi/releases/latest")
        .header(reqwest::header::USER_AGENT, "ShiGuang")
        .timeout(Duration::from_secs(10))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let url = release
        .get("assets")
        .and_then(|assets| assets.as_array())
        .and_then(|assets| {
            assets.iter().find(|asset| {
                asset.get("name").and_then(|name| name.as_str()) == Some(asset_name.as_str())
            })
        })
        .and_then(|asset| asset.get("browser_download_url"))
        .and_then(|url| url.as_str())
        .filter(|url| url.starts_with("https://github.com/can1357/oh-my-pi/releases/download/"))
        .ok_or_else(|| {
            AppError::General(format!("No official OMP release asset for {asset_name}"))
        })?;
    let directory = super::run_blocking(|| {
        #[cfg(windows)]
        let directory = std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .map(|directory| directory.join("omp"));
        #[cfg(not(windows))]
        let directory = dirs::home_dir().map(|home| home.join(".local").join("bin"));
        directory.ok_or_else(|| {
            AppError::General("Cannot determine OMP installation directory".to_string())
        })
    })
    .await?;
    tokio::fs::create_dir_all(&directory).await?;
    let target = directory.join(format!("omp{suffix}"));
    let temporary = directory.join(format!(".omp-{}{suffix}", uuid::Uuid::new_v4()));
    let _ = app.emit(
        "install-output",
        InstallOutput {
            line: format!("Downloading {asset_name} to {}", target.display()),
        },
    );
    let result: AppResult<()> = async {
        let mut response = client
            .get(url)
            .timeout(Duration::from_secs(900))
            .send()
            .await?
            .error_for_status()?;
        let mut file = tokio::fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)
            .await?;
        while let Some(chunk) = response.chunk().await? {
            file.write_all(&chunk).await?;
        }
        file.sync_all().await?;
        drop(file);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            tokio::fs::set_permissions(&temporary, std::fs::Permissions::from_mode(0o755)).await?;
        }
        tokio::fs::rename(&temporary, &target).await?;
        Ok(())
    }
    .await;
    if result.is_err() {
        let _ = tokio::fs::remove_file(&temporary).await;
    }
    result
}

#[tauri::command]
pub async fn run_install_command(
    app: tauri::AppHandle,
    command_type: String,
    method: String,
    cli: Option<CodingCli>,
) -> AppResult<()> {
    use tauri::Emitter;
    let result: AppResult<(bool, Option<String>)> = async {
        if command_type == "install_cli" && method == "native" && cli == Some(CodingCli::Omp) {
            install_native_omp(&app).await?;
            return Ok((true, None));
        }
        let (program, args): (&str, &[&str]) = match (command_type.as_str(), method.as_str(), cli) {
            ("install_git", "brew", _) => ("brew", &["install", "git"]),
            ("install_git", "xcode", _) => ("xcode-select", &["--install"]),
            ("install_node", "brew", _) => ("brew", &["install", "node"]),
            ("install_cli", "brew", Some(CodingCli::Omp)) => ("brew", &["install", "can1357/tap/omp"]),
            ("install_cli", "bun", Some(CodingCli::Omp)) => ("bun", &["install", "-g", "@oh-my-pi/pi-coding-agent"]),
            ("install_cli", "npm", Some(CodingCli::Pi)) => ("npm", &["install", "-g", "--ignore-scripts", "@earendil-works/pi-coding-agent"]),
            ("update_cli", _, Some(CodingCli::Omp)) => ("omp", &["update"]),
            ("update_cli", _, Some(CodingCli::Pi)) => ("pi", &["update", "--self"]),
            _ => return Err(AppError::General(format!("Unsupported installation command: {command_type} / {method}; CLI installation and updates require an explicit supported CLI"))),
        };
        let (path, executable) = super::run_blocking(move || {
            let path = user_shell_path();
            let executable = match program {
                "omp" => resolve_executable(CodingCli::Omp)?,
                "pi" => resolve_executable(CodingCli::Pi)?,
                _ => resolve_program(program, path)?,
            };
            Ok((path, executable))
        }).await?;
        let _ = app.emit("install-output", InstallOutput { line: format!("$ {} {}", executable.display(), args.join(" ")) });
        let mut command = executable_command(&executable);
        command.args(args).env("PATH", path).envs(crate::proxy::env_pairs())
            .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
        let mut child = command.spawn()?;
        let stdout = child.stdout.take().unwrap();
        let stderr = child.stderr.take().unwrap();
        let output = async {
            let mut lines = BufReader::new(stdout).lines();
            while let Some(line) = lines.next_line().await? {
                let _ = app.emit("install-output", InstallOutput { line });
            }
            Ok::<_, std::io::Error>(())
        };
        let errors = async {
            let mut lines = BufReader::new(stderr).lines();
            let mut last = None;
            while let Some(line) = lines.next_line().await? {
                let _ = app.emit("install-output", InstallOutput { line: line.clone() });
                last = Some(line);
            }
            Ok::<_, std::io::Error>(last)
        };
        let ((), last_error, status) = match tokio::try_join!(output, errors, child.wait()) {
            Ok(result) => result,
            Err(error) => {
                let _ = child.kill().await;
                let _ = child.wait().await;
                return Err(error.into());
            }
        };
        let error = if status.success() { None } else {
            Some(last_error.unwrap_or_else(|| format!("Process exited with code {}", status.code().unwrap_or(-1))))
        };
        Ok((status.success(), error))
    }.await;
    match result {
        Ok((success, error)) => {
            let _ = app.emit("install-done", InstallDone { success, error });
            Ok(())
        }
        Err(error) => {
            let _ = app.emit(
                "install-done",
                InstallDone {
                    success: false,
                    error: Some(error.to_string()),
                },
            );
            Err(error)
        }
    }
}
