use crate::models::PrintSettings;
use std::process::Command;

#[derive(Debug, thiserror::Error)]
pub enum CupsError {
    #[error("No printers detected.")]
    NoPrinters,
    #[error("Unable to read printer capabilities.")]
    CapabilitiesUnavailable,
    #[error("Printer offline.")]
    PrinterUnavailable,
    #[error("Printing could not be completed.")]
    CommandFailed,
}

pub fn run_cups_command(program: &str, args: &[&str]) -> Result<String, CupsError> {
    let output = Command::new(program)
        .args(args)
        .output()
        .map_err(|_| CupsError::CommandFailed)?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_lowercase();
        if stderr.contains("offline") || stderr.contains("not available") {
            return Err(CupsError::PrinterUnavailable);
        }
        return Err(CupsError::CommandFailed);
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

pub fn printer_status_lines() -> Result<String, CupsError> {
    run_cups_command("lpstat", &["-p"]).map_err(|_| CupsError::NoPrinters)
}

pub fn printer_device_lines() -> Result<String, CupsError> {
    run_cups_command("lpstat", &["-v"]).map_err(|_| CupsError::NoPrinters)
}

pub fn default_printer() -> Option<String> {
    let output = run_cups_command("lpstat", &["-d"]).ok()?;
    output
        .split(':')
        .nth(1)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

pub fn lpoptions_for_printer(printer: &str) -> Result<String, CupsError> {
    run_cups_command("lpoptions", &["-p", printer, "-l"])
        .map_err(|_| CupsError::CapabilitiesUnavailable)
}

pub fn submit_pdf(
    pdf_path: &str,
    settings: &PrintSettings,
    option_args: Vec<String>,
) -> Result<String, CupsError> {
    let mut args = vec![
        "-d".to_string(),
        settings.printer_id.clone(),
        "-n".to_string(),
        settings.copies.clamp(1, 999).to_string(),
    ];

    for option in option_args {
        args.extend(["-o".to_string(), option]);
    }

    args.push(pdf_path.to_string());
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    run_cups_command("lp", &arg_refs)
}
