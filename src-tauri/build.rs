fn required_env(name: &str, label: &str) {
    println!("cargo:rerun-if-env-changed={name}");
    let value = std::env::var(name).unwrap_or_default();
    let trimmed = value.trim();
    if trimmed.is_empty() {
        panic!("{label} is required for PrintPilot release builds.");
    }
}

fn main() {
    println!("cargo:rerun-if-env-changed=PRINTPILOT_RELEASE_BUILD");
    println!("cargo:rerun-if-env-changed=PRINTPILOT_GOOGLE_DRIVE_OAUTH_CLIENT_SECRET");

    if std::env::var("PRINTPILOT_RELEASE_BUILD").as_deref() == Ok("1") {
        required_env(
            "PRINTPILOT_GOOGLE_DRIVE_OAUTH_CLIENT_SECRET",
            "PRINTPILOT_GOOGLE_DRIVE_OAUTH_CLIENT_SECRET",
        );
    }

    tauri_build::build()
}
