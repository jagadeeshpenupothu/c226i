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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PresentationBookletRequest {
    pub pdf_path: String,
    pub sheet_width_mm: f32,
    pub sheet_height_mm: f32,
    pub pin_guide_count: u8,
    #[serde(default)]
    pub mode: BookletImpositionMode,
}

#[derive(Debug, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum BookletImpositionMode {
    Presentation,
    Normal,
}

impl Default for BookletImpositionMode {
    fn default() -> Self {
        Self::Presentation
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresentationBookletResponse {
    pub path: String,
    pub sheet_side_count: usize,
    pub source_page_count: usize,
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
    #[serde(default)]
    pub normalized_page_selection: String,
    #[serde(default)]
    pub scale_mode: String,
    pub custom_scale_percent: Option<u16>,
    #[serde(default)]
    pub margin_mode: String,
    pub custom_margins_mm: Option<PrintMarginsMm>,
    #[serde(default)]
    pub align: String,
    /// Advanced driver options selected in the UI's "More Options" panel, keyed
    /// by the driver's CUPS option keyword. Applied verbatim as `-o keyword=value`
    /// by the CUPS backend. Empty on Windows (driver options are not enumerated
    /// there), so nothing is silently dropped.
    #[serde(default)]
    pub driver_options: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PrintMarginsMm {
    pub top: f32,
    pub right: f32,
    pub bottom: f32,
    pub left: f32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintResponse {
    pub job_id: String,
    pub message: String,
}
