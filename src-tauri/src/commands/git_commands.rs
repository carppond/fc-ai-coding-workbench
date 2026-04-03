use crate::errors::AppResult;
use crate::git;

#[tauri::command]
pub async fn git_status(project_path: String) -> AppResult<Vec<git::GitFileStatus>> {
    git::status(&project_path)
}

#[tauri::command]
pub async fn git_diff(project_path: String) -> AppResult<String> {
    git::diff_workdir(&project_path)
}

#[tauri::command]
pub async fn git_diff_staged(project_path: String) -> AppResult<String> {
    git::diff_staged(&project_path)
}

#[tauri::command]
pub async fn git_diff_file(project_path: String, file_path: String) -> AppResult<String> {
    git::diff_workdir_file(&project_path, Some(&file_path))
}

#[tauri::command]
pub async fn git_diff_staged_file(project_path: String, file_path: String) -> AppResult<String> {
    git::diff_staged_file(&project_path, Some(&file_path))
}

#[tauri::command]
pub async fn git_stage_file(project_path: String, file_path: String) -> AppResult<()> {
    git::stage_file(&project_path, &file_path)
}

#[tauri::command]
pub async fn git_unstage_file(project_path: String, file_path: String) -> AppResult<()> {
    git::unstage_file(&project_path, &file_path)
}

#[tauri::command]
pub async fn git_stage_all(project_path: String) -> AppResult<()> {
    git::stage_all(&project_path)
}

#[tauri::command]
pub async fn git_unstage_all(project_path: String) -> AppResult<()> {
    git::unstage_all(&project_path)
}

#[tauri::command]
pub async fn git_commit(project_path: String, message: String) -> AppResult<String> {
    git::commit(&project_path, &message)
}

#[tauri::command]
pub async fn git_pull(project_path: String) -> AppResult<String> {
    git::pull(&project_path).await
}

#[tauri::command]
pub async fn git_push(project_path: String) -> AppResult<String> {
    git::push(&project_path).await
}

#[tauri::command]
pub async fn git_discard_file(project_path: String, file_path: String) -> AppResult<()> {
    git::discard_file(&project_path, &file_path)
}

#[tauri::command]
pub async fn git_init_repo(project_path: String, remote_url: Option<String>) -> AppResult<()> {
    git::init_repo(&project_path, remote_url.as_deref()).await
}

#[tauri::command]
pub async fn git_branch_info(project_path: String) -> AppResult<git::GitBranchInfo> {
    git::branch_info(&project_path)
}

#[tauri::command]
pub async fn git_log(project_path: String) -> AppResult<Vec<git::GitLogEntry>> {
    git::log(&project_path)
}

#[tauri::command]
pub async fn git_list_branches(project_path: String) -> AppResult<Vec<git::BranchListItem>> {
    git::list_branches(&project_path)
}

#[tauri::command]
pub async fn git_checkout_branch(project_path: String, branch_name: String) -> AppResult<()> {
    git::checkout_branch(&project_path, &branch_name)
}

#[tauri::command]
pub async fn git_create_branch(project_path: String, branch_name: String) -> AppResult<()> {
    git::create_branch(&project_path, &branch_name)
}

#[tauri::command]
pub async fn git_delete_branch(
    project_path: String,
    branch_name: String,
    force: bool,
) -> AppResult<()> {
    git::delete_branch(&project_path, &branch_name, force)
}

// ========== Tag ==========

#[tauri::command]
pub async fn git_tag_list(project_path: String) -> AppResult<Vec<git::TagEntry>> {
    git::tag_list(&project_path)
}

#[tauri::command]
pub async fn git_create_tag(
    project_path: String,
    tag_name: String,
    message: Option<String>,
    annotated: Option<bool>,
) -> AppResult<()> {
    git::create_tag(&project_path, &tag_name, message.as_deref(), annotated.unwrap_or(false))
}

#[tauri::command]
pub async fn git_delete_tag(project_path: String, tag_name: String) -> AppResult<()> {
    git::delete_tag(&project_path, &tag_name)
}

#[tauri::command]
pub async fn git_push_tag(project_path: String, tag_name: String) -> AppResult<String> {
    git::push_tag(&project_path, &tag_name).await
}

// ========== Stash ==========

#[tauri::command]
pub async fn git_stash_list(project_path: String) -> AppResult<Vec<git::StashEntry>> {
    git::stash_list(&project_path)
}

#[tauri::command]
pub async fn git_stash_save(project_path: String, message: Option<String>) -> AppResult<()> {
    git::stash_save(&project_path, message.as_deref())
}

#[tauri::command]
pub async fn git_stash_apply(project_path: String, index: usize) -> AppResult<()> {
    git::stash_apply(&project_path, index)
}

#[tauri::command]
pub async fn git_stash_drop(project_path: String, index: usize) -> AppResult<()> {
    git::stash_drop(&project_path, index)
}

#[tauri::command]
pub async fn git_resolve_ours(project_path: String, file_path: String) -> AppResult<()> {
    git::resolve_ours(&project_path, &file_path).await
}

#[tauri::command]
pub async fn git_resolve_theirs(project_path: String, file_path: String) -> AppResult<()> {
    git::resolve_theirs(&project_path, &file_path).await
}

#[tauri::command]
pub async fn git_merge_abort(project_path: String) -> AppResult<()> {
    git::merge_abort(&project_path).await
}
