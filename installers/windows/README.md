# Windows Installers

Expected artifacts for `v0.1.0`:

- `PrintPilot_0.1.0_x64_en-US.msi` — WiX installer
- `PrintPilot_0.1.0_x64-setup.exe` — NSIS installer

These are **not built here** because Windows bundling cannot be reliably
cross-compiled from Linux (the WiX `.msi` needs a Windows host; NSIS needs
Wine + MinGW). They are produced by the [`Release` workflow](../../.github/workflows/release.yml)
on a `windows-latest` runner.

## How to get them

1. Push a version tag: `git tag v0.1.0 && git push origin v0.1.0`
   (or run the **Release** workflow manually from the Actions tab).
2. Download the `.msi` / `.exe` from the resulting draft GitHub Release.
3. (Optional) Copy them into this folder to track them in-repo.

The app targets Windows 10/11 x64 and uses WebView2 (`downloadBootstrapper`
mode — the installer fetches the WebView2 runtime if it's missing).
