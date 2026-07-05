import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

const WIDTH = 240;

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
}

// Portal-rendered tooltip so it is never clipped by scroll/overflow containers.
// Shows on hover and keyboard focus of the wrapped trigger.
export function Tooltip({ content, children, side = "top" }: TooltipProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  function show() {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.max(8, Math.min(rect.left + rect.width / 2 - WIDTH / 2, window.innerWidth - WIDTH - 8));
    const top = side === "top" ? rect.top - 8 : rect.bottom + 8;
    setPos({ top, left });
  }
  function hide() {
    setPos(null);
  }

  return (
    <span ref={ref} className="inline-flex" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {pos &&
        createPortal(
          <div
            role="tooltip"
            style={{ position: "fixed", top: pos.top, left: pos.left, width: WIDTH, transform: side === "top" ? "translateY(-100%)" : undefined }}
            className="pointer-events-none z-[100] rounded-md border border-edge-subtle bg-elevated px-3 py-2 text-xs leading-5 text-ink-secondary shadow-dialog"
          >
            {content}
          </div>,
          document.body
        )}
    </span>
  );
}
