use crate::diagnostics;
use crate::google_drive::{
    self, GoogleDriveArchivePdfRequest, GoogleDriveArchivePdfResponse, GoogleDriveBaseRequest,
    GoogleDriveConnectionRequest, GoogleDriveConnectionState, GoogleDriveDocumentListResponse,
    GoogleDriveDocumentRequest, GoogleDriveDownloadResponse,
};
use crate::models::{
    CloudCacheWriteResponse, CloudflarePdfDownloadRequest, CloudflarePdfPartUploadRequest,
    CloudflarePdfPartUploadResponse, DiagnosticExportResponse, PdfFileMetadata,
    PdfValidationResponse, PresentationBookletRequest, PresentationBookletResponse, PrintRequest,
    PrintResponse, PrinterCapabilities,
    PrinterDiagnosticSnapshot, PrinterInfo,
};
use crate::booklet;
use crate::platform;
use reqwest::blocking::{Body, Client};
use reqwest::header::{AUTHORIZATION, CONTENT_LENGTH, CONTENT_TYPE};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use tauri::Manager;

const MAX_CLOUD_PDF_BYTES: u64 = 524_288_000;
const MAX_CLOUDFLARE_PART_BYTES: u64 = 64 * 1024 * 1024;
const PDF_MAGIC: &[u8] = b"%PDF-";

#[derive(Debug, thiserror::Error)]
enum CommandError {
    #[error("No printers detected.")]
    NoPrinters,
    #[error("Choose a PDF before printing.")]
    InvalidPdf,
}

fn is_pdf_file(path: &Path) -> bool {
    path.exists() && path.extension().and_then(|ext| ext.to_str()) == Some("pdf")
}

fn validate_pdf_magic(path: &Path) -> Result<bool, String> {
    let mut file = File::open(path).map_err(|_| CommandError::InvalidPdf.to_string())?;
    let mut header = [0_u8; 5];
    let read = file
        .read(&mut header)
        .map_err(|_| CommandError::InvalidPdf.to_string())?;
    Ok(read == PDF_MAGIC.len() && header == PDF_MAGIC)
}

fn hash_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|_| CommandError::InvalidPdf.to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 1024 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|_| CommandError::InvalidPdf.to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hex::encode(hasher.finalize()))
}

fn safe_cache_file_name(document_id: &str) -> Result<String, String> {
    if document_id.is_empty()
        || document_id.len() > 128
        || !document_id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
    {
        return Err("Invalid cloud document id.".to_string());
    }
    Ok(format!("{document_id}.pdf"))
}

fn cloud_cache_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("Could not resolve app cache directory: {error}"))?
        .join("cloud-documents");
    fs::create_dir_all(&dir).map_err(|error| format!("Could not create cloud cache: {error}"))?;
    Ok(dir)
}

fn clean_worker_base_url(value: &str) -> Result<String, String> {
    let trimmed = value.trim().trim_end_matches('/');
    if !(trimmed.starts_with("https://")
        || trimmed.starts_with("http://127.0.0.1")
        || trimmed.starts_with("http://localhost"))
    {
        return Err("Cloudflare archive URL must use HTTPS, localhost, or 127.0.0.1.".to_string());
    }
    Ok(trimmed.to_string())
}

fn bearer_header(token: &str) -> Result<String, String> {
    let trimmed = token.trim();
    if trimmed.is_empty() || trimmed.contains('\n') || trimmed.contains('\r') {
        return Err("Missing Cloudflare archive authentication token.".to_string());
    }
    Ok(format!("Bearer {trimmed}"))
}

fn read_cloudflare_error(response: reqwest::blocking::Response) -> String {
    let status = response.status();
    match response.text() {
        Ok(text) if !text.trim().is_empty() => {
            format!("Cloudflare archive request failed ({status}): {text}")
        }
        _ => format!("Cloudflare archive request failed ({status})."),
    }
}

#[tauri::command]
pub fn list_printers() -> Result<Vec<PrinterInfo>, String> {
    platform::list_printers()
}

#[tauri::command]
pub fn get_printer_capabilities(printer_id: String) -> Result<PrinterCapabilities, String> {
    platform::printer_capabilities(&printer_id)
}

#[tauri::command]
pub fn get_pdf_file_metadata(path: String) -> Result<PdfFileMetadata, String> {
    let pdf_path = Path::new(&path);
    if !is_pdf_file(pdf_path) {
        return Err(CommandError::InvalidPdf.to_string());
    }

    let metadata = std::fs::metadata(pdf_path).map_err(|_| CommandError::InvalidPdf.to_string())?;
    Ok(PdfFileMetadata {
        file_size_bytes: metadata.len(),
    })
}

#[tauri::command]
pub fn validate_pdf_for_cloud(path: String) -> Result<PdfValidationResponse, String> {
    let pdf_path = Path::new(&path);
    if !pdf_path.exists() || !pdf_path.is_file() {
        return Err(CommandError::InvalidPdf.to_string());
    }
    let metadata = fs::metadata(pdf_path).map_err(|_| CommandError::InvalidPdf.to_string())?;
    if metadata.len() == 0 {
        return Err("PDF is empty.".to_string());
    }
    if metadata.len() > MAX_CLOUD_PDF_BYTES {
        return Err("PDF is larger than the 500 MB cloud archive limit.".to_string());
    }
    let is_pdf = validate_pdf_magic(pdf_path)?;
    if !is_pdf {
        return Err("The selected file is not a valid PDF.".to_string());
    }
    let sha256 = hash_file(pdf_path)?;
    Ok(PdfValidationResponse {
        path,
        byte_size: metadata.len(),
        sha256,
        is_pdf,
    })
}

#[tauri::command]
pub fn resolve_cloud_pdf_cache_path(
    app: tauri::AppHandle,
    document_id: String,
) -> Result<String, String> {
    let file_name = safe_cache_file_name(&document_id)?;
    Ok(cloud_cache_dir(&app)?
        .join(file_name)
        .to_string_lossy()
        .to_string())
}

#[tauri::command]
pub fn download_cloud_pdf_to_cache(
    app: tauri::AppHandle,
    document_id: String,
    download_url: String,
    expected_sha256: String,
) -> Result<CloudCacheWriteResponse, String> {
    let file_name = safe_cache_file_name(&document_id)?;
    let cache_dir = cloud_cache_dir(&app)?;
    let final_path = cache_dir.join(file_name);
    let temp_path = cache_dir.join(format!("{document_id}.download"));

    let mut response = reqwest::blocking::get(&download_url)
        .map_err(|error| format!("Cloud download failed: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Cloud download failed: {error}"))?;

    let mut file = File::create(&temp_path)
        .map_err(|error| format!("Could not create cache file: {error}"))?;
    let mut hasher = Sha256::new();
    let mut byte_size = 0_u64;
    let mut buffer = [0_u8; 1024 * 1024];
    loop {
        let read = response
            .read(&mut buffer)
            .map_err(|error| format!("Cloud download failed: {error}"))?;
        if read == 0 {
            break;
        }
        byte_size += read as u64;
        if byte_size > MAX_CLOUD_PDF_BYTES {
            let _ = fs::remove_file(&temp_path);
            return Err("Downloaded PDF exceeds the 500 MB cloud archive limit.".to_string());
        }
        hasher.update(&buffer[..read]);
        file.write_all(&buffer[..read])
            .map_err(|error| format!("Could not write cache file: {error}"))?;
    }
    file.flush()
        .map_err(|error| format!("Could not flush cache file: {error}"))?;

    let sha256 = hex::encode(hasher.finalize());
    if sha256 != expected_sha256 {
        let _ = fs::remove_file(&temp_path);
        return Err("Downloaded PDF checksum did not match cloud metadata.".to_string());
    }
    if !validate_pdf_magic(&temp_path)? {
        let _ = fs::remove_file(&temp_path);
        return Err("Downloaded file is not a valid PDF.".to_string());
    }

    fs::rename(&temp_path, &final_path)
        .map_err(|error| format!("Could not finalize cached PDF: {error}"))?;
    Ok(CloudCacheWriteResponse {
        path: final_path.to_string_lossy().to_string(),
        byte_size,
        sha256,
    })
}

#[tauri::command]
pub fn upload_cloudflare_pdf_part(
    request: CloudflarePdfPartUploadRequest,
) -> Result<CloudflarePdfPartUploadResponse, String> {
    if request.part_number == 0 {
        return Err("Cloudflare upload part number is invalid.".to_string());
    }
    if request.byte_size == 0 || request.byte_size > MAX_CLOUDFLARE_PART_BYTES {
        return Err("Cloudflare upload part size is invalid.".to_string());
    }

    let pdf_path = Path::new(&request.path);
    if !pdf_path.exists() || !pdf_path.is_file() {
        return Err(CommandError::InvalidPdf.to_string());
    }
    let metadata = fs::metadata(pdf_path).map_err(|_| CommandError::InvalidPdf.to_string())?;
    if metadata.len() > MAX_CLOUD_PDF_BYTES {
        return Err("PDF is larger than the 500 MB cloud archive limit.".to_string());
    }
    let end = request
        .offset
        .checked_add(request.byte_size)
        .ok_or_else(|| "Cloudflare upload part range is invalid.".to_string())?;
    if end > metadata.len() {
        return Err("Cloudflare upload part range exceeds the PDF size.".to_string());
    }

    let mut file = File::open(pdf_path).map_err(|_| CommandError::InvalidPdf.to_string())?;
    file.seek(SeekFrom::Start(request.offset))
        .map_err(|error| format!("Could not read PDF part: {error}"))?;
    let reader = file.take(request.byte_size);
    let url = format!(
        "{}/v1/archive/{}/upload/parts/{}",
        clean_worker_base_url(&request.worker_base_url)?,
        request.document_id,
        request.part_number
    );
    let response = Client::new()
        .put(url)
        .header(AUTHORIZATION, bearer_header(&request.id_token)?)
        .header(CONTENT_TYPE, "application/pdf")
        .header(CONTENT_LENGTH, request.byte_size)
        .body(Body::sized(reader, request.byte_size))
        .send()
        .map_err(|error| format!("Cloudflare upload failed: {error}"))?;

    if !response.status().is_success() {
        return Err(read_cloudflare_error(response));
    }
    let text = response
        .text()
        .map_err(|error| format!("Cloudflare upload response could not be read: {error}"))?;
    let value: serde_json::Value = serde_json::from_str(&text)
        .map_err(|error| format!("Cloudflare upload returned invalid JSON: {error}"))?;
    if value.get("ok").and_then(|ok| ok.as_bool()) != Some(true) {
        return Err(value
            .get("error")
            .and_then(|error| error.as_str())
            .unwrap_or("Cloudflare upload failed.")
            .to_string());
    }
    let etag = value
        .get("etag")
        .and_then(|etag| etag.as_str())
        .filter(|etag| !etag.is_empty())
        .ok_or_else(|| "Cloudflare upload did not return an ETag.".to_string())?
        .to_string();
    let byte_size = value
        .get("byteSize")
        .and_then(|size| size.as_u64())
        .unwrap_or(request.byte_size);
    Ok(CloudflarePdfPartUploadResponse {
        part_number: request.part_number,
        etag,
        byte_size,
    })
}

#[tauri::command]
pub fn download_cloudflare_pdf_to_cache(
    app: tauri::AppHandle,
    request: CloudflarePdfDownloadRequest,
) -> Result<CloudCacheWriteResponse, String> {
    let file_name = safe_cache_file_name(&request.document_id)?;
    let cache_dir = cloud_cache_dir(&app)?;
    let final_path = cache_dir.join(file_name);
    let temp_path = cache_dir.join(format!("{}.download", request.document_id));
    let url = format!(
        "{}/v1/archive/{}/download",
        clean_worker_base_url(&request.worker_base_url)?,
        request.document_id
    );

    let mut response = Client::new()
        .get(url)
        .header(AUTHORIZATION, bearer_header(&request.id_token)?)
        .send()
        .map_err(|error| format!("Cloudflare download failed: {error}"))?;
    if !response.status().is_success() {
        return Err(read_cloudflare_error(response));
    }

    let result = (|| {
        let mut file = File::create(&temp_path)
            .map_err(|error| format!("Could not create cache file: {error}"))?;
        let mut hasher = Sha256::new();
        let mut byte_size = 0_u64;
        let mut buffer = [0_u8; 1024 * 1024];
        loop {
            let read = response
                .read(&mut buffer)
                .map_err(|error| format!("Cloudflare download failed: {error}"))?;
            if read == 0 {
                break;
            }
            byte_size += read as u64;
            if byte_size > MAX_CLOUD_PDF_BYTES {
                return Err("Downloaded PDF exceeds the 500 MB cloud archive limit.".to_string());
            }
            hasher.update(&buffer[..read]);
            file.write_all(&buffer[..read])
                .map_err(|error| format!("Could not write cache file: {error}"))?;
        }
        file.flush()
            .map_err(|error| format!("Could not flush cache file: {error}"))?;

        let sha256 = hex::encode(hasher.finalize());
        if sha256 != request.expected_sha256 {
            return Err("Downloaded PDF checksum did not match cloud metadata.".to_string());
        }
        if !validate_pdf_magic(&temp_path)? {
            return Err("Downloaded file is not a valid PDF.".to_string());
        }

        fs::rename(&temp_path, &final_path)
            .map_err(|error| format!("Could not finalize cached PDF: {error}"))?;
        Ok(CloudCacheWriteResponse {
            path: final_path.to_string_lossy().to_string(),
            byte_size,
            sha256,
        })
    })();

    if result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }
    result
}

#[tauri::command]
pub fn remove_cloud_cached_pdf(app: tauri::AppHandle, document_id: String) -> Result<(), String> {
    let file_name = safe_cache_file_name(&document_id)?;
    let path = cloud_cache_dir(&app)?.join(file_name);
    if path.exists() {
        fs::remove_file(path).map_err(|error| format!("Could not remove cached PDF: {error}"))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn connect_google_drive(
    request: GoogleDriveConnectionRequest,
) -> Result<GoogleDriveConnectionState, String> {
    tauri::async_runtime::spawn_blocking(move || google_drive::connect(request))
        .await
        .map_err(|_| "Google Drive connection task failed.".to_string())?
}

#[tauri::command]
pub async fn get_google_drive_connection_state(
    request: GoogleDriveConnectionRequest,
) -> Result<GoogleDriveConnectionState, String> {
    tauri::async_runtime::spawn_blocking(move || google_drive::connection_state(request))
        .await
        .map_err(|_| "Google Drive connection check failed.".to_string())?
}

#[tauri::command]
pub async fn disconnect_google_drive(
    request: GoogleDriveConnectionRequest,
) -> Result<GoogleDriveConnectionState, String> {
    tauri::async_runtime::spawn_blocking(move || google_drive::disconnect(request))
        .await
        .map_err(|_| "Google Drive disconnect task failed.".to_string())?
}

#[tauri::command]
pub async fn archive_google_drive_pdf(
    request: GoogleDriveArchivePdfRequest,
) -> Result<GoogleDriveArchivePdfResponse, String> {
    tauri::async_runtime::spawn_blocking(move || google_drive::archive_pdf(request))
        .await
        .map_err(|_| "Google Drive archive task failed.".to_string())?
}

#[tauri::command]
pub async fn list_google_drive_documents(
    request: GoogleDriveBaseRequest,
) -> Result<GoogleDriveDocumentListResponse, String> {
    tauri::async_runtime::spawn_blocking(move || google_drive::list_documents(request))
        .await
        .map_err(|_| "Google Drive document list task failed.".to_string())?
}

#[tauri::command]
pub async fn download_google_drive_pdf_to_cache(
    app: tauri::AppHandle,
    request: GoogleDriveDocumentRequest,
) -> Result<GoogleDriveDownloadResponse, String> {
    let cache_dir = cloud_cache_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        google_drive::download_document(request, cache_dir)
    })
    .await
    .map_err(|_| "Google Drive download task failed.".to_string())?
}

#[tauri::command]
pub async fn trash_google_drive_document(
    request: GoogleDriveDocumentRequest,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || google_drive::trash_document(request))
        .await
        .map_err(|_| "Google Drive delete task failed.".to_string())?
}

#[tauri::command]
pub async fn create_presentation_booklet(
    app: tauri::AppHandle,
    request: PresentationBookletRequest,
) -> Result<PresentationBookletResponse, String> {
    let source = Path::new(&request.pdf_path);
    if !is_pdf_file(source) {
        return Err(CommandError::InvalidPdf.to_string());
    }
    if !request.sheet_width_mm.is_finite()
        || !request.sheet_height_mm.is_finite()
        || request.sheet_width_mm <= 0.0
        || request.sheet_height_mm <= 0.0
        || request.pin_guide_count > 4
    {
        return Err("Invalid presentation booklet settings.".to_string());
    }

    let output_dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("Could not resolve app cache directory: {error}"))?
        .join("booklets");
    fs::create_dir_all(&output_dir)
        .map_err(|error| format!("Could not create booklet cache: {error}"))?;

    tauri::async_runtime::spawn_blocking(move || {
        booklet::create_presentation_booklet(&request, &output_dir)
    })
    .await
    .map_err(|_| "Presentation booklet task failed.".to_string())?
}

#[tauri::command]
pub fn print_pdf(request: PrintRequest) -> Result<PrintResponse, String> {
    let pdf_path = Path::new(&request.pdf_path);
    if !is_pdf_file(pdf_path) {
        return Err(CommandError::InvalidPdf.to_string());
    }

    if request.settings.printer_id.trim().is_empty() {
        return Err(CommandError::NoPrinters.to_string());
    }

    platform::print_pdf(&request)
}

#[tauri::command]
pub fn capture_diagnostic_snapshot(
    printer_id: String,
) -> Result<PrinterDiagnosticSnapshot, String> {
    diagnostics::capture_snapshot(&printer_id, env!("CARGO_PKG_VERSION"))
}

#[tauri::command]
pub fn export_diagnostic_snapshot(
    snapshot: PrinterDiagnosticSnapshot,
    path: String,
) -> Result<DiagnosticExportResponse, String> {
    diagnostics::export_snapshot(&snapshot, &path)
}
