use crate::models::{ParsedOption, PrinterCapabilities, PrinterInfo};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandExecutionRecord {
    pub label: String,
    pub program: String,
    pub args: Vec<String>,
    pub stdout: String,
    pub stderr: String,
    pub exit_status: Option<i32>,
    pub success: bool,
    pub timed_out: bool,
    pub duration_ms: u128,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostPrintingEnvironment {
    pub operating_system_version: Option<String>,
    pub cpu_architecture: String,
    pub cups_version: Option<String>,
    pub cups_server_running: Option<bool>,
    pub default_printer: Option<String>,
    pub installed_printers: Vec<PrinterInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrinterDiagnosticIdentity {
    pub cups_destination_name: String,
    pub device_uri: Option<String>,
    pub make_model: Option<String>,
    pub driver_or_ppd: Option<String>,
    pub hostname: Option<String>,
    pub ip_address: Option<String>,
    pub printer_uuid: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RawCupsData {
    pub lpstat_printers: Option<String>,
    pub lpstat_devices: Option<String>,
    pub lpstat_default: Option<String>,
    pub lpoptions_list: Option<String>,
    pub lpoptions_current: Option<String>,
    pub lpstat_printer_long: Option<String>,
    pub lpstat_accepting: Option<String>,
    pub lpstat_queue: Option<String>,
    pub lpstat_server: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueJobSnapshot {
    pub job_id: String,
    pub owner: Option<String>,
    pub size_bytes: Option<u64>,
    pub submitted_at: Option<String>,
    pub state: Option<String>,
    pub name: Option<String>,
    pub raw_line: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueSnapshot {
    pub raw_output: String,
    pub jobs: Vec<QueueJobSnapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrinterCapabilitySnapshot {
    pub raw_capabilities: Vec<ParsedOption>,
    pub normalized_capabilities: Option<PrinterCapabilities>,
    pub unknown_driver_options: Vec<ParsedOption>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrinterDiagnosticSnapshot {
    pub schema_version: u16,
    pub capture_timestamp: String,
    pub application_version: String,
    pub host_environment: HostPrintingEnvironment,
    pub selected_printer_identity: PrinterDiagnosticIdentity,
    pub raw_cups_data: RawCupsData,
    pub capability_snapshot: PrinterCapabilitySnapshot,
    pub queue_snapshot: QueueSnapshot,
    pub command_execution_records: Vec<CommandExecutionRecord>,
    pub warnings: Vec<String>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticExportResponse {
    pub path: String,
}
