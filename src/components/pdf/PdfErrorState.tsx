import { AlertCircle } from "lucide-react";

interface PdfErrorStateProps {
  reason: string;
}

export function PdfErrorState({ reason }: PdfErrorStateProps) {
  return (
    <div className="flex flex-1 items-center justify-center bg-[#1C1C1E] p-8">
      <div className="max-w-sm rounded-lg border border-[#48484A] bg-[#2C2C2E] px-5 py-4 text-center shadow-sm">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive" />
        <p className="text-sm font-semibold">Unable to open PDF.</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{reason}</p>
      </div>
    </div>
  );
}
