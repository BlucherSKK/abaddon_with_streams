pub mod commands;
pub mod discord;
pub mod state;

use commands::*;
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::new())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            login,
            logout,
            get_me,
            get_guilds,
            get_dms,
            get_channels,
            get_messages,
            send_message,
            delete_message,
            join_voice,
            leave_voice,
            start_stream,
            stop_stream,
            watch_stream,
            set_stream_paused,
            set_presence,
            get_guild_voice_states,
            get_channel_voice_states,
            get_user,
            set_speaking,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
