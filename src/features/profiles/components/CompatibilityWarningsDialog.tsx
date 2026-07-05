import { AlertTriangle } from "lucide-react";
import { Button, Icon, typography } from "@/design";
import { cn } from "@/lib/utils";
import type { CompatibilityWarning } from "../profileCompatibility";

// Shown after applying a profile whose settings didn't fully match the printer.
// Nothing was silently discarded — every adjustment is listed here.
export function CompatibilityWarningsDialog({
  profileName,
  warnings,
  onClose
}: {
  profileName: string;
  warnings: CompatibilityWarning[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-6" role="dialog" aria-modal="true" aria-label="Compatibility adjustments">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-edge-subtle bg-elevated shadow-dialog">
        <div className="flex items-center gap-2 border-b border-edge-subtle px-5 py-3">
          <Icon icon={AlertTriangle} className="text-warning" />
          <div>
            <h2 className={cn(typography.headingS, "text-ink")}>Applied with adjustments</h2>
            <p className={cn(typography.caption, "text-ink-muted")}>“{profileName}” didn't fully match this printer.</p>
          </div>
        </div>
        <div className="max-h-[50vh] overflow-auto p-4">
          <ul className="grid gap-2">
            {warnings.map((warning, index) => (
              <li key={`${warning.field}-${index}`} className="rounded-md border border-edge-subtle bg-white/[0.02] px-3 py-2">
                <p className={cn(typography.label, "text-ink")}>{warning.field}</p>
                <p className={cn(typography.caption, "text-ink-muted")}>{warning.message}</p>
              </li>
            ))}
          </ul>
          <p className={cn(typography.caption, "mt-3 text-ink-muted")}>
            Your profile still stores the original values — they'll be restored on a printer that supports them.
          </p>
        </div>
        <div className="flex justify-end border-t border-edge-subtle px-5 py-3">
          <Button variant="primary" size="sm" onClick={onClose}>
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
}
