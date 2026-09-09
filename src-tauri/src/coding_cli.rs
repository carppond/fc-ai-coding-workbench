use crate::commands::setup_commands::user_shell_path;
use crate::errors::{AppError, AppResult};
#[cfg(windows)]
use base64::Engine;
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

fn executable_file(path: &Path) -> bool {
    let Ok(metadata) = path.metadata() else {
        return false;
    };
    if !metadata.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if metadata.permissions().mode() & 0o111 == 0 {
            return false;
        }
    }
    true
}

#[cfg(any(windows, test))]
fn windows_program_names(program: &str, path_ext: Option<&str>) -> Vec<String> {
    // Explicit extensions must not become e.g. powershell.exe.EXE or pi.cmd.CMD.
    if Path::new(program).extension().is_some() {
        return vec![program.to_string()];
    }
    let mut extensions: Vec<String> = path_ext
        .unwrap_or("")
        .split(';')
        .map(str::trim)
        .filter(|extension| {
            extension.starts_with('.')
                && extension[1..].chars().all(|c| c.is_ascii_alphanumeric())
                && extension.len() > 1
        })
        .map(str::to_string)
        .collect();
    if extensions.is_empty() {
        extensions.extend([".COM", ".EXE", ".BAT", ".CMD"].map(str::to_string));
    }
    if !extensions
        .iter()
        .any(|extension| extension.eq_ignore_ascii_case(".ps1"))
    {
        extensions.push(".ps1".to_string());
    }
    // npm installs an extensionless POSIX shim alongside .cmd/.ps1. It is not
    // executable on Windows and must never shadow the native launchers.
    let mut names: Vec<String> = Vec::with_capacity(extensions.len());
    for extension in extensions {
        let name = format!("{program}{extension}");
        if !names
            .iter()
            .any(|previous| previous.eq_ignore_ascii_case(&name))
        {
            names.push(name);
        }
    }
    names
}

/// Resolve without invoking a shell or searching the project working directory.
/// Call on a blocking worker: PATH discovery and executable checks touch the filesystem.
pub(crate) fn resolve_program(program: &str, path: &str) -> AppResult<PathBuf> {
    let explicit = Path::new(program);
    if explicit.is_absolute() && executable_file(explicit) {
        return Ok(explicit.to_path_buf());
    }
    #[cfg(windows)]
    let names = windows_program_names(program, std::env::var("PATHEXT").ok().as_deref());
    for directory in std::env::split_paths(path) {
        if !directory.is_absolute() {
            continue;
        }
        #[cfg(windows)]
        let candidates = names.iter().map(|name| directory.join(name));
        #[cfg(not(windows))]
        let candidates = std::iter::once(directory.join(program));
        for candidate in candidates {
            if executable_file(&candidate) {
                return Ok(candidate);
            }
        }
    }
    Err(AppError::General(format!(
        "{program} was not found in PATH; install it and refresh the environment"
    )))
}

pub(crate) fn resolve_executable(cli: CodingCli) -> AppResult<PathBuf> {
    resolve_program(cli.executable(), user_shell_path())
}

/// Build non-interactive invocations without changing machine execution policy.
/// PowerShell receives UTF-16 encoded script text; all arguments are quoted as
/// literals, and callers send large/multiline prompts separately through stdin.
pub(crate) fn executable_command(
    executable: &Path,
    arguments: &[&str],
) -> AppResult<tokio::process::Command> {
    #[cfg(windows)]
    if executable.extension().is_some_and(|extension| {
        extension
            .to_str()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("ps1"))
    }) {
        let script_path = quote_path(executable, "powershell")?;
        let mut script = String::from(
            "$ErrorActionPreference='Stop'; $utf8=New-Object System.Text.UTF8Encoding $false; [Console]::InputEncoding=$utf8; [Console]::OutputEncoding=$utf8; $OutputEncoding=$utf8; & "
        );
        script.push_str(&script_path);
        for argument in arguments {
            if argument.contains('\0') {
                return Err(AppError::General("Process argument contains NUL".into()));
            }
            script.push_str(" '");
            script.push_str(&argument.replace('\'', "''"));
            script.push('\'');
        }
        script.push_str("; if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }");
        let bytes: Vec<u8> = script.encode_utf16().flat_map(u16::to_le_bytes).collect();
        let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
        let powershell = resolve_program("powershell.exe", user_shell_path())?;
        let mut command = tokio::process::Command::new(powershell);
        command.args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-EncodedCommand",
            &encoded,
        ]);
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW; never applied to PTYs.
        return Ok(command);
    }
    let mut command = tokio::process::Command::new(executable);
    command.args(arguments);
    #[cfg(windows)]
    command.creation_flags(0x0800_0000);
    Ok(command)
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

pub(crate) fn quote_path(executable: &Path, shell_name: &str) -> AppResult<String> {
    let path = executable
        .to_str()
        .ok_or_else(|| AppError::General("Path is not valid Unicode".to_string()))?;
    if path.chars().any(char::is_control) {
        return Err(AppError::General(
            "Path contains terminal control characters".to_string(),
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
                    "Path cannot be safely quoted for cmd; use PowerShell".to_string(),
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
    match shell_name
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(shell_name)
        .to_ascii_lowercase()
        .as_str()
    {
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
    fn windows_extensions_do_not_select_unix_shims_or_duplicate_explicit_extensions() {
        let names = windows_program_names("pi", Some(" ;invalid; "));
        assert!(names.iter().any(|name| name.eq_ignore_ascii_case("pi.cmd")));
        assert!(!names.iter().any(|name| name == "pi"));
        assert_eq!(
            windows_program_names("powershell.exe", Some(".EXE;.CMD")),
            ["powershell.exe"]
        );
        assert_eq!(
            windows_program_names("pi", Some(".CMD;.cmd;.PS1")),
            ["pi.CMD", "pi.PS1"]
        );
    }

    #[cfg(windows)]
    #[test]
    fn windows_resolution_finds_native_files_not_extensionless_npm_shims() {
        let directory =
            std::env::temp_dir().join(format!("shiguang-resolve-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&directory).unwrap();
        std::fs::write(directory.join("pi"), "#!/bin/sh\nexit 99\n").unwrap();
        std::fs::write(directory.join("pi.cmd"), "@echo off\r\n").unwrap();
        std::fs::write(directory.join("powershell.exe"), "not an executable").unwrap();
        let path = std::env::join_paths([&directory])
            .unwrap()
            .into_string()
            .unwrap();
        let pi = resolve_program("pi", &path).unwrap();
        let powershell = resolve_program("powershell.exe", &path).unwrap();
        assert_eq!(
            pi.canonicalize().unwrap(),
            directory.join("pi.cmd").canonicalize().unwrap()
        );
        assert_eq!(powershell, directory.join("powershell.exe"));
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn windows_script_launchers_preserve_unicode_input_and_real_exit_codes() {
        use crate::commands::command_output_with_timeout;
        use std::time::Duration;

        let directory = std::env::temp_dir()
            .join(format!("shiguang-script-{}", uuid::Uuid::new_v4()))
            .join("中文 O'Brien [work] & space");
        std::fs::create_dir_all(&directory).unwrap();
        let powershell = directory.join("cli.ps1");
        std::fs::write(
            &powershell,
            "[Console]::Write($args[0] + \"`n\" + [Console]::In.ReadToEnd()); exit 23",
        )
        .unwrap();
        let argument = "中文 O'Brien \"%PATH%\" & $HOME";
        let input = "第一行\r\nsecond ' \" % & $ line\n";
        let mut command = executable_command(&powershell, &[argument]).unwrap();
        let result = command_output_with_timeout(
            &mut command,
            Duration::from_secs(20),
            Some(input.as_bytes()),
        )
        .await;

        let batch = directory.join("cli.cmd");
        std::fs::write(&batch, "@echo off\r\necho WINDOWS_SHIM\r\nexit /b 7\r\n").unwrap();
        let mut command = executable_command(&batch, &[]).unwrap();
        let batch_result =
            command_output_with_timeout(&mut command, Duration::from_secs(20), None).await;
        std::fs::remove_dir_all(directory.parent().unwrap()).unwrap();

        let output = result.unwrap();
        assert_eq!(
            output.status.code(),
            Some(23),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert_eq!(
            String::from_utf8(output.stdout).unwrap(),
            format!("{argument}\n{input}")
        );
        let output = batch_result.unwrap();
        assert_eq!(
            output.status.code(),
            Some(7),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert_eq!(
            String::from_utf8(output.stdout).unwrap().trim(),
            "WINDOWS_SHIM"
        );
    }

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
