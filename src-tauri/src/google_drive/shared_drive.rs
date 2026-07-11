use crate::google_drive::models::ManagedFolders;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const DRIVE_API_BASE: &str = "https://www.googleapis.com/drive/v3";
const FOLDER_MIME_TYPE: &str = "application/vnd.google-apps.folder";
const USERS_MARKER: &str = "users-root";
const USER_MARKER: &str = "user-root";
const PDFS_MARKER: &str = "pdfs-root";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct FolderListRequest {
    pub shared_drive_id: String,
    pub parent_id: String,
    pub marker: String,
    pub firebase_uid: Option<String>,
    pub supports_all_drives: bool,
    pub corpora: String,
    pub include_items_from_all_drives: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct FolderCreateRequest {
    pub shared_drive_id: String,
    pub parent_id: String,
    pub name: String,
    pub marker: String,
    pub firebase_uid: Option<String>,
    pub supports_all_drives: bool,
}

pub(crate) trait DriveFolderApi {
    fn list_folders(&self, request: &FolderListRequest) -> Result<Vec<DriveFolder>, String>;
    fn create_folder(&self, request: &FolderCreateRequest) -> Result<DriveFolder, String>;
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DriveFolder {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub trashed: bool,
    #[serde(default)]
    pub app_properties: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DriveFileList {
    #[serde(default)]
    files: Vec<DriveFolder>,
    next_page_token: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateFolderBody<'a> {
    name: &'a str,
    mime_type: &'static str,
    parents: [&'a str; 1],
    app_properties: HashMap<&'static str, &'a str>,
}

pub(crate) struct GoogleDriveFolderApi<'a> {
    client: Client,
    access_token: &'a str,
}

impl<'a> GoogleDriveFolderApi<'a> {
    pub fn new(access_token: &'a str) -> Self {
        Self {
            client: Client::new(),
            access_token,
        }
    }
}

fn escape_query_value(value: &str) -> String {
    value.replace('\\', "\\\\").replace('\'', "\\'")
}

fn folder_query(request: &FolderListRequest) -> String {
    let mut clauses = vec![
        format!("'{}' in parents", escape_query_value(&request.parent_id)),
        format!("mimeType = '{FOLDER_MIME_TYPE}'"),
        "trashed = false".to_string(),
        format!(
            "appProperties has {{ key='printpilotType' and value='{}' }}",
            escape_query_value(&request.marker)
        ),
    ];
    if let Some(uid) = &request.firebase_uid {
        clauses.push(format!(
            "appProperties has {{ key='firebaseUid' and value='{}' }}",
            escape_query_value(uid)
        ));
    }
    clauses.join(" and ")
}

impl DriveFolderApi for GoogleDriveFolderApi<'_> {
    fn list_folders(&self, request: &FolderListRequest) -> Result<Vec<DriveFolder>, String> {
        let mut folders = Vec::new();
        let mut page_token: Option<String> = None;
        loop {
            let mut query = vec![
                ("supportsAllDrives", request.supports_all_drives.to_string()),
                (
                    "includeItemsFromAllDrives",
                    request.include_items_from_all_drives.to_string(),
                ),
                ("corpora", request.corpora.clone()),
                ("driveId", request.shared_drive_id.clone()),
                ("q", folder_query(request)),
                (
                    "fields",
                    "nextPageToken,files(id,name,trashed,appProperties)".to_string(),
                ),
                ("pageSize", "100".to_string()),
            ];
            if let Some(value) = &page_token {
                query.push(("pageToken", value.clone()));
            }
            let response = self
                .client
                .get(format!("{DRIVE_API_BASE}/files"))
                .bearer_auth(self.access_token)
                .query(&query)
                .send()
                .map_err(|_| {
                    "Could not list PrintPilot folders in the configured Shared Drive.".to_string()
                })?;
            if !response.status().is_success() {
                return Err(format!(
                    "Could not access the configured Shared Drive using drive.file ({}).",
                    response.status()
                ));
            }
            let page = response
                .json::<DriveFileList>()
                .map_err(|_| "Google Drive returned an invalid folder listing.".to_string())?;
            folders.extend(page.files.into_iter().filter(|folder| !folder.trashed));
            page_token = page.next_page_token;
            if page_token.is_none() {
                break;
            }
        }
        Ok(folders)
    }

    fn create_folder(&self, request: &FolderCreateRequest) -> Result<DriveFolder, String> {
        let mut app_properties = HashMap::from([
            ("printpilotType", request.marker.as_str()),
            ("schemaVersion", "1"),
        ]);
        if let Some(uid) = &request.firebase_uid {
            app_properties.insert("firebaseUid", uid.as_str());
        }
        let body = CreateFolderBody {
            name: &request.name,
            mime_type: FOLDER_MIME_TYPE,
            parents: [&request.parent_id],
            app_properties,
        };
        let response = self
            .client
            .post(format!("{DRIVE_API_BASE}/files"))
            .bearer_auth(self.access_token)
            .query(&[
                ("supportsAllDrives", request.supports_all_drives.to_string()),
                ("fields", "id,name,trashed,appProperties".to_string()),
            ])
            .json(&body)
            .send()
            .map_err(|_| {
                "Could not create a managed PrintPilot folder in the configured Shared Drive."
                    .to_string()
            })?;
        if !response.status().is_success() {
            return Err(format!(
                "Could not create a managed PrintPilot folder in the configured Shared Drive ({}).",
                response.status()
            ));
        }
        response
            .json::<DriveFolder>()
            .map_err(|_| "Google Drive returned an invalid created folder.".to_string())
    }
}

fn list_request(
    shared_drive_id: &str,
    parent_id: &str,
    marker: &str,
    firebase_uid: Option<&str>,
) -> FolderListRequest {
    FolderListRequest {
        shared_drive_id: shared_drive_id.to_string(),
        parent_id: parent_id.to_string(),
        marker: marker.to_string(),
        firebase_uid: firebase_uid.map(str::to_string),
        supports_all_drives: true,
        corpora: "drive".to_string(),
        include_items_from_all_drives: true,
    }
}

fn create_request(
    shared_drive_id: &str,
    parent_id: &str,
    name: &str,
    marker: &str,
    firebase_uid: Option<&str>,
) -> FolderCreateRequest {
    FolderCreateRequest {
        shared_drive_id: shared_drive_id.to_string(),
        parent_id: parent_id.to_string(),
        name: name.to_string(),
        marker: marker.to_string(),
        firebase_uid: firebase_uid.map(str::to_string),
        supports_all_drives: true,
    }
}

fn find_or_create(
    api: &dyn DriveFolderApi,
    list: FolderListRequest,
    create: FolderCreateRequest,
) -> Result<DriveFolder, String> {
    let mut matches = api.list_folders(&list)?;
    matches.retain(|folder| !folder.trashed);
    matches.sort_by(|left, right| left.id.cmp(&right.id));
    if let Some(folder) = matches.into_iter().next() {
        return Ok(folder);
    }
    api.create_folder(&create)
}

pub(crate) fn ensure_managed_folders(
    api: &dyn DriveFolderApi,
    shared_drive_id: &str,
    firebase_uid: &str,
) -> Result<ManagedFolders, String> {
    let users = find_or_create(
        api,
        list_request(shared_drive_id, shared_drive_id, USERS_MARKER, None),
        create_request(
            shared_drive_id,
            shared_drive_id,
            "users",
            USERS_MARKER,
            None,
        ),
    )?;
    let user = find_or_create(
        api,
        list_request(shared_drive_id, &users.id, USER_MARKER, Some(firebase_uid)),
        create_request(
            shared_drive_id,
            &users.id,
            firebase_uid,
            USER_MARKER,
            Some(firebase_uid),
        ),
    )?;
    let pdfs = find_or_create(
        api,
        list_request(shared_drive_id, &user.id, PDFS_MARKER, Some(firebase_uid)),
        create_request(
            shared_drive_id,
            &user.id,
            "PDFs",
            PDFS_MARKER,
            Some(firebase_uid),
        ),
    )?;
    Ok(ManagedFolders {
        users_folder_id: users.id,
        user_folder_id: user.id,
        pdfs_folder_id: pdfs.id,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[derive(Default)]
    struct MockApi {
        listed: Mutex<Vec<FolderListRequest>>,
        created: Mutex<Vec<FolderCreateRequest>>,
        list_results: Mutex<Vec<Vec<DriveFolder>>>,
        next_id: Mutex<usize>,
    }

    impl MockApi {
        fn with_results(results: Vec<Vec<DriveFolder>>) -> Self {
            Self {
                list_results: Mutex::new(results.into_iter().rev().collect()),
                ..Self::default()
            }
        }
    }

    impl DriveFolderApi for MockApi {
        fn list_folders(&self, request: &FolderListRequest) -> Result<Vec<DriveFolder>, String> {
            self.listed.lock().unwrap().push(request.clone());
            Ok(self.list_results.lock().unwrap().pop().unwrap_or_default())
        }

        fn create_folder(&self, request: &FolderCreateRequest) -> Result<DriveFolder, String> {
            self.created.lock().unwrap().push(request.clone());
            let mut next = self.next_id.lock().unwrap();
            *next += 1;
            Ok(folder(&format!("created-{next}"), &request.name, false))
        }
    }

    fn folder(id: &str, name: &str, trashed: bool) -> DriveFolder {
        DriveFolder {
            id: id.to_string(),
            name: name.to_string(),
            trashed,
            app_properties: HashMap::new(),
        }
    }

    #[test]
    fn discovers_existing_managed_hierarchy_without_creating() {
        let api = MockApi::with_results(vec![
            vec![folder("users-id", "users", false)],
            vec![folder("user-id", "firebase-user", false)],
            vec![folder("pdfs-id", "PDFs", false)],
        ]);
        let result = ensure_managed_folders(&api, "drive-id", "firebase-user").unwrap();
        assert_eq!(
            result,
            ManagedFolders {
                users_folder_id: "users-id".into(),
                user_folder_id: "user-id".into(),
                pdfs_folder_id: "pdfs-id".into(),
            }
        );
        assert!(api.created.lock().unwrap().is_empty());
    }

    #[test]
    fn recreates_missing_or_trashed_folders_without_adopting_old_content() {
        let api = MockApi::with_results(vec![
            vec![folder("trashed-users", "users", true)],
            vec![],
            vec![],
        ]);
        let result = ensure_managed_folders(&api, "drive-id", "firebase-user").unwrap();
        assert_eq!(result.users_folder_id, "created-1");
        assert_eq!(result.user_folder_id, "created-2");
        assert_eq!(result.pdfs_folder_id, "created-3");
        let created = api.created.lock().unwrap();
        assert_eq!(created.len(), 3);
        assert_eq!(created[0].parent_id, "drive-id");
        assert_eq!(created[1].parent_id, "created-1");
        assert_eq!(created[2].parent_id, "created-2");
    }

    #[test]
    fn every_listing_uses_required_shared_drive_parameters_and_uid_markers() {
        let api = MockApi::with_results(vec![vec![], vec![], vec![]]);
        ensure_managed_folders(&api, "drive-id", "firebase-user").unwrap();
        let listed = api.listed.lock().unwrap();
        assert_eq!(listed.len(), 3);
        for request in listed.iter() {
            assert!(request.supports_all_drives);
            assert!(request.include_items_from_all_drives);
            assert_eq!(request.corpora, "drive");
            assert_eq!(request.shared_drive_id, "drive-id");
        }
        assert_eq!(listed[0].firebase_uid, None);
        assert_eq!(listed[1].firebase_uid.as_deref(), Some("firebase-user"));
        assert_eq!(listed[2].firebase_uid.as_deref(), Some("firebase-user"));
    }

    #[test]
    fn created_folders_always_enable_shared_drive_support() {
        let api = MockApi::with_results(vec![vec![], vec![], vec![]]);
        ensure_managed_folders(&api, "drive-id", "firebase-user").unwrap();
        assert!(api
            .created
            .lock()
            .unwrap()
            .iter()
            .all(|request| request.supports_all_drives));
    }
}
