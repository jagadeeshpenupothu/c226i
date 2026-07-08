import { useCallback, useEffect, useState } from "react";
import { Cloud, Download, RefreshCw, Trash2, X } from "lucide-react";
import { Button, typography } from "@/design";
import { cn } from "@/lib/utils";
import { cloudManager } from "../cloudManager";
import { cloudDocumentService } from "../documents/cloudDocumentService";
import { CLOUD_USER_QUOTA_BYTES, formatBytes } from "../documents/constants";
import type { CloudDocument, CloudDocumentLibrarySnapshot } from "../documents/documentTypes";

export function CloudDocumentsDialog({
  onClose,
  onOpenPath
}: {
  onClose: () => void;
  onOpenPath: (path: string, document: CloudDocument) => void;
}) {
  const [snapshot, setSnapshot] = useState<CloudDocumentLibrarySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await cloudManager.listCloudDocuments();
    setLoading(false);
    if (result.ok) {
      setSnapshot(result.value);
    } else {
      setError(result.error.message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function openDocument(document: CloudDocument) {
    setBusyId(document.documentId);
    setError(null);
    try {
      const cached = await cloudDocumentService.openCloudDocument(document);
      onOpenPath(cached.path, document);
      onClose();
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : String(openError));
    } finally {
      setBusyId(null);
    }
  }

  async function deleteDocument(document: CloudDocument) {
    if (!window.confirm(`Delete "${document.displayName}" from Cloud Documents? The currently open local copy will stay usable.`)) return;
    setBusyId(document.documentId);
    setError(null);
    const result = await cloudManager.deleteCloudDocument(document);
    setBusyId(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    await refresh();
  }

  const quota = snapshot?.quota ?? { usedBytes: 0, reservedBytes: 0, quotaBytes: CLOUD_USER_QUOTA_BYTES };
  const usedPercent = Math.min(100, Math.round(((quota.usedBytes + quota.reservedBytes) / quota.quotaBytes) * 100));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6">
      <div className="flex h-[74vh] w-[76vw] max-w-5xl flex-col overflow-hidden rounded-xl border border-edge-subtle bg-surface shadow-dialog">
        <div className="flex shrink-0 items-center justify-between border-b border-edge-subtle px-5 py-3">
          <div>
            <h2 className={cn(typography.headingS, "text-ink")}>Cloud Documents</h2>
            <p className={cn(typography.caption, "text-ink-muted")}>
              {formatBytes(quota.usedBytes + quota.reservedBytes)} of {formatBytes(quota.quotaBytes)} used
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" leadingIcon={RefreshCw} loading={loading} onClick={refresh}>
              Refresh
            </Button>
            <button className="rounded-md p-1.5 text-ink-muted transition hover:bg-white/10 hover:text-ink" onClick={onClose} type="button">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="h-1 bg-elevated">
          <div className="h-full bg-brand transition-all" style={{ width: `${usedPercent}%` }} />
        </div>

        {error && <div className="border-b border-edge-subtle px-5 py-2 text-sm text-error">{error}</div>}

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {loading ? (
            <div className="grid h-full place-items-center text-sm text-ink-muted">Loading cloud documents...</div>
          ) : snapshot?.documents.length ? (
            <div className="grid gap-2">
              {snapshot.documents.map((document) => (
                <div key={document.documentId} className="grid grid-cols-[minmax(0,1fr)_120px_160px_130px] items-center gap-3 rounded-md border border-edge-subtle bg-elevated px-3 py-2">
                  <div className="min-w-0">
                    <p className={cn(typography.label, "truncate text-ink")}>{document.displayName}</p>
                    <p className={cn(typography.caption, "truncate text-ink-muted")}>
                      {document.originalFileName} · {formatBytes(document.byteSize)}
                      {document.pageCount ? ` · ${document.pageCount} pages` : ""}
                    </p>
                  </div>
                  <span className={cn(typography.caption, "capitalize text-ink-muted")}>{document.status}</span>
                  <span className={cn(typography.caption, "text-ink-muted")}>{formatDate(document.lastOpenedAt || document.createdAt)}</span>
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" size="sm" leadingIcon={Download} loading={busyId === document.documentId} onClick={() => void openDocument(document)}>
                      Open
                    </Button>
                    <Button variant="ghost" size="sm" leadingIcon={Trash2} disabled={busyId === document.documentId} onClick={() => void deleteDocument(document)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid h-full place-items-center">
              <div className="grid gap-2 text-center text-ink-muted">
                <Cloud className="mx-auto h-8 w-8" />
                <p className={typography.bodySmall}>No cloud documents yet.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "Never opened";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleDateString();
}
