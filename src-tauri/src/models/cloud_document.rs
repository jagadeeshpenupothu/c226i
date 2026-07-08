use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PdfValidationResponse {
    pub path: String,
    pub byte_size: u64,
    pub sha256: String,
    pub is_pdf: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CloudCacheWriteResponse {
    pub path: String,
    pub byte_size: u64,
    pub sha256: String,
}
