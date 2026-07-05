import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type ScrollableContainerProps = HTMLAttributes<HTMLDivElement>;

// Standard scroll region: fills remaining flex space, scrolls its own content, and
// inherits the app's themed scrollbar styling. Use inside a flex column.
export const ScrollableContainer = forwardRef<HTMLDivElement, ScrollableContainerProps>(function ScrollableContainer(
  { className, children, ...rest },
  ref
) {
  return (
    <div ref={ref} className={cn("min-h-0 flex-1 overflow-auto", className)} {...rest}>
      {children}
    </div>
  );
});
