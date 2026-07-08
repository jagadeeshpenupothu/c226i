# PROJECT STATUS RECONSTRUCTION REPORT

Audit date: 2026-07-07
Workspace: `/Users/jagadeeshpenupothu487/Desktop/c226i`

## 0. Current Priority Update - macOS DMG Distribution

Update date: 2026-07-08

Immediate priority changed to building, verifying, and publishing downloadable macOS DMG installers for the current Tauri + React + TypeScript + Rust application. Printer diagnostics and other feature development are paused until the DMG release path is approved.

Current development track:
- Tauri app remains the active release track temporarily.
- Swift/native migration remains deferred, not cancelled.
- `native-macos/` is preserved unchanged and remains untracked.
- No application features, UI redesign, print submission, or printer configuration changes were made for this release task.

Local verification on Intel MacBook Pro:
- Host architecture: `x86_64`.
- Host OS: macOS `12.7.6`.
- `npm run lint`: PASS.
- `npx tsc --noEmit`: PASS.
- Vite production build to `/private/tmp/printpilot-vite-release-dist`: PASS, with existing PDF.js `eval` and large chunk warnings.
- `cargo test` in `src-tauri`: PASS, 12 passed, 1 ignored.
- `cargo check` in `src-tauri`: PASS, with existing future-incompat warning for transitive `block v0.1.6`.
- Intel Tauri app bundle: PASS at `src-tauri/target/x86_64-apple-darwin/release/bundle/macos/PrintPilot.app`.
- Intel DMG: PASS after running Tauri's generated DMG script outside the sandbox; sandboxed `hdiutil` failed with `Device not configured`.
- Intel DMG path: `src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/PrintPilot_0.1.0_x64.dmg`.
- Intel executable architecture: `x86_64`.
- Binary deployment target: `LC_VERSION_MIN_MACOSX` version `10.13`.
- Bundle `LSMinimumSystemVersion`: `10.13`.
- Code signing: unsigned; `codesign` reports the app is not signed.
- DMG mount verification: PASS; read-only mount contained `PrintPilot.app`.
- Launch smoke test: PASS; process started and remained running until stopped.

Artifact status:
- Intel `x86_64-apple-darwin`: locally built and verified; remotely built and verified by GitHub Actions workflow run `28915392315`.
- Apple Silicon `aarch64-apple-darwin`: remotely built and verified by GitHub Actions workflow run `28915392315`; not locally launched on Apple Silicon hardware.
- Universal macOS DMG: not verified; do not publish a universal artifact until an actual universal build is produced and inspected.

GitHub Actions status:
- `.github/workflows/release.yml` updated to focus on macOS DMGs.
- Release workflow runs on `v*` tags and manual dispatch.
- Workflow uses `npm ci`, lint, TypeScript check, external Vite build, `cargo test --locked`, `cargo check --locked`, native Tauri DMG build, architecture verification, DMG mount/content verification, checksum generation, workflow artifact upload, and draft GitHub Release attachment for tag builds.
- Pushed `main` to `origin` at commit `46da8a27eceffb42bb268209f8bcf323b5db1cba`.
- Manual `workflow_dispatch` run succeeded.
- Workflow run ID: `28915392315`.
- Workflow run URL: `https://github.com/jagadeeshpenupothu/c226i/actions/runs/28915392315`.
- Run head SHA: `46da8a27eceffb42bb268209f8bcf323b5db1cba`.
- No tag was created.
- No production release was created.
- Draft-release attach step was skipped as expected for manual dispatch.

Remote workflow verification:
- Apple Silicon job `85781259658`: PASS in 4m49s.
- Intel job `85781259662`: PASS in 14m45s.
- Apple Silicon runner evidence: GitHub runner image `macos-15-arm64`, Node artifact `darwin-arm64`, Rust cache key `Darwin-arm64`, Rust target `aarch64-apple-darwin`.
- Intel runner evidence: Node artifact `darwin-x64`, Rust cache key `Darwin-x64`, Rust target `x86_64-apple-darwin`.
- Apple Silicon binary evidence: `lipo -info` reported `arm64`; `file` reported `Mach-O 64-bit executable arm64`.
- Intel binary evidence: `lipo -info` reported `x86_64`; `file` reported `Mach-O 64-bit executable x86_64`.
- Apple Silicon deployment target evidence: `LC_BUILD_VERSION` minos `11.0`.
- Intel deployment target evidence: `LC_VERSION_MIN_MACOSX` version `10.13`.
- Apple Silicon code-signing state: ad hoc/linker-signed, no TeamIdentifier.
- Intel code-signing state: not signed.
- Remote DMG mount/content verification: PASS for both architecture jobs; each mounted read-only and contained `PrintPilot.app`.
- Workflow artifacts uploaded:
  - `PrintPilot-0.1.0-macos-x86_64.dmg`, artifact ID `8157597095`, artifact zip digest `sha256:36af74397fbe36d0ec3717983e13599350077ae8025d1114c9982ed9f0d1d118`.
  - `PrintPilot-0.1.0-macos-aarch64.dmg`, artifact ID `8157487039`, artifact zip digest `sha256:b28f52761e6152b33b050dd8dd523849d625f15cd77c83b340962195e3b11109`.
- Downloaded artifacts to `/private/tmp/printpilot-remote-dmg-artifacts`.
- Downloaded Intel DMG checksum verified: `0aaa6d78fb6c7a1b94bf5d70b113adfbd7c1996383ce360c9e65fceb66c0c6e0`.
- Downloaded Apple Silicon DMG checksum verified: `dc9a7f253f325545a9b11e50f8619b826909ea943b97e65fd0259123a8deaeb9`.
- Downloaded DMG local mount checks: PASS for both Intel and Apple Silicon artifacts; each mounted read-only and contained `PrintPilot.app`.
- Workflow warnings:
  - GitHub Actions reported Node.js 20 deprecation for `actions/checkout@v4`, `actions/setup-node@v4`, and `actions/upload-artifact@v4`, forced to run on Node 24.
  - Node emitted `punycode` deprecation warnings in setup/upload/cache actions.
  - Vite retained existing PDF.js `eval` and large chunk warnings during production builds.

macOS compatibility status:
- Configured minimum macOS: `10.13`.
- Binary encoded minimum macOS: `10.13`.
- Verified runtime minimum macOS: `12.7.6` on Intel.
- Remote Apple Silicon binary encoded minimum macOS: `11.0`.
- Frontend build target for macOS: Safari 13, so runtime support below macOS 12.7.6 remains unproven without older-device testing.

Signing and release blockers:
- Signing/notarization are not configured.
- Unsigned/unnotarized Gatekeeper warnings are expected.
- Apple Silicon artifact is remotely built and verified by GitHub Actions, but has not been manually installed/launched on the Mac mini M4.
- Universal artifact remains unverified.
- Bundle identifier `com.printpilot.app` triggers a Tauri warning because it ends in `.app`; this was documented but not changed during this release task.

Exact next step:
- Manually download the two workflow artifacts from run `28915392315` on the target Intel MacBook Pro and Mac mini M4, install each unsigned app via Finder right-click Open, and confirm the UI launches.

## 1. Executive Summary

PrintPilot is a Tauri v2 desktop printing application built with React/TypeScript in the webview and Rust in the backend. The real current state is an advanced v1 prototype: PDF loading/preview, printer discovery, driver capability parsing, CUPS print submission, Windows WMI/PrintTo support, profiles, local job history, printer dashboard, notification UI, and cloud authentication scaffolding are present. The core safe-printing model is sound: it uses installed OS print systems and does not talk directly to printer hardware.

The app is not release-ready despite the latest commit title. Frontend build, TypeScript, ESLint, Rust tests, and Rust check all pass, but there is no full Tauri package verification in this audit, no UI/integration tests, no real print submission test, no signed/notarized release, no true print queue monitoring, and several features are preview-only or scaffolding-only.

## 2. Repository State

- Workspace path: `/Users/jagadeeshpenupothu487/Desktop/c226i`
- Current branch: `main`
- Latest commit: `b83af2ae00567ce22687621f81060b5ab8f6ace7 feat: complete production release pipeline and installer packaging`
- Git status before audit: clean, tracking `origin/main`
- Git status after audit: one new uncommitted file, `PROJECT_STATE.md`
- Local branches: `main`
- Remote branches: `origin/main`, `origin/HEAD -> origin/main`
- Tags: none
- Recent commits:
  - `b83af2a feat: complete production release pipeline and installer packaging`
  - `1b7c576 added code`
  - `761be54 Initial commit`

Important note on `b83af2a`: the commit did add release workflow/config/docs/icons, but it also added or changed large portions of app functionality: design system, cloud modules, jobs, printer dashboard, profiles, layout engine, Windows backend, and more. The release pipeline is configured, not proven by repository evidence.

## 3. Build Configuration

- Xcode project/workspace: none found. This is not a native Xcode app.
- Desktop framework: Tauri v2.
- Frontend target: Vite React app from `src/main.tsx` and `src/App.tsx`.
- Rust package: `src-tauri/Cargo.toml`, package `printpilot`, edition `2021`.
- Application target: Tauri app `PrintPilot`, bundle identifier `com.printpilot.app`.
- Test targets: Rust unit tests only, embedded in backend modules. No frontend, integration, or UI test target found.
- macOS deployment target: `10.13` via `src-tauri/tauri.conf.json` `bundle.macOS.minimumSystemVersion`.
- Swift version: not applicable. No Swift/Xcode target exists.
- Architectures: macOS docs/script support x86_64 and aarch64; CI matrix builds separate macOS targets. Windows docs support x64 and mention ARM64 manually. Linux build supported by CI.
- Entitlements: `null`.
- Signing: macOS `signingIdentity: null`; no notarization configured.
- Sandbox: Tauri webview security with `core:default` and `dialog:default` permissions. macOS app sandbox entitlements are not configured.
- CSP: `null`, which disables CSP.
- Asset protocol: enabled with scope `$HOME/**` for loading local PDFs.
- Bundle targets: `all`.
- Important scripts:
  - `npm run lint`
  - `npm run build`
  - `npm run tauri:build`
  - `npm run tauri:build:mac`
  - `cargo test` in `src-tauri`

## 4. Actual Architecture

Architecture is feature-oriented frontend plus platform-specific Rust backend:

- Application layer: `src/App.tsx` composes document selection, settings, print jobs, printer monitoring, profiles, cloud bootstrap, notifications, and dialogs.
- Domain/frontend feature layer:
  - PDF: `src/components/pdf`, `src/hooks/usePdfDocument.ts`, `src/services/pdf`
  - Printers: `src/features/printers`
  - Jobs: `src/features/jobs`
  - Profiles: `src/features/profiles`
  - Layout: `src/features/layout`, `src/services/layout`
  - Settings: `src/features/settings`
  - Cloud: `src/features/cloud`
  - Notifications: `src/features/notifications`
- Backend adapters:
  - macOS/Linux: `src-tauri/src/platform/unix.rs` using CUPS commands.
  - Windows: `src-tauri/src/platform/windows.rs` using PowerShell, WMI, PrintManagement, and shell `PrintTo`.
- Infrastructure:
  - Tauri commands in `src-tauri/src/commands/mod.rs`
  - CUPS command wrappers in `src-tauri/src/cups/client.rs`
  - Parsers in `src-tauri/src/parser`
  - Capability/print option mapping in `src-tauri/src/printer`
- Dependency injection:
  - Backend uses compile-time `cfg` routing in `platform/mod.rs`, not a runtime trait.
  - Cloud uses provider interfaces and registers a Firebase provider only when Vite env config exists.
- State management:
  - Mostly React state plus custom observable stores using `useSyncExternalStore`.
  - Persistence through `localStorage` for settings, layout, recents, history, profiles, jobs, cloud queue.
- Major data flow:
  - User selects PDF -> Tauri asset URL -> PDF.js renders preview.
  - Printer manager polls backend -> stores printers and capabilities.
  - Settings/profile UI updates local state.
  - Print action -> JobManager -> Tauri `print_pdf` -> OS print system.

## 5. Actual Project Structure

Relevant tree:

```text
.
├── .github/workflows/release.yml
├── README.md
├── ENGINEERING_AUDIT.md
├── MACOS_SUPPORT.md
├── WINDOWS_SUPPORT.md
├── docs/CLOUD_ARCHITECTURE.md
├── installers/
│   ├── README.md
│   ├── macos/README.md
│   └── windows/README.md
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/pdf/
│   ├── components/ui/
│   ├── design/
│   ├── features/cloud/
│   ├── features/jobs/
│   ├── features/layout/
│   ├── features/notifications/
│   ├── features/pdf/
│   ├── features/printers/
│   ├── features/profiles/
│   ├── features/settings/
│   ├── hooks/
│   ├── lib/
│   └── services/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/default.json
│   └── src/
│       ├── commands/
│       ├── cups/
│       ├── models/
│       ├── parser/
│       ├── platform/
│       └── printer/
├── cups/ README scaffold
├── history/ README scaffold
├── pdf/ README scaffold
├── printer-core/ README scaffold
├── printer-profiles/ README scaffold
├── settings/ README scaffold
└── ui/ README scaffold
```

## 6. Implemented Features

1. PDF open via file picker and drag/drop
   - Files: `src/App.tsx`, `src/features/pdf/types.ts`
   - Status: COMPLETED AND VERIFIED by TypeScript/build.
   - Evidence: Tauri dialog `open()`, drag/drop listener, PDF path filtering.
   - Tests: no direct unit/UI tests.
   - Manual verification: not performed.

2. PDF rendering and preview
   - Files: `src/components/pdf/*`, `src/hooks/usePdfDocument.ts`, `src/services/pdf/*`
   - Status: COMPLETED AND VERIFIED by build.
   - Evidence: PDF.js worker, CMaps/fonts, overview thumbnails, detail preview, zoom, rotation, guide overlays, cancellation.
   - Tests: none.
   - Manual verification: not performed.

3. Shared layout preview engine
   - Files: `src/services/layout/layoutEngine.ts`, `src/features/layout/types.ts`
   - Status: IMPLEMENTED BUT NOT VERIFIED.
   - Evidence: pure layout computation used by overview and detail preview.
   - Tests: none.
   - Important limitation: print submission does not consume this layout model.

4. Printer discovery and capability detection
   - Files: `src/features/printers/*`, `src-tauri/src/platform/*`, `src-tauri/src/parser/*`, `src-tauri/src/printer/capabilities.rs`
   - Status: COMPLETED AND VERIFIED at parser/unit/build level.
   - Evidence: CUPS `lpstat`, `lpoptions`; Windows WMI and `Get-PrintConfiguration`; capability summary.
   - Tests: Rust parser/capability tests pass.
   - Manual verification with real printers: not performed.

5. Print settings and submission
   - Files: `src/features/settings/*`, `src-tauri/src/models/print.rs`, `src-tauri/src/printer/print_options.rs`, `src-tauri/src/cups/client.rs`, `src-tauri/src/platform/windows.rs`
   - Status: IMPLEMENTED BUT NOT VERIFIED.
   - Evidence: settings DTO, CUPS `lp -d -n -o`, Windows `PrintTo`.
   - Tests: Rust test verifies advanced CUPS driver options are forwarded.
   - Manual verification: real print jobs intentionally not submitted.

6. Jobs, history, notifications
   - Files: `src/features/jobs/*`, `src/features/notifications/*`, `src/features/printers/printerNotifications.ts`
   - Status: IMPLEMENTED BUT NOT VERIFIED.
   - Evidence: local job state machine, timeline, persisted terminal jobs, toasts.
   - Limitation: progress after submission is estimated; no real queue polling/cancel/pause/resume.

7. Profiles
   - Files: `src/features/profiles/*`
   - Status: IMPLEMENTED BUT NOT VERIFIED.
   - Evidence: built-in profiles, CRUD, local persistence, import/export, compatibility resolution.
   - Limitation: built-in booklet/poster profiles can set roadmap-only layout modes that do not impose output.

8. Cloud authentication foundation
   - Files: `src/features/cloud/*`, `.env.example`
   - Status: IN PROGRESS.
   - Evidence: Firebase SDK is installed and Google auth provider exists when env config is present.
   - Limitation: sync/storage providers throw `NotImplementedError`; no real cloud data sync.

9. Release/installer pipeline
   - Files: `.github/workflows/release.yml`, `src-tauri/tauri.conf.json`, `installers/*`, icons
   - Status: IMPLEMENTED BUT NOT VERIFIED.
   - Evidence: GitHub Actions release workflow and bundle config.
   - Limitation: no tag, no release artifact, no signing/notarization evidence.

## 7. Printer Integration Status

- Printer discovery: IMPLEMENTED. CUPS `lpstat -p`, `lpstat -v`, `lpstat -d`; Windows WMI `Win32_Printer`.
- Printer selection: IMPLEMENTED. Frontend keeps selected printer valid.
- Printer identity: PARTIALLY IMPLEMENTED. Uses CUPS/Windows printer name as id; no vendor serial/UUID.
- Printer status: PARTIALLY IMPLEMENTED. Online/offline/unknown inferred from `lpstat` or WMI fields.
- Printer metadata: PARTIALLY IMPLEMENTED. Connection/driver/hostname fields exist in UI model but backend currently returns only core info.
- Capability detection: IMPLEMENTED for driver-exposed options on CUPS; limited on Windows.
- Paper sizes: IMPLEMENTED from CUPS options or WMI paper names; fallback standard list in no-printer mode.
- Custom media constraints: PARTIALLY IMPLEMENTED. Custom size strings can be parsed for preview; no full driver constraint enforcement.
- Trays: IMPLEMENTED on CUPS via common keywords; NOT IMPLEMENTED on Windows.
- Media types: IMPLEMENTED on CUPS via common keywords; NOT IMPLEMENTED on Windows.
- Duplex: IMPLEMENTED on CUPS and Windows.
- Color modes: IMPLEMENTED on CUPS and Windows.
- Resolution/quality: IMPLEMENTED on CUPS; NOT IMPLEMENTED on Windows.
- Finishing options: PARTIALLY IMPLEMENTED. Detected/classified as driver capabilities and forwarded on CUPS when selected; no normalized finishing model.
- Printable areas: PARTIALLY IMPLEMENTED. Preview uses nominal 3 mm/default/custom margins, not real driver printable area.
- PrintCore: NOT STARTED. No `NSPrintInfo`/PrintCore integration found.
- CUPS: IMPLEMENTED BUT NOT VERIFIED with real printer.
- IPP: NOT STARTED as direct implementation. CUPS may use IPP underneath, but app does not query IPP attributes directly.
- PPD: PARTIALLY IMPLEMENTED indirectly through `lpoptions -l`; no PPD file parser.
- Print submission: IMPLEMENTED BUT NOT VERIFIED. Real jobs not submitted during audit.
- Queue monitoring: PARTIALLY IMPLEMENTED. UI/job model exists; no backend spooler polling.
- Cancel/pause/resume: NOT STARTED for print jobs. Dashboard pause/resume only controls polling.
- Error handling: PARTIALLY IMPLEMENTED. CUPS/Windows stderr mapped to user messages, but no structured IPC errors.
- Konica Minolta bizhub C226i findings: the real target printer is Konica Minolta bizhub C226i. No captured driver capabilities or dedicated profile exist yet. Do not guess capabilities; investigate later from installed-driver evidence using native macOS APIs, CUPS, IPP, and PPD/driver evidence where available.

## 8. Document System Status

- Drag-and-drop: IMPLEMENTED.
- File picker: IMPLEMENTED.
- PDF importing: IMPLEMENTED.
- Image importing: NOT STARTED.
- Multi-file jobs: NOT STARTED.
- Internal document model: PARTIALLY IMPLEMENTED as `PdfFile` plus PDF.js document state.
- Page metadata: PARTIALLY IMPLEMENTED for first page and page count.
- Page-size detection: IMPLEMENTED for first page; thumbnails inspect pages while rendering.
- Page selection: IMPLEMENTED for preview navigation.
- Page ranges: NOT STARTED for actual print; field exists in layout model only.
- Reordering/removing pages: NOT STARTED.
- Rotation: IMPLEMENTED in preview only.
- Cropping: NOT STARTED.
- Undo/redo: NOT STARTED.

## 9. Preview and Rendering Status

- PDF rendering: COMPLETED AND VERIFIED by build.
- Image rendering: NOT STARTED.
- Thumbnail generation: IMPLEMENTED.
- Thumbnail caching: IMPLEMENTED as module-level in-memory `Map`, unbounded.
- High-quality preview: IMPLEMENTED in detail view.
- Zoom and pan: zoom implemented; pan via scroll.
- Background rendering: PARTIALLY IMPLEMENTED with active visible range and overscan.
- Cancellation: IMPLEMENTED for PDF loading and page renders.
- Memory handling: PARTIALLY IMPLEMENTED; render cancellation exists, cache is unbounded.
- Preview accuracy: PARTIALLY IMPLEMENTED. Preview and detail share layout engine, but print output does not.

## 10. Layout Engine Status

- Paper model: IMPLEMENTED.
- Standard sizes: IMPLEMENTED for common sizes.
- Custom sizes: PARTIALLY IMPLEMENTED via `WxH` parsing.
- Orientation: IMPLEMENTED in preview.
- Margins: IMPLEMENTED in preview.
- Printable areas: PARTIALLY IMPLEMENTED using nominal margins.
- Scaling: IMPLEMENTED in preview.
- Fit/fill: fit implemented; fill not implemented.
- Actual size/custom scaling: IMPLEMENTED in preview.
- Resolved layout model: IMPLEMENTED in `computeSheetLayout`.
- Geometry tests: NOT STARTED.
- Preview and printing share layout: NO. Preview uses the layout engine; backend print options do not.

## 11. Imposition Status

- N-up: NOT STARTED.
- Repeated-design layout: NOT STARTED.
- Booklet printing: PARTIALLY IMPLEMENTED as profile/driver keyword detection only; no imposition.
- Poster/tiled printing: NOT STARTED.
- Advanced imposition: NOT STARTED.
- Crop marks: NOT STARTED.
- Bleed: PARTIALLY IMPLEMENTED as preview overlay only.
- Registration marks: NOT STARTED.
- Rotation optimization: NOT STARTED.
- Geometry tests: NOT STARTED.

## 12. Print Job System Status

- Print settings model: IMPLEMENTED.
- Validation: PARTIALLY IMPLEMENTED. Backend validates existing `.pdf` and non-empty printer.
- Capability-driven settings: IMPLEMENTED in UI defaulting/choices.
- Print-job generation: PARTIALLY IMPLEMENTED as direct OS submission, not generated transformed PDF.
- Copies: IMPLEMENTED.
- Collation: NOT STARTED.
- Color: IMPLEMENTED.
- Duplex: IMPLEMENTED.
- Binding: PARTIALLY IMPLEMENTED only if exposed as driver option and selected.
- Tray selection: IMPLEMENTED on CUPS.
- Media type: IMPLEMENTED on CUPS.
- Resolution: IMPLEMENTED on CUPS.
- Submission mechanism: CUPS `lp` on macOS/Linux; Windows shell `PrintTo`.
- Preview-to-print consistency: PARTIALLY IMPLEMENTED; paper/driver settings align where mapped, layout/scaling/margins do not.

## 13. Print Queue Status

- Job listing: IMPLEMENTED locally.
- Progress: PARTIALLY IMPLEMENTED, estimated after submit.
- Job states: IMPLEMENTED locally.
- Cancel: NOT STARTED.
- Pause: NOT STARTED for jobs.
- Resume: NOT STARTED for jobs.
- Printer errors: PARTIALLY IMPLEMENTED through submission errors and printer status polling.
- Queue monitoring architecture: IN PROGRESS. Store/UI exists; no spooler polling.

## 14. Presets and Production Workflow Status

- Preset persistence: IMPLEMENTED via localStorage user profiles.
- Recent settings: IMPLEMENTED.
- Per-printer settings: PARTIALLY IMPLEMENTED through selected printer and profiles, not a dedicated per-printer store.
- Keyboard shortcuts: PARTIALLY IMPLEMENTED for open/print and detail preview navigation/zoom.
- Command system: NOT STARTED.
- Command palette: NOT STARTED.
- Fast print-shop workflows: PARTIALLY IMPLEMENTED through profiles, recents, and dashboard; missing batch, imposition, page edits, true queue controls.

## 15. Diagnostics and Logging

- Logging system: NOT STARTED. Console/dev messages only.
- Diagnostic tools: PARTIALLY IMPLEMENTED via printer dashboard/event UI.
- Raw printer capability inspection: PARTIALLY IMPLEMENTED through driver capability UI, not export/raw dump.
- Error reporting: PARTIALLY IMPLEMENTED with friendly messages/toasts.
- Crash diagnostics: NOT STARTED.

## 16. Testing Status

Latest audit verification:

- `npm run lint`: PASS.
- `npx tsc --noEmit`: PASS.
- `npx vite build --outDir /private/tmp/printpilot-vite-audit-dist --emptyOutDir`: PASS.
  - Warnings: PDF.js uses `eval`; main JS chunk is over 500 kB.
- `cargo test` in `src-tauri`: PASS, 6 tests passed.
- `cargo check` in `src-tauri`: PASS.
  - Warning: transitive Rust crate `block v0.1.6` has future-incompatibility warning.

Test inventory:

- Unit tests: Rust parser/capability/print option tests only.
- Integration tests: none found.
- UI tests: none found.
- Geometry tests: none found.
- Printer tests: no real-printer tests found.
- Performance tests: none found.
- Important untested areas: frontend components, Tauri IPC, PDF rendering behavior, layout geometry, profiles, cloud auth, release workflow, packaging, real CUPS/Windows printing, real queue monitoring.

## 17. Production and Release Status

- Code signing: NOT STARTED.
- Notarization: NOT STARTED.
- Installer packaging: IMPLEMENTED BUT NOT VERIFIED via Tauri bundle config and GitHub Actions workflow.
- Release scripts: PARTIALLY IMPLEMENTED through npm scripts and CI workflow.
- CI/CD: IMPLEMENTED BUT NOT VERIFIED. Workflow exists but no tag/run result found.
- Versioning: `0.1.0` in `package.json`, `Cargo.toml`, and `tauri.conf.json`.
- Release artifacts: no committed macOS/Windows artifacts; docs expect draft GitHub Release artifacts. No tags exist.
- Distribution readiness: BLOCKED by unsigned/unnotarized builds, unverified CI, no release artifacts, no UI/integration tests, no real printer verification.

The latest commit `b83af2a` implemented release workflow/config/icons/docs and many app features, but the release pipeline is not proven by repository state.

## 18. Known Bugs

- BUG-001: Preview layout settings do not drive print output.
  - Severity: High.
  - Components: `src/services/layout/layoutEngine.ts`, `src/features/layout/types.ts`, `src-tauri/src/printer/print_options.rs`.
  - Repro: set custom scaling/margins/orientation; print submission sends only paper/duplex/quality/tray/color/media/driver options.
  - Suspected root cause: layout engine is frontend-only.
  - Status: Open.

- BUG-002: Windows printing mutates printer defaults.
  - Severity: High.
  - Component: `src-tauri/src/platform/windows.rs`.
  - Repro: print with duplex/color/paper; backend calls `Set-PrintConfiguration`.
  - Suspected root cause: Windows `PrintTo` cannot pass per-job settings.
  - Status: Known limitation.

- BUG-003: Job progress is simulated and can misrepresent real spooler state.
  - Severity: Medium.
  - Component: `src/features/jobs/jobManager.ts`.
  - Repro: submit any job; UI advances through spooling/printing/completed after backend returns.
  - Suspected root cause: no queue polling.
  - Status: Open.

- BUG-004: Thumbnail cache is unbounded.
  - Severity: Medium.
  - Component: `src/components/pdf/PdfOverviewThumbnail.tsx`.
  - Repro: open/render many PDFs/pages.
  - Suspected root cause: module-level `Map` with no eviction.
  - Status: Open.

- BUG-005: Cloud architecture docs are stale.
  - Severity: Low.
  - Components: `docs/CLOUD_ARCHITECTURE.md`, `src/features/cloud/providers/firebaseProvider.ts`.
  - Repro: docs say no Firebase SDK/OAuth; code includes Firebase SDK and Google sign-in.
  - Status: Open documentation drift.

## 19. Current Problems and Blockers

- Release cannot be considered production-ready until signing/notarization and CI artifacts are verified.
- No real printer verification was performed.
- No UI/integration tests exist.
- No print queue backend monitoring exists.
- Layout/imposition/page-edit requirements are largely incomplete.
- Windows backend cannot safely apply per-job settings without changing printer defaults.
- Cloud sync/storage are not implemented.

## 20. Technical Debt

- Architectural drift: README and cloud docs lag current code.
- Tight coupling: `App.tsx` remains a large composition/root workflow file.
- Duplicated/parallel state: legacy print history plus job store both persist print outcomes.
- Temporary implementations: simulated job progress, nominal printable margins, Windows `PrintTo`.
- Unsafe dependencies/risks: CSP disabled; PDF.js eval warning; future-incompatible Rust transitive `block`.
- Large files: `src/App.tsx`, `src/features/settings/settingsPanel.tsx`, `src/features/printers/printerManager.ts`.
- Missing abstractions: backend platform not trait-injected; no mock print backend for tests.
- Insufficient tests: frontend, IPC, layout geometry, packaging, and real printer paths untested.
- Performance risks: unbounded thumbnail cache, large JS bundle, many PDF.js assets.
- Printing reliability risks: no command timeouts, no queue polling, preview/print mismatch.

## 21. Architecture Health

Classification: ACCEPTABLE WITH TECHNICAL DEBT

The core layering is coherent, the safety model is good, and the Rust backend is modular. The project has grown fast, and the main risks are verification gaps, stale docs, frontend concentration in large files, and incomplete end-to-end printing semantics.

## 22. Reconstructed Phase History

The original 18-phase roadmap file was not found in the repository. The phase history below is reconstructed from code, docs, commit history, and module names.

| Phase | Name | Status | Evidence | Missing / tests |
|---|---|---|---|---|
| 1 | Project bootstrap | COMPLETED AND VERIFIED | Tauri/React/Rust config, build passes | No native Xcode target |
| 2 | Desktop shell/design foundation | COMPLETED AND VERIFIED | `src/design`, shell UI, lint/build pass | Design consistency not fully tested |
| 3 | PDF import | COMPLETED AND VERIFIED | picker, drag/drop, PDF metadata | No UI tests |
| 4 | PDF preview | COMPLETED AND VERIFIED | overview/detail PDF.js preview | No render screenshots/tests |
| 5 | Basic printer discovery | COMPLETED AND VERIFIED | CUPS/WMI discovery, parser tests | No real-printer audit |
| 6 | Capability detection | COMPLETED AND VERIFIED | `lpoptions` parser/capability tests | Windows limited |
| 7 | Core print submission | IMPLEMENTED BUT NOT VERIFIED | CUPS `lp`, Windows `PrintTo` | No real print tests |
| 8 | Cloud foundation | IN PROGRESS | provider interfaces, queue, Firebase auth | Sync/storage missing |
| 9 | Google/Firebase auth | IMPLEMENTED BUT NOT VERIFIED | FirebaseProvider and AccountMenu | Needs config/manual auth test |
| 10 | Cloud sync/storage | NOT STARTED | providers throw `NotImplementedError` | No sync drain |
| 11 | Printer dashboard/monitoring | IMPLEMENTED BUT NOT VERIFIED | polling, dashboard, events | Metadata/consumables limited |
| 12 | Job management | IMPLEMENTED BUT NOT VERIFIED | local job manager/store/UI | No spooler monitoring |
| 13 | Profiles/presets | IMPLEMENTED BUT NOT VERIFIED | built-ins, CRUD, compatibility | Booklet/poster profile overpromises |
| 14 | Layout engine | IMPLEMENTED BUT NOT VERIFIED | shared preview engine | No geometry tests; not print-integrated |
| 15 | Imposition/page manipulation | NOT STARTED | only roadmap fields/overlays | N-up/booklet/poster absent |
| 16 | Diagnostics/logging | IN PROGRESS | notifications/events/dashboard | No structured logs/crash reporting |
| 17 | Packaging/CI | IMPLEMENTED BUT NOT VERIFIED | Tauri bundle config/release workflow | No tags/artifacts/signing |
| 18 | Production hardening | IN PROGRESS | lint/build/test pass | UI tests, printer tests, signing, CSP |

## 23. Current Development Phase

- Phase: Native migration, Phase 1: Native Project Shell.
- Goal: create only the native macOS Xcode project shell under `native-macos/` while preserving the Tauri prototype unchanged.
- Status: IN PROGRESS.
- Completion percentage: 0% for native migration Phase 1 before project creation.
- Remaining work: create minimal SwiftUI macOS app target and XCTest target, verify build/test where Xcode is available, and keep existing Tauri source untouched.
- Success criteria verified: architecture decision and Native PDF Layout Proof design approved.
- Success criteria not verified: native app build, native XCTest, Intel Monterey launch, Apple Silicon launch.

## 24. Gap Analysis Against Original Project Goals

- Modern desktop print UI: IMPLEMENTED BUT NOT VERIFIED.
- PDF import/preview: IMPLEMENTED AND VERIFIED by build.
- Image import: NOT IMPLEMENTED.
- Multi-document jobs: NOT IMPLEMENTED.
- Installed printer discovery: IMPLEMENTED AND VERIFIED by tests/build only.
- Konica Minolta bizhub C226i-specific support: PARTIALLY IMPLEMENTED only through generic driver options in the preserved Tauri prototype; no specific profile/sample or verified capability evidence exists.
- Full capability detection: PARTIALLY IMPLEMENTED.
- Safe print submission: IMPLEMENTED BUT NOT VERIFIED.
- Preview-to-print WYSIWYG: PARTIALLY IMPLEMENTED.
- Page manipulation: NOT IMPLEMENTED.
- Layout fit/scale/margins: PARTIALLY IMPLEMENTED, preview only.
- N-up/booklet/poster imposition: NOT IMPLEMENTED.
- Presets/profiles: IMPLEMENTED BUT NOT VERIFIED.
- Print queue monitoring/cancel/pause/resume: PARTIALLY IMPLEMENTED for local UI only.
- Diagnostics/logging: PARTIALLY IMPLEMENTED.
- Packaging/release: IMPLEMENTED BUT NOT VERIFIED.
- Signed/notarized distribution: NOT IMPLEMENTED.
- Cloud sync/accounts: PARTIALLY IMPLEMENTED auth foundation; sync NOT IMPLEMENTED.

## 25. Exact Recommended Next Step

Create the native macOS Xcode project shell in a dedicated `native-macos/` subdirectory, with an empty SwiftUI app target and XCTest target, and make no changes to the existing Tauri application.

## 26. PROJECT_STATE.md

Project goal: PrintPilot is a safe desktop printing app for macOS/Windows/Linux that provides a modern PDF preview/settings workflow on top of the operating system print stack.

Current architecture decision:
- CONTROLLED NATIVE MIGRATION is approved.
- The existing Tauri/React/Rust PrintPilot application is preserved as the known-good prototype/reference implementation.
- Temporary development decision: the existing Tauri/React/TypeScript/Rust application is resumed as the ACTIVE DEVELOPMENT TRACK for real printer research and diagnostics.
- Swift/native migration is DEFERRED, NOT CANCELLED.
- Do not delete, rewrite, or migrate the existing Tauri application until native parity is verified.
- Preserve `native-macos/` unchanged while Tauri diagnostics work is active.
- The native macOS application will live in `native-macos/`.
- The approved native milestone is Native PDF Layout Proof.
- The current native implementation phase is Phase 1: Native Project Shell.

Current Tauri diagnostics phase:
- REAL PRINTER DISCOVERY AND DIAGNOSTICS.
- Purpose: real printer investigation, capability discovery, CUPS diagnostics, printer status research, queue behavior research, and workflow prototyping.
- Exact current task: capture and persist a read-only diagnostic snapshot of the Konica Minolta bizhub C226i and the macOS/CUPS printing environment.
- Printer capabilities must be detected from real evidence and never guessed.

Approved Native PDF Layout Proof design:
- Primary goal: prove one canonical immutable resolved layout/page drawing plan can drive both native on-screen preview and generated print-ready PDF artifact.
- Pipeline: Imported PDF -> Selected PDF Page -> LayoutIntent -> LayoutResolver -> ResolvedLayout -> shared PageDrawingPlan/ResolvedPagePlacement -> PreviewRenderer and PDFArtifactRenderer.
- PreviewRenderer and PDFArtifactRenderer must consume the same immutable page drawing plan.
- Neither renderer may independently calculate source geometry, scale, placement, clipping, page rotation, page box choice, or page-placement transforms.
- Only final conversion from canonical sheet coordinates to the destination graphics context may differ between preview and artifact rendering.

Approved corrections:
- Printer identity correction: the real target printer is Konica Minolta bizhub C226i. Do not guess capabilities.
- PDF rotation correction: preserve raw PDF page rotation in the document page descriptor; explicitly support 0, 90, 180, and 270 degrees; normalize equivalent multiples of 360 only when mathematically exact; unexpected/non-right-angle rotations must produce controlled unsupported geometry, not silent modification.
- Shared drawing contract correction: add a PageDrawingPlan or ResolvedPagePlacement immutable value containing selected source box, normalized source geometry, source rectangle, destination rectangle, effective rotation, clipping rectangle, and page-to-sheet transform data required by both renderers.

Supported platforms:
- macOS 10.13+ configured.
- Windows 10/11 documented.
- Linux supported through Tauri/CUPS and CI workflow.

Known test printers:
- No concrete test printer evidence found in repo.
- Real target printer: Konica Minolta bizhub C226i. No captured capabilities or dedicated profile exists yet.

Technology stack:
- React 18, TypeScript 5.7, Vite 6, Tailwind CSS, lucide-react, PDF.js 3.11.
- Tauri v2, Rust 2021.
- Firebase SDK present for optional Google auth.

Architecture decisions:
- Delegate all printing to installed OS print systems.
- No raw sockets, PJL/PCL/PostScript-to-hardware, firmware, or SNMP writes.
- Use CUPS CLI on macOS/Linux.
- Use Windows WMI/PowerShell/PrintTo on Windows.
- Use local-first app state; cloud is optional and not authoritative.
- Controlled native migration is approved for the long-term macOS application.
- Preserve the Tauri app as the prototype/reference implementation.
- Native macOS work must live under `native-macos/`.

Architecture overview:
- `App.tsx` composition root.
- Feature modules under `src/features`.
- Shared services under `src/services`.
- Tauri commands in Rust.
- Platform-specific print backends selected at compile time.

Actual folder structure:
- See section 5.
- Planned native app folder: `native-macos/`.

Completed phases:
- Bootstrap, PDF import, PDF preview, CUPS parser/capability foundation, frontend build hygiene.

Current phase:
- REAL PRINTER DISCOVERY AND DIAGNOSTICS on the preserved Tauri prototype.

Native milestone success criteria:
- Native app launches on macOS Monterey 12.7.6 Intel.
- Native app launches on Apple Silicon.
- PDF can be selected.
- PDF can be drag-dropped.
- Page count is read.
- Selected page dimensions are correctly detected.
- A4, A3, and custom paper can be selected.
- Portrait and landscape work.
- Margins work.
- Actual, Fit, Fill, and Custom scaling work.
- Horizontal and vertical alignment work.
- Preview uses ResolvedLayout plus the shared immutable page drawing plan.
- Exported PDF uses the same ResolvedLayout plus the same immutable page drawing plan.
- Generated PDF page dimensions are correct.
- Generated PDF placement is correct.
- Clipping behavior is correct.
- Geometry tests pass.
- Rendering verification tests pass.
- Reopened generated artifact visually matches preview within documented tolerance.
- Existing Tauri prototype remains unchanged and buildable.

Native milestone non-goals:
- Printer discovery.
- Printer capability detection.
- Konica Minolta bizhub C226i capability investigation.
- PrintCore.
- CUPS.
- IPP.
- PPD inspection.
- Print submission.
- Print queues.
- Multiple imported files.
- Page reordering/deletion/cropping UI.
- N-up, booklet, poster/tiled, repeated-design, or advanced imposition.
- Presets.
- Cloud functionality.
- Production signing/notarization.

Implemented features:
- PDF file open and drag/drop.
- PDF overview/detail preview.
- Layout preview engine.
- Printer discovery.
- Capability detection.
- Print settings.
- CUPS print submission.
- Windows best-effort print submission.
- Local job manager/history.
- Printer dashboard and notifications.
- Profiles/presets.
- Optional Firebase Google auth foundation.
- Release workflow configuration.
- Read-only printer diagnostic snapshot capture and JSON export.
- Diagnostics dashboard panel for capturing/viewing/exporting CUPS and capability evidence.

Known bugs:
- See section 18.

Current problems:
- No full Tauri packaging verification in this audit.
- No real-printer verification.
- No UI/integration tests.
- Preview layout not applied to backend output.
- No real print queue monitoring.
- Unsigned/unnotarized distribution.
- Native Swift migration is deferred while Tauri is used for real printer research.
- Full native Xcode verification remains blocked on this machine because `xcodebuild` requires a full Xcode install, not Command Line Tools.

Printer research findings:
- CUPS is the strongest backend path.
- Windows path is limited by `PrintTo`.
- IPP/PPD/PrintCore are not directly implemented.
- Konica Minolta bizhub C226i behavior must be investigated later from installed driver and printer evidence using native macOS APIs, CUPS, IPP, and PPD/driver evidence where available.
- Read-only CUPS diagnostic snapshot captured for destination `_10_10_0_25_2`.
- Captured evidence: macOS `12.7.6`, CPU `x86_64`, CUPS `2.3.4`, default printer `_10_10_0_25_2`.
- Captured identity evidence: destination `_10_10_0_25_2`, device URI `ipp://10.10.0.25/ipp`, make/model `KONICA MINOLTA C226i PS`, hostname/IP `10.10.0.25`.
- Captured capability evidence: 135 raw driver options, 45 normalized paper/media sizes, 6 trays/input sources, 70 media types, 3 duplex modes, 3 color modes, 2 resolution/quality choices, and 127 currently unclassified/unknown driver options preserved for later analysis.
- Captured queue evidence: 0 queued jobs at capture time.
- Diagnostic snapshot warnings/errors: none reported by the snapshot.

Test environment:
- Local macOS-like development machine under `/Users/...`.
- Node dependencies already installed.
- Rust target/build cache present.

Latest test results:
- ESLint: pass (`npm run lint`).
- TypeScript no-emit: pass (`npx tsc --noEmit`).
- Vite production build to `/private/tmp/printpilot-vite-diagnostics-dist`: pass with existing warnings for PDF.js eval and large chunks.
- Rust tests: pass, 12 passed, 1 ignored (`cargo test`). Ignored test is the explicit real-printer diagnostic capture helper.
- Real diagnostic capture helper: pass when explicitly run for `_10_10_0_25_2`; wrote ignored `.local-diagnostics/_10_10_0_25_2-diagnostics.json`.
- Rust check: pass (`cargo check`) with future-incompat warning for transitive `block v0.1.6`.

Pending tasks:
- Analyze the captured Konica Minolta bizhub C226i raw driver options and classify unknown options into safe normalized categories.
- Add Native PDF Layout Proof domain and geometry tests after Swift migration resumes.
- Verify Tauri app bundle locally.
- Run release workflow from a tag.
- Add UI/integration tests.
- Add real printer smoke test plan.
- Add signing/notarization.

Deferred features:
- Image import.
- Multi-file jobs.
- Page reordering/removal/cropping.
- N-up/booklet/poster imposition.
- Real queue cancel/pause/resume.
- IPP direct capability query.
- PPD parser.
- Cloud sync/storage.
- Auto-update.

Technical debt:
- See section 20.

Important build/test/diagnostic commands:

```bash
npm run lint
npx tsc --noEmit
npx vite build --outDir /private/tmp/printpilot-vite-audit-dist --emptyOutDir
cd src-tauri && cargo test
cd src-tauri && cargo check
npm run tauri:dev
npm run tauri:build
npm run tauri:build:mac
PRINTPILOT_DIAGNOSTIC_PRINTER=_10_10_0_25_2 PRINTPILOT_DIAGNOSTIC_OUTPUT_DIR=../.local-diagnostics cargo test capture_real_diagnostic_snapshot_when_requested -- --ignored --nocapture
```

Current Git branch:
- `main`

Latest known-good commit:
- `b83af2ae00567ce22687621f81060b5ab8f6ace7`

Next step:
- Analyze the captured Konica Minolta bizhub C226i raw driver options and create a classification plan for unknown capabilities without guessing behavior.

Session handoff notes:
- No source files were modified during the audit.
- `PROJECT_STATE.md` was created as requested.
- Build/test verification avoided writing tracked `dist` by redirecting Vite output to `/private/tmp`.

Latest files modified:
- `.gitignore`
- `PROJECT_STATE.md`
- `src-tauri/src/commands/mod.rs`
- `src-tauri/src/cups/client.rs`
- `src-tauri/src/cups/mod.rs`
- `src-tauri/src/diagnostics/mod.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/src/models/diagnostics.rs`
- `src-tauri/src/models/mod.rs`
- `src-tauri/src/models/printer.rs`
- `src/features/diagnostics/api.ts`
- `src/features/diagnostics/components/PrinterDiagnosticsPanel.tsx`
- `src/features/diagnostics/index.ts`
- `src/features/diagnostics/types.ts`
- `src/features/printers/components/PrinterDashboard.tsx`

Latest working behavior:
- Static verification passes; PDF/printer/job/profile UI compiles.
- Controlled native migration and Native PDF Layout Proof technical design are approved, with corrected Konica Minolta bizhub C226i identity and shared page drawing contract.
- Tauri app now includes a read-only diagnostics panel in the printer dashboard.
- Backend diagnostic subsystem captures host/CUPS environment, selected printer identity, raw CUPS output, raw and normalized capabilities, read-only queue state, command execution records, warnings, and errors.
- Diagnostic export writes pretty-printed JSON only to a user-selected or explicitly provided path.

Latest unresolved error:
- No required verification command failed.
- Native Xcode build/test remains unverified because the active developer directory is Command Line Tools, not full Xcode.
- Vite build still reports existing PDF.js eval and large chunk warnings.
- Rust still reports existing transitive future-incompat warning for `block v0.1.6`.

Uncommitted changes:
- Diagnostics implementation changes pending commit.
- `native-macos/` remains untracked from the previous native shell task and is intentionally preserved unchanged.
- `.local-diagnostics/` contains ignored local machine-specific diagnostic JSON and must not be committed.

Do-not-change notes:
- Do not submit real print jobs without explicit approval.
- Do not modify printer configuration.
- Do not discard uncommitted changes.
- Do not delete, rewrite, or migrate the existing Tauri app until native parity is verified.
- Do not guess Konica Minolta bizhub C226i capabilities.
- Do not implement layout domain, PDF importing, printer discovery, PrintCore, CUPS, IPP, or PPD in native Phase 1.
- Do not commit `.local-diagnostics/` snapshots.
- Do not classify Konica Minolta bizhub C226i capabilities without captured evidence.

Recommended next action:
- Analyze captured raw Konica Minolta bizhub C226i driver options and design evidence-based normalization mappings.

## 27. Auth, Guest History, and Cloud PDF Archive Update

Update date: 2026-07-08

New immediate priority implemented in the existing Tauri + React + TypeScript + Rust app:

- Launch entry now supports Sign In, Sign Up, and Continue to Print.
- Email/password Firebase authentication is wired behind the existing provider adapter.
- Restored Firebase sessions enter the main app directly; guest users can continue without cloud.
- The top-right account menu now shows guest sign-in/sign-up controls or signed-in identity, Cloud Documents, storage usage, and Sign Out.
- Delete Account, Google, Apple, subscriptions, sharing, and collaboration were intentionally not added.
- Guest/local PDF opens are recorded in persistent local guest history and existing recent-file validation still checks that reopened files are valid local PDFs.
- Signed-in local PDF opens trigger a background cloud archive attempt without blocking preview or printing.
- Cloud archive validates PDF existence/type/size, enforces the 500 MB limit, computes SHA-256 in Rust with streaming I/O, reserves quota through a trusted function, uploads privately to Firebase Storage, finalizes metadata, and exposes retry/status UI.
- Cloud document opens download to an app cache through Rust, verify SHA-256, and re-enter the existing local PDF workflow with explicit cloud origin.
- Cloud document delete uses a confirmation and trusted server-side metadata/storage/quota cleanup, without closing the currently open local copy.

New files and configuration:

- `src/features/cloud/components/AuthEntryScreen.tsx`
- `src/features/cloud/components/CloudDocumentsDialog.tsx`
- `src/features/cloud/components/DocumentCloudBadge.tsx`
- `src/features/cloud/documents/*`
- `src-tauri/src/models/cloud_document.rs`
- `firebase.json`
- `firestore.rules`
- `storage.rules`
- `firestore.indexes.json`
- `functions/*`
- `docs/FIREBASE_CLOUD_ARCHIVE.md`

Cloud security model:

- Firestore document and quota writes are denied to clients.
- Storage access is scoped to `users/{uid}/documents/{documentId}/original.pdf`.
- Trusted Cloud Functions handle reservation, duplicate detection, finalization, deletion, and quota accounting.
- Deduplication is per-user SHA-256 only; there is no cross-user deduplication.

Latest verification for this update:

- `npx tsc --noEmit`: pass.
- `npm run lint`: pass.
- `npx vite build --outDir /private/tmp/printpilot-auth-vite-dist --emptyOutDir`: pass with known PDF.js eval and large chunk warnings.
- `cd src-tauri && cargo check`: pass with known transitive `block v0.1.6` future-incompat warning.
- `cd src-tauri && cargo test`: pass, 12 passed and 1 ignored.
- `npm --prefix functions run build`: pass.
- `npm audit --prefix functions --audit-level=high`: pass high-severity gate; reports moderate transitive `uuid` advisories in the Firebase Admin dependency graph. The automatic fix currently requires `firebase-admin@14`, but the latest Firebase Functions SDK peer range supports Firebase Admin only through v13.

Remaining blockers and limits:

- Firebase emulators/security-rules tests were not added or run.
- Firebase deployment, billing enablement, budget alerts, App Check, and production project setup remain blocked pending explicit approval.
- Cloud upload still uses the Firebase Web SDK Blob upload path after Rust validation/hash; a future hardening pass should replace this with native streaming upload or signed URL streaming.
- No real cloud E2E upload/download/delete test was performed against a live Firebase project.
- Native macOS work remains untouched.

Recommended next action:

- Add Firebase emulator tests for auth boundaries, cross-user denial, quota exhaustion, duplicate handling, oversize rejection, stale reservation cleanup, and cloud delete accounting before any production Firebase deployment.

## 28. Firebase Emulator Cloud Verification Update

Update date: 2026-07-08

Primary goal completed:

- Added a Firebase Emulator integration suite for the authenticated cloud PDF archive.
- Test project ID: `printpilot-emulator-test`.
- Emulated services: Authentication, Firestore, Storage, Functions.
- Deterministic ports: Auth `9099`, Firestore `8080`, Functions `5001`, Storage `9199`, Hub `4400`.
- Test command: `npm run test:firebase:emulator`.
- The test runner uses `firebase emulators:exec` and fails if required emulator environment variables are absent.
- No Firebase credentials, service-account keys, billing, production deployment, release tag, or GitHub Release were used.

Integration test architecture:

- Tests live under `tests/firebase-emulator/`.
- Helpers create Auth emulator accounts, authenticated clients, unauthenticated contexts, trusted seed data, deterministic small PDF fixtures, SHA-256 values, archive reservations, Storage uploads, finalization calls, quota reads, deletion calls, duplicate requests, and concurrent reservations.
- Firestore and Storage rules are exercised through `@firebase/rules-unit-testing`.
- Cloud Functions are exercised through the Firebase client SDK against the Functions emulator.
- Emulator state is cleared between tests for Auth, Firestore, and Storage.

Security and archive test results:

- Authentication emulator: pass.
- Firestore rules: pass for unauthenticated denial, cross-user denial, own metadata reads, direct metadata write denial, ownerUid-change denial, quota-forgery denial, direct finalized/synced transition denial, and hash-index write denial.
- Storage rules: pass for unauthenticated upload/download denial, cross-user read/write denial, invalid content type denial, unexpected path denial, and valid own archive-path PDF upload.
- Archive happy path: pass for reserve -> quota reserved -> upload -> finalize -> synced metadata -> exact accounting -> user isolation.
- Per-user deduplication: pass; same user reuses the same document and quota, different user gets a separate private document/storage path.
- Concurrent duplicate reserve race: pass; concurrent same-user same-SHA reservations produce one logical reservation and one quota charge.
- 500 MB trusted boundary: pass through reservation policy for exactly `524,288,000` bytes accepted and one byte over rejected.
- Storage 500 MB payload boundary: skipped because the Storage emulator evaluates `request.resource.size` from an actual upload payload; the suite intentionally avoids allocating or uploading a 500+ MB object.
- 5 GB quota: pass for remaining-quota acceptance, quota-exceeded rejection, failed reservation no-charge, duplicate no-charge, and concurrent reservations not exceeding seeded quota.
- Finalization idempotency: pass; repeated finalize does not double-charge.
- Delete/accounting: pass after fix; metadata, storage object, hash index, and quota are reconciled, and repeated delete remains idempotent.
- Partial failure/recovery: pass for reservation-without-upload, finalize-without-upload, upload-with-wrong-finalize-input, finalized-retry, missing-storage delete, malformed callable input, unauthenticated callable invocation, and cross-user callable denial.

Defect discovered and fixed:

- Defect: `deletePdfArchive` returned `functions/not-found` when called after the cloud document metadata was already deleted.
- Impact: repeated delete was not idempotent and could make safe retry/recovery paths appear failed.
- Fix: `deletePdfArchive` now returns `{ ok: true }` when the document is already absent, preserving quota/accounting state.

Latest verification for this update:

- `npm run test:firebase:emulator`: pass, 14 passed, 0 failed, 1 skipped.
- `npx tsc --noEmit`: pass.
- `npm run lint`: pass.
- `npx vite build --outDir /private/tmp/printpilot-firebase-emulator-dist --emptyOutDir`: pass with known PDF.js eval and large chunk warnings.
- `cd src-tauri && cargo test`: pass, 12 passed and 1 ignored.
- `cd src-tauri && cargo check`: pass with known transitive `block v0.1.6` future-incompat warning.
- `npm --prefix functions run build`: pass.
- `npm audit --prefix functions --audit-level=high`: pass high-severity gate; moderate transitive Firebase Admin `uuid` advisories remain.
- Printer diagnostics regression: pass through `cargo test` diagnostics unit tests; real-printer ignored diagnostic capture was not run.
- DMG pipeline integrity: `.github` release workflow files unchanged.
- `native-macos/` integrity: remains untracked and untouched.

Remaining blockers and limits:

- Live Firebase deployment remains blocked pending explicit approval, production project setup, billing/budget alerts, and App Check/security review.
- No live Firebase cloud E2E test was performed.
- No UI E2E test verified that an already-open PDF remains visible after cloud deletion.
- Storage-rule oversize payload was not tested with a real 500+ MB upload; trusted reservation size limits cover the boundary without large allocation.
- Firebase CLI emits unauthenticated emulator warnings and Java/runtime deprecation warnings during local emulator startup; tests still run against local emulators only.

Current phase:

- Cloud archive verification and production hardening.

Exact next step:

- Run a controlled live Firebase staging smoke test with billing budgets and App Check configured, after explicit approval.
