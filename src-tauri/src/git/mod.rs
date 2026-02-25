use crate::errors::{AppError, AppResult};
use git2::{DiffOptions, Repository, StatusOptions};
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct GitLogEntry {
    pub hash: String,
    pub message: String,
    pub author: String,
    pub timestamp: i64,
}

#[derive(Debug, Serialize, Clone)]
pub struct GitFileStatus {
    pub path: String,
    pub status: String,
    pub staged: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct GitBranchInfo {
    pub name: String,
    pub remote: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub is_detached: bool,
}

const MAX_STATUS_ENTRIES: usize = 500;
const MAX_DIFF_BYTES: usize = 512 * 1024; // 512 KB

/// Directories that should never be staged, even if the project has no .gitignore.
const SKIP_DIRS: &[&str] = &[
    "node_modules", ".git", "target", "dist", "build", ".next", ".nuxt",
    "__pycache__", ".venv", "venv", "vendor", ".cache", ".parcel-cache",
    ".turbo", ".output", "out", ".svelte-kit",
];

fn is_skip_dir(name: &str) -> bool {
    SKIP_DIRS.iter().any(|d| *d == name)
}

pub fn status(project_path: &str) -> AppResult<Vec<GitFileStatus>> {
    let repo = Repository::open(project_path)?;
    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(false)
        .include_ignored(false);

    let statuses = repo.statuses(Some(&mut opts))?;
    let mut result = Vec::new();

    for entry in statuses.iter() {
        if result.len() >= MAX_STATUS_ENTRIES {
            break;
        }

        let path = entry.path().unwrap_or("").trim_end_matches('/').to_string();
        let s = entry.status();

        // Filter out common large directories even if the project has no .gitignore
        {
            let top = path.split('/').next().unwrap_or("");
            if is_skip_dir(top) {
                continue;
            }
        }

        if s.contains(git2::Status::INDEX_NEW)
            || s.contains(git2::Status::INDEX_MODIFIED)
            || s.contains(git2::Status::INDEX_DELETED)
            || s.contains(git2::Status::INDEX_RENAMED)
        {
            let status_str = if s.contains(git2::Status::INDEX_NEW) {
                "added"
            } else if s.contains(git2::Status::INDEX_MODIFIED) {
                "modified"
            } else if s.contains(git2::Status::INDEX_DELETED) {
                "deleted"
            } else {
                "renamed"
            };
            result.push(GitFileStatus {
                path: path.clone(),
                status: status_str.to_string(),
                staged: true,
            });
        }

        if result.len() >= MAX_STATUS_ENTRIES {
            break;
        }

        if s.contains(git2::Status::WT_NEW)
            || s.contains(git2::Status::WT_MODIFIED)
            || s.contains(git2::Status::WT_DELETED)
        {
            let status_str = if s.contains(git2::Status::WT_NEW) {
                "untracked"
            } else if s.contains(git2::Status::WT_MODIFIED) {
                "modified"
            } else {
                "deleted"
            };
            result.push(GitFileStatus {
                path: path.clone(),
                status: status_str.to_string(),
                staged: false,
            });
        }
    }

    Ok(result)
}

pub fn diff_workdir(project_path: &str) -> AppResult<String> {
    diff_workdir_file(project_path, None)
}

pub fn diff_workdir_file(project_path: &str, file_path: Option<&str>) -> AppResult<String> {
    let repo = Repository::open(project_path)?;
    let mut opts = DiffOptions::new();
    if let Some(fp) = file_path {
        opts.pathspec(fp);
    }
    let is_full_diff = file_path.is_none();
    let diff = repo.diff_index_to_workdir(None, Some(&mut opts))?;
    let mut buf = Vec::new();
    let mut truncated = false;
    diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        if is_full_diff && buf.len() >= MAX_DIFF_BYTES {
            truncated = true;
            return false;
        }
        buf.extend_from_slice(line.content());
        true
    })?;
    let mut result = String::from_utf8_lossy(&buf).to_string();
    if truncated {
        result.push_str("\n\n... (diff truncated) ...\n");
    }
    Ok(result)
}

pub fn diff_staged(project_path: &str) -> AppResult<String> {
    diff_staged_file(project_path, None)
}

pub fn diff_staged_file(project_path: &str, file_path: Option<&str>) -> AppResult<String> {
    let repo = Repository::open(project_path)?;
    let head_tree = repo
        .head()
        .ok()
        .and_then(|r| r.peel_to_tree().ok());
    let mut opts = DiffOptions::new();
    if let Some(fp) = file_path {
        opts.pathspec(fp);
    }
    let is_full_diff = file_path.is_none();
    let diff = repo.diff_tree_to_index(head_tree.as_ref(), None, Some(&mut opts))?;
    let mut buf = Vec::new();
    let mut truncated = false;
    diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        if is_full_diff && buf.len() >= MAX_DIFF_BYTES {
            truncated = true;
            return false;
        }
        buf.extend_from_slice(line.content());
        true
    })?;
    let mut result = String::from_utf8_lossy(&buf).to_string();
    if truncated {
        result.push_str("\n\n... (diff truncated) ...\n");
    }
    Ok(result)
}

pub fn stage_all(project_path: &str) -> AppResult<()> {
    let repo = Repository::open(project_path)?;

    // Get status with same options as status() — no recursion into untracked dirs
    let mut status_opts = StatusOptions::new();
    status_opts
        .include_untracked(true)
        .recurse_untracked_dirs(false)
        .include_ignored(false);
    let statuses = repo.statuses(Some(&mut status_opts))?;

    let mut index = repo.index()?;
    let project = std::path::Path::new(project_path);

    for entry in statuses.iter() {
        let path_str = match entry.path() {
            Some(p) => p.trim_end_matches('/').to_string(),
            None => continue,
        };
        let s = entry.status();

        // Only handle workdir changes
        if s.contains(git2::Status::WT_DELETED) {
            let _ = index.remove_path(std::path::Path::new(&path_str));
        } else if s.contains(git2::Status::WT_NEW) || s.contains(git2::Status::WT_MODIFIED) {
            let full_path = project.join(&path_str);
            if full_path.is_dir() {
                // Skip nested git repos and common large directories
                let dir_name = full_path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if full_path.join(".git").exists() || is_skip_dir(dir_name) {
                    continue;
                }
                // Stage directory contents
                let _ = index.add_all(
                    [format!("{}/**", path_str)],
                    git2::IndexAddOption::DEFAULT,
                    None,
                );
            } else {
                let _ = index.add_path(std::path::Path::new(&path_str));
            }
        }
    }

    index.write()?;
    Ok(())
}

pub fn unstage_all(project_path: &str) -> AppResult<()> {
    let repo = Repository::open(project_path)?;
    match repo.head() {
        Ok(head_ref) => {
            let head = head_ref.peel_to_commit()?;
            repo.reset_default(Some(head.as_object()), ["*"])?;
        }
        Err(_) => {
            // No commits yet — clear entire index
            let mut index = repo.index()?;
            index.clear()?;
            index.write()?;
        }
    }
    Ok(())
}

pub fn stage_file(project_path: &str, file_path: &str) -> AppResult<()> {
    let file_path = file_path.trim_end_matches('/');
    let repo = Repository::open(project_path)?;
    let mut index = repo.index()?;
    let full_path = std::path::Path::new(project_path).join(file_path);

    if !full_path.exists() {
        // Deleted file — remove from index
        index.remove_path(std::path::Path::new(file_path))?;
        index.write()?;
        return Ok(());
    }

    if full_path.is_dir() {
        let dir_name = full_path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        // Nested git repo — cannot stage directly
        if full_path.join(".git").exists() {
            return Err(AppError::General(format!(
                "'{}' is a nested git repository. Use 'git submodule add' or add it to .gitignore.",
                file_path
            )));
        }
        // Block staging common large directories that should be in .gitignore
        if is_skip_dir(dir_name) {
            return Err(AppError::General(format!(
                "'{}' should be added to .gitignore instead of being staged.",
                file_path
            )));
        }
        index.add_all(
            [format!("{}/**", file_path)],
            git2::IndexAddOption::DEFAULT,
            None,
        )?;
        index.write()?;
        return Ok(());
    }

    // Regular file — check if inside a nested git repo
    let project = std::path::Path::new(project_path);
    if let Some(parent) = full_path.parent() {
        let mut dir = parent;
        while dir != project {
            if dir.join(".git").exists() {
                return Err(AppError::General(format!(
                    "File is inside nested git repository '{}'.",
                    dir.strip_prefix(project).unwrap_or(dir).display()
                )));
            }
            match dir.parent() {
                Some(p) => dir = p,
                None => break,
            }
        }
    }

    index.add_path(std::path::Path::new(file_path))?;
    index.write()?;
    Ok(())
}

pub fn unstage_file(project_path: &str, file_path: &str) -> AppResult<()> {
    let repo = Repository::open(project_path)?;
    match repo.head() {
        Ok(head_ref) => {
            let head = head_ref.peel_to_commit()?;
            repo.reset_default(Some(head.as_object()), [file_path])?;
        }
        Err(_) => {
            // No commits yet — just remove from index
            let mut index = repo.index()?;
            index.remove_path(std::path::Path::new(file_path))?;
            index.write()?;
        }
    }
    Ok(())
}

pub fn commit(project_path: &str, message: &str) -> AppResult<String> {
    let repo = Repository::open(project_path)?;
    let mut index = repo.index()?;
    let oid = index.write_tree()?;
    let tree = repo.find_tree(oid)?;
    let sig = repo.signature()?;

    let parent_commit = repo.head().ok().and_then(|r| r.peel_to_commit().ok());
    let parents: Vec<&git2::Commit> = parent_commit.iter().collect();

    let commit_oid = repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &parents)?;
    Ok(commit_oid.to_string())
}

pub fn branch_info(project_path: &str) -> AppResult<GitBranchInfo> {
    let repo = Repository::open(project_path)?;

    // Fresh repo with no commits yet — HEAD doesn't exist
    let head = match repo.head() {
        Ok(h) => h,
        Err(e) if e.code() == git2::ErrorCode::UnbornBranch || e.code() == git2::ErrorCode::NotFound => {
            return Ok(GitBranchInfo {
                name: "main".to_string(),
                remote: None,
                ahead: 0,
                behind: 0,
                is_detached: false,
            });
        }
        Err(e) => return Err(e.into()),
    };

    if repo.head_detached().unwrap_or(false) {
        return Ok(GitBranchInfo {
            name: "HEAD (detached)".to_string(),
            remote: None,
            ahead: 0,
            behind: 0,
            is_detached: true,
        });
    }
    let branch_name = head
        .shorthand()
        .unwrap_or("unknown")
        .to_string();

    let (ahead, behind, remote) = match repo.find_branch(&branch_name, git2::BranchType::Local) {
        Ok(branch) => {
            let upstream = branch.upstream();
            match upstream {
                Ok(upstream_branch) => {
                    let local_oid = match head.target() {
                        Some(oid) => oid,
                        None => return Ok(GitBranchInfo {
                            name: branch_name, remote: None, ahead: 0, behind: 0, is_detached: false,
                        }),
                    };
                    let upstream_oid = match upstream_branch.get().target() {
                        Some(oid) => oid,
                        None => return Ok(GitBranchInfo {
                            name: branch_name, remote: None, ahead: 0, behind: 0, is_detached: false,
                        }),
                    };
                    let (ahead, behind) = repo.graph_ahead_behind(local_oid, upstream_oid)?;
                    let remote_name = upstream_branch
                        .name()?
                        .unwrap_or("")
                        .to_string();
                    (ahead as u32, behind as u32, Some(remote_name))
                }
                Err(_) => (0, 0, None),
            }
        }
        Err(_) => (0, 0, None),
    };

    Ok(GitBranchInfo {
        name: branch_name,
        remote,
        ahead,
        behind,
        is_detached: false,
    })
}

pub fn log(project_path: &str) -> AppResult<Vec<GitLogEntry>> {
    let repo = Repository::open(project_path)?;
    let head = match repo.head() {
        Ok(h) => h,
        Err(e)
            if e.code() == git2::ErrorCode::UnbornBranch
                || e.code() == git2::ErrorCode::NotFound =>
        {
            return Ok(Vec::new());
        }
        Err(e) => return Err(e.into()),
    };
    let head_oid = head
        .target()
        .ok_or_else(|| AppError::General("HEAD has no target".to_string()))?;

    let mut revwalk = repo.revwalk()?;
    revwalk.push(head_oid)?;
    revwalk.set_sorting(git2::Sort::TIME)?;

    let mut entries = Vec::new();
    for oid in revwalk.take(50) {
        let oid = oid?;
        let commit = repo.find_commit(oid)?;
        let hash = oid.to_string()[..7].to_string();
        let message = commit
            .summary()
            .unwrap_or("")
            .to_string();
        let author = commit.author().name().unwrap_or("").to_string();
        let timestamp = commit.time().seconds() * 1000;
        entries.push(GitLogEntry {
            hash,
            message,
            author,
            timestamp,
        });
    }
    Ok(entries)
}

pub fn discard_file(project_path: &str, file_path: &str) -> AppResult<()> {
    let repo = Repository::open(project_path)?;

    // Check if the file is untracked (not in HEAD and not in index)
    let statuses = repo.statuses(Some(
        StatusOptions::new()
            .include_untracked(true)
            .pathspec(file_path),
    ))?;

    let is_untracked = statuses.iter().any(|e| {
        e.status().contains(git2::Status::WT_NEW)
    });

    if is_untracked {
        // Untracked file: delete it from disk
        let full_path = std::path::Path::new(project_path).join(file_path);
        if full_path.exists() {
            std::fs::remove_file(&full_path)?;
        }
    } else {
        // Tracked file: checkout HEAD version to overwrite working copy
        repo.checkout_head(Some(
            git2::build::CheckoutBuilder::new()
                .force()
                .path(file_path),
        ))?;
    }

    Ok(())
}

const GIT_REMOTE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

/// Detect the default branch name on origin (main, master, etc.)
async fn detect_remote_branch(project_path: &str) -> Option<String> {
    for branch in &["main", "master", "develop"] {
        if let Ok((true, _, _)) =
            run_git(project_path, &["rev-parse", "--verify", &format!("origin/{}", branch)]).await
        {
            return Some(branch.to_string());
        }
    }
    None
}

/// Detect current local branch name
fn current_branch_name(project_path: &str) -> Option<String> {
    let repo = Repository::open(project_path).ok()?;
    let head = repo.head().ok()?;
    head.shorthand().map(|s| s.to_string())
}

/// Check whether the current branch has an upstream tracking branch configured
fn has_upstream(project_path: &str) -> bool {
    let repo = match Repository::open(project_path) {
        Ok(r) => r,
        Err(_) => return false,
    };
    let head = match repo.head() {
        Ok(h) => h,
        Err(_) => return false,
    };
    let name = match head.shorthand() {
        Some(n) => n.to_string(),
        None => return false,
    };
    let result = match repo.find_branch(&name, git2::BranchType::Local) {
        Ok(branch) => branch.upstream().is_ok(),
        Err(_) => false,
    };
    result
}

/// Run a git command with timeout and return (success, stdout, stderr)
async fn run_git(
    project_path: &str,
    args: &[&str],
) -> AppResult<(bool, String, String)> {
    let child = tokio::process::Command::new("git")
        .args(args)
        .current_dir(project_path)
        .env("PATH", crate::commands::setup_commands::user_shell_path())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()?;
    let output = tokio::time::timeout(GIT_REMOTE_TIMEOUT, child.wait_with_output())
        .await
        .map_err(|_| {
            AppError::General(format!("git {} timed out (30s)", args.first().unwrap_or(&"")))
        })??;
    Ok((
        output.status.success(),
        String::from_utf8_lossy(&output.stdout).to_string(),
        String::from_utf8_lossy(&output.stderr).to_string(),
    ))
}

pub async fn pull(project_path: &str) -> AppResult<String> {
    if has_upstream(project_path) {
        // Normal pull — upstream is configured
        let (ok, stdout, stderr) = run_git(project_path, &["pull"]).await?;
        if ok {
            return Ok(stdout);
        }
        return Err(AppError::General(stderr));
    }

    // No upstream — detect remote branch and pull explicitly
    if let Some(branch) = detect_remote_branch(project_path).await {
        let (ok, stdout, stderr) = run_git(
            project_path,
            &["pull", "origin", &branch, "--allow-unrelated-histories"],
        )
        .await?;
        if ok {
            // Set tracking for future pulls
            let _ = run_git(
                project_path,
                &["branch", "--set-upstream-to", &format!("origin/{}", branch)],
            )
            .await;
            return Ok(stdout);
        }
        return Err(AppError::General(stderr));
    }

    Err(AppError::General(
        "No remote branch found (origin is empty). Push first to create a remote branch.".into(),
    ))
}

pub async fn init_repo(project_path: &str, remote_url: Option<&str>) -> AppResult<()> {
    let repo = Repository::init(project_path)?;
    if let Some(url) = remote_url {
        let url = url.trim();
        if !url.is_empty() {
            repo.remote("origin", url)?;
            drop(repo); // release lock so git CLI can access

            // Fetch from remote (may fail if repo is empty or network unreachable)
            let fetch = run_git(project_path, &["fetch", "origin"]).await;

            if let Ok((true, _, _)) = fetch {
                // Detect default branch on remote
                if let Some(branch) = detect_remote_branch(project_path).await {
                    // Check if local repo has any commits
                    let has_commits = {
                        let r = Repository::open(project_path).ok();
                        r.and_then(|repo| {
                            let head = repo.head().ok()?;
                            head.target()
                        })
                        .is_some()
                    };

                    if !has_commits {
                        // No local commits — checkout remote branch (sets tracking automatically)
                        let _ = run_git(project_path, &["checkout", &branch]).await;
                    } else {
                        // Local has commits — just set upstream tracking
                        let _ = run_git(
                            project_path,
                            &["branch", "--set-upstream-to", &format!("origin/{}", branch)],
                        )
                        .await;
                    }
                }
            }
        }
    }
    Ok(())
}

pub async fn push(project_path: &str) -> AppResult<String> {
    if has_upstream(project_path) {
        // Normal push — upstream is configured
        let (ok, stdout, stderr) = run_git(project_path, &["push"]).await?;
        if ok {
            return Ok(stdout);
        }
        return Err(AppError::General(stderr));
    }

    // No upstream — push with -u to create remote branch and set tracking
    let branch = current_branch_name(project_path).unwrap_or_else(|| "main".to_string());
    let (ok, stdout, stderr) =
        run_git(project_path, &["push", "-u", "origin", &branch]).await?;
    if ok {
        return Ok(stdout);
    }
    Err(AppError::General(stderr))
}
