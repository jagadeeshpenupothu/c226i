//! macOS / Linux backend.
//!
//! Printer discovery and print submission are routed through the local CUPS
//! command-line tools (`lpstat`, `lpoptions`, `lp`) so the installed printer
//! drivers remain the source of truth. This never talks to printer hardware
//! directly.

use crate::cups;
use crate::models::{PrintRequest, PrintResponse, PrinterCapabilities, PrinterInfo};
use crate::parser::{parse_lpoptions, parse_printers};
use crate::printer::{build_capabilities, build_print_options};

pub fn list_printers() -> Result<Vec<PrinterInfo>, String> {
    let default = cups::default_printer();
    let status_output = cups::printer_status_lines().unwrap_or_default();
    let device_output = cups::printer_device_lines().unwrap_or_default();
    if status_output.is_empty() && device_output.is_empty() {
        return Err("No printers detected.".to_string());
    }

    let printers = parse_printers(&status_output, &device_output, default.as_deref());

    if printers.is_empty() {
        return Err("No printers detected.".to_string());
    }

    Ok(printers)
}

pub fn printer_capabilities(printer_id: &str) -> Result<PrinterCapabilities, String> {
    let output = cups::lpoptions_for_printer(printer_id)
        .map_err(|_| "Unable to read printer capabilities.".to_string())?;
    let parsed = parse_lpoptions(&output);
    Ok(build_capabilities(printer_id, &parsed))
}

pub fn print_pdf(request: &PrintRequest) -> Result<PrintResponse, String> {
    let lpoptions = cups::lpoptions_for_printer(&request.settings.printer_id).unwrap_or_default();
    let parsed_options = parse_lpoptions(&lpoptions);
    let option_args = build_print_options(&request.settings, &parsed_options);
    let output = cups::submit_pdf(&request.pdf_path, &request.settings, option_args)
        .map_err(|error| error.to_string())?;
    let job_id = output
        .split_whitespace()
        .find(|part| part.contains('-') && part.chars().any(|char| char.is_ascii_digit()))
        .unwrap_or("submitted")
        .trim_end_matches('.')
        .to_string();

    Ok(PrintResponse {
        job_id,
        message: "Print job sent safely through the system print service.".to_string(),
    })
}
