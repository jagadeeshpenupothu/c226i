use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfFileMetadata {
    pub file_size_bytes: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PrintRequest {
    pub pdf_path: String,
    pub settings: PrintSettings,
}

// `paper_weight`, `tray`, and `quality` are consumed by the CUPS backend but
// not by the Windows backend, so they read as dead code on Windows only.
#[cfg_attr(target_os = "windows", allow(dead_code))]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PrintSettings {
    pub printer_id: String,
    pub paper_size: String,
    pub paper_weight: String,
    pub tray: String,
    pub duplex: String,
    pub copies: u16,
    pub color_mode: String,
    pub quality: String,
    /// Advanced driver options selected in the UI's "More Options" panel, keyed
    /// by the driver's CUPS option keyword. Applied verbatim as `-o keyword=value`
    /// by the CUPS backend. Empty on Windows (driver options are not enumerated
    /// there), so nothing is silently dropped.
    #[serde(default)]
    pub driver_options: HashMap<String, String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintResponse {
    pub job_id: String,
    pub message: String,
}
