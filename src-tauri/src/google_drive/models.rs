use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveConnectionRequest {
    pub firebase_uid: String,
    pub oauth_client_id: String,
    pub shared_drive_id: String,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveArchivePdfRequest {
    pub firebase_uid: String,
    pub oauth_client_id: String,
    pub shared_drive_id: String,
    pub path: String,
    pub original_file_name: String,
    pub display_name: String,
    pub page_count: Option<u32>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveBaseRequest {
    pub firebase_uid: String,
    pub oauth_client_id: String,
    pub shared_drive_id: String,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveDocumentRequest {
    pub firebase_uid: String,
    pub oauth_client_id: String,
    pub shared_drive_id: String,
    pub document_id: String,
    pub expected_sha256: Option<String>,
    pub expected_byte_size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveDocument {
    pub document_id: String,
    pub owner_uid: String,
    pub sha256: String,
    pub original_file_name: String,
    pub display_name: String,
    pub byte_size: u64,
    pub page_count: Option<u32>,
    pub storage_path: String,
    pub created_at: String,
    pub updated_at: String,
    pub last_opened_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveQuota {
    pub used_bytes: u64,
    pub reserved_bytes: u64,
    pub quota_bytes: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveDocumentListResponse {
    pub documents: Vec<GoogleDriveDocument>,
    pub quota: GoogleDriveQuota,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveDownloadResponse {
    pub path: String,
    pub byte_size: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveArchivePdfResponse {
    pub status: GoogleDriveArchiveStatus,
    pub file_id: String,
    pub sha256: String,
    pub byte_size: u64,
    pub used_bytes: u64,
    pub quota_bytes: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum GoogleDriveArchiveStatus {
    Uploaded,
    Duplicate,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDriveConnectionState {
    pub connected: bool,
    pub shared_drive_id: String,
    pub users_folder_id: Option<String>,
    pub user_folder_id: Option<String>,
    pub pdfs_folder_id: Option<String>,
}

impl GoogleDriveConnectionState {
    pub fn disconnected(shared_drive_id: String) -> Self {
        Self {
            connected: false,
            shared_drive_id,
            users_folder_id: None,
            user_folder_id: None,
            pdfs_folder_id: None,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct GoogleTokenResponse {
    pub access_token: String,
    pub expires_in: Option<u64>,
    pub refresh_token: Option<String>,
    pub scope: Option<String>,
    pub token_type: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ManagedFolders {
    pub users_folder_id: String,
    pub user_folder_id: String,
    pub pdfs_folder_id: String,
}

impl ManagedFolders {
    pub fn into_connection_state(self, shared_drive_id: String) -> GoogleDriveConnectionState {
        GoogleDriveConnectionState {
            connected: true,
            shared_drive_id,
            users_folder_id: Some(self.users_folder_id),
            user_folder_id: Some(self.user_folder_id),
            pdfs_folder_id: Some(self.pdfs_folder_id),
        }
    }
}
