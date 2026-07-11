use crate::google_drive::models::GoogleTokenResponse;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::{rngs::OsRng, RngCore};
use reqwest::blocking::Client;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::Command;
use std::thread;
use std::time::{Duration, Instant};
use url::Url;

pub(crate) const DRIVE_FILE_SCOPE: &str = "https://www.googleapis.com/auth/drive.file";
const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const CALLBACK_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Debug)]
pub(crate) struct OAuthGrant {
    pub access_token: String,
    pub refresh_token: String,
}

struct PendingCallback {
    code: String,
    stream: TcpStream,
}

#[derive(Debug, Deserialize)]
struct GoogleTokenErrorResponse {
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DesktopOAuthClientFile {
    installed: Option<InstalledOAuthClient>,
}

#[derive(Debug, Deserialize)]
struct InstalledOAuthClient {
    client_id: String,
    client_secret: Option<String>,
}

fn random_urlsafe(bytes: usize) -> String {
    let mut value = vec![0_u8; bytes];
    OsRng.fill_bytes(&mut value);
    URL_SAFE_NO_PAD.encode(value)
}

fn pkce_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

fn authorization_url(
    client_id: &str,
    redirect_uri: &str,
    state: &str,
    challenge: &str,
) -> Result<Url, String> {
    let mut url =
        Url::parse(AUTH_URL).map_err(|_| "Google OAuth endpoint is invalid.".to_string())?;
    url.query_pairs_mut()
        .append_pair("client_id", client_id)
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", DRIVE_FILE_SCOPE)
        .append_pair("code_challenge", challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("access_type", "offline")
        .append_pair("include_granted_scopes", "false")
        .append_pair("prompt", "consent")
        .append_pair("state", state);
    Ok(url)
}

fn open_system_browser(url: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let status = Command::new("open").arg(url).status();
    #[cfg(target_os = "windows")]
    let status = Command::new("cmd").args(["/C", "start", "", url]).status();
    #[cfg(all(unix, not(target_os = "macos")))]
    let status = Command::new("xdg-open").arg(url).status();

    match status {
        Ok(value) if value.success() => Ok(()),
        _ => Err("Could not open the system browser for Google Drive authorization.".to_string()),
    }
}

fn callback_code(callback_url: &str, expected_state: &str) -> Result<String, String> {
    let url =
        Url::parse(callback_url).map_err(|_| "Google OAuth callback was invalid.".to_string())?;
    let state = url
        .query_pairs()
        .find(|(key, _)| key == "state")
        .map(|(_, value)| value.into_owned());
    if state.as_deref() != Some(expected_state) {
        return Err("Google OAuth state validation failed.".to_string());
    }
    if let Some(error) = url
        .query_pairs()
        .find(|(key, _)| key == "error")
        .map(|(_, value)| value.into_owned())
    {
        return Err(format!("Google Drive authorization was denied: {error}"));
    }
    url.query_pairs()
        .find(|(key, _)| key == "code")
        .map(|(_, value)| value.into_owned())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Google OAuth callback did not contain an authorization code.".to_string())
}

fn respond(stream: &mut TcpStream, status: &str, message: &str) {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{message}",
        message.len()
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

fn respond_success(stream: &mut TcpStream) {
    respond(
        stream,
        "200 OK",
        "PrintPilot is connected to Google Drive. You can close this window.",
    );
}

fn respond_failure(stream: &mut TcpStream) {
    respond(
        stream,
        "400 Bad Request",
        "PrintPilot could not complete the Google Drive connection. Return to PrintPilot for details.",
    );
}

fn wait_for_callback(
    listener: TcpListener,
    redirect_origin: &str,
    expected_state: &str,
) -> Result<PendingCallback, String> {
    listener
        .set_nonblocking(true)
        .map_err(|_| "Could not configure the Google OAuth callback listener.".to_string())?;
    let deadline = Instant::now() + CALLBACK_TIMEOUT;
    while Instant::now() < deadline {
        match listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                let mut buffer = [0_u8; 8192];
                let count = stream
                    .read(&mut buffer)
                    .map_err(|_| "Could not read the Google OAuth callback.".to_string())?;
                let request = String::from_utf8_lossy(&buffer[..count]);
                let target = request
                    .lines()
                    .next()
                    .and_then(|line| line.split_whitespace().nth(1))
                    .ok_or_else(|| "Google OAuth callback request was invalid.".to_string())?;
                let callback = format!("{redirect_origin}{target}");
                match callback_code(&callback, expected_state) {
                    Ok(code) => return Ok(PendingCallback { code, stream }),
                    Err(error) => {
                        respond_failure(&mut stream);
                        return Err(error);
                    }
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(100));
            }
            Err(_) => return Err("Google OAuth callback listener failed.".to_string()),
        }
    }
    Err("Google Drive authorization timed out.".to_string())
}

fn google_token_error_message(status: reqwest::StatusCode, body: &str, context: &str) -> String {
    let parsed = serde_json::from_str::<GoogleTokenErrorResponse>(body).ok();
    let code = parsed
        .as_ref()
        .and_then(|value| value.error.as_deref())
        .filter(|value| !value.trim().is_empty());
    let description = parsed
        .as_ref()
        .and_then(|value| value.error_description.as_deref())
        .filter(|value| !value.trim().is_empty());

    match (code, description) {
        (Some(code), Some(description)) => {
            format!("{context} ({status}): {code} - {description}")
        }
        (Some(code), None) => format!("{context} ({status}): {code}"),
        _ => format!("{context} ({status})."),
    }
}

fn validate_token_response(
    token: GoogleTokenResponse,
    require_refresh_token: bool,
) -> Result<OAuthGrant, String> {
    if token.access_token.trim().is_empty() {
        return Err("Google did not return an access token.".to_string());
    }
    if token
        .token_type
        .as_deref()
        .is_some_and(|value| !value.eq_ignore_ascii_case("Bearer"))
    {
        return Err("Google returned an unsupported token type.".to_string());
    }
    if let Some(scope) = token.scope.as_deref() {
        if !scope
            .split_whitespace()
            .any(|value| value == DRIVE_FILE_SCOPE)
        {
            return Err("Google did not grant the required drive.file scope.".to_string());
        }
    }
    let _ = token.expires_in;
    let refresh_token = token.refresh_token.unwrap_or_default();
    if require_refresh_token && refresh_token.trim().is_empty() {
        return Err("Google did not return a refresh token. Reconnect Google Drive and grant offline access.".to_string());
    }
    Ok(OAuthGrant {
        access_token: token.access_token,
        refresh_token,
    })
}

fn desktop_oauth_json_paths(client_id: &str) -> Vec<PathBuf> {
    let file_name = format!("client_secret_{client_id}.json");
    let mut paths = Vec::new();
    if let Ok(path) = std::env::var("PRINTPILOT_GOOGLE_DRIVE_OAUTH_CLIENT_JSON") {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            paths.push(PathBuf::from(trimmed));
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        paths.push(PathBuf::from(home).join("Desktop").join(file_name));
    }
    paths
}

fn read_desktop_client_secret(client_id: &str) -> Result<Option<String>, String> {
    if let Ok(secret) = std::env::var("PRINTPILOT_GOOGLE_DRIVE_OAUTH_CLIENT_SECRET") {
        let trimmed = secret.trim();
        if !trimmed.is_empty() {
            return Ok(Some(trimmed.to_string()));
        }
    }

    if let Some(secret) = option_env!("PRINTPILOT_GOOGLE_DRIVE_OAUTH_CLIENT_SECRET") {
        let trimmed = secret.trim();
        if !trimmed.is_empty() {
            return Ok(Some(trimmed.to_string()));
        }
    }

    for path in desktop_oauth_json_paths(client_id) {
        if !path.exists() {
            continue;
        }
        let contents = fs::read_to_string(&path).map_err(|_| {
            "Could not read the Google Drive desktop OAuth client JSON.".to_string()
        })?;
        let client = serde_json::from_str::<DesktopOAuthClientFile>(&contents)
            .map_err(|_| "Google Drive desktop OAuth client JSON was invalid.".to_string())?
            .installed
            .ok_or_else(|| {
                "Google Drive OAuth client JSON is not an installed Desktop client.".to_string()
            })?;
        if client.client_id != client_id {
            return Err(
                "Google Drive desktop OAuth client JSON did not match the configured client id."
                    .to_string(),
            );
        }
        let Some(secret) = client.client_secret else {
            return Ok(None);
        };
        let trimmed = secret.trim();
        if !trimmed.is_empty() {
            return Ok(Some(trimmed.to_string()));
        }
    }

    Ok(None)
}

fn exchange_authorization_code(
    client: &Client,
    client_id: &str,
    client_secret: Option<&str>,
    code: &str,
    verifier: &str,
    redirect_uri: &str,
) -> Result<OAuthGrant, String> {
    let mut form = vec![
        ("client_id", client_id),
        ("code", code),
        ("code_verifier", verifier),
        ("grant_type", "authorization_code"),
        ("redirect_uri", redirect_uri),
    ];
    if let Some(secret) = client_secret {
        form.push(("client_secret", secret));
    }

    let response = client
        .post(TOKEN_URL)
        .form(&form)
        .send()
        .map_err(|_| "Google OAuth token exchange failed.".to_string())?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().unwrap_or_default();
        return Err(google_token_error_message(
            status,
            &body,
            "Google OAuth token exchange failed",
        ));
    }
    let token = response
        .json::<GoogleTokenResponse>()
        .map_err(|_| "Google OAuth token response was invalid.".to_string())?;
    validate_token_response(token, true)
}

pub(crate) fn authorize_and_complete<T>(
    client_id: &str,
    complete: impl FnOnce(OAuthGrant) -> Result<T, String>,
) -> Result<T, String> {
    let listener = TcpListener::bind(("127.0.0.1", 0))
        .map_err(|_| "Could not start the local Google OAuth callback listener.".to_string())?;
    let port = listener
        .local_addr()
        .map_err(|_| "Could not resolve the Google OAuth callback port.".to_string())?
        .port();
    let redirect_origin = format!("http://127.0.0.1:{port}");
    let redirect_uri = format!("{redirect_origin}/");
    let state = random_urlsafe(32);
    let verifier = random_urlsafe(64);
    let auth_url = authorization_url(client_id, &redirect_uri, &state, &pkce_challenge(&verifier))?;
    open_system_browser(auth_url.as_str())?;
    let mut callback = wait_for_callback(listener, &redirect_origin, &state)?;
    let client_secret = read_desktop_client_secret(client_id)?;

    let result = exchange_authorization_code(
        &Client::new(),
        client_id,
        client_secret.as_deref(),
        callback.code.as_str(),
        verifier.as_str(),
        redirect_uri.as_str(),
    )
    .and_then(complete);

    match &result {
        Ok(_) => respond_success(&mut callback.stream),
        Err(_) => respond_failure(&mut callback.stream),
    }
    result
}

pub(crate) fn refresh_access_token(client_id: &str, refresh_token: &str) -> Result<String, String> {
    let client_secret = read_desktop_client_secret(client_id)?;
    let mut form = vec![
        ("client_id", client_id),
        ("refresh_token", refresh_token),
        ("grant_type", "refresh_token"),
    ];
    if let Some(secret) = client_secret.as_deref() {
        form.push(("client_secret", secret));
    }

    let response = Client::new()
        .post(TOKEN_URL)
        .form(&form)
        .send()
        .map_err(|_| "Could not refresh Google Drive authorization.".to_string())?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().unwrap_or_default();
        return Err(google_token_error_message(
            status,
            &body,
            "Could not refresh Google Drive authorization",
        ));
    }
    let token = response
        .json::<GoogleTokenResponse>()
        .map_err(|_| "Google OAuth refresh response was invalid.".to_string())?;
    Ok(validate_token_response(token, false)?.access_token)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn callback_accepts_matching_state() {
        let result = callback_code(
            "http://127.0.0.1:41000/?code=abc&state=expected",
            "expected",
        );
        assert_eq!(result.unwrap(), "abc");
    }

    #[test]
    fn callback_rejects_mismatched_state() {
        let error =
            callback_code("http://127.0.0.1:41000/?code=abc&state=wrong", "expected").unwrap_err();
        assert!(error.contains("state validation"));
    }

    #[test]
    fn token_validation_requires_drive_file_and_refresh_token() {
        let missing_scope = GoogleTokenResponse {
            access_token: "access".into(),
            expires_in: Some(3600),
            refresh_token: Some("refresh".into()),
            scope: Some("openid".into()),
            token_type: Some("Bearer".into()),
        };
        assert!(validate_token_response(missing_scope, true)
            .unwrap_err()
            .contains("drive.file"));

        let missing_refresh = GoogleTokenResponse {
            access_token: "access".into(),
            expires_in: Some(3600),
            refresh_token: None,
            scope: Some(DRIVE_FILE_SCOPE.into()),
            token_type: Some("Bearer".into()),
        };
        assert!(validate_token_response(missing_refresh, true)
            .unwrap_err()
            .contains("refresh token"));
    }

    #[test]
    fn authorization_url_requests_only_drive_file_with_pkce() {
        let url =
            authorization_url("client", "http://127.0.0.1:1234/", "state", "challenge").unwrap();
        let values: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
        assert_eq!(
            values.get("redirect_uri").map(String::as_str),
            Some("http://127.0.0.1:1234/")
        );
        assert_eq!(
            values.get("scope").map(String::as_str),
            Some(DRIVE_FILE_SCOPE)
        );
        assert_eq!(
            values.get("code_challenge_method").map(String::as_str),
            Some("S256")
        );
        assert_eq!(values.get("state").map(String::as_str), Some("state"));
        assert_eq!(
            values.get("access_type").map(String::as_str),
            Some("offline")
        );
    }

    #[test]
    fn token_error_message_exposes_safe_google_error_details() {
        let message = google_token_error_message(
            reqwest::StatusCode::BAD_REQUEST,
            r#"{"error":"invalid_grant","error_description":"Bad Request"}"#,
            "Google OAuth token exchange failed",
        );
        assert_eq!(
            message,
            "Google OAuth token exchange failed (400 Bad Request): invalid_grant - Bad Request"
        );
    }
}
