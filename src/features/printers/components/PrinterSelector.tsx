import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, LayoutDashboard, Loader2, PrinterIcon } from "lucide-react";
import { Icon, typography } from "@/design";
import { cn } from "@/lib/utils";
import type { Printer } from "../printerTypes";
import { PrinterCard } from "./PrinterCard";

interface PrinterSelectorProps {
  printers: Printer[];
  value: string;
  onSelect: (id: string) => void;
  onOpenDashboard: () => void;
  loading?: boolean;
}

// A rich replacement for the native printer <select>: status, connection, default
// badge, and capability summary per printer. Renders its menu in a portal so it
// is never clipped, and never opens/closes spuriously (unlike native popups).
export function PrinterSelector({ printers, value, onSelect, onOpenDashboard, loading = false }: PrinterSelectorProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const selected = printers.find((printer) => printer.id === value) || null;

  function reposition() {
    const r = buttonRef.current?.getBoundingClientRect();
    if (r) setRect({ left: r.left, top: r.bottom + 4, width: r.width });
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
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

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          reposition();
          setOpen((value) => !value);
        }}
        className="flex w-full items-center gap-2 rounded-md border border-edge-subtle bg-app px-3 py-2 text-left outline-none transition duration-fast ease-standard hover:border-edge focus-visible:ring-2 focus-visible:ring-brand"
      >
        <div className="min-w-0 flex-1">
          {selected ? (
            <PrinterCard printer={selected} compact />
          ) : (
            <span className={cn(typography.bodySmall, "flex items-center gap-2 text-ink-muted")}>
              <Icon icon={PrinterIcon} />
              {loading ? "Discovering printers…" : "No printer connected"}
            </span>
          )}
        </div>
        <Icon icon={loading ? Loader2 : ChevronDown} className={cn("shrink-0 text-ink-muted", loading && "animate-spin")} />
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={{ position: "fixed", left: rect.left, top: rect.top, width: rect.width }}
            className="z-[80] max-h-[60vh] overflow-auto rounded-lg border border-edge-subtle bg-elevated p-1 shadow-dialog"
          >
            {printers.length === 0 ? (
              <p className={cn(typography.caption, "px-3 py-4 text-center text-ink-muted")}>No printers discovered.</p>
            ) : (
              printers.map((printer) => (
                <button
                  key={printer.id}
                  type="button"
                  role="option"
                  aria-selected={printer.id === value}
                  onClick={() => {
                    onSelect(printer.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-brand",
                    printer.id === value ? "bg-brand-soft" : "hover:bg-white/[0.05]"
                  )}
                >
                  <span className="w-4 shrink-0">{printer.id === value && <Icon icon={Check} size="xs" className="text-brand" />}</span>
                  <span className="min-w-0 flex-1">
                    <PrinterCard printer={printer} />
                  </span>
                </button>
              ))
            )}
            <div className="mt-1 border-t border-edge-subtle p-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpenDashboard();
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-ink-secondary outline-none transition hover:bg-white/[0.05] hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
              >
                <Icon icon={LayoutDashboard} />
                <span className={typography.label}>Open Printer Dashboard</span>
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
