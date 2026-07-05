# PrintPilot

PrintPilot is a native desktop app (macOS and Windows) that provides a modern printing interface on top of the operating system's own printing system.

It does not replace printer drivers and does not communicate directly with printer hardware. On macOS/Linux all printer discovery and print submission is routed through CUPS; on Windows it is routed through the Windows print system (WMI + the OS PDF handler). In both cases the installed drivers remain the source of truth.

## Version 1

Implemented scope:

- PDF loading with Browse and native drag/drop
- PDF preview through PDF.js
- Installed printer detection
- Tray selection when exposed by the printer driver
- Paper size selection
- Paper weight selection with best-effort driver option mapping
- Duplex mode
- Copies stepper
- Color mode
- Quality mode
- Safe PDF print submission through CUPS

Out of scope:

- Scanner support
- Toner monitoring
- Printer administration
- Cloud sync
- User accounts
- AI features
- Network printer configuration
- Firmware updates
- Printer status dashboard

## Safety Model

PrintPilot must never:

- Open raw printer sockets
- Use port 9100
- Send PJL/PCL/PostScript directly to hardware
- Modify firmware
- Modify printer configuration
- Send SNMP write commands

PrintPilot may:

- Read installed printers from CUPS
- Read driver-exposed print options
- Submit existing PDF files through the local macOS print system

On macOS/Linux the Rust backend uses local CUPS commands (`lpstat`, `lpoptions`, `lp`) as the compatibility layer. On Windows it uses PowerShell / WMI (`Win32_Printer`, `Get-PrintConfiguration`) plus the OS PDF handler via the shell `PrintTo` verb. These respect the installed printer drivers.

## Architecture

```text
src/
  components/ui/        shadcn-style UI primitives
  features/pdf/         PDF selection and preview
  features/printers/    printer discovery types and API calls
  features/settings/    typed print settings and print command API
  lib/                  shared frontend helpers

src-tauri/
  src/lib.rs            Tauri app entry point and command registration
  src/commands/         Tauri commands + shared, platform-agnostic validation
  src/platform/         Compile-time backend selection
    unix.rs             macOS / Linux backend (CUPS: lpstat, lpoptions, lp)
    windows.rs          Windows backend (WMI + PrintTo verb via PowerShell)
  src/cups, parser, printer   CUPS command layer + output parsing (non-Windows)
  tauri.conf.json       desktop app configuration

printer-core/           future shared print-domain logic
printer-profiles/       future printer-specific capability profiles
cups/                   future CUPS integration modules
pdf/                    future PDF services
ui/                     future UI package boundary
settings/               future settings persistence
history/                future local job history
```

## Platform Support

PrintPilot is a single codebase that runs on macOS and Windows. For the full list of supported OS versions and hardware:

- [macOS support](MACOS_SUPPORT.md) — macOS 10.13 (High Sierra) through the latest, Intel + Apple Silicon
- [Windows support](WINDOWS_SUPPORT.md) — Windows 10/11, x64 + ARM64

## Requirements

Common:

- Node.js 20+
- Rust stable

macOS:

- macOS High Sierra (10.13) or newer — covers Intel Macs back to 2017-era macOS and every Apple Silicon Mac
- Xcode Command Line Tools
- Tauri prerequisites for macOS

Windows:

- Windows 10 or newer
- WebView2 runtime (bundled by the installer if missing)
- Windows PowerShell 5.1+ (ships with Windows) and the PrintManagement module
- Microsoft Visual C++ Build Tools (for building)
- A PDF viewer that registers a `PrintTo` handler (e.g. Adobe Acrobat Reader) for reliable printing — see Windows Support below

Install Rust:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Install Xcode Command Line Tools:

```bash
xcode-select --install
```

## Development

Install dependencies:

```bash
npm install
```

Run the web UI only:

```bash
npm run dev
```

Run the native macOS app:

```bash
npm run tauri:dev
```

## Build

### macOS (recommended: universal build)

To produce a single app that runs natively on **both Intel and Apple Silicon** Macs, build the universal binary. Add the two Rust targets once, then build:

```bash
rustup target add x86_64-apple-darwin aarch64-apple-darwin
npm run tauri:build:mac
```

This runs `tauri build --target universal-apple-darwin` and emits a universal `.app` and `.dmg`.

A plain `npm run tauri:build` also works but produces a binary only for the architecture of the machine you build on, so prefer `tauri:build:mac` for distribution.

### macOS version coverage

The app targets **macOS 10.13 (High Sierra) and newer** via `bundle.macOS.minimumSystemVersion` in `tauri.conf.json`. That is the lowest version Tauri v2 supports, so it reaches essentially every Mac laptop still in use — Intel Macs from High Sierra/Mojave through the latest, and all Apple Silicon Macs (which ship with macOS 11+):

- **Intel Macs** run the `x86_64` slice, valid down to 10.13.
- **Apple Silicon Macs** run the `arm64` slice; these devices are all macOS 11+ regardless.

Note: printing uses the native CUPS backend, not the browser `window.print` API, so the 10.13 floor is safe. If you prefer to only support versions Apple still patches, raise `minimumSystemVersion` to `"10.15"` (Catalina) — a one-line change.

## Windows Support

PrintPilot runs on Windows using the same safe model: it never talks to hardware directly. The Windows backend lives in `src-tauri/src/platform/windows.rs`.

Build a Windows installer (run on Windows):

```bash
npm run tauri:build
```

This produces `.msi` and `.nsis` installers (the bundle `targets` are set to `"all"`, so each platform builds its own installers).

How it works on Windows:

- **Printer discovery** — `Get-CimInstance Win32_Printer` via PowerShell (name, default, offline state).
- **Capabilities** — supported paper sizes come from `Win32_Printer.PrinterPaperNames`; duplex and color support are read from the `Capabilities` bitmask; current defaults come from `Get-PrintConfiguration`.
- **Printing** — the PDF is sent to the selected printer through the OS-registered PDF handler using the shell `PrintTo` verb. Duplex, color, and paper size are applied best-effort with `Set-PrintConfiguration` first, and copies are produced by spooling the job multiple times.

### Windows limitations (v1)

- **A `PrintTo` handler is required.** Printing relies on a registered PDF `PrintTo` handler. Adobe Acrobat Reader registers one; a system whose only PDF app is Microsoft Edge may not, in which case printing will fail. Installing a reader that supports `PrintTo` resolves this.
- **Per-job options are best-effort and persist.** Because the `PrintTo` verb cannot carry per-job settings, duplex/color/paper are applied via `Set-PrintConfiguration`, which changes the printer's saved defaults. These changes are not automatically reverted after printing.
- **Trays, media types, and print quality are not exposed.** These are not reliably enumerable through WMI, so those selectors are empty on Windows for now.

For guaranteed per-job control on any Windows machine, a future option is to bundle a small PDF-printing helper (e.g. SumatraPDF) as a Tauri sidecar; this v1 intentionally avoids bundling third-party binaries.

## Konica Minolta bizhub Notes

PrintPilot starts with generic driver-safe mappings and detects trays from the installed printer driver where possible. Konica Minolta-specific option names can be added under `printer-profiles/` as the project grows, but profiles should only map friendly labels to driver-supported CUPS options. They must never send hardware commands.
