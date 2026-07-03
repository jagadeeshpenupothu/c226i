# PrintPilot for macOS

PrintPilot is a native macOS desktop app that provides a modern printing interface on top of the official macOS printing system.

It does not replace printer drivers and does not communicate directly with printer hardware. All printer discovery and print submission is routed through macOS/CUPS so installed drivers remain the source of truth.

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

The Rust backend currently uses local CUPS commands (`lpstat`, `lpoptions`, `lp`) as the compatibility layer. These commands respect the installed macOS printer drivers.

## Architecture

```text
src/
  components/ui/        shadcn-style UI primitives
  features/pdf/         PDF selection and preview
  features/printers/    printer discovery types and API calls
  features/settings/    typed print settings and print command API
  lib/                  shared frontend helpers

src-tauri/
  src/lib.rs            Tauri commands and safe CUPS integration
  tauri.conf.json       macOS desktop app configuration

printer-core/           future shared print-domain logic
printer-profiles/       future printer-specific capability profiles
cups/                   future CUPS integration modules
pdf/                    future PDF services
ui/                     future UI package boundary
settings/               future settings persistence
history/                future local job history
```

## Requirements

- macOS Monterey or newer
- Node.js 20+
- Rust stable
- Xcode Command Line Tools
- Tauri prerequisites for macOS

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

Build a native macOS app:

```bash
npm run tauri:build
```

## Universal macOS Builds

After Rust and Tauri prerequisites are installed:

```bash
rustup target add x86_64-apple-darwin aarch64-apple-darwin
npm run tauri:build -- --target universal-apple-darwin
```

The app is configured for macOS 12.0+ to cover Monterey, Ventura, Sonoma, and Sequoia.

## Konica Minolta bizhub Notes

PrintPilot starts with generic driver-safe mappings and detects trays from the installed printer driver where possible. Konica Minolta-specific option names can be added under `printer-profiles/` as the project grows, but profiles should only map friendly labels to driver-supported CUPS options. They must never send hardware commands.
