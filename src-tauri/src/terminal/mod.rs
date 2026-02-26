use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::Emitter;

/// Find the last valid UTF-8 boundary in a byte slice.
/// Returns (valid_bytes, leftover_bytes) where leftover_bytes is the count
/// of trailing bytes that form an incomplete UTF-8 sequence.
fn find_utf8_boundary(bytes: &[u8]) -> (usize, usize) {
    if bytes.is_empty() {
        return (0, 0);
    }
    // Fast path: check only the last few bytes for incomplete multi-byte sequences.
    // A UTF-8 continuation byte starts with 0b10xxxxxx. Walk backwards from the end
    // to find the start of the last (possibly incomplete) character.
    let len = bytes.len();
    let check_start = len.saturating_sub(3); // at most 3 trailing continuation bytes
    let mut i = len;
    // Find the leading byte of the last character by scanning backwards
    while i > check_start {
        i -= 1;
        let b = bytes[i];
        if b & 0x80 == 0 {
            // ASCII byte — everything is complete
            return (len, 0);
        }
        if b & 0xC0 != 0x80 {
            // Found a leading byte (0b11xxxxxx). Determine expected char length.
            let char_len = if b & 0xE0 == 0xC0 {
                2
            } else if b & 0xF0 == 0xE0 {
                3
            } else if b & 0xF8 == 0xF0 {
                4
            } else {
                // Invalid leading byte — treat as complete (lossy)
                return (len, 0);
            };
            let available = len - i;
            if available >= char_len {
                // The multi-byte character is complete
                return (len, 0);
            }
            // Incomplete character: split before this leading byte
            return (i, available);
        }
        // continuation byte — keep walking backwards
    }
    // All checked bytes are continuation bytes without a leading byte — treat as complete (lossy)
    (len, 0)
}

pub struct TerminalSession {
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    master: Arc<Mutex<Box<dyn portable_pty::MasterPty + Send>>>,
    child: Arc<Mutex<Box<dyn portable_pty::Child + Send + Sync>>>,
    alive: Arc<std::sync::atomic::AtomicBool>,
    pub id: String,
    pub shell_name: String,
}

impl Drop for TerminalSession {
    fn drop(&mut self) {
        self.alive.store(false, std::sync::atomic::Ordering::Relaxed);
        if let Ok(mut child) = self.child.lock() {
            let _ = child.kill();
            // Wait for the child to exit to prevent zombie processes
            let _ = child.wait();
        }
    }
}

impl TerminalSession {
    pub fn spawn(
        app: tauri::AppHandle,
        initial_dir: Option<&str>,
        rows: u16,
        cols: u16,
    ) -> Result<Self, String> {
        let session_id = uuid::Uuid::new_v4().to_string();

        let pty_system = native_pty_system();

        let size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };

        let pair = pty_system
            .openpty(size)
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        // --- Shell detection ---
        let shell = Self::detect_shell();
        let shell_name = std::path::Path::new(&shell)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("sh")
            .to_string();

        let mut cmd = CommandBuilder::new(&shell);

        // --- Shell launch flags ---
        match shell_name.as_str() {
            "fish" => {
                cmd.args(["--login", "--interactive"]);
            }
            "bash" => {
                // -i only; --rcfile is added below and requires non-login mode
                cmd.arg("-i");
            }
            "pwsh" | "pwsh.exe" | "powershell" | "powershell.exe" => {
                // PowerShell: -NoLogo -NoExit, prompt override via -Command
                cmd.args(["-NoLogo", "-NoExit"]);
            }
            "cmd" | "cmd.exe" => {
                // cmd.exe: /K keeps the shell open, chcp 65001 sets UTF-8 code page
                cmd.args(["/K", "chcp 65001 >nul"]);
            }
            _ => {
                // zsh, sh, etc: login + interactive
                cmd.args(["-l", "-i"]);
            }
        }

        if let Some(dir) = initial_dir {
            cmd.cwd(dir);
        }

        // Inherit environment from parent process
        for (key, val) in std::env::vars() {
            cmd.env(key, val);
        }
        // Inject proxy environment variables (overrides inherited values)
        for (key, val) in crate::proxy::env_pairs() {
            cmd.env(key, val);
        }
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        cmd.env("TERM_PROGRAM", "ShiGuang");
        cmd.env("TERM_FEATURES", "truecolor:clipboard:title:hyperlinks");
        cmd.env("AI_WORKBENCH_TERMINAL", "1");

        // --- Cross-shell prompt inhibitors ---
        // These disable third-party prompt tools across all shells.
        cmd.env("DISABLE_AUTO_UPDATE", "true");         // oh-my-zsh update check
        cmd.env("DISABLE_UPDATE_PROMPT", "true");        // oh-my-zsh update prompt
        cmd.env("ZSH_DISABLE_COMPFIX", "true");          // zsh compaudit check
        cmd.env("STARSHIP_SHELL", "");                   // disable starship detection
        cmd.env("STARSHIP_SESSION_KEY", "");             // disable starship session
        cmd.env("VIRTUAL_ENV_DISABLE_PROMPT", "1");      // disable virtualenv prompt
        cmd.env("CONDA_CHANGEPS1", "false");             // disable conda prompt
        cmd.env("POSH_THEME", "");                       // disable oh-my-posh theme
        cmd.env("POWERLINE_COMMAND", "");                 // disable powerline

        let user_home = Self::user_home_dir();

        // --- Per-shell prompt override ---
        match shell_name.as_str() {
            "zsh" => Self::setup_zsh_prompt(&mut cmd, &user_home, &session_id),
            "bash" => Self::setup_bash_prompt(&mut cmd, &user_home, &session_id),
            "fish" => Self::setup_fish_prompt(&mut cmd, &user_home, &session_id),
            "pwsh" | "pwsh.exe" | "powershell" | "powershell.exe" => {
                Self::setup_powershell_prompt(&mut cmd, &user_home);
            }
            "cmd" | "cmd.exe" => {
                // cmd.exe: set PROMPT env var for clean prompt
                cmd.env("PROMPT", "$P$G");
            }
            _ => {
                // sh or unknown: basic PS1
                cmd.env("PS1", "\\W $ ");
            }
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn shell: {}", e))?;

        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone reader: {}", e))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to take writer: {}", e))?;

        let alive = Arc::new(std::sync::atomic::AtomicBool::new(true));
        let alive_clone = alive.clone();
        let exit_session_id = session_id.clone();
        let output_event = format!("terminal-output-{}", session_id);
        let exit_event = format!("terminal-exit-{}", session_id);

        // Spawn reader thread — emits per-session terminal-output events
        std::thread::spawn(move || {
            let mut reader = reader;
            let mut buf = [0u8; 4096];
            let mut remainder_buf = [0u8; 4]; // UTF-8 max char = 4 bytes, no heap alloc
            let mut remainder_len: usize = 0;
            let mut initial_phase = true;
            let mut chunks_seen = 0u32;
            // Temp buffer for prepending remainder to new data
            let mut combined = [0u8; 4 + 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        alive_clone.store(false, std::sync::atomic::Ordering::Relaxed);
                        let _ = app.emit(&exit_event, &exit_session_id);
                        break;
                    }
                    Ok(n) => {
                        // Prepend any leftover bytes from the previous read
                        let bytes = if remainder_len == 0 {
                            &buf[..n]
                        } else {
                            combined[..remainder_len].copy_from_slice(&remainder_buf[..remainder_len]);
                            combined[remainder_len..remainder_len + n].copy_from_slice(&buf[..n]);
                            &combined[..remainder_len + n]
                        };

                        // Find the last valid UTF-8 boundary
                        let (valid_len, leftover) = find_utf8_boundary(bytes);
                        let data = String::from_utf8_lossy(&bytes[..valid_len]).into_owned();

                        // Store incomplete bytes for next read (max 3 bytes)
                        if leftover > 0 {
                            let start = bytes.len() - leftover;
                            remainder_buf[..leftover].copy_from_slice(&bytes[start..]);
                            remainder_len = leftover;
                        } else {
                            remainder_len = 0;
                        }

                        if data.is_empty() {
                            continue;
                        }

                        if initial_phase {
                            chunks_seen += 1;
                            if chunks_seen > 5 {
                                initial_phase = false;
                            }
                            if data.contains("Last login:") {
                                let filtered: String = data
                                    .split('\n')
                                    .filter(|line| {
                                        let trimmed = line.trim_start_matches(|c: char| {
                                            c == '\r' || c == ' ' || c == '\t'
                                        });
                                        !trimmed.starts_with("Last login:")
                                    })
                                    .collect::<Vec<_>>()
                                    .join("\n");
                                if !filtered.trim().is_empty() {
                                    let _ = app.emit(&output_event, &filtered);
                                }
                            } else if !data.trim().is_empty() {
                                let _ = app.emit(&output_event, &data);
                            }
                        } else {
                            let _ = app.emit(&output_event, &data);
                        }
                    }
                    Err(_) => {
                        alive_clone.store(false, std::sync::atomic::Ordering::Relaxed);
                        let _ = app.emit(&exit_event, &exit_session_id);
                        break;
                    }
                }
            }
        });

        let writer = Arc::new(Mutex::new(writer));

        Ok(Self {
            writer,
            master: Arc::new(Mutex::new(pair.master)),
            child: Arc::new(Mutex::new(child)),
            alive,
            id: session_id,
            shell_name: shell_name.clone(),
        })
    }

    pub fn write(&self, data: &str) -> Result<(), String> {
        let mut writer = self.writer.lock().map_err(|_| "Writer lock poisoned".to_string())?;
        writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("Write error: {}", e))?;
        writer.flush().map_err(|e| format!("Flush error: {}", e))?;
        Ok(())
    }

    pub fn resize(&self, rows: u16, cols: u16) -> Result<(), String> {
        let master = self.master.lock().map_err(|_| "Master lock poisoned".to_string())?;
        master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Resize error: {}", e))?;
        Ok(())
    }

    // ── Shell detection ─────────────────────────────────────────────

    fn detect_shell() -> String {
        if cfg!(target_os = "windows") {
            // Windows: try pwsh (PS 7+) → powershell (PS 5.x) → cmd
            for candidate in &["pwsh.exe", "powershell.exe", "cmd.exe"] {
                if std::process::Command::new(candidate)
                    .arg("/?")
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null())
                    .status()
                    .is_ok()
                {
                    return candidate.to_string();
                }
            }
            "cmd.exe".to_string()
        } else {
            // Unix: prefer $SHELL, fallback to common shells
            std::env::var("SHELL").unwrap_or_else(|_| {
                for candidate in &["/bin/zsh", "/bin/bash", "/bin/sh"] {
                    if std::path::Path::new(candidate).exists() {
                        return candidate.to_string();
                    }
                }
                "/bin/sh".to_string()
            })
        }
    }

    fn user_home_dir() -> String {
        if cfg!(target_os = "windows") {
            std::env::var("USERPROFILE").unwrap_or_default()
        } else {
            std::env::var("HOME").unwrap_or_default()
        }
    }

    // ── Prompt overrides per shell ──────────────────────────────────

    /// zsh: ZDOTDIR approach with precmd hook for self-healing prompt.
    fn setup_zsh_prompt(cmd: &mut CommandBuilder, user_home: &str, session_id: &str) {
        let dir = std::env::temp_dir().join(format!("shiguang_zsh_{}", session_id));
        if std::fs::create_dir_all(&dir).is_ok() {
            // Source user's .zshenv (ZDOTDIR changes where zsh looks for it)
            let mut zshenv = String::new();
            let user_zshenv = format!("{}/.zshenv", user_home);
            if std::path::Path::new(&user_zshenv).exists() {
                zshenv = format!("[ -f \"{}\" ] && source \"{}\"\n", user_zshenv, user_zshenv);
            }
            let _ = std::fs::write(dir.join(".zshenv"), zshenv);

            let zshrc_content = format!(
                r#"# Source user's original .zshrc
[ -f "{home}/.zshrc" ] && source "{home}/.zshrc"

# Persistent prompt override using precmd hook.
# Survives `source ~/.zshrc` because the function stays in memory
# and self-heals its position in precmd_functions.
unset STARSHIP_SHELL STARSHIP_SESSION_KEY 2>/dev/null
export VIRTUAL_ENV_DISABLE_PROMPT=1
export CONDA_CHANGEPS1=false
typeset -g POWERLEVEL9K_DISABLE_CONFIGURATION_WIZARD=true 2>/dev/null

__shiguang_prompt() {{
  PROMPT='%F{{110}}%1~%f $ '
  RPROMPT=''
  # Self-heal: always move to end of precmd_functions so we run last
  precmd_functions=(${{(@)precmd_functions:#__shiguang_prompt}} __shiguang_prompt)
}}

autoload -Uz add-zsh-hook
add-zsh-hook precmd __shiguang_prompt

PROMPT='%F{{110}}%1~%f $ '
RPROMPT=''
clear
# Self-cleanup
rm -rf "{zdotdir}" 2>/dev/null
"#,
                home = user_home,
                zdotdir = dir.display(),
            );
            let _ = std::fs::write(dir.join(".zshrc"), zshrc_content);
            cmd.env("ZDOTDIR", dir.to_string_lossy().as_ref());
        }
    }

    /// bash: --rcfile with PROMPT_COMMAND self-healing.
    fn setup_bash_prompt(cmd: &mut CommandBuilder, user_home: &str, session_id: &str) {
        let init_file =
            std::env::temp_dir().join(format!(".shiguang_bash_{}", session_id));
        let bash_content = format!(
            r#"# Source user's bash configs
[ -f "{home}/.bash_profile" ] && source "{home}/.bash_profile"
[ -f "{home}/.bashrc" ] && source "{home}/.bashrc"

# Persistent prompt override.
# __shiguang_prompt resets PS1 and re-injects itself into PROMPT_COMMAND
# so the clean prompt survives `source ~/.bashrc`.
unset STARSHIP_SHELL STARSHIP_SESSION_KEY 2>/dev/null
export VIRTUAL_ENV_DISABLE_PROMPT=1
export CONDA_CHANGEPS1=false

__shiguang_prompt() {{
    PS1='\[\033[38;5;110m\]\W\[\033[0m\] $ '
    # Self-heal: if PROMPT_COMMAND was overwritten, re-inject
    case "$PROMPT_COMMAND" in
        *__shiguang_prompt*) ;;
        *) PROMPT_COMMAND="__shiguang_prompt${{PROMPT_COMMAND:+;$PROMPT_COMMAND}}" ;;
    esac
}}
PROMPT_COMMAND='__shiguang_prompt'
clear
rm -f "{init}" 2>/dev/null
"#,
            home = user_home,
            init = init_file.display(),
        );
        let _ = std::fs::write(&init_file, &bash_content);
        cmd.args(["--rcfile", init_file.to_string_lossy().as_ref()]);
    }

    /// fish: use --init-command for prompt override.
    /// Fish evaluates --init-command before config files, so we also set
    /// fish_prompt as a universal function via the env-based disable flags.
    fn setup_fish_prompt(_cmd: &mut CommandBuilder, user_home: &str, _session_id: &str) {
        // Fish doesn't have a --rcfile equivalent. The best approach is to
        // create a conf.d snippet that loads last (alphabetical order).
        let conf_dir = format!("{}/.config/fish/conf.d", user_home);
        let snippet_path = format!("{}/99-shiguang.fish", conf_dir);

        // Create conf.d dir if needed, write override snippet
        if std::fs::create_dir_all(&conf_dir).is_ok() {
            let fish_content = r#"# ShiGuang AI terminal prompt override
# This file is auto-managed. Delete it to restore your normal prompt.
if set -q AI_WORKBENCH_TERMINAL
    function fish_prompt
        set_color brblue
        echo -n (basename $PWD)
        set_color normal
        echo -n ' $ '
    end
    function fish_right_prompt; end
    function fish_greeting; end
end
"#;
            let _ = std::fs::write(&snippet_path, fish_content);
        }
    }

    /// PowerShell (pwsh/powershell): use -Command to override prompt function.
    fn setup_powershell_prompt(cmd: &mut CommandBuilder, user_home: &str) {
        // Build a command that:
        // 1. Sources user's profile (if it exists)
        // 2. Overrides the prompt function
        // 3. Clears the screen
        let profile_path = if cfg!(target_os = "windows") {
            format!(
                "{}\\Documents\\PowerShell\\Microsoft.PowerShell_profile.ps1",
                user_home
            )
        } else {
            format!("{}/.config/powershell/profile.ps1", user_home)
        };

        let ps_init = format!(
            concat!(
                "if (Test-Path '{}') {{ . '{}' }}; ",
                "function global:prompt {{ ",
                    "$dir = Split-Path -Leaf (Get-Location); ",
                    "Write-Host -NoNewline -ForegroundColor Cyan $dir; ",
                    "return ' $ ' ",
                "}}; ",
                "Clear-Host"
            ),
            profile_path, profile_path,
        );
        cmd.args(["-Command", &ps_init]);
    }

    // ── Cleanup ─────────────────────────────────────────────────────

    /// Remove leftover temp files from previous sessions.
    /// Called once at app startup instead of per-spawn to avoid scanning temp dir repeatedly.
    pub fn cleanup_stale_temp_files() {
        let tmp = std::env::temp_dir();
        if let Ok(entries) = std::fs::read_dir(&tmp) {
            for entry in entries.flatten() {
                let name = entry.file_name();
                let name_str = name.to_string_lossy();
                if name_str.starts_with("shiguang_zsh_")
                    || name_str.starts_with(".shiguang_bash_")
                {
                    let _ = std::fs::remove_dir_all(entry.path());
                }
            }
        }
    }
}
