import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Bell, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { Icon, IconButton, typography } from "@/design";
import { cn } from "@/lib/utils";
import { notificationStore, useNotifications, useUnreadNotificationCount, type NotificationSeverity } from "../printerNotifications";

const SEVERITY: Record<NotificationSeverity, { icon: LucideIcon; className: string }> = {
  info: { icon: Info, className: "text-info" },
  success: { icon: CircleCheck, className: "text-success" },
  warning: { icon: TriangleAlert, className: "text-warning" },
  error: { icon: AlertTriangle, className: "text-error" }
};

// In-app notification center: a header bell with an unread badge and a portal
// dropdown. Opening it marks everything read.
export function NotificationCenter() {
  const notifications = useNotifications();
  const unread = useUnreadNotificationCount();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ right: number; top: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    notificationStore.markAllRead();
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (rect) setPos({ right: window.innerWidth - rect.right, top: rect.bottom + 6 });
    setOpen((value) => !value);
  }

  return (
    <div ref={anchorRef} className="relative inline-flex">
      <IconButton icon={Bell} label="Notifications" onClick={toggle} />
      {unread > 0 && (
        <span className="pointer-events-none absolute -right-0.5 -top-0.5 grid h-4 min-w-[16px] place-items-center rounded-pill bg-error px-1 text-[10px] font-semibold text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", right: pos.right, top: pos.top, width: 340 }}
            className="z-[90] overflow-hidden rounded-lg border border-edge-subtle bg-elevated shadow-dialog"
          >
            <div className="flex items-center justify-between border-b border-edge-subtle px-3 py-2">
              <p className={cn(typography.label, "text-ink")}>Notifications</p>
              {notifications.length > 0 && (
                <button type="button" onClick={() => notificationStore.clear()} className={cn(typography.caption, "text-ink-muted outline-none transition hover:text-ink focus-visible:text-ink")}>
                  Clear all
                </button>
              )}
            </div>
            <div className="max-h-[60vh] overflow-auto">
              {notifications.length === 0 ? (
                <p className={cn(typography.caption, "px-3 py-6 text-center text-ink-muted")}>You're all caught up.</p>
              ) : (
                notifications.map((note) => {
                  const meta = SEVERITY[note.severity];
                  return (
                    <div key={note.id} className="group flex items-start gap-2 border-b border-edge-subtle px-3 py-2 last:border-b-0">
                      <Icon icon={meta.icon} className={cn("mt-0.5", meta.className)} />
                      <div className="min-w-0 flex-1">
                        <p className={cn(typography.bodySmall, "text-ink")}>{note.title}</p>
                        <p className={cn(typography.caption, "text-ink-muted")}>{note.message}</p>
                        <p className={cn(typography.caption, "text-ink-disabled")}>{clock(note.at)}</p>
                      </div>
                      <button
                        type="button"
                        aria-label="Dismiss"
                        onClick={() => notificationStore.dismiss(note.id)}
                        className="rounded p-1 text-ink-muted opacity-0 outline-none transition hover:bg-white/10 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <Icon icon={X} size="xs" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

function clock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
}
