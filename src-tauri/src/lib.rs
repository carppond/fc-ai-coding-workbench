mod commands;
mod db;
mod errors;
mod git;
mod keychain;
mod providers;
pub mod proxy;
mod state;
mod terminal;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let app_state = AppState::new(app.handle())?;
            app.manage(app_state);
            app.manage(commands::terminal_commands::TerminalState {
                sessions: std::sync::Mutex::new(std::collections::HashMap::new()),
                warmup: std::sync::Arc::new(std::sync::Mutex::new(None)),
            });

            // 后台清理上次残留的临时文件（不阻塞启动）
            std::thread::spawn(|| {
                terminal::TerminalSession::cleanup_stale_temp_files();
            });

            // 后台线程预加载 shell 环境变量（供 claude -p 使用，不阻塞启动）
            commands::provider_commands::preload_shell_env();

            // 后台设置应用图标（不阻塞窗口显示）
            if let Some(window) = app.get_webview_window("main") {
                let win = window.clone();
                std::thread::spawn(move || {
                    let icon_bytes = include_bytes!("../icons/icon.png");
                    if let Ok(icon) = tauri::image::Image::from_bytes(icon_bytes) {
                        let _ = win.set_icon(icon);
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // DB commands
            commands::db_commands::create_workspace,
            commands::db_commands::list_workspaces,
            commands::db_commands::get_workspace,
            commands::db_commands::update_workspace,
            commands::db_commands::delete_workspace,
            commands::db_commands::update_workspace_timestamp,
            commands::db_commands::create_project,
            commands::db_commands::list_projects,
            commands::db_commands::get_project,
            commands::db_commands::update_project_last_opened,
            commands::db_commands::rename_project,
            commands::db_commands::delete_project,
            commands::db_commands::create_session,
            commands::db_commands::list_sessions,
            commands::db_commands::list_all_sessions,
            commands::db_commands::get_session,
            commands::db_commands::update_session,
            commands::db_commands::delete_session,
            commands::db_commands::create_thread,
            commands::db_commands::list_threads,
            commands::db_commands::get_thread,
            commands::db_commands::update_thread,
            commands::db_commands::delete_thread,
            commands::db_commands::create_message,
            commands::db_commands::list_messages,
            commands::db_commands::search_messages,
            commands::db_commands::get_setting,
            commands::db_commands::set_setting,
            commands::db_commands::set_proxy,
            commands::db_commands::get_proxy,
            // Keychain commands
            commands::keychain_commands::set_api_key,
            commands::keychain_commands::has_api_key,
            commands::keychain_commands::delete_api_key,
            commands::keychain_commands::detect_env_api_keys,
            // Provider commands
            commands::provider_commands::send_message,
            commands::provider_commands::stop_streaming,
            commands::provider_commands::test_api_key,
            commands::provider_commands::generate_commit_message,
            // Git commands
            commands::git_commands::git_status,
            commands::git_commands::git_diff,
            commands::git_commands::git_diff_staged,
            commands::git_commands::git_diff_file,
            commands::git_commands::git_diff_staged_file,
            commands::git_commands::git_stage_file,
            commands::git_commands::git_unstage_file,
            commands::git_commands::git_stage_all,
            commands::git_commands::git_unstage_all,
            commands::git_commands::git_commit,
            commands::git_commands::git_pull,
            commands::git_commands::git_push,
            commands::git_commands::git_branch_info,
            commands::git_commands::git_log,
            commands::git_commands::git_discard_file,
            commands::git_commands::git_init_repo,
            commands::git_commands::git_list_branches,
            commands::git_commands::git_checkout_branch,
            commands::git_commands::git_create_branch,
            commands::git_commands::git_delete_branch,
            commands::git_commands::git_tag_list,
            commands::git_commands::git_create_tag,
            commands::git_commands::git_delete_tag,
            commands::git_commands::git_push_tag,
            commands::git_commands::git_stash_list,
            commands::git_commands::git_stash_save,
            commands::git_commands::git_stash_apply,
            commands::git_commands::git_stash_drop,
            commands::git_commands::git_resolve_ours,
            commands::git_commands::git_resolve_theirs,
            commands::git_commands::git_merge_abort,
            // Project commands
            commands::project_commands::read_directory_tree,
            commands::project_commands::read_directory_children,
            commands::project_commands::read_file_content,
            commands::project_commands::write_file_content,
            commands::project_commands::create_file_or_dir,
            commands::project_commands::rename_entry,
            commands::project_commands::delete_entry,
            commands::project_commands::list_all_files,
            commands::project_commands::search_in_files,
            commands::project_commands::show_in_folder,
            // Env commands
            commands::env_commands::write_env_to_shell,
            commands::env_commands::get_shell_config_path,
            commands::env_commands::detect_platform,
            commands::env_commands::get_claude_resume_enabled,
            commands::env_commands::set_claude_resume_enabled,
            commands::env_commands::fetch_url,
            // Setup commands
            commands::setup_commands::check_environment,
            commands::setup_commands::run_install_command,
            // Terminal commands
            commands::terminal_commands::spawn_terminal,
            commands::terminal_commands::write_terminal,
            commands::terminal_commands::resize_terminal,
            commands::terminal_commands::kill_terminal,
            commands::terminal_commands::terminal_cd,
            commands::terminal_commands::is_terminal_idle,
            commands::terminal_commands::warmup_terminal,
            commands::terminal_commands::claim_warmup_terminal,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
