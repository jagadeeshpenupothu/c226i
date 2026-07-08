import { GUEST_HISTORY_SCHEMA_VERSION, MAX_GUEST_HISTORY_ITEMS } from "./constants";
import type { GuestHistoryItem } from "./documentTypes";
import { fileNameFromCloudPath, validatePdfForCloud } from "./localDocumentBridge";

const STORAGE_KEY = "printpilot.guestHistory.v1";

type Listener = () => void;

class GuestHistoryRepository {
  private listeners = new Set<Listener>();
  private items: GuestHistoryItem[] = this.read();

  getSnapshot = (): GuestHistoryItem[] => this.items;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async recordLocalPdf(path: string, pageCount: number | null = null): Promise<GuestHistoryItem | null> {
    try {
      const validation = await validatePdfForCloud(path);
      const now = new Date().toISOString();
      const existing = this.items.find((item) => item.localPath === path);
      const item: GuestHistoryItem = {
        schemaVersion: GUEST_HISTORY_SCHEMA_VERSION,
        historyId: existing?.historyId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        displayName: existing?.displayName ?? fileNameFromCloudPath(path),
        originalFileName: fileNameFromCloudPath(path),
        localPath: path,
        byteSize: validation.byteSize,
        pageCount,
        createdAt: existing?.createdAt ?? now,
        lastOpenedAt: now
      };
      this.items = [item, ...this.items.filter((entry) => entry.localPath !== path)].slice(0, MAX_GUEST_HISTORY_ITEMS);
      this.persist();
      return item;
    } catch {
      return null;
    }
  }

  async validateForOpen(item: GuestHistoryItem): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
    try {
      await validatePdfForCloud(item.localPath);
      await this.recordLocalPdf(item.localPath, item.pageCount);
      return { ok: true, path: item.localPath };
    } catch {
      return { ok: false, message: "This PDF was moved, deleted, or is no longer valid." };
    }
  }

  remove(historyId: string): void {
    this.items = this.items.filter((item) => item.historyId !== historyId);
    this.persist();
  }

  clear(): void {
    this.items = [];
    this.persist();
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items));
    } catch {
      // Best-effort local history; never interrupt local printing.
    }
    this.emit();
  }

  private read(): GuestHistoryItem[] {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((item): item is GuestHistoryItem => item && typeof item.localPath === "string" && typeof item.historyId === "string")
        .slice(0, MAX_GUEST_HISTORY_ITEMS);
    } catch {
      return [];
    }
  }
}

export const guestHistoryRepository = new GuestHistoryRepository();
