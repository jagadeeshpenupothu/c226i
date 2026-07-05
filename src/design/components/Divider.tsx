import { cn } from "@/lib/utils";

export interface DividerProps {
  orientation?: "horizontal" | "vertical";
  className?: string;
}

export function Divider({ orientation = "horizontal", className }: DividerProps) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn("bg-edge-subtle", orientation === "horizontal" ? "h-px w-full" : "h-full w-px", className)}
    />
  );
}
