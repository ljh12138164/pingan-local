#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use serde_json::Value;

#[tauri::command]
async fn execute(operation:String,input:Value)->Result<Value,String>{
    tauri::async_runtime::spawn_blocking(move||pingan_core::store::execute(&pingan_core::store::database_path(),&operation,input)).await.map_err(|e|e.to_string())?
}

fn main(){
    tauri::Builder::default()
        .setup(|_|{if let Err(error)=pingan_core::open_api::restore(&pingan_core::store::database_path()){eprintln!("{error}");}Ok(())})
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![execute])
        .run(tauri::generate_context!())
        .expect("无法启动平安手札");
}
