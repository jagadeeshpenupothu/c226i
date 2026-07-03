use crate::cups;
use crate::models::{
    PdfFileMetadata, PrintRequest, PrintResponse, PrinterCapabilities, PrinterInfo,
};
use crate::parser::{parse_lpoptions, parse_printers};
use crate::printer::{build_capabilities, build_print_options};
use std::path::Path;

#[derive(Debug, thiserror::Error)]
enum CommandError {
    #[error("No printers detected.")]
    NoPrinters,
    #[error("Unable to read printer capabilities.")]
    CapabilitiesUnavailable,
    #[error("Choose a PDF before printing.")]
    InvalidPdf,
    #[error("Printing could not be completed.")]
    PrintFailed,
}

#[tauri::command]
pub fn list_printers() -> Result<Vec<PrinterInfo>, String> {
    let default = cups::default_printer();
    let status_output = cups::printer_status_lines().unwrap_or_default();
    let device_output = cups::printer_device_lines().unwrap_or_default();
    if status_output.is_empty() && device_output.is_empty() {
        return Err(CommandError::NoPrinters.to_string());
    }

    let printers = parse_printers(&status_output, &device_output, default.as_deref());

    for printer in &printers {
        println!("Printer detected: {}", printer.id);
    }

    if printers.is_empty() {
        return Err(CommandError::NoPrinters.to_string());
    }

    Ok(printers)
}

#[tauri::command]
pub fn get_printer_capabilities(printer_id: String) -> Result<PrinterCapabilities, String> {
    let output = cups::lpoptions_for_printer(&printer_id)
        .map_err(|_| CommandError::CapabilitiesUnavailable.to_string())?;
    let parsed = parse_lpoptions(&output);
    Ok(build_capabilities(&printer_id, &parsed))
}

#[tauri::command]
pub fn get_pdf_file_metadata(path: String) -> Result<PdfFileMetadata, String> {
    let pdf_path = Path::new(&path);
    if !pdf_path.exists() || pdf_path.extension().and_then(|ext| ext.to_str()) != Some("pdf") {
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
    if !pdf_path.exists() || pdf_path.extension().and_then(|ext| ext.to_str()) != Some("pdf") {
        return Err(CommandError::InvalidPdf.to_string());
    }

    if request.settings.printer_id.trim().is_empty() {
        return Err(CommandError::NoPrinters.to_string());
    }

    let lpoptions = cups::lpoptions_for_printer(&request.settings.printer_id).unwrap_or_default();
    let parsed_options = parse_lpoptions(&lpoptions);
    let option_args = build_print_options(&request.settings, &parsed_options);
    let output = cups::submit_pdf(&request.pdf_path, &request.settings, option_args)
        .map_err(|_| CommandError::PrintFailed.to_string())?;
    let job_id = output
        .split_whitespace()
        .find(|part| part.contains('-') && part.chars().any(|char| char.is_ascii_digit()))
        .unwrap_or("submitted")
        .trim_end_matches('.')
        .to_string();

    Ok(PrintResponse {
        job_id,
        message: "Print job sent safely through macOS.".to_string(),
    })
}
