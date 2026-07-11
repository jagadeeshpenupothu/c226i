mod archive;
mod models;
mod oauth;
mod shared_drive;
mod token_store;

pub use models::{
    GoogleDriveArchivePdfRequest, GoogleDriveArchivePdfResponse, GoogleDriveBaseRequest,
    GoogleDriveConnectionRequest, GoogleDriveConnectionState, GoogleDriveDocumentListResponse,
    GoogleDriveDocumentRequest, GoogleDriveDownloadResponse,
};

use shared_drive::{ensure_managed_folders, GoogleDriveFolderApi};
use token_store::{OsRefreshTokenStore, RefreshTokenStore};

fn validate_identifier(value: &str, label: &str, max_len: usize) -> Result<(), String> {
    if value.is_empty()
        || value.len() > max_len
        || !value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
    {
        return Err(format!("{label} is invalid."));
    }
    Ok(())
}

fn validate_firebase_uid(value: &str) -> Result<(), String> {
    if value.trim().is_empty()
        || value.len() > 128
        || value.chars().any(|character| character.is_control())
    {
        return Err("Firebase user id is invalid.".to_string());
    }
    Ok(())
}

fn validate_request(request: &GoogleDriveConnectionRequest) -> Result<(), String> {
    validate_firebase_uid(&request.firebase_uid)?;
    validate_identifier(&request.oauth_client_id, "Google OAuth client id", 256)?;
    validate_identifier(&request.shared_drive_id, "Google Shared Drive id", 128)
}

fn provision(
    access_token: &str,
    request: &GoogleDriveConnectionRequest,
) -> Result<GoogleDriveConnectionState, String> {
    let api = GoogleDriveFolderApi::new(access_token);
    ensure_managed_folders(&api, &request.shared_drive_id, &request.firebase_uid)
        .map(|folders| folders.into_connection_state(request.shared_drive_id.clone()))
}

pub fn connect(
    request: GoogleDriveConnectionRequest,
) -> Result<GoogleDriveConnectionState, String> {
    validate_request(&request)?;
    oauth::authorize_and_complete(&request.oauth_client_id, |grant| {
        let store = OsRefreshTokenStore;
        store.set(
            &request.firebase_uid,
            &request.oauth_client_id,
            &grant.refresh_token,
        )?;
        provision(&grant.access_token, &request)
    })
}

pub fn connection_state(
    request: GoogleDriveConnectionRequest,
) -> Result<GoogleDriveConnectionState, String> {
    validate_request(&request)?;
    let store = OsRefreshTokenStore;
    let Some(refresh_token) = store.get(&request.firebase_uid, &request.oauth_client_id)? else {
        return Ok(GoogleDriveConnectionState::disconnected(
            request.shared_drive_id,
        ));
    };
    let access_token = oauth::refresh_access_token(&request.oauth_client_id, &refresh_token)?;
    provision(&access_token, &request)
}

pub fn disconnect(
    request: GoogleDriveConnectionRequest,
) -> Result<GoogleDriveConnectionState, String> {
    validate_request(&request)?;
    OsRefreshTokenStore.delete(&request.firebase_uid, &request.oauth_client_id)?;
    Ok(GoogleDriveConnectionState::disconnected(
        request.shared_drive_id,
    ))
}

pub fn archive_pdf(
    request: GoogleDriveArchivePdfRequest,
) -> Result<GoogleDriveArchivePdfResponse, String> {
    validate_request(&GoogleDriveConnectionRequest {
        firebase_uid: request.firebase_uid.clone(),
        oauth_client_id: request.oauth_client_id.clone(),
        shared_drive_id: request.shared_drive_id.clone(),
    })?;
    archive::archive_pdf(request)
}

pub fn list_documents(
    request: GoogleDriveBaseRequest,
) -> Result<GoogleDriveDocumentListResponse, String> {
    validate_request(&GoogleDriveConnectionRequest {
        firebase_uid: request.firebase_uid.clone(),
        oauth_client_id: request.oauth_client_id.clone(),
        shared_drive_id: request.shared_drive_id.clone(),
    })?;
    archive::list_documents(request)
}

pub fn download_document(
    request: GoogleDriveDocumentRequest,
    cache_dir: std::path::PathBuf,
) -> Result<GoogleDriveDownloadResponse, String> {
    validate_request(&GoogleDriveConnectionRequest {
        firebase_uid: request.firebase_uid.clone(),
        oauth_client_id: request.oauth_client_id.clone(),
        shared_drive_id: request.shared_drive_id.clone(),
    })?;
    archive::download_document(request, cache_dir)
}

pub fn trash_document(request: GoogleDriveDocumentRequest) -> Result<(), String> {
    validate_request(&GoogleDriveConnectionRequest {
        firebase_uid: request.firebase_uid.clone(),
        oauth_client_id: request.oauth_client_id.clone(),
        shared_drive_id: request.shared_drive_id.clone(),
    })?;
    archive::trash_document(request)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::Mutex;

    #[derive(Default)]
    struct MemoryTokenStore {
        tokens: Mutex<HashMap<String, String>>,
    }

    impl RefreshTokenStore for MemoryTokenStore {
        fn get(&self, firebase_uid: &str, client_id: &str) -> Result<Option<String>, String> {
            Ok(self
                .tokens
                .lock()
                .unwrap()
                .get(&format!("{firebase_uid}:{client_id}"))
                .cloned())
        }

        fn set(
            &self,
            firebase_uid: &str,
            client_id: &str,
            refresh_token: &str,
        ) -> Result<(), String> {
            self.tokens.lock().unwrap().insert(
                format!("{firebase_uid}:{client_id}"),
                refresh_token.to_string(),
            );
            Ok(())
        }

        fn delete(&self, firebase_uid: &str, client_id: &str) -> Result<(), String> {
            self.tokens
                .lock()
                .unwrap()
                .remove(&format!("{firebase_uid}:{client_id}"));
            Ok(())
        }
    }

    #[test]
    fn token_store_is_scoped_by_firebase_uid_and_client_id() {
        let store = MemoryTokenStore::default();
        store.set("uid-a", "client-a", "refresh-a").unwrap();
        assert_eq!(
            store.get("uid-a", "client-a").unwrap().as_deref(),
            Some("refresh-a")
        );
        assert_eq!(store.get("uid-b", "client-a").unwrap(), None);
        assert_eq!(store.get("uid-a", "client-b").unwrap(), None);
        store.delete("uid-a", "client-a").unwrap();
        assert_eq!(store.get("uid-a", "client-a").unwrap(), None);
    }

    #[test]
    fn rejects_control_characters_in_firebase_uid() {
        let request = GoogleDriveConnectionRequest {
            firebase_uid: "uid\nother".into(),
            oauth_client_id: "client.apps.googleusercontent.com".into(),
            shared_drive_id: "drive-id".into(),
        };
        assert!(validate_request(&request).unwrap_err().contains("Firebase"));
    }
}
