use crate::errors::{AppError, AppResult};
use git2::{DiffOptions, Repository, StashFlags, StatusOptions};
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

#[derive(Debug, Serialize, Clone)]
pub struct BranchListItem {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
    pub upstream: Option<String>,
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

        // 冲突文件优先检测，不再归类为 staged/unstaged
        if s.contains(git2::Status::CONFLICTED) {
            result.push(GitFileStatus {
                path: path.clone(),
                status: "conflicted".to_string(),
                staged: false,
            });
            continue;
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
    let print_result = diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        if is_full_diff && buf.len() >= MAX_DIFF_BYTES {
            truncated = true;
            return false;
        }
        buf.extend_from_slice(line.content());
        true
    });
    // 回调返回 false 时 libgit2 报 GIT_EUSER(-7)，属于正常截断，忽略此错误
    if let Err(e) = print_result {
        if !truncated {
            return Err(e.into());
        }
    }
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
    let print_result = diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        if is_full_diff && buf.len() >= MAX_DIFF_BYTES {
            truncated = true;
            return false;
        }
        buf.extend_from_slice(line.content());
        true
    });
    // 回调返回 false 时 libgit2 报 GIT_EUSER(-7)，属于正常截断，忽略此错误
    if let Err(e) = print_result {
        if !truncated {
            return Err(e.into());
        }
    }
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
    let mut cmd = tokio::process::Command::new("git");
    cmd.args(args)
        .current_dir(project_path)
        .env("PATH", crate::commands::setup_commands::user_shell_path())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    for (k, v) in crate::proxy::env_pairs() {
        cmd.env(k, v);
    }
    let child = cmd.spawn()?;
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

// ========== 分支管理 ==========

/// 列出本地和远程分支
pub fn list_branches(project_path: &str) -> AppResult<Vec<BranchListItem>> {
    let repo = Repository::open(project_path)?;
    let mut result = Vec::new();

    // 获取当前分支名
    let current_name = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(|s| s.to_string()));

    // 本地分支
    let branches = repo.branches(Some(git2::BranchType::Local))?;
    for branch_result in branches {
        let (branch, _) = branch_result?;
        let name = branch.name()?.unwrap_or("").to_string();
        let upstream = branch
            .upstream()
            .ok()
            .and_then(|u| u.name().ok().flatten().map(|s| s.to_string()));
        result.push(BranchListItem {
            is_current: current_name.as_deref() == Some(&name),
            name,
            is_remote: false,
            upstream,
        });
    }

    // 远程分支
    let remote_branches = repo.branches(Some(git2::BranchType::Remote))?;
    for branch_result in remote_branches {
        let (branch, _) = branch_result?;
        let name = branch.name()?.unwrap_or("").to_string();
        if name.ends_with("/HEAD") {
            continue;
        }
        result.push(BranchListItem {
            name,
            is_current: false,
            is_remote: true,
            upstream: None,
        });
    }

    Ok(result)
}

/// 切换分支
pub fn checkout_branch(project_path: &str, branch_name: &str) -> AppResult<()> {
    let repo = Repository::open(project_path)?;

    // 检查工作树是否有未提交的修改
    let statuses = repo.statuses(Some(
        StatusOptions::new()
            .include_untracked(false)
            .include_ignored(false),
    ))?;
    let dirty = statuses.iter().any(|e| {
        let s = e.status();
        s.intersects(
            git2::Status::WT_MODIFIED
                | git2::Status::WT_DELETED
                | git2::Status::INDEX_NEW
                | git2::Status::INDEX_MODIFIED
                | git2::Status::INDEX_DELETED,
        )
    });
    if dirty {
        return Err(AppError::General(
            "Cannot switch branch: uncommitted changes exist. Commit or stash first.".into(),
        ));
    }

    // 尝试找本地分支
    match repo.find_branch(branch_name, git2::BranchType::Local) {
        Ok(branch) => {
            let refname = branch
                .get()
                .name()
                .ok_or_else(|| AppError::General("Invalid branch ref".into()))?
                .to_string();
            repo.set_head(&refname)?;
        }
        Err(_) => {
            // 尝试从远程分支创建本地分支
            let remote_ref = format!("origin/{}", branch_name);
            let remote_branch = repo
                .find_branch(&remote_ref, git2::BranchType::Remote)
                .map_err(|_| {
                    AppError::General(format!("Branch '{}' not found", branch_name))
                })?;
            let commit = remote_branch.get().peel_to_commit()?;
            let mut local = repo.branch(branch_name, &commit, false)?;
            local.set_upstream(Some(&remote_ref))?;
            let refname = local
                .get()
                .name()
                .ok_or_else(|| AppError::General("Invalid branch ref".into()))?
                .to_string();
            repo.set_head(&refname)?;
        }
    }

    // 更新工作树
    repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))?;

    Ok(())
}

/// 从 HEAD 创建新分支
pub fn create_branch(project_path: &str, branch_name: &str) -> AppResult<()> {
    let repo = Repository::open(project_path)?;
    let head = repo.head()?;
    let commit = head.peel_to_commit()?;
    repo.branch(branch_name, &commit, false)?;
    Ok(())
}

// ========== Stash 管理 ==========

#[derive(Debug, Serialize, Clone)]
pub struct StashEntry {
    pub index: usize,
    pub message: String,
    pub timestamp: i64,
}

/// 列出所有 stash 条目
pub fn stash_list(project_path: &str) -> AppResult<Vec<StashEntry>> {
    let mut repo = Repository::open(project_path)?;
    let mut raw_entries: Vec<(usize, String, git2::Oid)> = Vec::new();

    repo.stash_foreach(|index, message, oid| {
        raw_entries.push((index, message.to_string(), *oid));
        true
    })?;

    let entries = raw_entries
        .into_iter()
        .map(|(index, message, oid)| {
            let timestamp = repo
                .find_commit(oid)
                .map(|c| c.time().seconds() * 1000)
                .unwrap_or(0);
            StashEntry { index, message, timestamp }
        })
        .collect();

    Ok(entries)
}

/// 保存当前工作区到 stash
pub fn stash_save(project_path: &str, message: Option<&str>) -> AppResult<()> {
    let repo = Repository::open(project_path)?;
    let sig = repo.signature()?;
    let msg = message.unwrap_or("WIP");

    // 需要 &mut repo
    let mut repo = repo;
    repo.stash_save(&sig, msg, Some(StashFlags::INCLUDE_UNTRACKED))?;
    Ok(())
}

/// 应用 stash（保留 stash 条目）
pub fn stash_apply(project_path: &str, index: usize) -> AppResult<()> {
    let mut repo = Repository::open(project_path)?;
    repo.stash_apply(index, None)?;
    Ok(())
}

/// 删除 stash 条目
pub fn stash_drop(project_path: &str, index: usize) -> AppResult<()> {
    let mut repo = Repository::open(project_path)?;
    repo.stash_drop(index)?;
    Ok(())
}

// ========== Tag 管理 ==========

#[derive(Debug, Serialize, Clone)]
pub struct TagEntry {
    pub name: String,
    pub message: Option<String>,
    pub hash: String,
    pub timestamp: i64,
    pub is_annotated: bool,
}

/// 列出所有 tag
pub fn tag_list(project_path: &str) -> AppResult<Vec<TagEntry>> {
    let repo = Repository::open(project_path)?;
    let tag_names = repo.tag_names(None)?;
    let mut entries = Vec::new();

    for name in tag_names.iter().flatten() {
        let refname = format!("refs/tags/{}", name);
        let reference = match repo.find_reference(&refname) {
            Ok(r) => r,
            Err(_) => continue,
        };

        let obj = match reference.peel(git2::ObjectType::Any) {
            Ok(o) => o,
            Err(_) => continue,
        };

        // 检查是否为注解 tag
        if let Ok(tag) = obj.clone().into_tag() {
            // 注解 tag：从 tag 对象获取信息
            let target = tag.target().ok().and_then(|t| t.peel_to_commit().ok());
            let hash = target
                .as_ref()
                .map(|c| c.id().to_string())
                .unwrap_or_else(|| tag.target_id().to_string());
            let timestamp = tag
                .tagger()
                .map(|s| s.when().seconds() * 1000)
                .unwrap_or(0);
            entries.push(TagEntry {
                name: name.to_string(),
                message: tag.message().map(|m| m.trim().to_string()),
                hash,
                timestamp,
                is_annotated: true,
            });
        } else if let Ok(commit) = obj.peel_to_commit() {
            // 轻量 tag：从 commit 获取信息
            entries.push(TagEntry {
                name: name.to_string(),
                message: None,
                hash: commit.id().to_string(),
                timestamp: commit.time().seconds() * 1000,
                is_annotated: false,
            });
        }
    }

    // 按时间倒序
    entries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(entries)
}

/// 创建 tag
pub fn create_tag(
    project_path: &str,
    tag_name: &str,
    message: Option<&str>,
    annotated: bool,
) -> AppResult<()> {
    let repo = Repository::open(project_path)?;
    let head = repo.head()?.peel_to_commit()?;
    let obj = head.as_object();

    if annotated {
        let sig = repo.signature()?;
        let msg = message.unwrap_or(tag_name);
        repo.tag(tag_name, obj, &sig, msg, false)?;
    } else {
        repo.reference(
            &format!("refs/tags/{}", tag_name),
            head.id(),
            false,
            &format!("create tag {}", tag_name),
        )?;
    }
    Ok(())
}

/// 删除 tag
pub fn delete_tag(project_path: &str, tag_name: &str) -> AppResult<()> {
    let repo = Repository::open(project_path)?;
    let refname = format!("refs/tags/{}", tag_name);
    let mut reference = repo.find_reference(&refname)?;
    reference.delete()?;
    Ok(())
}

/// 推送 tag 到远程
pub async fn push_tag(project_path: &str, tag_name: &str) -> AppResult<String> {
    let (ok, stdout, stderr) =
        run_git(project_path, &["push", "origin", tag_name]).await?;
    if ok {
        return Ok(stdout);
    }
    Err(AppError::General(stderr))
}

/// 删除本地分支
pub fn delete_branch(project_path: &str, branch_name: &str, force: bool) -> AppResult<()> {
    let repo = Repository::open(project_path)?;

    // 不允许删除当前分支
    let current = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(|s| s.to_string()));
    if current.as_deref() == Some(branch_name) {
        return Err(AppError::General(
            "Cannot delete the currently checked-out branch".into(),
        ));
    }

    let mut branch = repo.find_branch(branch_name, git2::BranchType::Local)?;

    if !force {
        // 检查分支是否已合并到当前 HEAD
        let head_oid = repo.head()?.peel_to_commit()?.id();
        let branch_oid = branch.get().peel_to_commit()?.id();
        let merge_base = repo.merge_base(head_oid, branch_oid).ok();
        if merge_base != Some(branch_oid) {
            return Err(AppError::General(
                "Branch is not fully merged. Use force delete to remove it.".into(),
            ));
        }
    }

    branch.delete()?;
    Ok(())
}

/// 使用本地版本解决冲突（git checkout --ours + git add）
pub async fn resolve_ours(project_path: &str, file_path: &str) -> AppResult<()> {
    let (ok, _, stderr) = run_git(project_path, &["checkout", "--ours", "--", file_path]).await?;
    if !ok {
        return Err(AppError::General(stderr));
    }
    stage_file(project_path, file_path)?;
    Ok(())
}

/// 使用远程版本解决冲突（git checkout --theirs + git add）
pub async fn resolve_theirs(project_path: &str, file_path: &str) -> AppResult<()> {
    let (ok, _, stderr) = run_git(project_path, &["checkout", "--theirs", "--", file_path]).await?;
    if !ok {
        return Err(AppError::General(stderr));
    }
    stage_file(project_path, file_path)?;
    Ok(())
}

/// 中止合并
pub async fn merge_abort(project_path: &str) -> AppResult<()> {
    let (ok, _, stderr) = run_git(project_path, &["merge", "--abort"]).await?;
    if !ok {
        return Err(AppError::General(stderr));
    }
    Ok(())
}
