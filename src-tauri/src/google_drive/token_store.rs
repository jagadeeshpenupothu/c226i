use sha2::{Digest, Sha256};

const KEYCHAIN_SERVICE: &str = "com.printpilot.app.google-drive";

pub(crate) trait RefreshTokenStore: Send + Sync {
    fn get(&self, firebase_uid: &str, client_id: &str) -> Result<Option<String>, String>;
    fn set(&self, firebase_uid: &str, client_id: &str, refresh_token: &str) -> Result<(), String>;
    fn delete(&self, firebase_uid: &str, client_id: &str) -> Result<(), String>;
}

pub(crate) struct OsRefreshTokenStore;

fn account_key(firebase_uid: &str, client_id: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(firebase_uid.as_bytes());
    hasher.update([0]);
    hasher.update(client_id.as_bytes());
    format!("firebase-drive-{}", hex::encode(hasher.finalize()))
}

fn entry(firebase_uid: &str, client_id: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYCHAIN_SERVICE, &account_key(firebase_uid, client_id))
        .map_err(|_| "Could not access the operating system credential store.".to_string())
}

impl RefreshTokenStore for OsRefreshTokenStore {
    fn get(&self, firebase_uid: &str, client_id: &str) -> Result<Option<String>, String> {
        match entry(firebase_uid, client_id)?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err("Could not read Google Drive authorization from the operating system credential store.".to_string()),
        }
    }

    fn set(&self, firebase_uid: &str, client_id: &str, refresh_token: &str) -> Result<(), String> {
        if refresh_token.trim().is_empty() {
            return Err("Google did not return a refresh token.".to_string());
        }
        entry(firebase_uid, client_id)?
            .set_password(refresh_token)
            .map_err(|_| "Could not save Google Drive authorization in the operating system credential store.".to_string())
    }

    fn delete(&self, firebase_uid: &str, client_id: &str) -> Result<(), String> {
        match entry(firebase_uid, client_id)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err("Could not remove Google Drive authorization from the operating system credential store.".to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_is_stable_and_scoped_to_uid_and_client() {
        let first = account_key("firebase-a", "client-a");
        assert_eq!(first, account_key("firebase-a", "client-a"));
        assert_ne!(first, account_key("firebase-b", "client-a"));
        assert_ne!(first, account_key("firebase-a", "client-b"));
        assert!(!first.contains("firebase-a"));
    }
}
