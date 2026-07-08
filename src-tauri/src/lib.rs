mod commands;
mod diagnostics;
mod models;
mod platform;

// CUPS parsing and option mapping only apply to the macOS / Linux backend.
#[cfg(not(target_os = "windows"))]
mod cups;
#[cfg(not(target_os = "windows"))]
mod parser;
#[cfg(not(target_os = "windows"))]
mod printer;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // On some Linux/Wayland setups WebKitGTK renders a blank (white) window even
    // though the DOM is present, because of a compositing/paint bug in the
    // Wayland path. Forcing the webview onto the X11 (XWayland) backend paints
    // reliably. Must be set before GTK initializes; only applied when the user
    // hasn't already chosen a backend, so it stays overridable.
    #[cfg(target_os = "linux")]
    {
        // GNOME/Wayland sessions export GDK_BACKEND=wayland, which triggers the
        // blank-window bug; override it to x11 (XWayland). Leave any explicit
        // non-Wayland choice untouched.
        let backend = std::env::var("GDK_BACKEND").unwrap_or_default();
        if backend.is_empty() || backend == "wayland" {
            std::env::set_var("GDK_BACKEND", "x11");
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::list_printers,
            commands::get_printer_capabilities,
            commands::get_pdf_file_metadata,
            commands::validate_pdf_for_cloud,
            commands::resolve_cloud_pdf_cache_path,
            commands::download_cloud_pdf_to_cache,
            commands::remove_cloud_cached_pdf,
            commands::print_pdf,
            commands::capture_diagnostic_snapshot,
            commands::export_diagnostic_snapshot
        ])
        .run(tauri::generate_context!())
        .expect("error while running PrintPilot");
}
