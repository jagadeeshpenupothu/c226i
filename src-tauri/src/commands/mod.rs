use crate::models::{
    PdfFileMetadata, PrintRequest, PrintResponse, PrinterCapabilities, PrinterInfo,
};
use crate::platform;
use std::path::Path;

#[derive(Debug, thiserror::Error)]
enum CommandError {
    #[error("No printers detected.")]
    NoPrinters,
    #[error("Choose a PDF before printing.")]
    InvalidPdf,
}

fn is_pdf_file(path: &Path) -> bool {
    path.exists() && path.extension().and_then(|ext| ext.to_str()) == Some("pdf")
}

#[tauri::command]
pub fn list_printers() -> Result<Vec<PrinterInfo>, String> {
    platform::list_printers()
}

#[tauri::command]
pub fn get_printer_capabilities(printer_id: String) -> Result<PrinterCapabilities, String> {
    platform::printer_capabilities(&printer_id)
}

#[tauri::command]
pub fn get_pdf_file_metadata(path: String) -> Result<PdfFileMetadata, String> {
    let pdf_path = Path::new(&path);
    if !is_pdf_file(pdf_path) {
        return Err(CommandError::InvalidPdf.to_string());
    }

    let metadata = std::fs::metadata(pdf_path).map_err(|_| CommandError::InvalidPdf.to_string())?;
    Ok(PdfFileMetadata {
        file_size_bytes: metadata.len(),
    })
}

#[tauri::command]
pub fn print_pdf(request: PrintRequest) -> Result<PrintResponse, String> {
    let pdf_path = Path::new(&request.pdf_path);
    if !is_pdf_file(pdf_path) {
        return Err(CommandError::InvalidPdf.to_string());
    }

    if request.settings.printer_id.trim().is_empty() {
        return Err(CommandError::NoPrinters.to_string());
    }

    platform::print_pdf(&request)
}
