import { useMemo } from "react";
import { createPortal } from "react-dom";
import { useNotifications } from "@/features/printers";
import { useToasts } from "../useToasts";
import { ToastItem } from "./ToastItem";

interface ToastViewportProps {
  // Opens the related Print Job when a job-linked toast is clicked.
  onOpenJob: (jobId: string) => void;
}

// Floating, top-right toast stack. The container is pointer-events-none so it
// never blocks the main UI; each toast re-enables pointer events for itself.
// Content is resolved live from the Notification Center (the source of truth) —
// no notification data is copied here.
export function ToastViewport({ onOpenJob }: ToastViewportProps) {
  const toasts = useToasts();
  const notifications = useNotifications();

  const byId = useMemo(() => {
    const map = new Map(notifications.map((note) => [note.id, note]));
    return map;
  }, [notifications]);

  if (toasts.length === 0) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => {
        const note = byId.get(toast.notificationId);
        if (!note) return null; // dismissed from the center before it surfaced
        return <ToastItem key={toast.id} toast={toast} note={note} onOpenJob={onOpenJob} />;
      })}
    </div>,
    document.body
  );
}
