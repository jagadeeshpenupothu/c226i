use crate::google_drive::models::{
    GoogleDriveArchivePdfRequest, GoogleDriveArchivePdfResponse, GoogleDriveArchiveStatus,
    GoogleDriveBaseRequest, GoogleDriveDocument, GoogleDriveDocumentListResponse,
    GoogleDriveDocumentRequest, GoogleDriveDownloadResponse, GoogleDriveQuota,
};
use crate::google_drive::oauth;
use crate::google_drive::shared_drive::{ensure_managed_folders, GoogleDriveFolderApi};
use crate::google_drive::token_store::{OsRefreshTokenStore, RefreshTokenStore};
use rand::{rngs::OsRng, RngCore};
use reqwest::blocking::{Client, RequestBuilder, Response};
use reqwest::header::{CONTENT_LENGTH, CONTENT_RANGE, CONTENT_TYPE, LOCATION};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::thread;
use std::time::Duration;

const DRIVE_API_BASE: &str = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE: &str = "https://www.googleapis.com/upload/drive/v3";
const PDF_MIME_TYPE: &str = "application/pdf";
const PDF_MAGIC: &[u8] = b"%PDF-";
const PDF_MARKER: &str = "pdf";
const MAX_PDF_BYTES: u64 = 500 * 1024 * 1024;
const QUOTA_BYTES: u64 = 10 * 1024 * 1024 * 1024;
const CHUNK_BYTES: usize = 8 * 1024 * 1024;
const MAX_RETRY_ATTEMPTS: u32 = 4;

#[derive(Debug, Clone)]
struct ValidatedPdf {
    byte_size: u64,
    sha256: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DriveFile {
    id: String,
    name: Option<String>,
    size: Option<String>,
    created_time: Option<String>,
    modified_time: Option<String>,
    app_properties: Option<HashMap<String, String>>,
}

#[derive(Debug, Serialize)]
struct TrashFileBody {
    trashed: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DriveFileList {
    #[serde(default)]
    files: Vec<DriveFile>,
    next_page_token: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UploadMetadata<'a> {
    name: &'a str,
    mime_type: &'static str,
    parents: [&'a str; 1],
    app_properties: HashMap<&'static str, String>,
}

struct ArchiveClient {
    client: Client,
    client_id: String,
    refresh_token: String,
    access_token: String,
}

impl ArchiveClient {
    fn new(client_id: &str, refresh_token: String) -> Result<Self, String> {
        let access_token = oauth::refresh_access_token(client_id, &refresh_token)?;
        Ok(Self {
            client: Client::new(),
            client_id: client_id.to_string(),
            refresh_token,
            access_token,
        })
    }

    fn refresh(&mut self) -> Result<(), String> {
        self.access_token = oauth::refresh_access_token(&self.client_id, &self.refresh_token)?;
        Ok(())
    }

    fn execute_with_auth_retry(
        &mut self,
        build: impl Fn(&Client, &str) -> RequestBuilder,
    ) -> Result<Response, String> {
        let response = build(&self.client, &self.access_token)
            .send()
            .map_err(|_| "Google Drive request failed.".to_string())?;
        if response.status() != reqwest::StatusCode::UNAUTHORIZED {
            return Ok(response);
        }
        self.refresh()?;
        build(&self.client, &self.access_token)
            .send()
            .map_err(|_| "Google Drive request failed after refreshing authorization.".to_string())
    }

    fn execute_retryable(
        &mut self,
        mut build: impl FnMut(&Client, &str) -> RequestBuilder,
    ) -> Result<Response, String> {
        let mut refreshed = false;
        let mut last_status: Option<reqwest::StatusCode> = None;
        for attempt in 0..MAX_RETRY_ATTEMPTS {
            let response = build(&self.client, &self.access_token)
                .send()
                .map_err(|_| "Google Drive upload request failed.".to_string())?;
            let status = response.status();
            if status == reqwest::StatusCode::UNAUTHORIZED && !refreshed {
                refreshed = true;
                self.refresh()?;
                continue;
            }
            if !is_retryable_status(status) {
                return Ok(response);
            }
            last_status = Some(status);
            sleep_before_retry(attempt);
        }
        Err(format!(
            "Google Drive upload did not recover after retryable response {}.",
            last_status
                .map(|status| status.to_string())
                .unwrap_or_else(|| "unknown".to_string())
        ))
    }
}

pub(crate) fn archive_pdf(
    request: GoogleDriveArchivePdfRequest,
) -> Result<GoogleDriveArchivePdfResponse, String> {
    let pdf = validate_pdf(&request.path)?;
    let store = OsRefreshTokenStore;
    let refresh_token = store
        .get(&request.firebase_uid, &request.oauth_client_id)?
        .ok_or_else(|| "Connect Google Drive before archiving PDFs.".to_string())?;
    let mut archive = ArchiveClient::new(&request.oauth_client_id, refresh_token)?;

    let folders = {
        let folder_api = GoogleDriveFolderApi::new(&archive.access_token);
        ensure_managed_folders(&folder_api, &request.shared_drive_id, &request.firebase_uid)?
    };

    let duplicate = find_duplicate(
        &mut archive,
        &request.shared_drive_id,
        &folders.pdfs_folder_id,
        &request.firebase_uid,
        &pdf.sha256,
    )?;
    let usage_before = managed_usage(
        &mut archive,
        &request.shared_drive_id,
        &folders.pdfs_folder_id,
        &request.firebase_uid,
    )?;
    if let Some(file) = duplicate {
        return Ok(GoogleDriveArchivePdfResponse {
            status: GoogleDriveArchiveStatus::Duplicate,
            file_id: file.id,
            sha256: pdf.sha256,
            byte_size: pdf.byte_size,
            used_bytes: usage_before,
            quota_bytes: QUOTA_BYTES,
        });
    }
    if usage_before.saturating_add(pdf.byte_size) > QUOTA_BYTES {
        return Err("Google Drive PrintPilot quota exceeded.".to_string());
    }

    let file_id = resumable_upload(
        &mut archive,
        &request,
        &folders.pdfs_folder_id,
        &pdf,
        usage_before,
    )?;
    Ok(GoogleDriveArchivePdfResponse {
        status: GoogleDriveArchiveStatus::Uploaded,
        file_id,
        sha256: pdf.sha256,
        byte_size: pdf.byte_size,
        used_bytes: usage_before + pdf.byte_size,
        quota_bytes: QUOTA_BYTES,
    })
}

pub(crate) fn list_documents(
    request: GoogleDriveBaseRequest,
) -> Result<GoogleDriveDocumentListResponse, String> {
    let (mut archive, pdfs_folder_id) = connected_archive(&request)?;
    let files = list_managed_pdfs(
        &mut archive,
        &request.shared_drive_id,
        &pdfs_folder_id,
        &request.firebase_uid,
        None,
    )?;
    let used_bytes = files.iter().map(managed_file_size).sum();
    Ok(GoogleDriveDocumentListResponse {
        documents: files
            .into_iter()
            .filter_map(|file| map_drive_document(file, &request.firebase_uid))
            .collect(),
        quota: GoogleDriveQuota {
            used_bytes,
            reserved_bytes: 0,
            quota_bytes: QUOTA_BYTES,
        },
    })
}

pub(crate) fn download_document(
    request: GoogleDriveDocumentRequest,
    cache_dir: PathBuf,
) -> Result<GoogleDriveDownloadResponse, String> {
    let (mut archive, pdfs_folder_id) = connected_archive(&GoogleDriveBaseRequest {
        firebase_uid: request.firebase_uid.clone(),
        oauth_client_id: request.oauth_client_id.clone(),
        shared_drive_id: request.shared_drive_id.clone(),
    })?;
    let file = get_owned_document(
        &mut archive,
        &pdfs_folder_id,
        &request.firebase_uid,
        &request.document_id,
    )?
    .ok_or_else(|| "Google Drive PDF was not found.".to_string())?;
    let expected_size = request
        .expected_byte_size
        .unwrap_or_else(|| managed_file_size(&file));
    let expected_sha = request
        .expected_sha256
        .clone()
        .or_else(|| app_property(&file, "sha256"))
        .ok_or_else(|| "Google Drive PDF is missing checksum metadata.".to_string())?;

    fs::create_dir_all(&cache_dir)
        .map_err(|_| "Could not create Google Drive PDF cache directory.".to_string())?;
    let final_path = cache_dir.join(safe_cache_file_name(&request.document_id)?);
    let temp_path = cache_dir.join(format!("{}.download", request.document_id));
    let result = stream_download_to_path(
        &mut archive,
        &request.document_id,
        expected_size,
        &expected_sha,
        &temp_path,
        &final_path,
    );
    if result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }
    result
}

pub(crate) fn trash_document(request: GoogleDriveDocumentRequest) -> Result<(), String> {
    let (mut archive, pdfs_folder_id) = connected_archive(&GoogleDriveBaseRequest {
        firebase_uid: request.firebase_uid.clone(),
        oauth_client_id: request.oauth_client_id.clone(),
        shared_drive_id: request.shared_drive_id.clone(),
    })?;
    let Some(_) = get_owned_document(
        &mut archive,
        &pdfs_folder_id,
        &request.firebase_uid,
        &request.document_id,
    )?
    else {
        return Ok(());
    };
    let response = archive.execute_retryable(|client, token| {
        client
            .patch(format!("{DRIVE_API_BASE}/files/{}", request.document_id))
            .bearer_auth(token)
            .query(&[("supportsAllDrives", "true"), ("fields", "id,trashed")])
            .json(&TrashFileBody { trashed: true })
    })?;
    if response.status().is_success() || response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(());
    }
    Err(format!(
        "Could not delete Google Drive PDF ({}).",
        response.status()
    ))
}

fn connected_archive(request: &GoogleDriveBaseRequest) -> Result<(ArchiveClient, String), String> {
    let store = OsRefreshTokenStore;
    let refresh_token = store
        .get(&request.firebase_uid, &request.oauth_client_id)?
        .ok_or_else(|| "Connect Google Drive before opening Cloud Documents.".to_string())?;
    let archive = ArchiveClient::new(&request.oauth_client_id, refresh_token)?;
    let folders = {
        let folder_api = GoogleDriveFolderApi::new(&archive.access_token);
        ensure_managed_folders(&folder_api, &request.shared_drive_id, &request.firebase_uid)?
    };
    Ok((archive, folders.pdfs_folder_id))
}

fn validate_pdf(path: &str) -> Result<ValidatedPdf, String> {
    let pdf_path = Path::new(path);
    if !pdf_path.exists()
        || !pdf_path.is_file()
        || pdf_path.extension().and_then(|ext| ext.to_str()) != Some("pdf")
    {
        return Err("The selected file is not a PDF.".to_string());
    }
    let metadata = pdf_path
        .metadata()
        .map_err(|_| "Could not read the selected PDF.".to_string())?;
    if metadata.len() == 0 {
        return Err("PDF is empty.".to_string());
    }
    if metadata.len() > MAX_PDF_BYTES {
        return Err("PDF is larger than the 500 MiB Google Drive archive limit.".to_string());
    }

    let mut file =
        File::open(pdf_path).map_err(|_| "Could not open the selected PDF.".to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; 1024 * 1024];
    let mut read_total = 0_u64;
    let mut header = Vec::with_capacity(PDF_MAGIC.len());
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|_| "Could not read the selected PDF.".to_string())?;
        if read == 0 {
            break;
        }
        if header.len() < PDF_MAGIC.len() {
            let missing = PDF_MAGIC.len() - header.len();
            header.extend_from_slice(&buffer[..read.min(missing)]);
        }
        read_total += read as u64;
        hasher.update(&buffer[..read]);
    }
    if read_total != metadata.len() || header.as_slice() != PDF_MAGIC {
        return Err("The selected file is not a valid PDF.".to_string());
    }

    Ok(ValidatedPdf {
        byte_size: metadata.len(),
        sha256: hex::encode(hasher.finalize()),
    })
}

fn list_managed_pdfs(
    archive: &mut ArchiveClient,
    shared_drive_id: &str,
    pdfs_folder_id: &str,
    firebase_uid: &str,
    sha256: Option<&str>,
) -> Result<Vec<DriveFile>, String> {
    let mut files = Vec::new();
    let mut page_token: Option<String> = None;
    loop {
        let query = pdf_query(pdfs_folder_id, firebase_uid, sha256);
        let mut params = vec![
            ("supportsAllDrives", "true".to_string()),
            ("includeItemsFromAllDrives", "true".to_string()),
            ("corpora", "drive".to_string()),
            ("driveId", shared_drive_id.to_string()),
            ("q", query),
            (
                "fields",
                "nextPageToken,files(id,name,size,createdTime,modifiedTime,appProperties)"
                    .to_string(),
            ),
            ("pageSize", "100".to_string()),
        ];
        if let Some(token) = &page_token {
            params.push(("pageToken", token.clone()));
        }
        let response = archive.execute_with_auth_retry(|client, token| {
            client
                .get(format!("{DRIVE_API_BASE}/files"))
                .bearer_auth(token)
                .query(&params)
        })?;
        if !response.status().is_success() {
            return Err(format!(
                "Could not list PrintPilot PDFs in Google Drive ({}).",
                response.status()
            ));
        }
        let page = response
            .json::<DriveFileList>()
            .map_err(|_| "Google Drive returned an invalid PDF listing.".to_string())?;
        files.extend(page.files);
        page_token = page.next_page_token;
        if page_token.is_none() {
            break;
        }
    }
    Ok(files)
}

fn find_duplicate(
    archive: &mut ArchiveClient,
    shared_drive_id: &str,
    pdfs_folder_id: &str,
    firebase_uid: &str,
    sha256: &str,
) -> Result<Option<DriveFile>, String> {
    let mut matches = list_managed_pdfs(
        archive,
        shared_drive_id,
        pdfs_folder_id,
        firebase_uid,
        Some(sha256),
    )?;
    matches.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(matches.into_iter().next())
}

fn managed_usage(
    archive: &mut ArchiveClient,
    shared_drive_id: &str,
    pdfs_folder_id: &str,
    firebase_uid: &str,
) -> Result<u64, String> {
    Ok(
        list_managed_pdfs(archive, shared_drive_id, pdfs_folder_id, firebase_uid, None)?
            .iter()
            .map(managed_file_size)
            .sum(),
    )
}

fn managed_file_size(file: &DriveFile) -> u64 {
    file.app_properties
        .as_ref()
        .and_then(|props| props.get("originalSize"))
        .and_then(|value| value.parse::<u64>().ok())
        .or_else(|| {
            file.size
                .as_deref()
                .and_then(|value| value.parse::<u64>().ok())
        })
        .unwrap_or(0)
}

fn get_owned_document(
    archive: &mut ArchiveClient,
    pdfs_folder_id: &str,
    firebase_uid: &str,
    document_id: &str,
) -> Result<Option<DriveFile>, String> {
    if !is_safe_drive_file_id(document_id) {
        return Err("Google Drive document id is invalid.".to_string());
    }
    let response = archive.execute_with_auth_retry(|client, token| {
        client
            .get(format!("{DRIVE_API_BASE}/files/{document_id}"))
            .bearer_auth(token)
            .query(&[
                ("supportsAllDrives", "true"),
                (
                    "fields",
                    "id,name,size,createdTime,modifiedTime,trashed,parents,appProperties",
                ),
            ])
    })?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !response.status().is_success() {
        return Err(format!(
            "Could not inspect Google Drive PDF ({}).",
            response.status()
        ));
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct DocumentWithParents {
        id: String,
        name: Option<String>,
        size: Option<String>,
        created_time: Option<String>,
        modified_time: Option<String>,
        #[serde(default)]
        trashed: bool,
        #[serde(default)]
        parents: Vec<String>,
        app_properties: Option<HashMap<String, String>>,
    }
    let file = response
        .json::<DocumentWithParents>()
        .map_err(|_| "Google Drive returned invalid document metadata.".to_string())?;
    if file.trashed {
        return Ok(None);
    }
    if !file.parents.iter().any(|parent| parent == pdfs_folder_id) {
        return Err(
            "Google Drive PDF is outside the current user's PrintPilot folder.".to_string(),
        );
    }
    let mapped = DriveFile {
        id: file.id,
        name: file.name,
        size: file.size,
        created_time: file.created_time,
        modified_time: file.modified_time,
        app_properties: file.app_properties,
    };
    if app_property(&mapped, "printpilotType").as_deref() != Some(PDF_MARKER)
        || app_property(&mapped, "firebaseUid").as_deref() != Some(firebase_uid)
    {
        return Err("Google Drive PDF is not owned by the current PrintPilot user.".to_string());
    }
    Ok(Some(mapped))
}

fn map_drive_document(file: DriveFile, firebase_uid: &str) -> Option<GoogleDriveDocument> {
    if app_property(&file, "printpilotType").as_deref() != Some(PDF_MARKER)
        || app_property(&file, "firebaseUid").as_deref() != Some(firebase_uid)
    {
        return None;
    }
    let sha256 = app_property(&file, "sha256")?;
    let byte_size = managed_file_size(&file);
    let display_name = file
        .name
        .clone()
        .unwrap_or_else(|| "Document.pdf".to_string());
    Some(GoogleDriveDocument {
        document_id: file.id.clone(),
        owner_uid: firebase_uid.to_string(),
        sha256,
        original_file_name: app_property(&file, "originalFileName")
            .or_else(|| file.name.clone())
            .unwrap_or_else(|| "Document.pdf".to_string()),
        display_name,
        byte_size,
        page_count: app_property(&file, "pageCount").and_then(|value| value.parse().ok()),
        storage_path: file.id,
        created_at: file
            .created_time
            .clone()
            .unwrap_or_else(|| "1970-01-01T00:00:00Z".to_string()),
        updated_at: file
            .modified_time
            .clone()
            .unwrap_or_else(|| "1970-01-01T00:00:00Z".to_string()),
        last_opened_at: None,
    })
}

fn app_property(file: &DriveFile, key: &str) -> Option<String> {
    file.app_properties
        .as_ref()
        .and_then(|props| props.get(key))
        .cloned()
}

fn stream_download_to_path(
    archive: &mut ArchiveClient,
    document_id: &str,
    expected_size: u64,
    expected_sha256: &str,
    temp_path: &Path,
    final_path: &Path,
) -> Result<GoogleDriveDownloadResponse, String> {
    let mut response = archive.execute_retryable(|client, token| {
        client
            .get(format!("{DRIVE_API_BASE}/files/{document_id}"))
            .bearer_auth(token)
            .query(&[("supportsAllDrives", "true"), ("alt", "media")])
    })?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Err("Google Drive PDF was not found.".to_string());
    }
    if !response.status().is_success() {
        return Err(format!(
            "Could not download Google Drive PDF ({}).",
            response.status()
        ));
    }

    let mut output =
        File::create(temp_path).map_err(|_| "Could not create cached PDF file.".to_string())?;
    let mut hasher = Sha256::new();
    let mut byte_size = 0_u64;
    let mut header = Vec::with_capacity(PDF_MAGIC.len());
    let mut buffer = vec![0_u8; 1024 * 1024];
    loop {
        let read = response
            .read(&mut buffer)
            .map_err(|_| "Could not read Google Drive PDF download.".to_string())?;
        if read == 0 {
            break;
        }
        if header.len() < PDF_MAGIC.len() {
            let missing = PDF_MAGIC.len() - header.len();
            header.extend_from_slice(&buffer[..read.min(missing)]);
        }
        byte_size += read as u64;
        if byte_size > MAX_PDF_BYTES {
            return Err("Downloaded PDF exceeds the 500 MiB limit.".to_string());
        }
        hasher.update(&buffer[..read]);
        output
            .write_all(&buffer[..read])
            .map_err(|_| "Could not write cached PDF file.".to_string())?;
    }
    output
        .flush()
        .map_err(|_| "Could not flush cached PDF file.".to_string())?;
    if byte_size != expected_size {
        return Err("Downloaded PDF size did not match cloud metadata.".to_string());
    }
    if header.as_slice() != PDF_MAGIC {
        return Err("Downloaded file is not a valid PDF.".to_string());
    }
    let sha256 = hex::encode(hasher.finalize());
    if sha256 != expected_sha256 {
        return Err("Downloaded PDF checksum did not match cloud metadata.".to_string());
    }
    fs::rename(temp_path, final_path)
        .map_err(|_| "Could not finalize cached Google Drive PDF.".to_string())?;
    Ok(GoogleDriveDownloadResponse {
        path: final_path.to_string_lossy().to_string(),
        byte_size,
        sha256,
    })
}

fn safe_cache_file_name(document_id: &str) -> Result<String, String> {
    if !is_safe_drive_file_id(document_id) {
        return Err("Google Drive document id is invalid.".to_string());
    }
    Ok(format!("google-drive-{document_id}.pdf"))
}

fn is_safe_drive_file_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 256
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_'))
}

fn resumable_upload(
    archive: &mut ArchiveClient,
    request: &GoogleDriveArchivePdfRequest,
    pdfs_folder_id: &str,
    pdf: &ValidatedPdf,
    usage_before: u64,
) -> Result<String, String> {
    let upload_id = upload_id();
    let metadata = UploadMetadata {
        name: &request.display_name,
        mime_type: PDF_MIME_TYPE,
        parents: [pdfs_folder_id],
        app_properties: HashMap::from([
            ("schemaVersion", "1".to_string()),
            ("printpilotType", PDF_MARKER.to_string()),
            ("firebaseUid", request.firebase_uid.clone()),
            ("sha256", pdf.sha256.clone()),
            ("originalSize", pdf.byte_size.to_string()),
            ("originalFileName", request.original_file_name.clone()),
            (
                "pageCount",
                request
                    .page_count
                    .map(|value| value.to_string())
                    .unwrap_or_default(),
            ),
            ("uploadId", upload_id),
            ("quotaUsageBefore", usage_before.to_string()),
        ]),
    };
    let response = archive.execute_retryable(|client, token| {
        client
            .post(format!("{DRIVE_UPLOAD_BASE}/files"))
            .bearer_auth(token)
            .query(&[
                ("uploadType", "resumable"),
                ("supportsAllDrives", "true"),
                ("fields", "id,name,size,appProperties"),
            ])
            .header("X-Upload-Content-Type", PDF_MIME_TYPE)
            .header("X-Upload-Content-Length", pdf.byte_size)
            .json(&metadata)
    })?;
    if !response.status().is_success() {
        return Err(format!(
            "Could not start Google Drive PDF upload ({}).",
            response.status()
        ));
    }
    let session_url = response
        .headers()
        .get(LOCATION)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string)
        .ok_or_else(|| "Google Drive did not return a resumable upload session.".to_string())?;

    upload_chunks(archive, &request.path, &session_url, pdf.byte_size)
}

fn upload_chunks(
    archive: &mut ArchiveClient,
    path: &str,
    session_url: &str,
    total_size: u64,
) -> Result<String, String> {
    let mut file =
        File::open(path).map_err(|_| "Could not open PDF for Google Drive upload.".to_string())?;
    let mut offset = 0_u64;
    let mut buffer = vec![0_u8; CHUNK_BYTES];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|_| "Could not read PDF for Google Drive upload.".to_string())?;
        if read == 0 {
            break;
        }
        let start = offset;
        let end = offset + read as u64 - 1;
        let body = buffer[..read].to_vec();
        let response = archive.execute_retryable(|client, token| {
            client
                .put(session_url)
                .bearer_auth(token)
                .header(CONTENT_LENGTH, read)
                .header(CONTENT_TYPE, PDF_MIME_TYPE)
                .header(CONTENT_RANGE, format!("bytes {start}-{end}/{total_size}"))
                .body(body.clone())
        })?;
        if response.status() == reqwest::StatusCode::PERMANENT_REDIRECT {
            offset += read as u64;
            continue;
        }
        if response.status().is_success() {
            let file = response.json::<DriveFile>().map_err(|_| {
                "Google Drive returned an invalid uploaded file response.".to_string()
            })?;
            return Ok(file.id);
        }
        return Err(format!(
            "Google Drive PDF upload failed ({}).",
            response.status()
        ));
    }
    Err("Google Drive PDF upload ended before the file was completed.".to_string())
}

fn pdf_query(pdfs_folder_id: &str, firebase_uid: &str, sha256: Option<&str>) -> String {
    let mut clauses = vec![
        format!("'{}' in parents", escape_query_value(pdfs_folder_id)),
        "mimeType = 'application/pdf'".to_string(),
        "trashed = false".to_string(),
        format!(
            "appProperties has {{ key='printpilotType' and value='{}' }}",
            PDF_MARKER
        ),
        format!(
            "appProperties has {{ key='firebaseUid' and value='{}' }}",
            escape_query_value(firebase_uid)
        ),
    ];
    if let Some(value) = sha256 {
        clauses.push(format!(
            "appProperties has {{ key='sha256' and value='{}' }}",
            escape_query_value(value)
        ));
    }
    clauses.join(" and ")
}

fn escape_query_value(value: &str) -> String {
    value.replace('\\', "\\\\").replace('\'', "\\'")
}

fn is_retryable_status(status: reqwest::StatusCode) -> bool {
    status == reqwest::StatusCode::TOO_MANY_REQUESTS
        || status == reqwest::StatusCode::FORBIDDEN
        || status.is_server_error()
}

fn sleep_before_retry(attempt: u32) {
    let base_ms = 250_u64.saturating_mul(2_u64.saturating_pow(attempt));
    let mut jitter = [0_u8; 2];
    OsRng.fill_bytes(&mut jitter);
    let jitter_ms = u16::from_le_bytes(jitter) as u64 % 200;
    thread::sleep(Duration::from_millis(base_ms.min(4_000) + jitter_ms));
}

fn upload_id() -> String {
    let mut bytes = [0_u8; 16];
    OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pdf_query_scopes_by_parent_uid_marker_and_sha() {
        let query = pdf_query("folder'id", "uid\\one", Some("aabb"));
        assert!(query.contains("'folder\\'id' in parents"));
        assert!(query.contains("mimeType = 'application/pdf'"));
        assert!(query.contains("trashed = false"));
        assert!(query.contains("printpilotType"));
        assert!(query.contains("firebaseUid"));
        assert!(query.contains("uid\\\\one"));
        assert!(query.contains("sha256"));
        assert!(query.contains("aabb"));
    }

    #[test]
    fn managed_file_size_prefers_original_size_app_property() {
        let file = DriveFile {
            id: "id".to_string(),
            name: Some("name.pdf".to_string()),
            size: Some("10".to_string()),
            created_time: None,
            modified_time: None,
            app_properties: Some(HashMap::from([(
                "originalSize".to_string(),
                "42".to_string(),
            )])),
        };
        assert_eq!(managed_file_size(&file), 42);
    }
}
