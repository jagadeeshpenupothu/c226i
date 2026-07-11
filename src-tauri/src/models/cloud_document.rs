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

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CloudflarePdfPartUploadRequest {
    pub worker_base_url: String,
    pub id_token: String,
    pub document_id: String,
    pub path: String,
    pub part_number: u32,
    pub offset: u64,
    pub byte_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CloudflarePdfPartUploadResponse {
    pub part_number: u32,
    pub etag: String,
    pub byte_size: u64,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CloudflarePdfDownloadRequest {
    pub worker_base_url: String,
    pub id_token: String,
    pub document_id: String,
    pub expected_sha256: String,
}
