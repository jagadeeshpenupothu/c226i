use crate::models::{
    CommandExecutionRecord, DiagnosticExportResponse, HostPrintingEnvironment, PrinterCapabilitySnapshot,
    PrinterDiagnosticIdentity, PrinterDiagnosticSnapshot, QueueJobSnapshot, QueueSnapshot, RawCupsData,
};
use std::path::Path;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const SNAPSHOT_SCHEMA_VERSION: u16 = 1;
const COMMAND_TIMEOUT: Duration = Duration::from_secs(8);

#[cfg(not(target_os = "windows"))]
pub fn capture_snapshot(printer_id: &str, app_version: &str) -> Result<PrinterDiagnosticSnapshot, String> {
    use crate::models::PrinterCapabilities;
    use crate::parser::{parse_lpoptions, parse_printers};
    use crate::printer::build_capabilities;

    let printer_id = printer_id.trim();
    if printer_id.is_empty() {
        return Err("Choose a printer before capturing diagnostics.".to_string());
    }

    let mut commands = DiagnosticCommands::default();
    let os_version = commands.run_optional("macOS version", "sw_vers", &["-productVersion"]);
    let cups_version = commands.run_optional("CUPS version", "cups-config", &["--version"]);
    let server = commands.run_optional("CUPS server", "lpstat", &["-r"]);
    let lpstat_printers = commands.run_optional("Installed printers", "lpstat", &["-p"]);
    let lpstat_devices = commands.run_optional("Printer device URIs", "lpstat", &["-v"]);
    let lpstat_default = commands.run_optional("Default printer", "lpstat", &["-d"]);
    let lpoptions_list = commands.run_optional("Driver options", "lpoptions", &["-p", printer_id, "-l"]);
    let lpoptions_current = commands.run_optional("Current printer options", "lpoptions", &["-p", printer_id]);
    let lpstat_long = commands.run_optional("Printer long status", "lpstat", &["-l", "-p", printer_id]);
    let lpstat_accepting = commands.run_optional("Printer accepting jobs", "lpstat", &["-a", printer_id]);
    let lpstat_queue = commands.run_optional("Printer queue", "lpstat", &["-o", printer_id]);

    let default_printer = lpstat_default.as_deref().and_then(parse_default_printer);
    let installed_printers = parse_printers(
        lpstat_printers.as_deref().unwrap_or_default(),
        lpstat_devices.as_deref().unwrap_or_default(),
        default_printer.as_deref(),
    );

    let parsed_options = parse_lpoptions(lpoptions_list.as_deref().unwrap_or_default());
    let mut raw_capabilities = parsed_options.values().cloned().collect::<Vec<_>>();
    raw_capabilities.sort_by(|left, right| left.keyword.cmp(&right.keyword));
    let normalized_capabilities: Option<PrinterCapabilities> = if parsed_options.is_empty() {
        None
    } else {
        Some(build_capabilities(printer_id, &parsed_options))
    };
    let unknown_driver_options = collect_unknown_driver_options(&raw_capabilities);

    let current_options = parse_current_options(lpoptions_current.as_deref().unwrap_or_default());
    let device_uri = parse_device_uri_for_printer(
        lpstat_devices.as_deref().unwrap_or_default(),
        printer_id,
    )
    .map(|uri| redact_device_uri(&uri));
    let hostname = device_uri.as_deref().and_then(extract_hostname);
    let ip_address = hostname.as_deref().filter(|host| is_ipv4(host)).map(ToOwned::to_owned);
    let identity = PrinterDiagnosticIdentity {
        cups_destination_name: printer_id.to_string(),
        device_uri,
        make_model: current_options
            .get("printer-make-and-model")
            .cloned()
            .or_else(|| parse_lpstat_field(lpstat_long.as_deref().unwrap_or_default(), "Description")),
        driver_or_ppd: current_options
            .get("printer-driver")
            .cloned()
            .or_else(|| parse_lpstat_field(lpstat_long.as_deref().unwrap_or_default(), "Interface")),
        hostname,
        ip_address,
        printer_uuid: current_options.get("printer-uuid").cloned(),
    };

    let raw_cups_data = RawCupsData {
        lpstat_printers,
        lpstat_devices,
        lpstat_default,
        lpoptions_list,
        lpoptions_current,
        lpstat_printer_long: lpstat_long,
        lpstat_accepting,
        lpstat_queue: lpstat_queue.clone(),
        lpstat_server: server.clone(),
    };

    let queue_snapshot = QueueSnapshot {
        raw_output: lpstat_queue.clone().unwrap_or_default(),
        jobs: parse_queue_jobs(lpstat_queue.as_deref().unwrap_or_default()),
    };

    let mut warnings = commands.warnings;
    let mut errors = commands.errors;
    if installed_printers.is_empty() {
        warnings.push("No installed printers were parsed from lpstat output.".to_string());
    }
    if normalized_capabilities.is_none() {
        warnings.push("No driver capabilities were parsed from lpoptions output.".to_string());
    }
    if !installed_printers.iter().any(|printer| printer.id == printer_id) {
        warnings.push(format!(
            "Selected printer '{printer_id}' was not present in parsed lpstat printer list."
        ));
    }
    errors.sort();
    warnings.sort();
    warnings.dedup();
    errors.dedup();

    Ok(PrinterDiagnosticSnapshot {
        schema_version: SNAPSHOT_SCHEMA_VERSION,
        capture_timestamp: now_timestamp(),
        application_version: app_version.to_string(),
        host_environment: HostPrintingEnvironment {
            operating_system_version: os_version.map(|value| value.trim().to_string()),
            cpu_architecture: std::env::consts::ARCH.to_string(),
            cups_version: cups_version.map(|value| value.trim().to_string()),
            cups_server_running: server.as_deref().map(|value| {
                let lower = value.to_lowercase();
                lower.contains("scheduler is running") || lower.contains("server is running")
            }),
            default_printer,
            installed_printers,
        },
        selected_printer_identity: identity,
        raw_cups_data,
        capability_snapshot: PrinterCapabilitySnapshot {
            raw_capabilities,
            normalized_capabilities,
            unknown_driver_options,
        },
        queue_snapshot,
        command_execution_records: commands.records,
        warnings,
        errors,
    })
}

#[cfg(target_os = "windows")]
pub fn capture_snapshot(_printer_id: &str, _app_version: &str) -> Result<PrinterDiagnosticSnapshot, String> {
    Err("CUPS diagnostics are only available on macOS/Linux.".to_string())
}

pub fn export_snapshot(snapshot: &PrinterDiagnosticSnapshot, path: &str) -> Result<DiagnosticExportResponse, String> {
    let destination = Path::new(path);
    if destination.as_os_str().is_empty() || destination.is_dir() {
        return Err("Choose a JSON file path for diagnostic export.".to_string());
    }
    let json = serde_json::to_string_pretty(snapshot)
        .map_err(|error| format!("Unable to serialize diagnostic snapshot: {error}"))?;
    std::fs::write(destination, json)
        .map_err(|error| format!("Unable to write diagnostic snapshot: {error}"))?;
    Ok(DiagnosticExportResponse {
        path: destination.display().to_string(),
    })
}

#[cfg(not(target_os = "windows"))]
#[derive(Default)]
struct DiagnosticCommands {
    records: Vec<CommandExecutionRecord>,
    warnings: Vec<String>,
    errors: Vec<String>,
}

#[cfg(not(target_os = "windows"))]
impl DiagnosticCommands {
    fn run_optional(&mut self, label: &str, program: &str, args: &[&str]) -> Option<String> {
        let record = run_diagnostic_command(label, program, args);
        let output = if record.success {
            Some(record.stdout.clone())
        } else {
            let message = format!(
                "{} failed{}",
                label,
                record
                    .error
                    .as_ref()
                    .map(|error| format!(": {error}"))
                    .unwrap_or_default()
            );
            if record.timed_out || record.error.is_some() {
                self.errors.push(message);
            } else {
                self.warnings.push(message);
            }
            None
        };
        self.records.push(record);
        output
    }
}

#[cfg(not(target_os = "windows"))]
fn run_diagnostic_command(label: &str, program: &str, args: &[&str]) -> CommandExecutionRecord {
    let output = crate::cups::run_cups_command_recorded(program, args, COMMAND_TIMEOUT);
    let success = output.success();
    CommandExecutionRecord {
        label: label.to_string(),
        program: program.to_string(),
        args: args.iter().map(|value| value.to_string()).collect(),
        stdout: output.stdout,
        stderr: output.stderr,
        exit_status: output.exit_status,
        success,
        timed_out: output.timed_out,
        duration_ms: output.duration_ms,
        error: output.spawn_error.or_else(|| {
            output
                .timed_out
                .then(|| format!("Command exceeded {} ms timeout.", COMMAND_TIMEOUT.as_millis()))
        }),
    }
}

fn now_timestamp() -> String {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("unix:{}.{:03}", duration.as_secs(), duration.subsec_millis())
}

fn parse_default_printer(output: &str) -> Option<String> {
    output
        .split(':')
        .nth(1)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn parse_device_uri_for_printer(output: &str, printer_id: &str) -> Option<String> {
    output.lines().find_map(|line| {
        let rest = line.strip_prefix("device for ")?;
        let (name, uri) = rest.split_once(':')?;
        (name.trim() == printer_id).then(|| uri.trim().to_string())
    })
}

pub fn redact_device_uri(uri: &str) -> String {
    let Some(scheme_index) = uri.find("://") else {
        return uri.to_string();
    };
    let authority_start = scheme_index + 3;
    let rest = &uri[authority_start..];
    let authority_end = rest.find('/').map(|index| authority_start + index).unwrap_or(uri.len());
    let authority = &uri[authority_start..authority_end];
    let Some(at_index) = authority.rfind('@') else {
        return uri.to_string();
    };
    let host = &authority[at_index + 1..];
    format!(
        "{}[redacted]@{}{}",
        &uri[..authority_start],
        host,
        &uri[authority_end..]
    )
}

fn extract_hostname(uri: &str) -> Option<String> {
    let scheme_index = uri.find("://")?;
    let authority_start = scheme_index + 3;
    let rest = &uri[authority_start..];
    let authority_end = rest.find('/').unwrap_or(rest.len());
    let authority = &rest[..authority_end];
    let authority = authority.rsplit('@').next().unwrap_or(authority);
    let host = authority
        .trim_start_matches('[')
        .split(']')
        .next()
        .unwrap_or(authority)
        .split(':')
        .next()
        .unwrap_or(authority)
        .trim();
    (!host.is_empty()).then(|| host.to_string())
}

fn is_ipv4(value: &str) -> bool {
    let parts = value.split('.').collect::<Vec<_>>();
    parts.len() == 4
        && parts.iter().all(|part| {
            !part.is_empty() && part.parse::<u8>().is_ok()
        })
}

fn parse_lpstat_field(output: &str, label: &str) -> Option<String> {
    let prefix = format!("{label}:");
    output.lines().find_map(|line| {
        let trimmed = line.trim();
        trimmed
            .strip_prefix(&prefix)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
    })
}

pub fn parse_current_options(output: &str) -> std::collections::BTreeMap<String, String> {
    split_option_tokens(output)
        .into_iter()
        .filter_map(|token| {
            let (key, value) = token.split_once('=')?;
            Some((key.trim().to_string(), value.trim_matches('\'').trim_matches('"').to_string()))
        })
        .collect()
}

fn split_option_tokens(output: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;

    for ch in output.chars() {
        if quote == Some(ch) {
            quote = None;
            current.push(ch);
        } else if quote.is_none() && (ch == '\'' || ch == '"') {
            quote = Some(ch);
            current.push(ch);
        } else if quote.is_none() && ch.is_whitespace() {
            if !current.is_empty() {
                tokens.push(std::mem::take(&mut current));
            }
        } else {
            current.push(ch);
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    tokens
}

pub fn parse_queue_jobs(output: &str) -> Vec<QueueJobSnapshot> {
    output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| {
            let parts = line.split_whitespace().collect::<Vec<_>>();
            let job_id = parts.first()?.to_string();
            let owner = parts.get(1).map(|value| (*value).to_string());
            let size_bytes = parts.get(2).and_then(|value| value.parse::<u64>().ok());
            let submitted_at = (parts.len() > 3).then(|| parts[3..].join(" "));
            Some(QueueJobSnapshot {
                job_id,
                owner,
                size_bytes,
                submitted_at,
                state: None,
                name: None,
                raw_line: line.to_string(),
            })
        })
        .collect()
}

fn collect_unknown_driver_options(options: &[crate::models::ParsedOption]) -> Vec<crate::models::ParsedOption> {
    let known_keywords = [
        "KMInputSlot", "InputSlot", "APInputSlot", "PaperSources", "PageSize", "media",
        "MediaSize", "MediaType", "KMMediaType", "MediaWeight", "KMDuplex", "sides",
        "Duplex", "EFDuplex", "SelectColor", "ColorModel", "ColorMode", "BRColorMode",
        "Resolution", "printer-resolution", "CNResolution", "cupsPrintQuality",
    ];
    options
        .iter()
        .filter(|option| !known_keywords.contains(&option.keyword.as_str()))
        .cloned()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_credentials_in_device_uri() {
        assert_eq!(
            redact_device_uri("ipp://user:secret@printer.local/ipp/print"),
            "ipp://[redacted]@printer.local/ipp/print"
        );
        assert_eq!(redact_device_uri("ipp://printer.local/ipp/print"), "ipp://printer.local/ipp/print");
    }

    #[test]
    fn parses_current_options_with_quoted_values() {
        let parsed = parse_current_options("printer-make-and-model='KONICA MINOLTA C226i' printer-uuid=abc");
        assert_eq!(parsed.get("printer-make-and-model"), Some(&"KONICA MINOLTA C226i".to_string()));
        assert_eq!(parsed.get("printer-uuid"), Some(&"abc".to_string()));
    }

    #[test]
    fn parses_queue_lines_without_panicking_on_malformed_output() {
        let jobs = parse_queue_jobs("Office-123 alice 2048 Wed Jul 8 10:15:00 2026\nmalformed\n");
        assert_eq!(jobs.len(), 2);
        assert_eq!(jobs[0].job_id, "Office-123");
        assert_eq!(jobs[0].owner, Some("alice".to_string()));
        assert_eq!(jobs[0].size_bytes, Some(2048));
        assert_eq!(jobs[1].job_id, "malformed");
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn preserves_unknown_driver_options() {
        let parsed = crate::parser::parse_lpoptions(
            "PageSize/Paper Size: *A4 A3\nVendorMagic/Vendor Magic: *Default Fancy\n",
        );
        let raw = parsed.values().cloned().collect::<Vec<_>>();
        let unknown = collect_unknown_driver_options(&raw);
        assert_eq!(unknown.len(), 1);
        assert_eq!(unknown[0].keyword, "VendorMagic");
        assert_eq!(unknown[0].choices.len(), 2);
    }

    #[test]
    fn serializes_snapshot_schema() {
        let snapshot = PrinterDiagnosticSnapshot {
            schema_version: SNAPSHOT_SCHEMA_VERSION,
            capture_timestamp: "unix:1.000".to_string(),
            application_version: "0.1.0".to_string(),
            host_environment: HostPrintingEnvironment {
                operating_system_version: Some("12.7.6".to_string()),
                cpu_architecture: "x86_64".to_string(),
                cups_version: Some("2.3.4".to_string()),
                cups_server_running: Some(true),
                default_printer: Some("Office".to_string()),
                installed_printers: Vec::new(),
            },
            selected_printer_identity: PrinterDiagnosticIdentity {
                cups_destination_name: "Office".to_string(),
                device_uri: Some("ipp://printer.local/ipp/print".to_string()),
                make_model: None,
                driver_or_ppd: None,
                hostname: Some("printer.local".to_string()),
                ip_address: None,
                printer_uuid: None,
            },
            raw_cups_data: RawCupsData::default(),
            capability_snapshot: PrinterCapabilitySnapshot {
                raw_capabilities: Vec::new(),
                normalized_capabilities: None,
                unknown_driver_options: Vec::new(),
            },
            queue_snapshot: QueueSnapshot {
                raw_output: String::new(),
                jobs: Vec::new(),
            },
            command_execution_records: Vec::new(),
            warnings: Vec::new(),
            errors: Vec::new(),
        };

        let json = serde_json::to_string_pretty(&snapshot).expect("snapshot json");
        assert!(json.contains("\"schemaVersion\": 1"));
        assert!(json.contains("\"cupsDestinationName\": \"Office\""));
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn command_timeout_is_recorded() {
        let output = crate::cups::run_cups_command_recorded("sleep", &["1"], Duration::from_millis(20));
        assert!(output.timed_out);
        assert!(output.duration_ms < 1000);
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    #[ignore]
    fn capture_real_diagnostic_snapshot_when_requested() {
        let printer = std::env::var("PRINTPILOT_DIAGNOSTIC_PRINTER")
            .expect("PRINTPILOT_DIAGNOSTIC_PRINTER must name an installed CUPS destination");
        let snapshot = capture_snapshot(&printer, env!("CARGO_PKG_VERSION")).expect("diagnostic snapshot");
        let output_dir = std::env::var("PRINTPILOT_DIAGNOSTIC_OUTPUT_DIR")
            .unwrap_or_else(|_| "../.local-diagnostics".to_string());
        std::fs::create_dir_all(&output_dir).expect("diagnostic output dir");
        let path = format!("{output_dir}/{printer}-diagnostics.json");
        export_snapshot(&snapshot, &path).expect("export diagnostic snapshot");
        assert_eq!(snapshot.selected_printer_identity.cups_destination_name, printer);
    }
}
