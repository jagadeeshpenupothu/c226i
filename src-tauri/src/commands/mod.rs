use crate::models::{
    CloudCacheWriteResponse,
    DiagnosticExportResponse,
    PdfFileMetadata, PrintRequest, PrintResponse, PrinterCapabilities, PrinterInfo,
    PrinterDiagnosticSnapshot, PdfValidationResponse,
};
use crate::diagnostics;
use crate::platform;
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::Manager;

const MAX_CLOUD_PDF_BYTES: u64 = 524_288_000;
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
    let read = file.read(&mut header).map_err(|_| CommandError::InvalidPdf.to_string())?;
    Ok(read == PDF_MAGIC.len() && header == PDF_MAGIC)
}

fn hash_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|_| CommandError::InvalidPdf.to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 1024 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(|_| CommandError::InvalidPdf.to_string())?;
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
pub fn resolve_cloud_pdf_cache_path(app: tauri::AppHandle, document_id: String) -> Result<String, String> {
    let file_name = safe_cache_file_name(&document_id)?;
    Ok(cloud_cache_dir(&app)?.join(file_name).to_string_lossy().to_string())
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

    let mut file = File::create(&temp_path).map_err(|error| format!("Could not create cache file: {error}"))?;
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
    file.flush().map_err(|error| format!("Could not flush cache file: {error}"))?;

    let sha256 = hex::encode(hasher.finalize());
    if sha256 != expected_sha256 {
        let _ = fs::remove_file(&temp_path);
        return Err("Downloaded PDF checksum did not match cloud metadata.".to_string());
    }
    if !validate_pdf_magic(&temp_path)? {
        let _ = fs::remove_file(&temp_path);
        return Err("Downloaded file is not a valid PDF.".to_string());
    }

    fs::rename(&temp_path, &final_path).map_err(|error| format!("Could not finalize cached PDF: {error}"))?;
    Ok(CloudCacheWriteResponse {
        path: final_path.to_string_lossy().to_string(),
        byte_size,
        sha256,
    })
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
pub fn capture_diagnostic_snapshot(printer_id: String) -> Result<PrinterDiagnosticSnapshot, String> {
    diagnostics::capture_snapshot(&printer_id, env!("CARGO_PKG_VERSION"))
}

#[tauri::command]
pub fn export_diagnostic_snapshot(
    snapshot: PrinterDiagnosticSnapshot,
    path: String,
) -> Result<DiagnosticExportResponse, String> {
    diagnostics::export_snapshot(&snapshot, &path)
}
