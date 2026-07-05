# Windows Support

PrintPilot runs on Windows from the **same codebase** as macOS. The Windows backend lives in [`src-tauri/src/platform/windows.rs`](src-tauri/src/platform/windows.rs) and is selected at compile time via `#[cfg(target_os = "windows")]`. This document lists which Windows versions and hardware are supported.

## Summary

- **Recommended minimum:** Windows 10 (version 1803 / April 2018 update or later).
- **Architectures:** 64-bit x86 (`x86_64`) — primary; ARM64 (`aarch64`) — supported.
- **Web engine:** Microsoft Edge WebView2 (preinstalled on Windows 11; installed by the app's installer otherwise).
- **Printing:** routed through the OS-registered PDF handler via the shell `PrintTo` verb; discovery and options use PowerShell / WMI.

## Supported Windows versions

| Version | Status | Notes |
|---------|--------|-------|
| Windows 11 (all releases) | ✅ Fully supported | WebView2 ships with the OS |
| Windows 10 (1803 / April 2018 and later) | ✅ Fully supported | WebView2 via OS or installer bootstrapper |
| Windows Server 2016 / 2019 / 2022 | ✅ Supported | Same WebView2 + PowerShell APIs |
| Windows 8 / 8.1 | ⚠️ Not recommended | PrintManagement cmdlets exist, but Microsoft ended WebView2 runtime support for 8/8.1 |
| Windows 7 | ❌ Not supported in practice | Ships with PowerShell 2.0 (no `Get-CimInstance`), lacks the PrintManagement module, and WebView2 support has ended |

Although Tauri v2 itself can technically target Windows 7+, this app's printing backend relies on APIs that make **Windows 10 or newer** the realistic floor.

## Architecture details

- **x64 (Intel / AMD 64-bit)** — the primary target; a plain build produces an x64 app.
- **ARM64** (Snapdragon / Copilot+ PCs, Surface Pro X) — supported. Build with the ARM64 Rust target:
  ```bash
  rustup target add aarch64-pc-windows-msvc
  npm run tauri:build -- --target aarch64-pc-windows-msvc
  ```

## Runtime requirements

1. **Microsoft Edge WebView2 runtime** — preinstalled on Windows 11 and current Windows 10; otherwise the installer's bootstrapper installs it.
2. **Windows PowerShell 5.1+** (ships with Windows 10/11) and the **PrintManagement** module — used for printer discovery, capabilities, and applying options.
3. **A PDF viewer that registers a `PrintTo` handler** (e.g. Adobe Acrobat Reader). This is required for printing to work; see limitations below.

## How printing works on Windows

- **Discovery** — `Get-CimInstance Win32_Printer` (name, default, offline state).
- **Capabilities** — supported paper sizes from `Win32_Printer.PrinterPaperNames`; duplex and color support from the `Capabilities` bitmask; current defaults from `Get-PrintConfiguration`.
- **Printing** — the PDF is sent to the selected printer through the OS-registered PDF handler using the shell `PrintTo` verb. Duplex, color, and paper size are applied best-effort with `Set-PrintConfiguration`; copies are produced by spooling the job multiple times.

## Limitations (v1)

1. **A `PrintTo` handler is required.** Printing relies on a registered PDF `PrintTo` handler. Adobe Acrobat Reader provides one; a machine whose only PDF app is Microsoft Edge may not, in which case printing fails. Installing a reader that supports `PrintTo` resolves this.
2. **Per-job options persist.** Because the `PrintTo` verb cannot carry per-job settings, duplex/color/paper are applied via `Set-PrintConfiguration`, which changes the printer's saved defaults and is not automatically reverted.
3. **Trays, media types, and print quality are not exposed.** These are not reliably enumerable through WMI, so those selectors are empty on Windows.

For guaranteed per-job control on any Windows machine, a future option is to bundle a small PDF-printing helper (e.g. SumatraPDF) as a Tauri sidecar; this v1 intentionally avoids bundling third-party binaries.

## Building for Windows

Run on a Windows machine:

```bash
npm install
npm run tauri:build
```

This produces `.msi` and `.nsis` installers under `src-tauri/target/release/bundle/` (the bundle `targets` are set to `"all"`, so each platform builds its own installers).

## Notes and caveats

- **Build tooling.** Building on Windows requires the Microsoft Visual C++ Build Tools (MSVC toolchain) in addition to Node.js and Rust.
- **Verification.** The support range above is the configured/expected target. The build has been compile-verified for the Windows target (`cargo check --target x86_64-pc-windows-gnu`, clean), but on-device printing should be confirmed on an actual Windows machine.

## Sources

- [Webview Versions — Tauri v2](https://v2.tauri.app/reference/webview-versions/)
- [Windows Installer — Tauri v2](https://v2.tauri.app/distribute/windows-installer/)
- [Prerequisites — Tauri v2](https://v2.tauri.app/start/prerequisites/)
