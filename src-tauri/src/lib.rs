mod commands;
mod cups;
mod models;
mod parser;
mod printer;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::list_printers,
            commands::get_printer_capabilities,
            commands::get_pdf_file_metadata,
            commands::print_pdf
        ])
        .run(tauri::generate_context!())
        .expect("error while running PrintPilot");
}
