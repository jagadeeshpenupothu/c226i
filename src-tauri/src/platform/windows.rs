//! Windows backend.
//!
//! Windows has no `lp`-style command that prints a PDF to a chosen printer with
//! options, so this backend uses the tools that ship with Windows:
//!
//! * Printer discovery and capabilities come from WMI (`Win32_Printer`) and the
//!   PrintManagement module (`Get-PrintConfiguration`), queried via PowerShell.
//! * Print submission routes the PDF through the OS-registered PDF handler using
//!   the shell `PrintTo` verb, mirroring the app's "route through the OS print
//!   system" safety model. Per-job options (duplex / color / paper) are applied
//!   best-effort through `Set-PrintConfiguration` before printing.
//!
//! Like the CUPS backend, this never opens raw printer sockets or sends
//! page-description commands to hardware directly.

use crate::models::{
    CapabilityChoice, ParsedOption, PrintRequest, PrintResponse, PrintSettings, PrinterCapabilities,
    PrinterInfo, PrinterStatus,
};
use serde::de::DeserializeOwned;
use serde::Deserialize;
use std::os::windows::process::CommandExt;
use std::process::Command;

/// Prevents a console window from flashing when we shell out to PowerShell.
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// WMI `Win32_Printer.PrinterStatus` value for an offline device.
const PRINTER_STATUS_OFFLINE: i64 = 7;

/// WMI `Win32_Printer.Capabilities` values (see the Win32_Printer schema).
const CAPABILITY_COLOR: i64 = 3;
const CAPABILITY_DUPLEX: i64 = 4;

const LIST_SCRIPT: &str = "$ErrorActionPreference='SilentlyContinue'; \
$printers = @(Get-CimInstance Win32_Printer | \
Select-Object Name, Default, WorkOffline, PrinterStatus); \
$printers | ConvertTo-Json -Compress -Depth 3";

const CAPABILITIES_BODY: &str = "\
$p = Get-CimInstance Win32_Printer | Where-Object { $_.Name -eq $name } | Select-Object -First 1; \
if (-not $p) { exit 1 }; \
$cfg = Get-PrintConfiguration -PrinterName $name -ErrorAction SilentlyContinue; \
$caps = @(); if ($p.Capabilities) { $caps = @($p.Capabilities) }; \
$papers = @(); if ($p.PrinterPaperNames) { $papers = @($p.PrinterPaperNames) }; \
$currentColor = $null; if ($cfg) { $currentColor = [bool]$cfg.Color }; \
$currentDuplex = $null; if ($cfg) { $currentDuplex = [string]$cfg.DuplexingMode }; \
$currentPaper = $null; if ($cfg) { $currentPaper = [string]$cfg.PaperSize }; \
$out = [ordered]@{ PaperSizes = $papers; Capabilities = $caps; CurrentColor = $currentColor; \
CurrentDuplex = $currentDuplex; CurrentPaper = $currentPaper }; \
$out | ConvertTo-Json -Compress -Depth 3";

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct RawPrinter {
    name: Option<String>,
    default: Option<bool>,
    work_offline: Option<bool>,
    printer_status: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct RawCapabilities {
    paper_sizes: Option<Vec<String>>,
    capabilities: Option<Vec<i64>>,
    current_color: Option<bool>,
    current_duplex: Option<String>,
    current_paper: Option<String>,
}

pub fn list_printers() -> Result<Vec<PrinterInfo>, String> {
    let raw = run_powershell(LIST_SCRIPT).unwrap_or_default();
    let printers: Vec<PrinterInfo> = parse_json_flexible::<RawPrinter>(&raw)
        .into_iter()
        .filter_map(map_printer)
        .collect();

    if printers.is_empty() {
        return Err("No printers detected.".to_string());
    }

    Ok(printers)
}

pub fn printer_capabilities(printer_id: &str) -> Result<PrinterCapabilities, String> {
    let mut script = String::from("$ErrorActionPreference='SilentlyContinue'; $name=");
    script.push_str(&ps_single_quote(printer_id));
    script.push_str("; ");
    script.push_str(CAPABILITIES_BODY);

    let raw = run_powershell(&script)
        .map_err(|_| "Unable to read printer capabilities.".to_string())?;
    let parsed: RawCapabilities = serde_json::from_str(raw.trim())
        .map_err(|_| "Unable to read printer capabilities.".to_string())?;

    let caps = parsed.capabilities.unwrap_or_default();
    let color_supported = caps.contains(&CAPABILITY_COLOR);
    let duplex_supported = caps.contains(&CAPABILITY_DUPLEX);

    let current_paper = parsed
        .current_paper
        .as_deref()
        .filter(|value| !value.trim().is_empty());
    let paper_sizes: Vec<CapabilityChoice> = parsed
        .paper_sizes
        .unwrap_or_default()
        .into_iter()
        .filter(|name| !name.trim().is_empty())
        .map(|name| {
            let is_default = Some(name.as_str()) == current_paper;
            CapabilityChoice {
                label: name.clone(),
                value: name,
                is_default,
            }
        })
        .collect();

    let duplex_modes = windows_duplex_modes(duplex_supported, parsed.current_duplex.as_deref());
    let color_modes = windows_color_modes(color_supported, parsed.current_color);

    // Trays, media types, and resolutions are not reliably enumerable through
    // WMI, so they are left empty (best-effort). The frontend renders empty
    // capability groups gracefully.
    Ok(PrinterCapabilities::new(
        printer_id.to_string(),
        Vec::new(),
        paper_sizes,
        Vec::new(),
        duplex_modes,
        color_modes,
        Vec::new(),
        Vec::<ParsedOption>::new(),
    ))
}

pub fn print_pdf(request: &PrintRequest) -> Result<PrintResponse, String> {
    let settings: &PrintSettings = &request.settings;
    if !settings.normalized_page_selection.trim().is_empty() {
        return Err("Page selection requires the macOS/Linux CUPS backend in this build.".to_string());
    }
    if matches!(settings.scale_mode.as_str(), "actual" | "custom")
        || matches!(settings.margin_mode.as_str(), "none" | "custom")
        || (!settings.align.is_empty() && settings.align != "center")
    {
        return Err("This Windows print path cannot safely honor scaling, custom margins, or position without PDF transformation.".to_string());
    }

    let mut script = String::from("$ErrorActionPreference='Stop'; $name=");
    script.push_str(&ps_single_quote(&settings.printer_id));
    script.push_str("; $file=");
    script.push_str(&ps_single_quote(&request.pdf_path));
    script.push_str("; ");

    // Best-effort per-job options. These are applied to the printer's
    // configuration because the PrintTo verb cannot carry per-job options;
    // failures are swallowed so printing still proceeds.
    if let Some(mode) = windows_duplex_arg(&settings.duplex) {
        script.push_str("try { Set-PrintConfiguration -PrinterName $name -DuplexingMode ");
        script.push_str(mode);
        script.push_str(" -ErrorAction Stop } catch {}; ");
    }
    if let Some(color) = windows_color_arg(&settings.color_mode) {
        script.push_str("try { Set-PrintConfiguration -PrinterName $name -Color ");
        script.push_str(color);
        script.push_str(" -ErrorAction Stop } catch {}; ");
    }
    if !settings.paper_size.trim().is_empty() {
        script.push_str("try { Set-PrintConfiguration -PrinterName $name -PaperSize ");
        script.push_str(&ps_single_quote(&settings.paper_size));
        script.push_str(" -ErrorAction Stop } catch {}; ");
    }

    // Each PrintTo invocation spools one job; loop for copies. Clamped so a
    // stray value can't launch the handler an unbounded number of times.
    let copies = settings.copies.clamp(1, 99);
    script.push_str("for ($i = 0; $i -lt ");
    script.push_str(&copies.to_string());
    script.push_str("; $i++) { Start-Process -FilePath $file -Verb PrintTo -ArgumentList $name -ErrorAction Stop; Start-Sleep -Milliseconds 300 }; ");
    script.push_str("Write-Output 'submitted'");

    run_powershell(&script)?;

    Ok(PrintResponse {
        job_id: "submitted".to_string(),
        message: "Print job sent through Windows.".to_string(),
    })
}

fn map_printer(entry: RawPrinter) -> Option<PrinterInfo> {
    let name = entry.name?.trim().to_string();
    if name.is_empty() {
        return None;
    }

    let offline =
        entry.work_offline.unwrap_or(false) || entry.printer_status == Some(PRINTER_STATUS_OFFLINE);
    let status = if offline {
        PrinterStatus::Offline
    } else if entry.printer_status.is_some() || entry.work_offline == Some(false) {
        PrinterStatus::Online
    } else {
        PrinterStatus::Unknown
    };
    let status_message = if offline {
        "Printer offline.".to_string()
    } else {
        String::new()
    };

    Some(PrinterInfo {
        id: name.clone(),
        name,
        is_default: entry.default.unwrap_or(false),
        status,
        status_message,
    })
}

fn windows_duplex_modes(supported: bool, current: Option<&str>) -> Vec<CapabilityChoice> {
    if !supported {
        return vec![choice(
            "OneSided",
            "Single",
            current == Some("OneSided") || current.is_none(),
        )];
    }

    [
        ("OneSided", "Single"),
        ("TwoSidedLongEdge", "Double"),
        ("TwoSidedShortEdge", "Double (Short Edge)"),
    ]
    .iter()
    .map(|(value, label)| choice(value, label, current == Some(*value)))
    .collect()
}

fn windows_color_modes(supported: bool, current: Option<bool>) -> Vec<CapabilityChoice> {
    if !supported {
        return vec![choice("Grayscale", "Grayscale", true)];
    }

    vec![
        choice("Color", "Color", current != Some(false)),
        choice("Grayscale", "Grayscale", current == Some(false)),
    ]
}

/// Maps a duplex capability value to a `Set-PrintConfiguration -DuplexingMode`
/// argument. Returns a static string so nothing user-supplied is interpolated
/// into the PowerShell script.
fn windows_duplex_arg(value: &str) -> Option<&'static str> {
    match value {
        "OneSided" => Some("OneSided"),
        "TwoSidedLongEdge" => Some("TwoSidedLongEdge"),
        "TwoSidedShortEdge" => Some("TwoSidedShortEdge"),
        _ => None,
    }
}

fn windows_color_arg(value: &str) -> Option<&'static str> {
    match value {
        "Color" => Some("$true"),
        "Grayscale" | "Monochrome" => Some("$false"),
        _ => None,
    }
}

fn choice(value: &str, label: &str, is_default: bool) -> CapabilityChoice {
    CapabilityChoice {
        value: value.to_string(),
        label: label.to_string(),
        is_default,
    }
}

/// Wraps a value as a PowerShell single-quoted string literal. Single quotes
/// are the only character that needs escaping (by doubling), which makes this
/// safe for printer names and paths containing spaces or backslashes.
fn ps_single_quote(value: &str) -> String {
    let escaped = value.replace('\'', "''");
    format!("'{escaped}'")
}

/// `ConvertTo-Json` emits a bare object for a single result and an array for
/// multiple, so accept either shape.
fn parse_json_flexible<T: DeserializeOwned>(raw: &str) -> Vec<T> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    if let Ok(items) = serde_json::from_str::<Vec<T>>(trimmed) {
        return items;
    }
    serde_json::from_str::<T>(trimmed)
        .map(|item| vec![item])
        .unwrap_or_default()
}

fn run_powershell(script: &str) -> Result<String, String> {
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|_| "Windows print system is unavailable.".to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_lowercase();
        if stderr.contains("offline") || stderr.contains("not available") || stderr.contains("unavailable") {
            return Err("Printer is offline or unavailable.".to_string());
        }
        if stderr.contains("denied") || stderr.contains("permission") {
            return Err("Permission denied by the print system.".to_string());
        }
        if stderr.contains("cannot find") || (stderr.contains("not found") && stderr.contains("print")) {
            return Err("Printer not found, or no PDF handler is available to print.".to_string());
        }
        return Err("Printing could not be completed.".to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}
