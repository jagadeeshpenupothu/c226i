use crate::models::{PrintRequest, PrintResponse, PrinterCapabilities, PrinterInfo};

// The active backend is selected at compile time. macOS and Linux route through
// the CUPS command-line tools; Windows routes through PowerShell / WMI.
#[cfg(not(target_os = "windows"))]
mod unix;
#[cfg(not(target_os = "windows"))]
use self::unix as backend;

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
use self::windows as backend;

pub fn list_printers() -> Result<Vec<PrinterInfo>, String> {
    backend::list_printers()
}

pub fn printer_capabilities(printer_id: &str) -> Result<PrinterCapabilities, String> {
    backend::printer_capabilities(printer_id)
}

pub fn print_pdf(request: &PrintRequest) -> Result<PrintResponse, String> {
    backend::print_pdf(request)
}
