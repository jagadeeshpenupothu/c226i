import { cn } from "@/lib/utils";

export interface SkeletonProps {
  className?: string;
}

// Loading placeholder. Size it with utility classes (e.g. `h-4 w-32`).
export function Skeleton({ className }: SkeletonProps) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-white/[0.06]", className)} />;
}

export interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

// A stack of shimmer lines for text placeholders; the last line is shortened.
export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div className={cn("grid gap-2", className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={cn("h-3", index === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}
