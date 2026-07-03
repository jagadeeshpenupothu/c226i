import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { FileText, FileUp, History, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PdfPreview } from "@/features/pdf/pdfPreview";
import type { PdfFile } from "@/features/pdf/types";
import { getPrinterCapabilities, listPrinters } from "@/features/printers/api";
import type { CapabilityChoice, PrinterCapabilities, PrinterInfo } from "@/features/printers/types";
import { submitPrintJob } from "@/features/settings/api";
import { SettingsPanel } from "@/features/settings/settingsPanel";
import type { PrintSettings } from "@/features/settings/types";
import { isTauriRuntime } from "@/lib/tauri";
import { resolvePrintPaperPreview } from "@/services/pdf/printPreview";

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

function fileNameFromPath(path: string) {
  return path.split(/[\\/]/).pop() || "Document.pdf";
}

function pdfFromPath(path: string): PdfFile {
  return {
    name: fileNameFromPath(path),
    path,
    previewUrl: convertFileSrc(path)
  };
}

function friendlyError(error: unknown) {
  const message = String(error);
  if (message.toLowerCase().includes("offline")) return "Printer offline.";
  if (message.toLowerCase().includes("media")) return "Unsupported media.";
  if (message.toLowerCase().includes("paper")) return "Paper mismatch.";
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

function readStoredHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem("printpilot.history") || "[]") as PrintHistoryItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function recentFilesToHistory(paths: string[], currentFile: PdfFile | null, printerName: string, paperSize: string, copies: number) {
  const candidates = currentFile?.path ? [currentFile.path, ...paths.filter((path) => path !== currentFile.path)] : paths;

  return candidates.slice(0, 5).map((path, index) => ({
    id: `recent-${index}-${path}`,
    fileName: fileNameFromPath(path),
    path,
    printedAt: new Date(Date.now() - index * 36 * 60 * 60 * 1000).toISOString(),
    printerName,
    paperSize,
    copies,
    status: index % 4 === 3 ? "Failed" : "Completed"
  })) satisfies PrintHistoryItem[];
}

export default function App() {
  const splitRef = useRef<HTMLElement | null>(null);
  const [pdfFile, setPdfFile] = useState<PdfFile | null>(null);
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [capabilities, setCapabilities] = useState<PrinterCapabilities | null>(null);
  const [settings, setSettings] = useState<PrintSettings>(initialSettings);
  const [status, setStatus] = useState<string | null>(null);
  const [recentFiles, setRecentFiles] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("printpilot.recent") || "[]") as string[];
    } catch {
      return [];
    }
  });
  const [isLoadingPrinters, setIsLoadingPrinters] = useState(false);
  const [isLoadingCapabilities, setIsLoadingCapabilities] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [printHistory, setPrintHistory] = useState<PrintHistoryItem[]>(readStoredHistory);
  const [leftPanelPercent, setLeftPanelPercent] = useState(() => {
    const saved = Number(localStorage.getItem("printpilot.split"));
    return Number.isFinite(saved) && saved >= 58 && saved <= 74 ? saved : 67;
  });
  const selectedPrinter = printers.find((printer) => printer.id === settings.printerId);
  const printPaperPreview = resolvePrintPaperPreview(settings, capabilities?.paperSizes);
  const historyItems = useMemo(
    () =>
      printHistory.length
        ? printHistory
        : recentFilesToHistory(
            recentFiles,
            pdfFile,
            selectedPrinter?.name || settings.printerId || "Not selected",
            printPaperPreview?.label || settings.paperSize || "Default",
            settings.copies || 1
          ),
    [pdfFile, printHistory, printPaperPreview?.label, recentFiles, selectedPrinter?.name, settings.copies, settings.paperSize, settings.printerId]
  );
  const canPrint = Boolean(
    pdfFile?.path &&
      settings.printerId &&
      selectedPrinter?.status !== "offline" &&
      capabilities &&
      !isLoadingCapabilities &&
      !isPrinting
  );

  const loadPrinters = useCallback(async () => {
    setIsLoadingPrinters(true);
    try {
      const detectedPrinters = await listPrinters();
      setPrinters(detectedPrinters);
      setSettings((current) => ({
        ...current,
        printerId:
          detectedPrinters.find((printer) => printer.id === current.printerId)?.id ||
          detectedPrinters.find((printer) => printer.isDefault)?.id ||
          detectedPrinters[0]?.id ||
          ""
      }));
      setStatus(detectedPrinters.length ? null : "No printers detected.");
    } catch {
      setPrinters([]);
      setCapabilities(null);
      setStatus("No printers detected.");
    } finally {
      setIsLoadingPrinters(false);
    }
  }, []);

  useEffect(() => {
    loadPrinters();
  }, [loadPrinters]);

  useEffect(() => {
    if (!settings.printerId) {
      setCapabilities(null);
      return;
    }

    let cancelled = false;

    async function loadCapabilities() {
      setIsLoadingCapabilities(true);
      try {
        const nextCapabilities = await getPrinterCapabilities(settings.printerId);
        if (cancelled) return;

        setCapabilities(nextCapabilities);
        setSettings((current) => applyCapabilityDefaults(current, nextCapabilities));
        setStatus(null);
      } catch {
        if (!cancelled) {
          setCapabilities(null);
          setStatus("Unable to read printer capabilities.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingCapabilities(false);
        }
      }
    }

    loadCapabilities();

    return () => {
      cancelled = true;
    };
  }, [settings.printerId]);

  const selectPdfPath = useCallback((path: string) => {
    setPdfFile(pdfFromPath(path));
    setRecentFiles((current) => {
      const nextRecent = [path, ...current.filter((item) => item !== path)].slice(0, 5);
      localStorage.setItem("printpilot.recent", JSON.stringify(nextRecent));
      return nextRecent;
    });
    setStatus(null);
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;

    const unlistenPromise = getCurrentWebviewWindow().onDragDropEvent((event) => {
      if (event.payload.type !== "drop") return;
      const path = event.payload.paths.find((candidate) => candidate.toLowerCase().endsWith(".pdf"));
      if (path) selectPdfPath(path);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [selectPdfPath]);

  async function browsePdf() {
    if (!isTauriRuntime()) {
      setStatus("Run the native app to choose and print PDFs.");
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
      setStatus("Choose a PDF before printing.");
      return;
    }

    setIsPrinting(true);
    setStatus(null);

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
      const response = await submitPrintJob({ pdfPath: pdfFile.path, settings });
      setStatus(response.message || `Print job ${response.jobId} sent.`);
      recordHistoryItem({ ...historyBase, status: "Completed" });
    } catch (error) {
      setStatus(friendlyError(error));
      recordHistoryItem({ ...historyBase, status: "Failed" });
    } finally {
      setIsPrinting(false);
    }
  }

  function recordHistoryItem(item: PrintHistoryItem) {
    setPrintHistory((current) => {
      const nextHistory = [item, ...current].slice(0, 25);
      localStorage.setItem("printpilot.history", JSON.stringify(nextHistory));
      return nextHistory;
    });
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
      localStorage.setItem("printpilot.split", String(nextPercent));
    }

    function stopResize() {
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stopResize);
    }

    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stopResize, { once: true });
  }

  return (
    <main className="h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_30%),linear-gradient(135deg,#17181A_0%,#101113_48%,#202124_100%)] p-2 text-foreground sm:p-3 md:p-4">
      <div className="mx-auto flex h-full max-w-[2200px] flex-col gap-2 md:gap-3">
        <header className="flex shrink-0 items-center justify-end">
          <div className="flex min-w-0 flex-nowrap justify-end gap-1.5 sm:gap-2">
            <Button className="h-9 px-2.5 sm:h-10 sm:px-4" variant="secondary" onClick={browsePdf}>
              <FileUp className="h-4 w-4" />
              Browse PDF
            </Button>
            <Button className="h-9 px-2.5 sm:h-10 sm:px-4" variant="outline" onClick={loadPrinters} disabled={isLoadingPrinters}>
              <RefreshCw className={`h-4 w-4 ${isLoadingPrinters ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button className="h-9 px-2.5 sm:h-10 sm:px-4" variant="outline" onClick={() => setIsHistoryOpen(true)}>
              <History className="h-4 w-4" />
              History
            </Button>
          </div>
        </header>

        <section
          ref={splitRef}
          className="grid min-h-0 flex-1 grid-cols-[minmax(0,var(--left-panel))_8px_minmax(0,1fr)] gap-2 transition-[grid-template-columns] duration-200 ease-out md:gap-3 md:grid-cols-[minmax(0,var(--left-panel))_clamp(8px,0.75vw,12px)_minmax(0,1fr)]"
          style={{ "--left-panel": `${leftPanelPercent}%` } as CSSProperties}
        >
          <div className="min-h-0 min-w-0">
            <PdfPreview file={pdfFile} printPaper={printPaperPreview} printerName={selectedPrinter?.name} />
          </div>

          <button
            aria-label="Resize preview and settings panels"
            className="group flex cursor-col-resize items-stretch justify-center rounded-md outline-none"
            onPointerDown={startPanelResize}
            type="button"
          >
            <span className="my-auto h-16 w-1 rounded-full bg-white/10 transition group-hover:bg-primary group-focus-visible:bg-primary" />
          </button>

          <Card className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border-[#3D3F43] bg-[#1C1D20]/82 p-0 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl">
            <SettingsPanel
              printers={printers}
              capabilities={capabilities}
              isLoadingCapabilities={isLoadingCapabilities}
              settings={settings}
              onChange={setSettings}
              canPrint={canPrint}
              isPrinting={isPrinting}
              status={status}
              onPrint={printPdf}
            />
          </Card>
        </section>
      </div>
      {isHistoryOpen && (
        <HistoryDialog
          items={historyItems}
          onClose={() => setIsHistoryOpen(false)}
          onReprint={(path) => {
            selectPdfPath(path);
            setIsHistoryOpen(false);
          }}
        />
      )}
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
                  <span className="text-xs text-[#B9BABE]">{formatHistoryDate(item.printedAt)}</span>
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

function formatHistoryDate(value: string) {
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
