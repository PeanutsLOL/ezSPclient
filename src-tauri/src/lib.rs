//! ezSPclient —— 《卫戍协议：盟约》多平台客户端。
//!
//! 结构：`state`（地址簿与设置的持久化）、`probe`（/healthz 探活）、`commands`（前端命令）、
//! 这里只负责把三者装配成一个 Tauri 应用。设计说明见仓库 `docs/DESIGN.md`。

mod commands;
mod probe;
mod state;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app
                .path()
                .app_config_dir()
                .map_err(|e| format!("无法定位配置目录：{e}"))?;
            std::fs::create_dir_all(&dir)?;
            app.manage(commands::AppState::load(dir));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_state,
            commands::add_server,
            commands::update_server,
            commands::remove_server,
            commands::set_active,
            commands::update_settings,
            commands::probe_server,
            commands::record_probe,
            commands::open_game,
            commands::close_game,
            commands::export_state,
            commands::import_state,
            commands::reset_state,
        ])
        .run(tauri::generate_context!())
        .expect("启动 ezSPclient 失败");
}
