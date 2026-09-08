use crate::commands::setup_commands::user_shell_path;
use crate::errors::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CodingCli {
    Omp,
    Pi,
}

impl CodingCli {
    pub(crate) fn executable(self) -> &'static str {
        match self {
            Self::Omp => "omp",
            Self::Pi => "pi",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CliLaunchAction {
    New,
    Continue,
    Resume,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum OmpApprovalMode {
    Default,
    AlwaysAsk,
    AutoApprove,
}

/// Per-application launch overrides live outside all user CLI configuration.
pub(crate) struct CliLaunchConfig {
    pub new_session_overlay: PathBuf,
}

impl CliLaunchConfig {
    pub(crate) fn new() -> AppResult<Self> {
        let directory =
            std::env::temp_dir().join(format!("shiguang-launch-{}", uuid::Uuid::new_v4()));
        let mut builder = std::fs::DirBuilder::new();
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        builder.create(&directory)?;
        let config = Self {
            new_session_overlay: directory.join("omp-new-session.yml"),
        };
        std::fs::write(&config.new_session_overlay, "autoResume: false\n")?;
        Ok(config)
    }
}

impl Drop for CliLaunchConfig {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.new_session_overlay);
        if let Some(directory) = self.new_session_overlay.parent() {
            let _ = std::fs::remove_dir(directory);
        }
    }
}

/// Resolve without invoking a shell or searching the project working directory.
/// Call on a blocking worker: PATH discovery and executable checks touch the filesystem.
pub(crate) fn resolve_program(program: &str, path: &str) -> AppResult<PathBuf> {
    #[cfg(windows)]
    let extensions: Vec<String> = {
        let mut extensions: Vec<String> = std::env::var("PATHEXT")
            .unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".to_string())
            .split(';')
            .filter(|extension| extension.starts_with('.') && !extension.contains(['/', '\\']))
            .map(str::to_string)
            .collect();
        if !extensions
            .iter()
            .any(|extension| extension.eq_ignore_ascii_case(".ps1"))
        {
            extensions.push(".ps1".to_string());
        }
        extensions
    };
    for directory in std::env::split_paths(path) {
        if !directory.is_absolute() {
            continue;
        }
        #[cfg(windows)]
        let candidates = extensions
            .iter()
            .map(|extension| directory.join(format!("{program}{extension}")));
        #[cfg(not(windows))]
        let candidates = std::iter::once(directory.join(program));
        for candidate in candidates {
            let Ok(metadata) = candidate.metadata() else {
                continue;
            };
            if !metadata.is_file() {
                continue;
            }
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if metadata.permissions().mode() & 0o111 == 0 {
                    continue;
                }
            }
            return Ok(candidate);
        }
    }
    Err(AppError::General(format!(
        "{program} CLI was not found in PATH; install it and refresh the environment"
    )))
}

pub(crate) fn resolve_executable(cli: CodingCli) -> AppResult<PathBuf> {
    resolve_program(cli.executable(), user_shell_path())
}

/// std::process handles .cmd/.bat dispatch and argument escaping on Windows;
/// PowerShell scripts need their interpreter explicitly.
pub(crate) fn executable_command(executable: &Path) -> tokio::process::Command {
    #[cfg(windows)]
    if executable.extension().is_some_and(|extension| {
        extension
            .to_str()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("ps1"))
    }) {
        let mut command = tokio::process::Command::new("powershell.exe");
        command.args(["-NoLogo", "-NoProfile", "-NonInteractive", "-File"]);
        command.arg(executable);
        return command;
    }
    tokio::process::Command::new(executable)
}

pub(crate) fn launch_arguments(
    cli: CodingCli,
    action: CliLaunchAction,
    approval: OmpApprovalMode,
) -> AppResult<Vec<&'static str>> {
    if cli == CodingCli::Pi && approval != OmpApprovalMode::Default {
        return Err(AppError::General(
            "Pi does not support OMP tool-approval policies".to_string(),
        ));
    }
    let mut arguments = Vec::with_capacity(2);
    match action {
        CliLaunchAction::New => {}
        CliLaunchAction::Continue => arguments.push("--continue"),
        CliLaunchAction::Resume => arguments.push("--resume"),
    }
    match approval {
        OmpApprovalMode::Default => {}
        OmpApprovalMode::AlwaysAsk => arguments.push("--approval-mode=always-ask"),
        OmpApprovalMode::AutoApprove => arguments.push("--auto-approve"),
    }
    Ok(arguments)
}

fn quote_path(executable: &Path, shell_name: &str) -> AppResult<String> {
    let path = executable
        .to_str()
        .ok_or_else(|| AppError::General("CLI executable path is not valid Unicode".to_string()))?;
    if path.chars().any(char::is_control) {
        return Err(AppError::General(
            "CLI executable path contains terminal control characters".to_string(),
        ));
    }
    let shell = shell_name
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(shell_name)
        .to_ascii_lowercase();
    match shell.as_str() {
        "powershell" | "powershell.exe" | "pwsh" | "pwsh.exe" => {
            Ok(format!("'{}'", path.replace('\'', "''")))
        }
        "cmd" | "cmd.exe" => {
            // cmd expands these even inside quotes. Refuse rather than run a different path.
            if path.contains(['%', '!', '"']) {
                return Err(AppError::General(
                    "CLI executable path cannot be safely quoted for cmd; use PowerShell"
                        .to_string(),
                ));
            }
            Ok(format!("\"{path}\""))
        }
        "fish" => Ok(format!(
            "'{}'",
            path.replace('\\', "\\\\").replace('\'', "\\'")
        )),
        _ => Ok(format!("'{}'", path.replace('\'', "'\\''"))),
    }
}

fn quote_executable(executable: &Path, shell_name: &str) -> AppResult<String> {
    let quoted = quote_path(executable, shell_name)?;
    match shell_name.to_ascii_lowercase().as_str() {
        "powershell" | "powershell.exe" | "pwsh" | "pwsh.exe" => Ok(format!("& {quoted}")),
        "cmd" | "cmd.exe"
            if executable.extension().is_some_and(|extension| {
                extension
                    .to_str()
                    .is_some_and(|extension| extension.eq_ignore_ascii_case("ps1"))
            }) =>
        {
            Ok(format!("powershell.exe -NoLogo -NoProfile -File {quoted}"))
        }
        _ => Ok(quoted),
    }
}

pub(crate) fn build_launch_command(
    cli: CodingCli,
    action: CliLaunchAction,
    approval: OmpApprovalMode,
    shell_name: &str,
    new_session_overlay: &Path,
) -> AppResult<String> {
    let arguments = launch_arguments(cli, action, approval)?;
    let executable = resolve_executable(cli)?;
    let mut command = quote_executable(&executable, shell_name)?;
    for argument in arguments {
        command.push(' ');
        command.push_str(argument);
    }
    if cli == CodingCli::Omp && action == CliLaunchAction::New {
        // A user may enable autoResume globally. New must still mean new.
        command.push_str(" --config ");
        command.push_str(&quote_path(new_session_overlay, shell_name)?);
    }
    Ok(command)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pi_rejects_omp_approval_instead_of_granting_project_trust() {
        assert!(launch_arguments(
            CodingCli::Pi,
            CliLaunchAction::New,
            OmpApprovalMode::AutoApprove
        )
        .is_err());
    }

    #[cfg(unix)]
    #[test]
    fn unix_shell_executes_the_literal_selected_path() {
        use std::os::unix::fs::PermissionsExt;
        let directory = std::env::temp_dir().join(format!("shiguang-cli-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&directory).unwrap();
        let executable = directory.join("it's\\omp; echo injected");
        std::fs::write(&executable, "#!/bin/sh\nprintf '%s' \"$1\"\n").unwrap();
        std::fs::set_permissions(&executable, std::fs::Permissions::from_mode(0o755)).unwrap();
        let command = format!("{} --resume", quote_executable(&executable, "sh").unwrap());
        let output = std::process::Command::new("/bin/sh")
            .args(["-c", &command])
            .output()
            .unwrap();
        std::fs::remove_dir_all(directory).unwrap();
        assert!(output.status.success());
        assert_eq!(output.stdout, b"--resume");
    }

    #[test]
    fn unsafe_terminal_paths_fail_instead_of_expanding_or_injecting_commands() {
        assert!(quote_executable(Path::new("C:\\%USER%\\omp.cmd"), "cmd").is_err());
        assert!(quote_executable(Path::new("/tmp/omp\nexit"), "fish").is_err());
    }
}
