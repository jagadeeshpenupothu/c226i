import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Bookmark, Clock, FileText, FileUp, History, ListChecks, Printer, RefreshCw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppCard, Button as DSButton, Divider, Icon, IconButton, SearchBox, StatusIndicator, typography } from "@/design";
import { PdfPreview } from "@/features/pdf/pdfPreview";
import type { PdfFile } from "@/features/pdf/types";
import { jobManager, useActiveJobCount, JobsDialog } from "@/features/jobs";
import { printerManager, usePrinters, usePrinterCapabilities, usePrinterDiscovery, startNotificationWatchers, notify, PrinterDashboard, NotificationCenter } from "@/features/printers";
import { toastManager, ToastViewport } from "@/features/notifications";
import {
  bootstrapCloud,
  AccountMenu,
  AuthEntryScreen,
  CloudDocumentsDialog,
  DocumentCloudBadge,
  cloudDocumentService,
  guestHistoryRepository,
  useCloudState,
  useCloudUser,
  type CloudDocument,
  type DocumentOrigin
} from "@/features/cloud";
import { profileManager, ProfileLibrary, CompatibilityWarningsDialog, type PrintProfile, type CompatibilityWarning, type ProfileCapabilitySnapshot } from "@/features/profiles";
import type { CapabilityChoice, PrinterCapabilities } from "@/features/printers/types";
import { SettingsPanel } from "@/features/settings/settingsPanel";
import type { PrintSettings } from "@/features/settings/types";
import { validatePageSelection } from "@/features/settings/pageSelection";
import { defaultPrintLayout, normalizePrintLayout, type PrintLayout } from "@/features/layout/types";
import { isTauriRuntime } from "@/lib/tauri";
import { FALLBACK_PAPER_CHOICES } from "@/services/layout/paper";
import { readPdfFileMetadata } from "@/services/pdf/pdfMetadata";
import { resolvePrintPaperPreview } from "@/services/pdf/printPreview";
import { createPresentationBooklet } from "@/services/pdf/presentationBooklet";

const STORAGE = {
  recent: "printpilot.recent",
  profiles: "printpilot.profiles",
  settings: "printpilot.settings",
  layout: "printpilot.layout",
  history: "printpilot.history",
  split: "printpilot.split"
} as const;

const MAX_RECENT = 20;

const initialSettings: PrintSettings = {
  printerId: "",
  paperSize: "",
  paperWeight: "",
  tray: "",
  duplex: "",
  copies: 1,
  colorMode: "",
  quality: ""
};

type HistoryStatus = "Completed" | "Failed" | "Cancelled";

interface PrintHistoryItem {
  id: string;
  fileName: string;
  path?: string;
  printedAt: string;
  printerName: string;
  paperSize: string;
  copies: number;
  status: HistoryStatus;
}

interface RecentFile {
  path: string;
  name: string;
  openedAt: string;
}


function fileNameFromPath(path: string) {
  return path.split(/[\\/]/).pop() || "Document.pdf";
}

function pdfFromPath(path: string, origin: DocumentOrigin = "guest-local-import", cloudDocumentId?: string): PdfFile {
  return {
    name: fileNameFromPath(path),
    path,
    previewUrl: convertFileSrc(path),
    origin,
    cloudDocumentId
  };
}

function friendlyError(error: unknown) {
  const message = String(error).trim();
  const lower = message.toLowerCase();

  if (lower.includes("no printer") || lower.includes("not found") || lower.includes("no destinations")) {
    return "No printer connected. Connect a printer and click Refresh.";
  }
  if (lower.includes("cups") || lower.includes("connection refused") || lower.includes("cups.sock") || lower.includes("scheduler")) {
    return "The printing system (CUPS) isn't reachable. Make sure it is running, then try again.";
  }
  if (lower.includes("network") || lower.includes("unreachable") || lower.includes("timed out") || lower.includes("host") || lower.includes("no route")) {
    return "The printer couldn't be reached over the network. Check that it is powered on and connected.";
  }
  if (lower.includes("offline") || lower.includes("unavailable")) return "Printer is offline or unavailable.";
  if (lower.includes("permission") || lower.includes("denied") || lower.includes("not authorized")) {
    return "Permission denied by the print system.";
  }
  if (lower.includes("page range") || lower.includes("invalid page")) return "Invalid page range.";
  if ((lower.includes("driver") || lower.includes("ppd") || lower.includes("filter")) && (lower.includes("missing") || lower.includes("no such") || lower.includes("fail"))) {
    return "The printer driver appears to be missing or misconfigured.";
  }
  if (lower.includes("unsupported") || lower.includes("media") || lower.includes("paper")) {
    return "The selected paper, media, or option is not supported by this printer.";
  }
  if (lower.includes("driver") && lower.includes("reject")) return "The printer driver rejected the job.";

  // Surface a clean, specific message from the backend rather than genericizing it.
  if (message && message !== "undefined" && message.length <= 200) return message;
  return "Printing could not be completed. Please check the printer and try again.";
}

function defaultChoice(choices: CapabilityChoice[]) {
  return choices.find((choice) => choice.isDefault)?.value || choices[0]?.value || "";
}

function supportedValue(value: string, choices: CapabilityChoice[]) {
  return choices.some((choice) => choice.value === value);
}

function capabilityValue(current: string, choices: CapabilityChoice[]) {
  if (!choices.length) return "";
  return supportedValue(current, choices) ? current : defaultChoice(choices);
}

function applyCapabilityDefaults(settings: PrintSettings, capabilities: PrinterCapabilities): PrintSettings {
  return {
    ...settings,
    paperSize: capabilityValue(settings.paperSize, capabilities.paperSizes),
    paperWeight: capabilityValue(settings.paperWeight, capabilities.paperTypes),
    tray: capabilityValue(settings.tray, capabilities.trays),
    duplex: capabilityValue(settings.duplex, capabilities.duplexModes),
    colorMode: capabilityValue(settings.colorMode, capabilities.colorModes),
    quality: capabilityValue(settings.quality, capabilities.resolutions)
  };
}

function readStoredHistory(): PrintHistoryItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE.history) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Reads the recent-files list, migrating the legacy `string[]` (paths only) shape.
function readRecentFiles(): RecentFile[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE.recent) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) =>
        typeof entry === "string"
          ? { path: entry, name: fileNameFromPath(entry), openedAt: "" }
          : entry && typeof entry.path === "string"
            ? { path: entry.path, name: entry.name || fileNameFromPath(entry.path), openedAt: entry.openedAt || "" }
            : null
      )
      .filter((entry): entry is RecentFile => entry !== null)
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function persistRecentFiles(files: RecentFile[]) {
  localStorage.setItem(STORAGE.recent, JSON.stringify(files));
}

function readStoredSettings(): PrintSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE.settings) || "null");
    if (parsed && typeof parsed === "object") {
      return { ...initialSettings, ...parsed };
    }
  } catch {
    // fall through to defaults
  }
  return initialSettings;
}

// Restores the print layout from the previous session, healing any partial or
// legacy shape against the defaults.
function readStoredLayout(): PrintLayout {
  try {
    return normalizePrintLayout(JSON.parse(localStorage.getItem(STORAGE.layout) || "null"));
  } catch {
    return { ...defaultPrintLayout };
  }
}

export default function App() {
  const splitRef = useRef<HTMLElement | null>(null);
  const currentPathRef = useRef<string | null>(null);
  const archivedPathRef = useRef<string | null>(null);
  const [pdfFile, setPdfFile] = useState<PdfFile | null>(null);
  const cloudState = useCloudState();
  const cloudUser = useCloudUser();
  const [enteredApp, setEnteredApp] = useState(false);
  // Printer domain — the PrinterStore/Manager are the single source of truth.
  const printers = usePrinters();
  const [settings, setSettings] = useState<PrintSettings>(readStoredSettings);
  const capabilities = usePrinterCapabilities(settings.printerId);
  const { discovering: isLoadingPrinters, capabilitiesLoadingId } = usePrinterDiscovery();
  const isLoadingCapabilities = capabilitiesLoadingId === settings.printerId;
  const [layout, setLayout] = useState<PrintLayout>(readStoredLayout);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(readRecentFiles);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isRecentOpen, setIsRecentOpen] = useState(false);
  const [isProfilesOpen, setIsProfilesOpen] = useState(false);
  const [profileWarnings, setProfileWarnings] = useState<{ profileName: string; warnings: CompatibilityWarning[] } | null>(null);
  const [isJobsOpen, setIsJobsOpen] = useState(false);
  const [isCloudDocumentsOpen, setIsCloudDocumentsOpen] = useState(false);
  // Which job the Jobs dialog should focus — set when a job toast is clicked.
  const [focusedJobId, setFocusedJobId] = useState<string | null>(null);
  const [isPrinterDashboardOpen, setIsPrinterDashboardOpen] = useState(false);
  const activeJobCount = useActiveJobCount();
  const [isDragging, setIsDragging] = useState(false);
  const [pendingReplacePath, setPendingReplacePath] = useState<string | null>(null);
  const [printHistory, setPrintHistory] = useState<PrintHistoryItem[]>(readStoredHistory);
  const [leftPanelPercent, setLeftPanelPercent] = useState(() => {
    const saved = Number(localStorage.getItem(STORAGE.split));
    return Number.isFinite(saved) && saved >= 58 && saved <= 74 ? saved : 70;
  });
  // Loaded document's page count, surfaced by the preview for the header readout.
  const [documentPageCount, setDocumentPageCount] = useState(0);
  const [currentPdfPage, setCurrentPdfPage] = useState(1);
  const [bookletPreview, setBookletPreview] = useState<PdfFile | null>(null);
  const [bookletSheetSideCount, setBookletSheetSideCount] = useState(0);
  const [bookletError, setBookletError] = useState<string | null>(null);
  const [isPreparingBooklet, setIsPreparingBooklet] = useState(false);
  const selectedPrinter = printers.find((printer) => printer.id === settings.printerId);
  const hasPrinter = printers.length > 0;
  // A printer's reported media list when available; a built-in standard list
  // otherwise, so paper size / preview stay usable with no printer connected.
  const paperChoices = capabilities?.paperSizes?.length ? capabilities.paperSizes : FALLBACK_PAPER_CHOICES;
  const printPaperPreview = useMemo(
    () => resolvePrintPaperPreview(settings, paperChoices),
    [paperChoices, settings]
  );
  const isCustomBooklet = layout.pageLayout === "presentation-booklet" || layout.pageLayout === "booklet";
  const previewFile = isCustomBooklet ? bookletPreview || pdfFile : pdfFile;
  const previewLayout = isCustomBooklet
    ? {
        ...layout,
        pageLayout: "single" as const,
        orientation: "landscape" as const,
        scaleMode: "actual" as const,
        marginMode: "none" as const,
        align: "center" as const
      }
    : layout;
  const canPrint = Boolean(
    pdfFile?.path &&
      (!isCustomBooklet || bookletPreview?.path) &&
      settings.printerId &&
      selectedPrinter?.status !== "offline" &&
      capabilities &&
      !isLoadingCapabilities &&
      !isPreparingBooklet &&
      !isPrinting
  );
  const printDisabledReason = useMemo(() => {
    if (isPrinting) return "Sending your document to the printer…";
    if (!pdfFile?.path) return "Open a PDF to enable printing.";
    if (isPreparingBooklet) return "Preparing the presentation booklet preview…";
    if (isCustomBooklet && bookletError) return bookletError;
    if (isCustomBooklet && !printPaperPreview) return "Choose a supported output paper size for the booklet.";
    if (isCustomBooklet && !bookletPreview) return "Booklet preview is not ready.";
    if (!hasPrinter) return "Connect a printer to print — everything else is ready.";
    if (!settings.printerId) return "Select a printer to print.";
    if (selectedPrinter?.status === "offline") return "The selected printer is offline.";
    if (isLoadingCapabilities) return "Reading printer capabilities…";
    if (!capabilities) return "Printer capabilities are unavailable.";
    return null;
  }, [bookletError, bookletPreview, capabilities, hasPrinter, isCustomBooklet, isLoadingCapabilities, isPreparingBooklet, isPrinting, pdfFile?.path, printPaperPreview, selectedPrinter?.status, settings.printerId]);

  useEffect(() => {
    let active = true;
    setBookletPreview(null);
    setBookletSheetSideCount(0);
    setBookletError(null);
    if (!isCustomBooklet || !pdfFile?.path) {
      setIsPreparingBooklet(false);
      return () => {
        active = false;
      };
    }
    if (!printPaperPreview) {
      setBookletError("Choose a supported output paper size for the booklet.");
      setIsPreparingBooklet(false);
      return () => {
        active = false;
      };
    }

    setIsPreparingBooklet(true);
    const ptToMm = 25.4 / 72;
    void createPresentationBooklet({
      pdfPath: pdfFile.path,
      sheetWidthMm: printPaperPreview.widthPt * ptToMm,
      sheetHeightMm: printPaperPreview.heightPt * ptToMm,
      pinGuideCount: layout.pinGuideCount,
      mode: layout.pageLayout === "booklet" ? "normal" : "presentation"
    })
      .then((response) => {
        if (!active) return;
        setBookletPreview({
          ...pdfFile,
          name: `${pdfFile.name} — ${layout.pageLayout === "booklet" ? "Normal Booklet" : "Presentation Booklet"}`,
          path: response.path,
          previewUrl: convertFileSrc(response.path)
        });
        setBookletSheetSideCount(response.sheetSideCount);
      })
      .catch((error) => {
        if (active) setBookletError(friendlyError(error));
      })
      .finally(() => {
        if (active) setIsPreparingBooklet(false);
      });

    return () => {
      active = false;
    };
  }, [
    isCustomBooklet,
    layout.pageLayout,
    layout.pinGuideCount,
    pdfFile,
    printPaperPreview
  ]);

  // Keep the latest values available to the global keyboard-shortcut listener
  // without re-subscribing on every render.
  const shortcutRef = useRef({ browse: () => {}, print: () => {}, canPrint: false });

  useEffect(() => {
    currentPathRef.current = pdfFile?.path ?? null;
  }, [pdfFile]);

  useEffect(() => {
    if (!pdfFile?.path || !cloudUser || pdfFile.origin !== "authenticated-local-import") return;
    const key = `${cloudUser.id}:${pdfFile.path}`;
    if (archivedPathRef.current === key) return;
    archivedPathRef.current = key;
    cloudDocumentService.archiveAuthenticatedLocalPdf({
      path: pdfFile.path,
      fileName: pdfFile.name,
      pageCount: documentPageCount || null,
      user: cloudUser,
      origin: pdfFile.origin
    });
  }, [cloudUser, documentPageCount, pdfFile]);

  // Remember the last session's printer + settings.
  useEffect(() => {
    localStorage.setItem(STORAGE.settings, JSON.stringify(settings));
  }, [settings]);

  // Persist the print layout so refreshing printers (or reopening the app)
  // preserves orientation, scaling, margins, and paper choice.
  useEffect(() => {
    localStorage.setItem(STORAGE.layout, JSON.stringify(layout));
  }, [layout]);

  // With no printer to reconcile against, keep paper size valid against the
  // built-in fallback list so the preview always has a sheet to simulate.
  useEffect(() => {
    if (capabilities) return;
    setSettings((current) =>
      paperChoices.some((choice) => choice.value === current.paperSize)
        ? current
        : { ...current, paperSize: defaultChoice(paperChoices) }
    );
  }, [capabilities, paperChoices]);

  // Re-runs printer discovery without disturbing the document, layout, zoom,
  // profiles, or history. `announce` shows a short confirmation for the manual
  // Refresh action; the initial load stays silent.
  const loadPrinters = useCallback(async (announce = false) => {
    try {
      const detected = await printerManager.discover();
      if (announce) {
        notify(
          detected.length
            ? { type: "info", severity: "success", title: "Printers refreshed", message: `${detected.length} printer${detected.length > 1 ? "s" : ""} available.` }
            : { type: "info", severity: "warning", title: "No printers found", message: "Connect a printer and click Refresh." }
        );
      }
    } catch {
      if (announce) notify({ type: "info", severity: "error", title: "Print system unavailable", message: "Could not reach the printing system. Is CUPS running?" });
    }
  }, []);

  // Start live printer monitoring (5s polling), the job→notification bridge, and
  // the toast layer on mount; stop polling on unmount.
  useEffect(() => {
    startNotificationWatchers();
    toastManager.start();
    printerManager.startPolling();
    return () => printerManager.stopPolling();
  }, []);

  // Cloud composition root. App.tsx stays completely Firebase-unaware — the
  // bootstrap reads config, constructs + registers the provider, and initializes
  // the CloudManager, returning a cleanup function. With no config it runs fully
  // local/offline, so existing behavior is untouched.
  useEffect(() => {
    const dispose = bootstrapCloud();
    return dispose;
  }, []);

  // Keep the selected printer valid as the discovered list changes.
  useEffect(() => {
    if (printers.length === 0) return;
    setSettings((current) => {
      if (printers.some((printer) => printer.id === current.printerId)) return current;
      const next = printers.find((printer) => printer.isDefault)?.id || printers[0]?.id || "";
      return next === current.printerId ? current : { ...current, printerId: next };
    });
  }, [printers]);

  // Selecting a printer loads its capabilities into the store (via the manager,
  // the only printer-API caller).
  useEffect(() => {
    if (!settings.printerId) return;
    printerManager.select(settings.printerId);
  }, [settings.printerId]);

  // When the selected printer's capabilities arrive, snap settings to its defaults.
  useEffect(() => {
    if (!capabilities) return;
    setSettings((current) => applyCapabilityDefaults(current, capabilities));
  }, [capabilities]);

  const addRecentFile = useCallback((path: string) => {
    setRecentFiles((current) => {
      const entry: RecentFile = { path, name: fileNameFromPath(path), openedAt: new Date().toISOString() };
      const next = [entry, ...current.filter((item) => item.path !== path)].slice(0, MAX_RECENT);
      persistRecentFiles(next);
      return next;
    });
  }, []);

  const selectPdfPath = useCallback(
    (path: string, origin: DocumentOrigin = cloudUser ? "authenticated-local-import" : "guest-local-import", cloudDocumentId?: string) => {
      const file = pdfFromPath(path, origin, cloudDocumentId);
      setPdfFile(file);
      addRecentFile(path);
      if (origin === "guest-local-import") {
        void guestHistoryRepository.recordLocalPdf(path, null);
      }
      if (origin === "authenticated-local-import") {
        archivedPathRef.current = null;
      }
    },
    [addRecentFile, cloudUser]
  );

  // Opens the Print Jobs dialog focused on a specific job (from a job toast).
  const openJob = useCallback((jobId: string) => {
    setFocusedJobId(jobId);
    setIsJobsOpen(true);
  }, []);

  const removeRecentFile = useCallback((path: string) => {
    setRecentFiles((current) => {
      const next = current.filter((item) => item.path !== path);
      persistRecentFiles(next);
      return next;
    });
  }, []);

  const clearRecentFiles = useCallback(() => {
    persistRecentFiles([]);
    setRecentFiles([]);
  }, []);

  // Applies a profile: resolves its settings against the CURRENT printer's
  // capabilities (never force-switches printers), restores the layout, records
  // usage, and surfaces any compatibility adjustments — nothing is silently lost.
  const applyProfile = useCallback(
    (profile: PrintProfile) => {
      const resolved = profileManager.resolveApplication(profile, capabilities);
      setSettings((current) => ({ ...current, ...resolved.settings, printerId: current.printerId }));
      setLayout(resolved.layout);
      profileManager.recordUse(profile.id);
      setIsProfilesOpen(false);
      if (resolved.warnings.length > 0) {
        setProfileWarnings({ profileName: profile.name, warnings: resolved.warnings });
        notify({ type: "info", severity: "warning", title: "Profile applied with adjustments", message: `“${profile.name}” — ${resolved.warnings.length} setting${resolved.warnings.length > 1 ? "s" : ""} adjusted for this printer.` });
      } else {
        notify({ type: "info", severity: "success", title: "Profile applied", message: `“${profile.name}” is ready to print.` });
      }
    },
    [capabilities]
  );

  // Restore the last opened PDF once at startup, but only if the file still exists.
  useEffect(() => {
    if (!isTauriRuntime()) return;
    const last = readRecentFiles()[0];
    if (!last) return;
    let cancelled = false;
    readPdfFileMetadata({ name: last.name, path: last.path, previewUrl: "" }).then((metadata) => {
      if (!cancelled && metadata) setPdfFile(pdfFromPath(last.path, "app-cache-reopen"));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;

    const unlistenPromise = getCurrentWebviewWindow().onDragDropEvent((event) => {
      const payload = event.payload;
      if (payload.type === "enter" || payload.type === "over") {
        setIsDragging(true);
        return;
      }
      if (payload.type === "leave") {
        setIsDragging(false);
        return;
      }
      if (payload.type === "drop") {
        setIsDragging(false);
        const path = payload.paths.find((candidate) => candidate.toLowerCase().endsWith(".pdf"));
        if (!path) {
          notify({ type: "info", severity: "warning", title: "Unsupported file", message: "Only PDF files can be opened." });
          return;
        }
        if (currentPathRef.current && currentPathRef.current !== path) {
          setPendingReplacePath(path);
        } else {
          selectPdfPath(path);
        }
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [selectPdfPath]);

  // Desktop-grade keyboard shortcuts: ⌘/Ctrl+O opens a PDF, ⌘/Ctrl+P prints
  // (and overrides the browser's own print dialog). Reads the latest handlers
  // from a ref so the listener is registered only once.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.metaKey && !event.ctrlKey) return;
      const key = event.key.toLowerCase();
      if (key === "o") {
        event.preventDefault();
        shortcutRef.current.browse();
      } else if (key === "p") {
        event.preventDefault();
        if (shortcutRef.current.canPrint) shortcutRef.current.print();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function browsePdf() {
    if (!isTauriRuntime()) {
      notify({ type: "info", severity: "info", title: "Desktop app required", message: "Run the native app to choose and print PDFs." });
      return;
    }

    const selected = await open({
      multiple: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }]
    });

    if (typeof selected === "string") {
      selectPdfPath(selected);
    }
  }

  async function printPdf() {
    if (!pdfFile?.path) {
      notify({ type: "info", severity: "warning", title: "No document", message: "Choose a PDF before printing." });
      return;
    }

    setIsPrinting(true);

    const pageSelection = isCustomBooklet
      ? {
          ok: true as const,
          pages: Array.from({ length: bookletSheetSideCount }, (_, index) => index + 1),
          normalized: ""
        }
      : validatePageSelection({
          mode: settings.pageSelectionMode || "all",
          value: settings.pageSelection || "",
          currentPage: currentPdfPage,
          pageCount: documentPageCount || 0
        });
    if (!pageSelection.ok) {
      setIsPrinting(false);
      notify({ type: "info", severity: "error", title: "Page selection invalid", message: pageSelection.error || "Choose valid pages before printing." });
      return;
    }

    const printSettings: PrintSettings = {
      ...settings,
      normalizedPageSelection: pageSelection.normalized,
      duplex: isCustomBooklet ? "PresentationBooklet" : settings.duplex,
      scaleMode: isCustomBooklet ? "actual" : layout.scaleMode,
      customScalePercent: isCustomBooklet ? 100 : layout.customScalePercent,
      marginMode: isCustomBooklet ? "default" : layout.marginMode,
      customMarginsMm: layout.customMarginsMm || { top: layout.customMarginMm, right: layout.customMarginMm, bottom: layout.customMarginMm, left: layout.customMarginMm },
      align: layout.align
    };

    const historyBase = {
      id: `${Date.now()}-${pdfFile.name}`,
      fileName: pdfFile.name,
      path: pdfFile.path,
      printedAt: new Date().toISOString(),
      printerName: selectedPrinter?.name || settings.printerId || "Not selected",
      paperSize: printPaperPreview?.label || settings.paperSize || "Default",
      copies: settings.copies || 1
    };

    try {
      // Every print becomes a managed Print Job — the JobManager is the single
      // source of truth and performs the actual (unchanged) submission internally.
      const job = await jobManager.print({
        documentName: pdfFile.name,
        documentPath: isCustomBooklet ? bookletPreview?.path || pdfFile.path : pdfFile.path,
        printerId: settings.printerId,
        printerName: selectedPrinter?.name || settings.printerId || "Not selected",
        settings: printSettings,
        totalPages: pageSelection.pages.length || documentPageCount || 1,
        paperSize: printPaperPreview?.label || settings.paperSize || "Default",
        orientation: isCustomBooklet ? "landscape" : layout.orientation
      });

      if (job.status === "completed") {
        // Outcomes surface through toasts + the Notification Center (jobCompleted /
        // jobFailed) and the Print Job timeline — no inline banner above Print.
        recordHistoryItem({ ...historyBase, status: "Completed" });
      } else {
        recordHistoryItem({ ...historyBase, status: "Failed" });
      }
    } catch (error) {
      // The job never reached a managed failed state (it threw before running), so
      // no jobFailed notification fired — surface it as a toast here.
      notify({ type: "info", severity: "error", title: "Print failed", message: friendlyError(error) });
      recordHistoryItem({ ...historyBase, status: "Failed" });
    } finally {
      setIsPrinting(false);
    }
  }

  function recordHistoryItem(item: PrintHistoryItem) {
    setPrintHistory((current) => {
      const nextHistory = [item, ...current].slice(0, 25);
      localStorage.setItem(STORAGE.history, JSON.stringify(nextHistory));
      return nextHistory;
    });
  }

  function confirmReplace() {
    if (pendingReplacePath) selectPdfPath(pendingReplacePath);
    setPendingReplacePath(null);
  }

  function startPanelResize(event: React.PointerEvent<HTMLButtonElement>) {
    const container = splitRef.current;
    if (!container) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = container.getBoundingClientRect();

    function resize(nextEvent: PointerEvent) {
      const rawPercent = ((nextEvent.clientX - bounds.left) / bounds.width) * 100;
      const nextPercent = Math.min(74, Math.max(58, rawPercent));
      setLeftPanelPercent(nextPercent);
      localStorage.setItem(STORAGE.split, String(nextPercent));
    }

    function stopResize() {
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stopResize);
    }

    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stopResize, { once: true });
  }

  // Expose the latest handlers to the keyboard-shortcut listener.
  shortcutRef.current = { browse: browsePdf, print: printPdf, canPrint };

  // Snapshot of the selected printer's features, stored with saved profiles.
  const currentCapabilitySnapshot: ProfileCapabilitySnapshot | undefined = selectedPrinter?.capabilitySummary
    ? {
        color: selectedPrinter.capabilitySummary.color,
        duplex: selectedPrinter.capabilitySummary.duplex,
        booklet: selectedPrinter.capabilitySummary.booklet,
        stapling: selectedPrinter.capabilitySummary.stapling,
        holePunch: selectedPrinter.capabilitySummary.holePunch,
        paperSizes: capabilities?.paperSizes.map((choice) => choice.value) || []
      }
    : undefined;

  // Compact printer status for the header.
  const printerStatus = !hasPrinter
    ? { tone: "offline" as const, label: "No printer" }
    : selectedPrinter?.status === "online"
      ? { tone: "online" as const, label: selectedPrinter?.name || "Ready" }
      : selectedPrinter?.status === "offline"
        ? { tone: "error" as const, label: "Offline" }
        : { tone: "idle" as const, label: "Unknown" };

  if (cloudState.initialized && !cloudUser && !enteredApp) {
    return <AuthEntryScreen onContinue={() => setEnteredApp(true)} />;
  }

  return (
    <main className="h-screen overflow-hidden bg-app p-2 text-foreground sm:p-3 md:p-4">
      <div className="mx-auto flex h-full max-w-[2200px] flex-col gap-2 md:gap-3">
        <header className="flex shrink-0 items-center justify-between gap-3 rounded-lg border border-edge-subtle bg-surface px-3 py-2 shadow-e-sm">
          {/* Brand + current document */}
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex shrink-0 items-center gap-2.5">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-soft text-brand ring-1 ring-edge-subtle">
                <Icon icon={Printer} size="md" />
              </div>
              <p className={`${typography.headingS} hidden text-ink sm:block`}>PrintPilot</p>
            </div>
            <Divider orientation="vertical" className="h-8" />
            <div className="min-w-0">
              {pdfFile ? (
                <>
                  <p className={`${typography.label} truncate text-ink`} title={pdfFile.name}>
                    {pdfFile.name}
                  </p>
                  <p className={`${typography.caption} text-ink-muted`}>
                    {documentPageCount ? `${documentPageCount} ${documentPageCount === 1 ? "page" : "pages"} · PDF` : "PDF document"}
                  </p>
                  <div className="mt-1">
                    <DocumentCloudBadge path={pdfFile.path} />
                  </div>
                </>
              ) : (
                <p className={`${typography.bodySmall} text-ink-muted`}>No document open</p>
              )}
            </div>
          </div>

          {/* Status + actions */}
          <div className="flex shrink-0 items-center gap-2">
            <StatusIndicator tone={printerStatus.tone} label={printerStatus.label} pulse={printerStatus.tone === "online"} className="hidden max-w-[180px] truncate laptop:inline-flex" />
            <SearchBox
              aria-label="Search (coming soon)"
              placeholder="Search…"
              value=""
              onChange={() => {}}
              disabled
              title="Search is coming in a future update"
              className="hidden w-44 desktop:block"
            />
            <Divider orientation="vertical" className="hidden h-6 laptop:block" />
            <DSButton variant="secondary" size="sm" leadingIcon={FileUp} onClick={browsePdf}>
              Browse
            </DSButton>
            <DSButton variant="ghost" size="sm" leadingIcon={RefreshCw} loading={isLoadingPrinters} onClick={() => loadPrinters(true)}>
              Refresh
            </DSButton>
            <Divider orientation="vertical" className="h-6" />
            <NotificationCenter />
            <span className="relative inline-flex">
              <IconButton icon={ListChecks} label="Print jobs" onClick={() => setIsJobsOpen(true)} />
              {activeJobCount > 0 && (
                <span className="pointer-events-none absolute -right-0.5 -top-0.5 grid h-4 min-w-[16px] place-items-center rounded-pill bg-brand px-1 text-[10px] font-semibold text-brand-fg">
                  {activeJobCount}
                </span>
              )}
            </span>
            <IconButton icon={Clock} label="Recent files" onClick={() => setIsRecentOpen(true)} />
            <IconButton icon={Bookmark} label="Print profiles" onClick={() => setIsProfilesOpen(true)} />
            <IconButton icon={History} label="Print history" onClick={() => setIsHistoryOpen(true)} />
            <Divider orientation="vertical" className="h-6" />
            <AccountMenu onOpenCloudDocuments={() => setIsCloudDocumentsOpen(true)} />
          </div>
        </header>

        <section
          ref={splitRef}
          className="grid min-h-0 flex-1 grid-cols-[minmax(0,var(--left-panel))_8px_minmax(0,1fr)] gap-2 transition-[grid-template-columns] duration-200 ease-out md:gap-3 md:grid-cols-[minmax(0,var(--left-panel))_clamp(8px,0.75vw,12px)_minmax(0,1fr)]"
          style={{ "--left-panel": `${leftPanelPercent}%` } as CSSProperties}
        >
          <div className="min-h-0 min-w-0">
            <PdfPreview
              file={previewFile}
              printPaper={printPaperPreview}
              layout={previewLayout}
              printerName={selectedPrinter?.name}
              recentFiles={recentFiles}
              onBrowse={browsePdf}
              onOpenRecent={selectPdfPath}
              onPageCount={(count) => {
                if (isCustomBooklet) setBookletSheetSideCount(count);
                else setDocumentPageCount(count);
              }}
              onCurrentPageChange={setCurrentPdfPage}
            />
          </div>

          <button
            aria-label="Resize preview and settings panels"
            className="group flex cursor-col-resize items-stretch justify-center rounded-md outline-none"
            onPointerDown={startPanelResize}
            type="button"
          >
            <span className="my-auto h-16 w-1 rounded-pill bg-white/10 transition duration-medium ease-standard group-hover:bg-brand group-focus-visible:bg-brand" />
          </button>

          <AppCard padded={false} className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            <SettingsPanel
              printers={printers}
              capabilities={capabilities}
              isLoadingCapabilities={isLoadingCapabilities}
              isLoadingPrinters={isLoadingPrinters}
              settings={settings}
              onChange={setSettings}
              layout={layout}
              onLayoutChange={setLayout}
              paperChoices={paperChoices}
              hasPrinter={hasPrinter}
              canPrint={canPrint}
              isPrinting={isPrinting}
              printDisabledReason={printDisabledReason}
              pageCount={documentPageCount}
              currentPage={currentPdfPage}
              onRefresh={() => loadPrinters(true)}
              onOpenPrinterDashboard={() => setIsPrinterDashboardOpen(true)}
              onApplyProfile={applyProfile}
              onOpenProfileLibrary={() => setIsProfilesOpen(true)}
              onPrint={printPdf}
            />
          </AppCard>
        </section>
      </div>

      {isDragging && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-8 backdrop-blur-sm animate-in fade-in-0 duration-150">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary/70 bg-[#1C1D20]/85 px-12 py-10 text-center">
            <FileUp className="h-10 w-10 text-primary" />
            <p className="text-lg font-semibold text-white">Drop your PDF to open it</p>
            <p className="text-sm text-[#AEAEB2]">
              {pdfFile ? "This will replace the current document." : "Release anywhere in the window."}
            </p>
          </div>
        </div>
      )}

      {isJobsOpen && (
        <JobsDialog
          initialJobId={focusedJobId}
          onClose={() => {
            setIsJobsOpen(false);
            setFocusedJobId(null);
          }}
        />
      )}

      {isPrinterDashboardOpen && (
        <PrinterDashboard
          printerId={settings.printerId}
          capabilitiesLoading={isLoadingCapabilities}
          onClose={() => setIsPrinterDashboardOpen(false)}
          onOpenJobs={() => {
            setIsPrinterDashboardOpen(false);
            setIsJobsOpen(true);
          }}
        />
      )}

      {isHistoryOpen && (
        <HistoryDialog
          items={printHistory}
          onClose={() => setIsHistoryOpen(false)}
          onReprint={(path) => {
            selectPdfPath(path);
            setIsHistoryOpen(false);
          }}
        />
      )}

      {isRecentOpen && (
        <RecentFilesDialog
          items={recentFiles}
          onOpen={(path) => {
            selectPdfPath(path);
            setIsRecentOpen(false);
          }}
          onRemove={removeRecentFile}
          onClear={clearRecentFiles}
          onClose={() => setIsRecentOpen(false)}
        />
      )}

      {isCloudDocumentsOpen && (
        <CloudDocumentsDialog
          onClose={() => setIsCloudDocumentsOpen(false)}
          onOpenPath={(path, document: CloudDocument) => {
            selectPdfPath(path, "cloud-library-download", document.documentId);
          }}
        />
      )}

      {isProfilesOpen && (
        <ProfileLibrary
          onClose={() => setIsProfilesOpen(false)}
          onApply={applyProfile}
          currentConfig={{
            settings,
            layout,
            printerId: settings.printerId,
            printerName: selectedPrinter?.name,
            capabilitySnapshot: currentCapabilitySnapshot
          }}
        />
      )}

      {profileWarnings && (
        <CompatibilityWarningsDialog
          profileName={profileWarnings.profileName}
          warnings={profileWarnings.warnings}
          onClose={() => setProfileWarnings(null)}
        />
      )}

      {pendingReplacePath && (
        <ConfirmDialog
          title="Replace current PDF?"
          message={`Open “${fileNameFromPath(pendingReplacePath)}” and close the current document?`}
          confirmLabel="Replace"
          onConfirm={confirmReplace}
          onCancel={() => setPendingReplacePath(null)}
        />
      )}

      {/* Floating top-right toast stack — mirrors the Notification Center. */}
      <ToastViewport onOpenJob={openJob} />
    </main>
  );
}

function HistoryDialog({
  items,
  onClose,
  onReprint
}: {
  items: PrintHistoryItem[];
  onClose: () => void;
  onReprint: (path: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6">
      <div className="flex h-[72vh] w-[72vw] max-w-5xl flex-col overflow-hidden rounded-xl border border-[#48484A] bg-[#242426] shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Print History</h2>
            <p className="mt-0.5 text-xs text-[#AEAEB2]">Recent print activity for this workstation.</p>
          </div>
          <button className="rounded-md p-1.5 text-[#AEAEB2] transition hover:bg-white/10 hover:text-white" onClick={onClose} type="button">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="overflow-hidden rounded-lg border border-white/10 bg-black/12">
            <div className="grid grid-cols-[minmax(170px,1.5fr)_150px_minmax(130px,1fr)_100px_72px_104px_96px] gap-3 border-b border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#A7A9AF]">
              <span>File</span>
              <span>Date & Time</span>
              <span>Printer</span>
              <span>Paper</span>
              <span>Copies</span>
              <span>Status</span>
              <span className="text-right">Action</span>
            </div>

            {items.length ? (
              items.map((item) => (
                <div
                  className="grid grid-cols-[minmax(170px,1.5fr)_150px_minmax(130px,1fr)_100px_72px_104px_96px] items-center gap-3 border-b border-white/10 px-3 py-2 text-sm text-[#F3F4F6] last:border-b-0 hover:bg-white/[0.04]"
                  key={item.id}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-red-400" />
                    <span className="truncate">{item.fileName}</span>
                  </span>
                  <span className="text-xs text-[#B9BABE]">{formatTimestamp(item.printedAt)}</span>
                  <span className="truncate text-[#D7D8DD]">{item.printerName}</span>
                  <span className="truncate text-[#D7D8DD]">{item.paperSize}</span>
                  <span className="text-[#D7D8DD]">{item.copies}</span>
                  <span className={`w-fit rounded-full px-2 py-1 text-xs font-medium ${statusClass(item.status)}`}>{item.status}</span>
                  <Button className="h-8 rounded-md px-3" disabled={!item.path} variant="secondary" onClick={() => item.path && onReprint(item.path)}>
                    Reprint
                  </Button>
                </div>
              ))
            ) : (
              <div className="grid place-items-center px-6 py-12 text-sm text-[#AEAEB2]">No print history yet.</div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 justify-end border-t border-white/10 px-5 py-3">
          <Button className="h-9 rounded-md px-5" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

function RecentFilesDialog({
  items,
  onOpen,
  onRemove,
  onClear,
  onClose
}: {
  items: RecentFile[];
  onOpen: (path: string) => void;
  onRemove: (path: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [availability, setAvailability] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      items.map(async (item) => {
        const metadata = await readPdfFileMetadata({ name: item.name, path: item.path, previewUrl: "" });
        return [item.path, metadata !== null] as const;
      })
    ).then((entries) => {
      if (!cancelled) setAvailability(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [items]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6">
      <div className="flex h-[68vh] w-[64vw] max-w-3xl flex-col overflow-hidden rounded-xl border border-[#48484A] bg-[#242426] shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Recent Files</h2>
            <p className="mt-0.5 text-xs text-[#AEAEB2]">The last {MAX_RECENT} PDFs you opened.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button className="h-8 rounded-md px-3" variant="outline" disabled={!items.length} onClick={onClear}>
              <Trash2 className="h-4 w-4" />
              Clear All
            </Button>
            <button className="rounded-md p-1.5 text-[#AEAEB2] transition hover:bg-white/10 hover:text-white" onClick={onClose} type="button">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {items.length ? (
            <div className="grid gap-1.5">
              {items.map((item) => {
                const available = availability[item.path];
                const missing = available === false;
                return (
                  <div
                    className="flex items-center gap-3 rounded-md border border-white/10 bg-black/12 px-3 py-2 hover:bg-white/[0.04]"
                    key={item.path}
                  >
                    <FileText className={`h-4 w-4 shrink-0 ${missing ? "text-[#6b6d73]" : "text-red-400"}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm ${missing ? "text-[#8A8C92]" : "text-[#F3F4F6]"}`}>{item.name}</p>
                      <p className="truncate text-xs text-[#8A8C92]">{item.path}</p>
                    </div>
                    {missing ? (
                      <span className="rounded-full bg-[#3A3A3C] px-2 py-1 text-xs text-[#B9BABE]">Unavailable</span>
                    ) : (
                      <span className="text-xs text-[#8A8C92]">{formatTimestamp(item.openedAt)}</span>
                    )}
                    <Button className="h-8 rounded-md px-3" variant="secondary" disabled={missing} onClick={() => onOpen(item.path)}>
                      Open
                    </Button>
                    <button
                      aria-label={`Remove ${item.name}`}
                      className="rounded-md p-1.5 text-[#AEAEB2] transition hover:bg-white/10 hover:text-white"
                      onClick={() => onRemove(item.path)}
                      type="button"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid place-items-center px-6 py-12 text-sm text-[#AEAEB2]">No recent files yet.</div>
          )}
        </div>

        <div className="flex shrink-0 justify-end border-t border-white/10 px-5 py-3">
          <Button className="h-9 rounded-md px-5" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}


function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-6">
      <div className="w-full max-w-md rounded-xl border border-[#48484A] bg-[#242426] p-5 shadow-2xl">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-[#C4C5CA]">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button className="h-9 rounded-md px-4" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button className="h-9 rounded-md px-4" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function statusClass(status: HistoryStatus) {
  if (status === "Completed") return "bg-emerald-500/12 text-emerald-300";
  if (status === "Failed") return "bg-red-500/12 text-red-300";
  return "bg-amber-500/12 text-amber-300";
}
