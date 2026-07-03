use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfFileMetadata {
    pub file_size_bytes: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintRequest {
    pub pdf_path: String,
    pub settings: PrintSettings,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintSettings {
    pub printer_id: String,
    pub paper_size: String,
    pub paper_weight: String,
    pub tray: String,
    pub duplex: String,
    pub copies: u16,
    pub color_mode: String,
    pub quality: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintResponse {
    pub job_id: String,
    pub message: String,
}
