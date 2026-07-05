use crate::models::PrintSettings;
use std::process::Command;

#[derive(Debug, thiserror::Error)]
pub enum CupsError {
    #[error("No printers detected.")]
    NoPrinters,
    #[error("Unable to read printer capabilities.")]
    CapabilitiesUnavailable,
    #[error("Printer is offline or unavailable.")]
    PrinterUnavailable,
    #[error("Permission denied by the print system.")]
    PermissionDenied,
    #[error("The printer rejected these settings (unsupported paper, media, or option).")]
    MediaUnsupported,
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
        return Err(classify_cups_failure(&stderr));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Maps a failed CUPS command's stderr to a specific, user-facing error so the
/// UI can show why a job failed instead of a blanket "printing failed".
fn classify_cups_failure(stderr: &str) -> CupsError {
    if stderr.contains("offline")
        || stderr.contains("not available")
        || stderr.contains("not connected")
        || stderr.contains("unreachable")
    {
        CupsError::PrinterUnavailable
    } else if stderr.contains("permission")
        || stderr.contains("denied")
        || stderr.contains("not permitted")
        || stderr.contains("forbidden")
    {
        CupsError::PermissionDenied
    } else if stderr.contains("unsupported")
        || stderr.contains("unknown option")
        || stderr.contains("bad option")
        || stderr.contains("not supported")
        || stderr.contains("media")
    {
        CupsError::MediaUnsupported
    } else {
        CupsError::CommandFailed
    }
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
