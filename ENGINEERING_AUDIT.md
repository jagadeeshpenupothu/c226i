# PrintPilot — Principal-Level Engineering Audit

> Read-only audit. No source files were modified, refactored, or generated. Only this documentation file was created.
> Scope: every folder, TypeScript/Rust module, Tailwind class, config, IPC command, and dependency was inspected.
> Metrics are evidence-based: **~4,329 app LOC** (2,905 frontend TS/TSX + 1,424 backend Rust), **437 transitive Rust crates**, **258 npm packages**, **66 inline hex colors** inside Tailwind arbitrary values, **0 frontend tests**, **3 Rust test modules**, **0 TODO/FIXME markers**, **19 aria attributes**, **CSP disabled**, **no LICENSE**.

---

## 1. Executive Summary

**What it is.** PrintPilot is a **Tauri v2 desktop application** (Rust core + React/TypeScript WebView UI) that provides a modern, safe front-end for **printing PDF documents** through the operating system's own print stack. It is *not* an Electron app — there is no Node in the renderer and no preload bridge.

**Problem it solves.** OS print dialogs are inconsistent and shallow; driver UIs are ugly and vendor-specific. PrintPilot offers one polished, cross-platform surface to preview a PDF page-by-page and drive the installed driver's real capabilities — **without ever touching hardware directly** (no raw sockets, port 9100, PJL/PCL/PostScript, SNMP writes, or firmware access). It delegates to CUPS (macOS/Linux) and the Windows print system.

**Current maturity: early v1 / advanced prototype.** The happy path works: discover printers → preview PDF → pick common settings → submit. But it has (a) a **material functional gap** (advanced driver options are collected in the UI and silently dropped before reaching the backend), (b) **~650 LOC of a fully-built but unwired PDF viewer**, (c) **partly fabricated print history**, and (d) **zero frontend tests / no CI / no signing / no auto-update**. It is a strong foundation, not a shippable enterprise product.

**Architecture style.** Layered, feature-oriented frontend + a Rust core with a clean **compile-time platform-abstraction seam** (`platform::unix` for CUPS, `platform::windows` for PowerShell/WMI). Client-side PDF rendering via PDF.js. Local component state only (no state library, no router).

**Biggest strengths.**
1. Excellent **platform abstraction** and a **safety-first printing model** that is genuinely well-conceived.
2. A **rich capability-introspection engine** on the Rust side (every driver option is parsed, categorized, and made searchable).
3. A **visually polished, responsive** dark UI with sophisticated per-page paper-fit preview.
4. **Backend is unit-tested** (parsers + capability builder) and cleanly modular.

**Biggest weaknesses.**
1. **End-to-end incompleteness**: advanced options don't reach the OS; orientation/scaling/margins are preview-only; history is faked.
2. **Dead code & unreachable features** (detail viewer, zoom, rotate, overlays, keyboard nav).
3. **God component** (`App.tsx`, 477 LOC) + prop-drilling; no server-state separation.
4. **Design-token indiscipline** (66 hardcoded hex vs ~43 token uses), **no accessibility** in dialogs, **dark-only**.
5. **No test/CI/release engineering** on the frontend; **no CSP**, **no LICENSE**, **no auto-update/signing**.

---

## 2. Complete Folder Tree

```
c226i/
├── index.html                     Vite HTML entry; mounts <div id="root">
├── package.json                   Frontend deps + scripts (dev/build/tauri/lint)
├── package-lock.json              Locked npm tree (258 packages)
├── vite.config.ts                 Vite: port 1420, @→src, build targets, env prefixes
├── tailwind.config.ts             Design tokens (HSL vars→Tailwind), radii, one shadow
├── postcss.config.js              tailwind + autoprefixer
├── tsconfig.json                  Strict TS, ES2020, @/* paths, noEmit
├── eslint.config.js               Flat config: js + ts-eslint + react-hooks/refresh
├── README.md                      Project + build docs (updated for Win/Linux/macOS)
├── MACOS_SUPPORT.md               macOS version/arch support matrix
├── WINDOWS_SUPPORT.md             Windows version/arch support matrix
│
├── src/                           ── FRONTEND (React) — 100% shared across OSes ──
│   ├── main.tsx                   React root (StrictMode → <App/>)
│   ├── App.tsx                    ★ Root: all state, orchestration, HistoryDialog (477 LOC)
│   ├── styles.css                 Tailwind layers + :root/.dark CSS variable themes
│   ├── vite-env.d.ts              Vite client type reference (1 line)
│   ├── components/
│   │   ├── ui/                    Reusable primitives: button, card, input, select
│   │   └── pdf/                   PDF viewer — TWO subsystems (one unreachable):
│   │       ├── PdfPreview.tsx         [live] container: empty/loading/error/overview
│   │       ├── PdfDocumentOverview.tsx[live] thumbnail grid + page search + modes
│   │       ├── PdfOverviewThumbnail.tsx[live] renders one page → canvas, caches JPEG
│   │       ├── PdfLoadingState.tsx    [live] progress bar
│   │       ├── PdfErrorState.tsx      [live] error card
│   │       ├── PdfDetailPreview.tsx   [DEAD] continuous zoom/rotate viewer (259 LOC)
│   │       ├── PdfToolbar.tsx         [DEAD] nav/zoom/rotate/overlays (169 LOC)
│   │       ├── PdfPageCanvas.tsx      [DEAD] page + bleed/trim/safe guides (178 LOC)
│   │       └── PdfInfoBar.tsx         [DEAD] metadata strip (used only by detail)
│   ├── features/
│   │   ├── pdf/                    pdfPreview.tsx (1-line re-export) + PdfFile type
│   │   ├── printers/               api.ts (invoke wrappers) + types.ts (rich caps types)
│   │   └── settings/               ★ settingsPanel.tsx (595 LOC) + api.ts + types.ts
│   ├── hooks/
│   │   ├── usePdfDocument.ts       Load/track a PDF (PDF.js), cancellation-safe
│   │   ├── useElementSize.ts       ResizeObserver wrapper
│   │   └── usePdfKeyboardShortcuts.ts [DEAD] used only by unreachable detail viewer
│   ├── lib/
│   │   ├── tauri.ts                isTauriRuntime + safeInvoke (IPC guard)
│   │   └── utils.ts                cn() = clsx + tailwind-merge
│   ├── services/pdf/
│   │   ├── pdfJs.ts                PDF.js worker/cmap/font wiring (Vite glob)
│   │   ├── pdfMetadata.ts          page size, formatting, paper detection (table #1)
│   │   ├── printPreview.ts         selected paper → pt dimensions (table #2, DUP)
│   │   └── pdfErrors.ts            friendly PDF error text
│   └── types/pdf.ts                PDF TS types (ZoomMode, PdfPageSize, …)
│
├── src-tauri/                     ── BACKEND (Rust) ──
│   ├── Cargo.toml                  Deps; macOS-gated cocoa/objc (UNUSED)
│   ├── Cargo.lock                  437 transitive crates
│   ├── build.rs                    tauri_build::build()
│   ├── tauri.conf.json             Window, bundle(targets:"all"), csp:null, asset scope
│   ├── capabilities/default.json   ACL: core:default + dialog:default (minimal ✔)
│   ├── icons/                      icon.png + icon.ico (single-size, PNG-embedded)
│   ├── gen/schemas/                Generated ACL schemas (desktop/macOS/windows)
│   └── src/
│       ├── main.rs                 → printpilot_lib::run()
│       ├── lib.rs                  ★ Tauri builder, 4 commands, #[cfg] module gating
│       ├── commands/mod.rs         4 #[tauri::command] + shared validation
│       ├── models/                 Serde DTOs: print.rs, printer.rs (+ rich caps model)
│       ├── platform/               ★ compile-time backend selection
│       │   ├── mod.rs              cfg router (self::unix / self::windows)
│       │   ├── unix.rs             macOS + Linux (CUPS orchestration)
│       │   └── windows.rs          Windows (PowerShell/WMI, 320 LOC)
│       ├── cups/                   client.rs (Command wrappers) + mod.rs  [non-Windows]
│       ├── parser/                 lpstat.rs + lpoptions.rs (+ unit tests) [non-Windows]
│       └── printer/                capabilities.rs + print_options.rs (+ tests)[non-Win]
│
└── cups/ pdf/ printer-core/ printer-profiles/    ── EMPTY SCAFFOLD DIRS ──
    settings/ history/ ui/                          (one-line README each; no code)
```

**Purpose of every major area** is annotated inline above. The **7 root scaffold dirs are aspirational placeholders** — they contain only a `# name` README and represent an intended future modular structure that has not materialized. They currently add noise and imply structure that isn't there.

---

## 3. Startup Flow

```
Launch (OS opens the bundled binary)
      │
      ▼
main.rs → printpilot_lib::run()
      │
      ▼
lib.rs  tauri::Builder::default()
      ├─ .plugin(tauri_plugin_dialog::init())
      ├─ .invoke_handler([list_printers, get_printer_capabilities,
      │                    get_pdf_file_metadata, print_pdf])
      └─ .run(generate_context!())         reads tauri.conf.json
             │                              + capabilities/default.json (ACL)
             ▼
      Creates window "main" (1180×780, min 960×680)
      Loads devUrl :1420 (dev) or ../dist (prod) into the system WebView
             │
             ▼  (WebView boots)
      index.html → <script src="/src/main.tsx">
             ▼
      main.tsx  ReactDOM.createRoot(#root).render(<StrictMode><App/></StrictMode>)
             ▼
      App.tsx mounts
        ├─ useEffect → loadPrinters()  ──invoke("list_printers")──►  Rust/CUPS/WMI
        │                              ◄──PrinterInfo[]────────────
        ├─ chooses default/first printer
        ├─ useEffect(printerId) ─invoke("get_printer_capabilities")►
        │                              ◄──PrinterCapabilities───────
        ├─ applyCapabilityDefaults(settings)
        └─ render: <PdfPreview/> | resize divider | <SettingsPanel/>
             │
   user Browse/drop PDF
             ▼
   plugin-dialog open() / webview onDragDropEvent → selectPdfPath(path)
        └─ pdfFromPath → convertFileSrc(path) → PDF.js getDocument()
             ▼
   Preview renders (thumbnail grid)  →  user sets options  →  Print
             ▼
   invoke("print_pdf", {request}) → platform::print_pdf → lp / PrintTo
             ▼
   status banner + history entry
```

**No preload, no router, no splash.** The core process is thin; nearly all logic lives in the WebView except printing/discovery, which is Rust.

---

## 4. Architecture Diagrams

**Frontend (render tree — [live] vs [dead]):**
```
App
├── header (Browse / Refresh / History buttons)
├── PdfPreview [live]
│     └── usePdfDocument → PDF.js
│         └── PdfDocumentOverview [live]
│               └── PdfOverviewThumbnail × N  (renders each page to <canvas>)
│         └── PdfLoadingState / PdfErrorState [live]
├── resize divider (pointer events, persisted %)
├── Card → SettingsPanel [live]
│     ├── printer <select>
│     ├── quick settings (paper/layout/color)   ← choiceDescriptor engine
│     └── MoreOptionsDialog (searchable driver options)  ← driverDescriptor engine
└── HistoryDialog (modal)

ISLAND [dead]: PdfDetailPreview → {PdfToolbar, PdfPageCanvas, PdfInfoBar} + usePdfKeyboardShortcuts
               (no inbound import anywhere)
```

**Backend + IPC:**
```
WebView (features/*/api.ts → lib/tauri.safeInvoke) ──invoke──► Tauri core
                                                                   │
                                              commands/mod.rs (validate)
                                                                   │
                                              platform/mod.rs  [#cfg router]
                                        ┌──────────────────────────┴───────────┐
                                (macOS+Linux)                             (Windows)
                            platform/unix.rs                        platform/windows.rs
                        cups + parser + printer                   PowerShell script builder
                                   │                                        │
                        Command(lpstat/lpoptions/lp)         powershell(Get-CimInstance,
                                   │                          Set-PrintConfiguration, PrintTo)
                                   ▼                                        ▼
                                CUPS  ─────────────► PRINTER ◄───────  Windows Spooler
```

**Data flow (unidirectional, props-down):**
```
localStorage ⇄ App state (useState ×~13)
                 │  props        ┌────────────► PdfPreview (file, printPaper, printerName)
                 ├───────────────┤
                 │               └────────────► SettingsPanel (settings, capabilities, onChange, onPrint)
                 │  invoke()
                 ▼
             Rust backend (stateless per call)
```

**PDF rendering:** `previewUrl = convertFileSrc(path)` (asset: protocol, scope `$HOME/**`) → PDF.js `getDocument` (bundled worker/cmaps/fonts via Vite glob) → `page.render()` onto `<canvas>` at min(devicePixelRatio, 2). Thumbnails cache a JPEG dataURL in a **module-level unbounded Map**.

**Printer communication:** always **out-of-process CLI/PowerShell**, never a library/socket. Unix uses argv (no shell); Windows builds a single-quoted PowerShell script string.

---

## 5. Component Inventory

| Component | Purpose | Key Props | Hooks | State | Complexity | Reusable? | Split? |
|---|---|---|---|---|---|---|---|
| **App** | Root: state, orchestration, print, history, resize | — | useState×8, useEffect×3, useMemo, useCallback×2, useRef | pdfFile, printers, capabilities, settings, status, recentFiles, 3× loading, history, split% | **High (477)** | No | **Yes** — split server-state + history + resize |
| HistoryDialog | History table + reprint | items, onClose, onReprint | — | none | Medium | No | Maybe |
| **SettingsPanel** | Printer + settings + drives More Options | printers, capabilities, settings, onChange, canPrint, isPrinting, status, onPrint | useState×2, useMemo | isMoreOptionsOpen, modalSearch | **Very High (595)** | No | **Yes** — extract descriptor engine + dialog + control |
| MoreOptionsDialog | Searchable advanced/expert/unknown options | descriptors, search, callbacks | — | none | High | No | Part of split |
| SettingControl | number stepper / select for one setting | descriptor, settings, onChange | — | none | Medium | Medium | Extract |
| PdfPreview | Preview state machine | file, printPaper, printerName | usePdfDocument | none | Low | Medium | No |
| PdfDocumentOverview | Thumbnail grid, search, preview-mode, ppr | file, document, pageCount, firstPage, printPaper, printerName | useState×4, useMemo×2, useEffect, useRef | selectedPage, search, pagesPerRow, previewMode | High (224) | Medium | Maybe |
| PdfOverviewThumbnail | Render one page + paper-fit layout | document, pageNumber, paperSize, previewMode, isSelected | useState×2, useEffect, useRef×2 | pageSize, isRendered | High (214) | Medium | No |
| PdfLoadingState | Progress bar | progress | — | none | Trivial | High | No |
| PdfErrorState | Error card | reason | — | none | Trivial | High | No |
| **PdfDetailPreview** ⚠️ | Continuous scroll viewer, zoom/rotate/overlays | file, document, initialPage, onBack, … | useState×6, useMemo×2, useCallback×7, useEffect×2, useRef, useElementSize, usePdfKeyboardShortcuts | many | **High (259) — DEAD** | — | Wire up or delete |
| **PdfToolbar** ⚠️ | Nav/zoom/rotate/overlay controls | 18 callbacks | — | none | High (169) — DEAD | High | — |
| OverlayToggle | Toggle chip | label, active, onClick | — | none | Trivial — dead | High | — |
| **PdfPageCanvas** ⚠️ | Page + printable/bleed/trim guides | document, pageNumber, scale, rotation, … | useState×2, useEffect, useRef×3 | isRendering, error | High — DEAD | Medium | — |
| Guide | Inset border overlay | inset, color | — | none | Trivial — dead | High | — |
| **PdfInfoBar** ⚠️ | Metadata strip | file, pageCount, firstPage, … | — | none | Low — DEAD | High | — |
| Button | CVA-variant button | variant, size | — | none | Low | **Yes** | No |
| Card | Panel container | div props | — | none | Trivial | **Yes** | No |
| Input | Text input | input props | — | none | Trivial | **Yes** | No |
| Select | Styled select + chevron | label, select props | — | none | Low | **Yes** | No |

Total: **19 components**; **5 are dead** (~650 LOC unreachable); **2 are oversized** (App, SettingsPanel).

---

## 6. Rust Backend

| Module | Responsibilities | Notes / Future scalability |
|---|---|---|
| `main.rs` | Binary entry → `run()` | — |
| `lib.rs` | Tauri builder, dialog plugin, register 4 commands, `#[cfg(not(windows))]` gate for cups/parser/printer | Clean. As commands grow, group by domain. |
| `commands/mod.rs` | 4 commands; shared validation (path exists, `.pdf`, printerId non-empty); delegate to `platform` | `CommandError` (thiserror) but returns `Result<_,String>` → structure lost across IPC. |
| `platform/mod.rs` | Compile-time router; exposes `list_printers`/`printer_capabilities`/`print_pdf` | **Should be a trait** (`PrintBackend`) to enable mock backends + tests. |
| `platform/unix.rs` | CUPS orchestration | Re-reads lpoptions on print (redundant). |
| `platform/windows.rs` | PowerShell/WMI; PrintTo loop; single-quote escaping; `CREATE_NO_WINDOW` | No job id; mutates global printer config; can't enumerate trays/media/res. |
| `cups/client.rs` | `Command` wrappers; offline detection from stderr | **No timeouts** → hang risk. |
| `parser/lpstat.rs` | Parse `-p`/`-v`, merge (BTreeMap dedupe), default flag | Unit-tested ✔ |
| `parser/lpoptions.rs` | Parse `kw/Display: *choice …` | Unit-tested ✔ |
| `printer/capabilities.rs` | Bucket choices + build rich `DriverCapability` (category/control/priority/keywords) | Unit-tested ✔; strong design. |
| `printer/print_options.rs` | Map friendly settings → driver keyword=value w/ fallbacks (KM-aware) | **Ignores driverOptions.** |
| `models/print.rs` | `PrintRequest`, `PrintSettings`, `PrintResponse`, `PdfFileMetadata` | **`PrintSettings` lacks `driver_options`** → advanced options dropped. `#[cfg_attr(windows, allow(dead_code))]` on 3 fields. |
| `models/printer.rs` | `PrinterInfo`, `PrinterStatus`, `CapabilityChoice`, `ParsedOption`, `DriverCapability`, `PrinterCapabilities` + derivation logic (category/control/keywords) | Well-modeled; several enum variants (`CapabilityControlType`, `CapabilitySource`) are `#[allow(dead_code)]` — modeled but unused. |

**Commands**: `list_printers`, `get_printer_capabilities`, `get_pdf_file_metadata`, `print_pdf`.
**Errors**: `CommandError`/`CupsError` (thiserror) → stringified for IPC.
**Traits**: none (platform selection is module-level `#[cfg]`).
**Future scalability**: the seam is right; formalize it as a trait, add job tracking, and cache capabilities. The capability model is already enterprise-grade in ambition (it exposes far more than the UI consumes).

---

## 7. IPC Analysis

**Every `invoke()`** (all via `safeInvoke`, which throws outside Tauri):
- `listPrinters()` → `list_printers`
- `getPrinterCapabilities(printerId)` → `get_printer_capabilities`
- `readPdfFileMetadata` → `get_pdf_file_metadata` ({path})
- `submitPrintJob({pdfPath, settings})` → `print_pdf`

**Every `#[tauri::command]`**: the four above (registered in `lib.rs`).

| Check | Finding |
|---|---|
| Validation | print/metadata validate existence + `.pdf` extension + non-empty printerId. **No path canonicalization**; no `.pdf` MIME sniff (extension only). |
| Serialization | serde camelCase↔snake_case. **No `deny_unknown_fields`** → `settings.driverOptions` silently dropped (root cause of the biggest functional bug). |
| Error handling | `Result<_, String>` everywhere → structure lost; frontend `friendlyError` further collapses to generic text (hides Windows PrintTo-handler failures). |
| Security | Unix: `Command` with argv, **no shell** (safe from injection). Windows: builds a PowerShell **script string** from user input, mitigated by single-quote escaping (`''`) — acceptable but a surface. ACL is minimal (`core:default` + `dialog:default`). No fs plugin exposed. |

**Non-command IPC**: dialog `open()`, `onDragDropEvent`, `convertFileSrc`.

---

## 8. Printing Pipeline

```
1. User opens PDF
   dialog open() OR onDragDropEvent → path → pdfFromPath{name,path,previewUrl=convertFileSrc}
2. Preview generation
   usePdfDocument → PDF.js getDocument(previewUrl, bundled cmaps/fonts) → render pages to <canvas>
3. Metadata extraction
   invoke get_pdf_file_metadata → fs::metadata (size); page dims from PDF.js viewport;
   paper-size guess (A3/A4/A5/Letter/Legal ±4mm)
4. Printer discovery
   invoke list_printers → lpstat -p/-v/-d (unix) OR Get-CimInstance Win32_Printer (win)
5. Settings
   invoke get_printer_capabilities → lpoptions -l (unix, full+KM) OR Win32_Printer/Get-PrintConfiguration (win);
   SettingsPanel builds descriptors; applyCapabilityDefaults seeds values
6. Print command
   submitPrintJob → invoke print_pdf → build_print_options (unix) OR PowerShell builder (win)
7. OS APIs
   lp -d <id> -n <copies> -o media=… -o sides=… … <path>   (unix)
   Set-PrintConfiguration + Start-Process -Verb PrintTo (loop copies)  (win)
8. Printer
   OS spooler → driver → device
```

**Every step works — with these leaks:** step 5 collects `driverOptions` + orientation/scaling/margins that **step 6 never forwards** (unix) or can't (win); step 7 returns a best-effort job id (unix) or literal `"submitted"` (win); step 6 on Windows mutates the printer's saved defaults.

---

## 9. Platform Layer

| | macOS | Linux | Windows |
|---|---|---|---|
| Backend | `platform/unix.rs` (shared) | `platform/unix.rs` (shared) | `platform/windows.rs` |
| Discovery/Caps/Submit | CUPS (`lpstat`/`lpoptions`/`lp`) — full per-job options | identical to macOS | WMI + `Get/Set-PrintConfiguration` + `PrintTo` |
| Per-job options | ✅ full | ✅ full | ⚠️ partial; **persists to global printer config** |
| Trays / media / resolution | ✅ | ✅ | ❌ not enumerated |
| Job id | parsed | parsed | ❌ `"submitted"` |
| OS-specific code actually used | **none** (cocoa/objc idle) | none beyond CUPS | PowerShell/WMI |

**Shared code**: entire frontend; `commands`, `models`, `platform/mod`. **Platform code**: `unix.rs`(+cups/parser/printer) vs `windows.rs`. **Missing**: Windows tray/media/resolution enumeration, true per-job options, job tracking; macOS/Linux have no genuinely OS-specific enhancements (both are "CUPS"). Quality: **macOS = Linux ≫ Windows.**

---

## 10. UI Audit

- **Spacing/alignment**: consistent within panels; heavy use of arbitrary pixel gaps (`px-3 py-1.5`, `text-[13px]`). No spacing scale — magic numbers.
- **Typography**: Inter/SF stack; sizes are ad-hoc arbitrary values, not a semantic scale; hierarchy is legible but not systematized.
- **Visual hierarchy**: good — clear panel separation, primary Print button, section headers.
- **Consistency**: medium — strong look, but controls are sometimes primitives and sometimes raw elements with inline classes.
- **Animations**: minimal (`animate-spin`, hover transitions, grid transition). `tailwindcss-animate` barely used. No `prefers-reduced-motion`.
- **Responsiveness**: strong — `sm/md/xl` breakpoints, ResizeObserver adaptive columns, `clamp()`, resizable split.
- **Color system**: **two competing systems**; hex literals dominate (66 inline-in-Tailwind) over tokens (~43). Dark-only.
- **Accessibility**: weak — **19 aria attributes total, 0 in dialogs**, no focus trap, no Esc-to-close, no focus restoration, no visible skip/landmarks, icon-only buttons mostly have `aria-label` (good) but modals are inaccessible.
- **Keyboard navigation**: **0 inline key handlers in the live app**; the only keyboard support lives in the **orphaned** `usePdfKeyboardShortcuts`. So the shipped app has essentially no keyboard workflow beyond native tabbing.
- **Mouse interactions**: rich — wheel-zoom (in dead viewer), pointer-drag resize, click-to-select pages.
- **Empty state**: present ("Drop a PDF") but doesn't surface recent files.
- **Loading state**: present (progress bar with %).
- **Error state**: present (PDF errors friendly; print errors over-generalized).

---

## 11. Design System

| Element | Current state |
|---|---|
| Buttons | `Button` (CVA): variants default/secondary/ghost/outline; sizes default/icon/lg. Good — but bypassed by many raw `<button>`s. |
| Inputs | `Input` primitive; also many raw `<input>`/`<select>` with duplicated inline classes. |
| Cards | `Card` (single style). |
| Dialogs | **No primitive** — two bespoke modals, inaccessible. |
| Typography | No scale; arbitrary px sizes. |
| Spacing scale | None (magic numbers). |
| Radius | tokens: lg .75rem / md .5rem / sm .375rem (used inconsistently vs `rounded-md/lg`). |
| Icons | lucide-react (consistent ✔). |
| Shadows | one token `shadow-panel` + many arbitrary shadows. |
| Animations | animate plugin present, underused. |
| Theme / Dark mode | `:root` + `.dark` variable sets defined; `darkMode:"class"`; **nothing toggles `.dark`** → effectively dark-only, and most UI bypasses tokens with hex. |
| Responsive rules | Good, breakpoint-driven + observers. |

**Verdict**: a *nascent* design system exists but is **not enforced**; ~60% of styling is one-off.

---

## 12. Tailwind Audit

- **Arbitrary values**: **102** across **14 files**; **66** are inline hex colors (`bg-[#1C1D20]`, `text-[#AEAEB2]`, …). This is the dominant styling mode.
- **Token usage**: only **~43** semantic token classes (`bg-primary`, `text-foreground`, `text-muted`, `ring-ring`, …).
- **Duplicate classes**: repeated modal shells, repeated `<select>`/`<button>` class strings (e.g. the settings select style is duplicated between `SettingControl` and `ui/select`).
- **Hardcoded values**: pervasive px typography/spacing and hex color.
- **Design-token usage**: defined in `tailwind.config.ts` but **~1/3** of color usage; the token system is effectively decorative.

**Impact**: theming (light mode, high-contrast, white-label) is currently infeasible without touching dozens of files.

---

## 13. Performance Audit

| Issue | Severity | Detail |
|---|---|---|
| No thumbnail virtualization | 🔴 | `PdfDocumentOverview` renders **all** pages (`isVisible=true` hardcoded) → every page rasterized on load. 100–500pp PDFs = heavy CPU/RAM. |
| Unbounded thumbnail cache | 🔴 | Module-level `Map` of JPEG dataURLs, never evicted → session-long memory growth. |
| Blocking Command/PowerShell | 🟠 | Synchronous, **no timeouts**; offline printer can stall; Windows sleeps 300ms×copies. |
| Redundant capability read on print | 🟠 | unix `print_pdf` re-runs `lpoptions`. |
| God-component re-renders | 🟡 | `App` owns all state → unrelated updates (status) re-render preview subtree. |
| Descriptor rebuild key | 🟡 | `buildDescriptors` memo depends on a derived string (`capabilityPlaceholder`) → rebuilds on loading toggles. |
| StrictMode double render (dev) | 🟢 | Dev-only double PDF load. |
| Unused deps | 🟢 | cocoa/objc (Rust); animate plugin barely used. |
| Bundle | 🟢 | PDF.js worker/assets bundled correctly; DPR capped ×2 (good). |

---

## 14. State Management

- **Local state**: everything — ~13 `useState` slices in `App`, plus per-component view state (zoom, page, caches). **No Redux/Zustand/Context/signals.**
- **Shared state**: passed via props (controlled `SettingsPanel`). **Prop-drilling** through App.
- **Context**: none.
- **Hooks**: `usePdfDocument` (server-ish PDF state), `useElementSize`, (dead) `usePdfKeyboardShortcuts`.
- **Data ownership**: `App` owns document selection + settings + printers + capabilities + history; children own ephemeral view state.
- **Event flow**: unidirectional (props down, callbacks up), `localStorage` for recent/history/split. Async guarded with `cancelled` flags (correct).
- **Gap**: **server-state (printers/capabilities) is not separated** from UI state; no caching/invalidation; refetch logic is manual.

---

## 15. Code Quality

- **Dead code** 🔴: 5 components + 1 hook (~650 LOC) unreachable; `PrinterInfo.statusMessage` unused; several modeled Rust enums `#[allow(dead_code)]`; cocoa/objc deps.
- **Duplicate code** 🟠: paper-size tables (×2, different units), fit/fill math (×2), select/button class strings, error-mapping helpers (PDF vs print).
- **Large files** 🟠: `settingsPanel.tsx` 595, `App.tsx` 477, `windows.rs` 320, two ~220-LOC PDF components.
- **Large components** 🟠: App + SettingsPanel (god-ish).
- **Naming** 🟢: generally clear; `features/pdf/pdfPreview.tsx` (1-line re-export) vs `components/pdf/PdfPreview.tsx` is confusing.
- **Technical debt** 🟠: driverOptions gap; fabricated history; disabled CSP; no tests/CI; empty scaffold dirs implying non-existent structure.
- **TODO/FIXME**: **0 markers** — debt is structural and unannotated (arguably worse: it's invisible).
- **Code smells**: god component; two-way divergence risk from duplicated data; string-typed IPC errors; boolean→string→memo-key chain.

---

## 16. Security Review

| Area | Verdict | Notes |
|---|---|---|
| Process model | ✅ Strong | Tauri: sandboxed WebView, no Node, no preload. |
| IPC / command allow-list | ✅ | Only 4 commands; ACL minimal. |
| Filesystem | 🟡 | `fs::metadata` + reads PDF by path; no fs plugin to frontend; asset scope `$HOME/**`. |
| Shell execution | ✅ unix / 🟡 win | Unix argv (no shell). Windows builds PS script from strings (single-quote escaped). |
| Command injection | ✅ low | printerId/paths passed as args (unix); escaped (win). |
| PDF handling | 🟡 | PDF.js in-webview (good isolation), but no size guardrails; password PDFs dead-end. |
| Path traversal | 🟡 | No canonicalization; a path outside `$HOME` can't preview but can be printed. |
| Permissions | ✅ | Least-privilege ACL. |
| **CSP** | 🔴 | **`csp: null`** — disabled. Should be defined. |
| Tauri security | ✅ baseline | Strong defaults; main gap is CSP + Windows script surface. |
| Supply chain | 🟡 | 437 Rust crates / 258 npm pkgs, **no license/audit**, no `cargo-audit`/`npm audit` in CI (npm reports 4 high vulns). |

---

## 17. Cross-Platform Review

- **macOS**: best supported; universal build; min 10.13; CUPS full-featured; but **no macOS-native code actually used** (cocoa/objc idle).
- **Linux**: functionally identical to macOS (same CUPS backend); build needs manual system libs (webkit2gtk/glib).
- **Windows**: **second-class** — partial capabilities (no tray/media/resolution), per-job options mutate global config, no job id, depends on an external `PrintTo` handler.

**Implementation quality**: macOS ≈ Linux (A−) ≫ Windows (C). The abstraction is clean; the Windows *implementation depth* is the gap.

---

## 18. Feature Matrix

| Feature | Status | Notes |
|---|---|---|
| PDF Preview | ✅ | Thumbnail grid path |
| Zoom | ⚠️ Built, unreachable | Only in dead detail viewer |
| Rotate | ⚠️ Built, unreachable | Dead viewer |
| Thumbnail panel | ✅ | The live overview |
| Search (page) | ✅ | Page-number jump |
| Search (content) | ❌ | No text search |
| Printer Profiles | ❌ | Empty scaffold dir |
| Recent Printers | ❌ | Only recent files |
| Favorites | ❌ | |
| Batch Printing | ❌ | Single file only |
| Multi-document | ❌ | |
| Booklet | ⚠️ | Only as duplex label; no imposition |
| N-Up | ❌ | |
| Scaling / Fit | ⚠️ Preview-only | Not applied to job |
| Watermark | ❌ | |
| Color Management | ⚠️ | Color mode only; no ICC |
| ICC Profiles | ❌ | |
| History | ⚠️ Partial/Fake | localStorage + fabricated fallback |
| Print Queue | ❌ | |
| Job Monitor | ❌ | No real job id (win) |
| Network Printers | ⚠️ | If OS already has them; no add/discovery UI |
| Remote Printing | ❌ | |
| Cloud Printing | ❌ | Out of scope |
| OCR | ❌ | |
| Drag & Drop | ✅ | First PDF only; no dropzone affordance |
| Keyboard Shortcuts | ⚠️ Built, unreachable | Dead hook |
| Accessibility | ❌ Weak | No accessible dialogs |
| Dark Theme | ✅ | Dark-only |
| Light Theme | ❌ | Tokens exist, no toggle |
| Localization | ❌ | English hardcoded |
| Auto Update | ❌ | |
| Crash Recovery | ❌ | |
| Advanced driver options | ❌ Broken | Collected, not sent |
| Orientation | ❌ Broken | Not sent |
| Margins | ⚠️ Preview-only | |
| Page range | ❌ | |

---

## 19. UI Feature Matrix

**Implemented**: browse + drag-drop; multi-page thumbnail grid; 7 preview/fit modes; per-page paper+margin visualization; page search + prev/next; adaptive pages-per-row; resizable persisted split; printer dropdown (status/default); copies stepper; quick paper/layout/color/quality; searchable More-Options modal + section reset; status banner; history modal + reprint; loading/error/empty states; responsive layout; dark glass theme.

**Missing enterprise UX**: light/high-contrast/white-label themes; accessible + keyboard-first workflows; command palette; multi-doc tabs; job queue/monitor view; printer favorites/profiles UI; per-printer remembered settings; preferences window; onboarding/first-run; toasts; i18n; page-range/N-up/scaling UI that works; page-level edit (rotate/reorder/select); update + release-notes UI; About/version/license; drag-drop affordance + multi-file; recent-files management.

---

## 20. Scalability Review

**Framing challenge**: this is a **desktop utility**, so "100k users" is not server concurrency — it's **fleet distribution + support + telemetry** at scale.

- **100k installs / enterprise fleets?** Not yet. Needs: signed/notarized builds, MSI/PKG with **silent-install + Group Policy/MDM** config, an **auto-update channel** with signature verification, **structured logging + opt-in telemetry**, and **centralized default policies** (locked settings). The core (Rust + Tauri) is lightweight enough to scale to many installs; the *release engineering* is absent.
- **Enterprise deployment?** Needs profiles/policy, quotas/accounting hooks (PaperCut-style), audit logging, and admin-defined printer allow-lists. Architecture can host this; none built.
- **Plugin architecture?** Feasible and natural: the `DriverCapability` model + `platform` seam are good extension points. Would need a stable plugin API (vendor profiles, custom option renderers, post-processors). Not present.
- **Mobile companion?** The Rust core is Tauri v2 (mobile-capable), but the printing backends are desktop-CLI-bound. A companion would more realistically be a *send-to-desktop* protocol than a port of the print engine.
- **Cloud sync?** Profiles/history/settings sync is feasible (small structured data) with an opt-in account layer; nothing exists (explicitly out of current scope).

**Bottom line**: the *architecture* can scale to enterprise; the *product surface and release engineering* cannot yet.

---

## 21. Refactoring Opportunities (ranked, with WHY)

**Critical**
- **Plumb `driverOptions` end-to-end** — the flagship "More Options" feature is a silent no-op; users trust settings that never apply. *Correctness + trust.*
- **Add `deny_unknown_fields` + typed IPC errors** — would have prevented the above and enables precise UX/i18n. *Contract integrity.*
- **Remove fabricated history / persist real jobs** — a print tool must not show invented records. *Trust.*
- **Enable CSP** — disabled CSP in a WebView that loads user content is a real hardening gap. *Security.*

**High**
- **Wire up or delete the dead viewer (~650 LOC)** — either ship zoom/rotate/overlays/keyboard or stop misleading maintainers. *Clarity + user value.*
- **Extract server-state + shrink App** — the god component is the main maintainability tax. *Maintainability.*
- **Virtualize thumbnails + bound the cache** — the only thing standing between this and large real-world PDFs. *Performance/stability.*
- **Formalize `PrintBackend` trait + add timeouts** — testability + resilience. *Robustness.*
- **Consolidate duplicated paper/layout logic** — two sources of truth will drift. *Correctness.*

**Medium**
- Adopt a light state solution; split `settingsPanel`; enforce design tokens; shared accessible `Dialog`; light theme; tests + CI; Prettier; structured logging.

**Low**
- Remove cocoa/objc; remove/fill scaffold dirs; rename the confusing re-export; multi-resolution icons; About screen.

---

## 22. Technical Roadmap (5 phases)

**Phase 1 — Architecture cleanup & correctness (foundations)**
Fix driverOptions end-to-end; `deny_unknown_fields`; typed IPC errors; delete/wire dead code; extract server-state out of App; consolidate paper/layout utilities; enable CSP; add LICENSE; add CI + Prettier + first tests; structured logging; Command timeouts.

**Phase 2 — Printing engine depth**
Real job tracking + queue; page range; N-up; scaling/fit that applies; margins; orientation; booklet imposition; Windows capability parity (trays/media/resolution via PrintCapabilities) + non-destructive per-job options; capability caching; printer profiles + remembered per-printer settings; batch printing.

**Phase 3 — Professional UI/UX**
Design-token enforcement + light/high-contrast themes; accessible dialogs + full keyboard workflow; command palette; toasts; multi-document tabs; preferences window; onboarding; page-level editing (rotate/reorder/select); i18n scaffolding; virtualized grid.

**Phase 4 — Enterprise**
Signed/notarized builds + auto-update; MSI/PKG silent install + MDM/Group-Policy config; policy-locked defaults + admin printer allow-lists; opt-in telemetry + crash reporting; audit logging; quotas/accounting hooks; profile/settings cloud sync (opt-in); plugin API (vendor profiles).

**Phase 5 — AI-powered printing**
Auto-suggest optimal settings from document analysis (duplex/N-up/paper/mono); natural-language print intents ("2-up, double-sided, staple"); OCR + searchable text; image enhancement/upscaling; color calibration assistance; anomaly detection (avoid mis-prints); smart preflight (bleed/trim/font checks).

---

## 23. Product Vision (vs the field)

To compete with **Adobe Acrobat / Konica Minolta utilities / Canon Print / HP Smart / Epson Print Layout / PaperCut / PrintNode**, PrintPilot's differentiator should be **"one beautiful, safe, cross-vendor print cockpit."**

Table-stakes to reach parity: real preview with zoom/rotate/page-edit (Acrobat), full driver-option depth incl. finishing/staple/booklet/N-up (KM/Canon/HP), profiles + remembered settings (Epson Print Layout), job queue + accounting + fleet policy (PaperCut), and API/remote submission (PrintNode).

Differentiators to *win*: **vendor-neutral capability normalization** (already the seed of this exists in `DriverCapability`), **best-in-class preview/preflight**, **AI-assisted settings**, **beautiful cross-platform parity**, and **enterprise-grade deployment without a print server** (PaperCut/PrintNode require infrastructure; a great local-first tool with optional cloud is a real niche).

Required feature set for "best desktop printing software": accurate WYSIWYG preview + preflight; complete + normalized driver control; profiles/favorites/history that are real; job monitoring; finishing (staple/punch/fold/booklet); color management + ICC; batch/multi-doc; accessibility + i18n; secure/pull printing; network discovery; auto-update + signing; admin policy + accounting; optional cloud + mobile send-to-print; and a plugin ecosystem for vendor specifics.

---

## 24. Overall Scores (with justification)

| Dimension | Score /10 | Justification |
|---|---|---|
| Architecture | 7.5 | Clean platform seam, safety model, feature/service layering; loses points for god component + dead island + no server-state separation. |
| Rust Backend | 7.5 | Modular, unit-tested, thoughtful capability model; loses points for string errors, no timeouts, no trait, Windows depth. |
| React Frontend | 6.0 | Correct hooks/cancellation and rich components, but a 477-LOC root, prop-drilling, dead code, and no tests. |
| UI | 8.0 | Genuinely polished, responsive, cohesive; held back by token indiscipline + dark-only. |
| UX | 6.0 | Strong preview/settings flows; undermined by non-functional advanced options, fake history, unreachable features, weak a11y. |
| Performance | 5.5 | Good PDF.js bundling/DPR; hurt by full-document thumbnailing, unbounded cache, blocking calls. |
| Scalability | 6.0 | Architecture can scale; product surface + release engineering cannot yet. |
| Security | 6.5 | Excellent Tauri baseline + minimal ACL; dragged by disabled CSP, Windows script surface, no supply-chain audit, no LICENSE. |
| Maintainability | 6.5 | Small clear modules, but oversized hotspots, duplication, and invisible (unannotated) debt. |
| Cross-Platform | 7.0 | One codebase, three OSes, verified builds; Windows is second-class, macOS-native code idle. |
| Printing Engine | 6.0 | Safe, capable CUPS path + rich caps; incomplete plumbing (options/orientation/scaling), weak Windows, no job tracking. |
| Developer Experience | 6.5 | Fast HMR, typed IPC, good scripts + docs; no tests/CI, no formatter, Linux build needs manual libs. |
| **Overall Product** | **6.4** | A well-architected, beautiful **v1 foundation** with a sound safety model and a strong backend, whose path to world-class is about **completeness, trust, testing, and enterprise/release maturity** — not a rewrite. |

---

## Top 100 Improvements (prioritized by impact)

> Ranked in four tiers. Within each tier, ordered by impact. Each includes the **why**.

### CRITICAL — correctness, trust, security foundations (1–15)

1. **Plumb `driverOptions` end-to-end** (add `driver_options` to Rust `PrintSettings`; emit in `build_print_options`). *The entire "More Options" feature is silently discarded today.*
2. **Add serde `deny_unknown_fields`** to `PrintRequest`/`PrintSettings`. *Would have caught #1; stops silent TS↔Rust contract drift.*
3. **Stop fabricating print history** (`recentFilesToHistory` invents timestamps + fake "Failed"). *A print tool must never show invented records.*
4. **Persist real history** from actual submissions in durable storage (SQLite via `tauri-plugin-sql`). *Truthful, auditable records.*
5. **Wire orientation to the backend** (explicit portrait/landscape flag). *Core setting, currently non-functional.*
6. **Define a Content-Security-Policy** (`csp` is `null`). *Hardening for a WebView loading user PDFs.*
7. **Surface real backend error detail** (esp. Windows "no PrintTo handler"). *Users can't self-diagnose failures today.*
8. **Fix Windows per-job options** so they don't permanently mutate the printer's global defaults. *Silent side-effect bug.*
9. **Add timeouts to all `Command`/PowerShell calls.** *An offline printer hangs the core thread indefinitely.*
10. **Wire up or delete the orphaned detail viewer** (~650 LOC). *Dead code hides intended features and misleads maintainers.*
11. **Add page-range printing** end-to-end. *Fundamental print capability, absent.*
12. **Handle password-protected PDFs** (prompt for password). *Common real case that currently dead-ends.*
13. **Canonicalize/validate file paths** in Rust before printing. *Defense-in-depth against unintended targets.*
14. **Add a LICENSE + run `cargo-audit`/`npm audit`** (4 high npm vulns reported). *Legal + supply-chain blocker for distribution.*
15. **Introduce typed, tagged IPC errors** (enum → JSON) instead of `Result<_, String>`. *Enables precise UI handling + i18n.*

### HIGH — architecture, printing depth, core UX (16–45)

16. **Extract server-state** (printers/capabilities) into a dedicated hook/store. *Ends the God-component pattern.*
17. **Adopt a light state solution** (Zustand or context+reducer). *Removes prop-drilling; enables growth.*
18. **Split `App.tsx` (477)** into shell + document + settings + history containers. *Maintainability.*
19. **Split `settingsPanel.tsx` (595)** — extract the descriptor engine + dialog + control. *Isolate the most complex logic + make it testable.*
20. **Formalize `PrintBackend` as a Rust trait.** *Enables mock backends and unit tests of orchestration.*
21. **Virtualize the thumbnail grid** (render visible ± overscan only). *Large PDFs currently rasterize every page.*
22. **Bound/evict the thumbnail cache.** *Unbounded module-level `Map` leaks memory across documents.*
23. **Cap concurrent PDF renders** + cancel offscreen work. *Prevents render storms on fast scroll.*
24. **Cache capabilities** so `print_pdf` doesn't re-run `lpoptions`. *Latency + resilience.*
25. **Real job monitoring** (poll `lpstat -W`/spooler) + return a genuine job id on Windows. *Foundation for a queue.*
26. **Job queue UI** (progress, cancel, retry, reprint-with-settings). *Table-stakes vs competitors.*
27. **N-up (pages-per-sheet)** end-to-end (`number-up`). *Common professional need.*
28. **Scaling/fit-to-page that actually applies** to the job. *Preview shows modes that don't affect output.*
29. **Margins control** (custom + printer minimums) end-to-end.
30. **Booklet imposition** (real, not just a duplex label).
31. **Windows capability parity**: enumerate trays/media/resolution via PrintCapabilities/`Get-PrinterProperty`. *Windows is second-class.*
32. **Printer profiles** (named saved settings per printer) — activate the `printer-profiles/` scaffold.
33. **Remember last-used settings per printer** (persist + auto-apply).
34. **Recent printers + favorites.**
35. **Batch printing** (multi-file queue with per-file overrides).
36. **Multi-document tabs/session.**
37. **Accessible dialogs** (focus trap, Esc, `aria-modal`, focus restore) via a shared `Dialog` primitive. *0 accessible dialogs today.*
38. **Full keyboard workflow in the live app** (grid nav, shortcuts) — not the dead hook. *0 live keyboard handlers today.*
39. **Route all controls through `ui/*` primitives.** *Kills duplicated inline control styling.*
40. **Enforce design tokens**: replace 66 inline hex with theme variables. *Unblocks theming/white-label.*
41. **Ship a real light theme + toggle.** *`darkMode:"class"` exists but nothing toggles it.*
42. **Toast/notification system** (replace the single inline status line).
43. **Drag-drop affordance** (dropzone highlight) + **multi-file** drop. *Currently invisible + first-PDF-only.*
44. **Empty state surfaces clickable recent files.**
45. **Consolidate duplicated paper-size tables + fit/fill math** into one module. *Two divergent sources will drift.*

### MEDIUM — quality, DX, release, product breadth (46–80)

46. **Frontend tests** (Vitest + RTL), starting with the settings descriptor engine.
47. **Rust integration tests** for platform backends (inject mock `Command` output).
48. **CI (GitHub Actions)**: build all 3 OSes + lint + typecheck + test on PRs.
49. **Code signing + macOS notarization** in release pipeline.
50. **Auto-update** (`tauri-plugin-updater`) with signature verification.
51. **Crash recovery**: restore last document + settings on relaunch.
52. **Structured logging** (`tracing`) + a log file + in-app log viewer.
53. **Opt-in telemetry** (feature usage + error rates) for prioritization.
54. **Prettier** + format check in CI.
55. **Pre-commit hooks** (lint/format/typecheck).
56. **Persist window size/position.**
57. **Preferences window** (defaults, theme, units).
58. **Unit toggle (mm/inch).** *mm-only today.*
59. **i18n scaffolding** (extract strings; locale switch).
60. **Page-level editing**: rotate/reorder individual pages.
61. **Page include/exclude selection** in the grid (print subset).
62. **Watermark/stamp** support.
63. **PDF merge/split/reorder** tools.
64. **Color management / ICC profile** selection.
65. **Live printer status chip** (use the unused `statusMessage` + polling).
66. **Actionable error banners** (e.g., "install a PDF reader that supports PrintTo").
67. **Error boundary** around the PDF viewer.
68. **Large-file guardrails** + friendly messaging.
69. **Debounce ResizeObserver relayouts.**
70. **Stabilize descriptor memo key** (depend on capabilities identity, not a derived string).
71. **Replace `println!`** with gated debug logging (7 occurrences).
72. **Remove unused `cocoa`/`objc`** Rust deps.
73. **Remove or intentionally fill** the 7 empty scaffold dirs. *They imply structure that doesn't exist.*
74. **Rename `features/pdf/pdfPreview.tsx`** re-export. *Confusing vs `components/pdf/PdfPreview`.*
75. **Multi-resolution app icons** (`tauri icon`) — current `.ico` is single-size.
76. **About/version/license screen** + keyboard-shortcut help overlay.
77. **`prefers-reduced-motion`** + consistent, theme-aware focus rings.
78. **Consistent tooltips** on all icon buttons.
79. **Settings export/import** (profile portability).
80. **"Print test page"** action.

### LOW / STRATEGIC — enterprise, ecosystem, differentiation (81–100)

81. **Admin policy layer**: locked defaults + printer allow-lists (Group Policy/MDM/plist).
82. **Silent-install packaging** (MSI transforms, PKG) for fleet deployment.
83. **Quotas/accounting hooks** (PaperCut-style cost display + limits).
84. **Audit logging** of print actions (compliance).
85. **Profile/history/settings cloud sync** (opt-in account layer).
86. **Plugin architecture**: vendor capability profiles + custom option renderers + post-processors.
87. **Network printer discovery/add UI** (IPP Everywhere / mDNS).
88. **Secure/pull ("follow-me") printing** integration hooks.
89. **PrintNode-style remote submission API** (headless job intake).
90. **Mobile companion** send-to-desktop protocol.
91. **OCR** + searchable text extraction.
92. **AI: auto-suggest optimal settings** from document analysis (duplex/N-up/mono).
93. **AI: natural-language print intents** ("2-up, double-sided, stapled").
94. **Smart preflight** (bleed/trim/font/low-res image warnings) — connect the built overlays.
95. **Image enhancement/upscaling** before print.
96. **Color calibration assistant** (device profiling).
97. **Finishing options** UI (staple/punch/fold) surfaced from `DriverCapability` (already parsed).
98. **Secure-print/PIN release** support (detected as a capability, currently unused).
99. **Analytics dashboard** (fleet usage, error hot-spots) for enterprise admins.
100. **White-label theming** (brandable palette/logo) once tokens are enforced — enables OEM/vendor distribution.

---

*End of audit. Deliverable is documentation only; no code was modified, refactored, or generated.*
