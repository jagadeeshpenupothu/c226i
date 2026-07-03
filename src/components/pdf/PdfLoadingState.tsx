import type { PdfLoadProgress } from "@/types/pdf";

interface PdfLoadingStateProps {
  progress: PdfLoadProgress;
}

export function PdfLoadingState({ progress }: PdfLoadingStateProps) {
  return (
    <div className="flex flex-1 items-center justify-center bg-[#1C1C1E] p-8">
      <div className="w-full max-w-sm rounded-lg border border-[#48484A] bg-[#2C2C2E] p-5 text-center shadow-sm">
        <p className="text-sm font-semibold">Loading...</p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${progress.percent ?? 35}%` }}
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {progress.percent !== null ? `${progress.percent}%` : "Preparing preview"}
        </p>
      </div>
    </div>
  );
}
