use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

pub mod db_commands;
pub mod env_commands;
pub mod git_commands;
pub mod keychain_commands;
pub mod project_commands;
pub mod provider_commands;
pub mod setup_commands;
pub mod terminal_commands;

static BLOCKING_TASKS: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(4);

pub(crate) async fn run_blocking<T: Send + 'static>(
    task: impl FnOnce() -> crate::errors::AppResult<T> + Send + 'static,
) -> crate::errors::AppResult<T> {
    let permit = BLOCKING_TASKS.acquire().await.map_err(|error| {
        crate::errors::AppError::General(format!("blocking task unavailable: {}", error))
    })?;
    tauri::async_runtime::spawn_blocking(move || {
        // Keep the slot until the actual work ends, even if its caller is cancelled.
        let _permit = permit;
        task()
    })
    .await
    .map_err(|error| crate::errors::AppError::General(format!("blocking task failed: {}", error)))?
}

/// Feed optional stdin and drain both output pipes within one kill-and-reap deadline.
pub(super) async fn command_output_with_timeout(
    command: &mut tokio::process::Command,
    timeout: Duration,
    input: Option<&[u8]>,
) -> std::io::Result<std::process::Output> {
    let mut child = command
        .stdin(if input.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()?;
    let stdin = child.stdin.take();
    let mut stdout = child.stdout.take().unwrap();
    let mut stderr = child.stderr.take().unwrap();
    let mut out = Vec::new();
    let mut err = Vec::new();
    let result = tokio::time::timeout(timeout, async {
        let (status, _, _, _) = tokio::try_join!(
            child.wait(),
            stdout.read_to_end(&mut out),
            stderr.read_to_end(&mut err),
            async {
                if let (Some(mut stdin), Some(input)) = (stdin, input) {
                    stdin.write_all(input).await?;
                    stdin.shutdown().await?;
                }
                Ok::<_, std::io::Error>(())
            },
        )?;
        Ok::<_, std::io::Error>(status)
    })
    .await;
    match result {
        Ok(Ok(status)) => Ok(std::process::Output {
            status,
            stdout: out,
            stderr: err,
        }),
        result => {
            // kill() also waits for exit. Dropped futures retain kill_on_drop protection.
            let _ = child.kill().await;
            match result {
                Ok(Err(error)) => Err(error),
                Err(_) => Err(std::io::Error::new(
                    std::io::ErrorKind::TimedOut,
                    "Command timed out",
                )),
                Ok(Ok(_)) => unreachable!(),
            }
        }
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[tokio::test]
    async fn subprocess_deadline_kills_and_reaps_the_child() {
        let pid_path =
            std::env::temp_dir().join(format!("shiguang-child-{}", uuid::Uuid::new_v4()));
        let mut command = tokio::process::Command::new("/bin/sh");
        command
            .args([
                "-c",
                "printf '%s' $$ > \"$1\"; exec sleep 30",
                "shiguang-test",
            ])
            .arg(&pid_path);
        let result = command_output_with_timeout(&mut command, Duration::from_secs(1), None).await;
        let pid_text = std::fs::read_to_string(&pid_path).unwrap();
        std::fs::remove_file(pid_path).unwrap();
        assert_eq!(result.unwrap_err().kind(), std::io::ErrorKind::TimedOut);
        let pid = sysinfo::Pid::from_u32(pid_text.parse().unwrap());
        let mut system = sysinfo::System::new();
        system.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[pid]), true);
        assert!(
            system.process(pid).is_none(),
            "timed-out child is still present"
        );
    }

    #[tokio::test]
    async fn subprocess_input_is_literal_and_closed_at_eof() {
        let input = "中文 diff\n\"%PATH%\" & $(exit 9)\n".repeat(8192);
        let mut command = tokio::process::Command::new("/bin/sh");
        command.args(["-c", "cat; printf 'stderr drained' >&2"]);
        let output = command_output_with_timeout(
            &mut command,
            Duration::from_secs(5),
            Some(input.as_bytes()),
        )
        .await
        .unwrap();
        assert!(output.status.success());
        assert_eq!(output.stdout, input.as_bytes());
        assert_eq!(output.stderr, b"stderr drained");
    }
}
