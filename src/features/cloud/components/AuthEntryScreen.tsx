import { useState } from "react";
import { FileText, LogIn, UserPlus } from "lucide-react";
import { Button, typography } from "@/design";
import { cn } from "@/lib/utils";
import { cloudManager } from "../cloudManager";

type Mode = "signin" | "signup";

export function AuthEntryScreen({ onContinue }: { onContinue: () => void }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(nextMode = mode) {
    setBusy(true);
    setError(null);
    const credentials = { email, password };
    const result = nextMode === "signin" ? await cloudManager.signInWithEmail(credentials) : await cloudManager.signUpWithEmail(credentials);
    setBusy(false);
    if (result.ok) {
      onContinue();
      return;
    }
    setError(result.error.message);
  }

  return (
    <main className="grid min-h-screen place-items-center bg-app p-6 text-foreground">
      <section className="grid w-full max-w-sm gap-5 rounded-lg border border-edge-subtle bg-surface p-6 shadow-dialog">
        <div className="grid gap-2 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-brand-soft text-brand">
            <FileText className="h-6 w-6" />
          </div>
          <h1 className={cn(typography.headingM, "text-ink")}>PrintPilot</h1>
          <p className={cn(typography.bodySmall, "text-ink-muted")}>Sign in for private cloud documents, or continue locally as a guest.</p>
        </div>

        <div className="grid gap-3">
          <input
            className="h-10 rounded-md border border-edge-subtle bg-elevated px-3 text-sm text-ink outline-none focus:border-brand"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <input
            className="h-10 rounded-md border border-edge-subtle bg-elevated px-3 text-sm text-ink outline-none focus:border-brand"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error && <p className={cn(typography.caption, "text-error")}>{error}</p>}
        </div>

        <div className="grid gap-2">
          <Button leadingIcon={LogIn} loading={busy && mode === "signin"} onClick={() => { setMode("signin"); void submit("signin"); }}>
            Sign In
          </Button>
          <Button variant="secondary" leadingIcon={UserPlus} loading={busy && mode === "signup"} onClick={() => { setMode("signup"); void submit("signup"); }}>
            Sign Up
          </Button>
          <Button variant="ghost" onClick={onContinue}>
            Continue to Print
          </Button>
        </div>
      </section>
    </main>
  );
}
