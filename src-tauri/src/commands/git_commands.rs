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
