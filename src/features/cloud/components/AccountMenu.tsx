import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Cloud, LogIn, LogOut, UserPlus } from "lucide-react";
import { Button, IconButton, typography } from "@/design";
import { cn } from "@/lib/utils";
import { cloudManager } from "../cloudManager";
import { useCloudUser } from "../hooks/useCloud";
import type { CloudUser } from "../cloudTypes";
import { CLOUD_USER_QUOTA_BYTES, formatBytes } from "../documents/constants";

type AuthMode = "signin" | "signup";

export function AccountMenu({ onOpenCloudDocuments }: { onOpenCloudDocuments?: () => void }) {
  const user = useCloudUser();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<{ usedBytes: number; quotaBytes: number } | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ right: number; top: number } | null>(null);

  useEffect(() => {
    if (!open) return;
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

  useEffect(() => {
    if (!open || !user) return;
    cloudManager.getCloudStorageUsage().then((result) => {
      if (result.ok) setUsage({ usedBytes: result.value.usedBytes + result.value.reservedBytes, quotaBytes: result.value.quotaBytes });
    });
  }, [open, user]);

  function toggle() {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (rect) setPos({ right: window.innerWidth - rect.right, top: rect.bottom + 6 });
    setError(null);
    setOpen((value) => !value);
  }

  async function submit(nextMode = mode) {
    setBusy(true);
    setError(null);
    const result = nextMode === "signin"
      ? await cloudManager.signInWithEmail({ email, password })
      : await cloudManager.signUpWithEmail({ email, password });
    setBusy(false);
    if (result.ok) {
      setOpen(false);
      return;
    }
    setError(result.error.message);
  }

  async function handleSignOut() {
    setBusy(true);
    await cloudManager.signOut();
    setBusy(false);
    setOpen(false);
  }

  return (
    <div className="relative inline-flex">
      {user ? (
        <button ref={anchorRef} type="button" aria-haspopup="menu" aria-expanded={open} aria-label="Account" onClick={toggle} className="rounded-full outline-none ring-offset-1 ring-offset-app transition focus-visible:ring-2 focus-visible:ring-brand">
          <Avatar user={user} size={28} />
        </button>
      ) : (
        <IconButton ref={anchorRef} icon={LogIn} label="Guest account" onClick={toggle} />
      )}

      {open && pos && createPortal(
        <div ref={menuRef} role="menu" style={{ position: "fixed", right: pos.right, top: pos.top, width: 320 }} className="z-[95] overflow-hidden rounded-lg border border-edge-subtle bg-elevated shadow-dialog">
          {user ? (
            <>
              <div className="flex items-center gap-3 border-b border-edge-subtle px-4 py-3">
                <Avatar user={user} size={40} />
                <div className="min-w-0">
                  <p className={cn(typography.bodySmall, "truncate font-medium text-ink")}>{user.displayName || "Signed in"}</p>
                  {user.email && <p className={cn(typography.caption, "truncate text-ink-muted")}>{user.email}</p>}
                </div>
              </div>
              <div className="grid gap-2 px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className={cn(typography.caption, "text-ink-muted")}>Cloud storage</span>
                  <span className={cn(typography.caption, "text-ink")}>{formatBytes(usage?.usedBytes ?? 0)} / {formatBytes(usage?.quotaBytes ?? CLOUD_USER_QUOTA_BYTES)}</span>
                </div>
                <Button variant="secondary" size="sm" leadingIcon={Cloud} onClick={() => { setOpen(false); onOpenCloudDocuments?.(); }}>
                  Cloud Documents
                </Button>
              </div>
              <div className="border-t border-edge-subtle p-2">
                <Button variant="secondary" size="sm" className="w-full" leadingIcon={LogOut} loading={busy} onClick={handleSignOut}>
                  Sign Out
                </Button>
              </div>
            </>
          ) : (
            <div className="grid gap-3 p-4">
              <div>
                <p className={cn(typography.label, "text-ink")}>Guest</p>
                <p className={cn(typography.caption, "text-ink-muted")}>Local printing and guest history stay on this Mac.</p>
              </div>
              <div className="flex gap-2">
                <Button variant={mode === "signin" ? "primary" : "secondary"} size="sm" leadingIcon={LogIn} onClick={() => setMode("signin")}>Sign In</Button>
                <Button variant={mode === "signup" ? "primary" : "secondary"} size="sm" leadingIcon={UserPlus} onClick={() => setMode("signup")}>Sign Up</Button>
              </div>
              <input className="h-9 rounded-md border border-edge-subtle bg-surface px-3 text-sm text-ink outline-none focus:border-brand" placeholder="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              <input className="h-9 rounded-md border border-edge-subtle bg-surface px-3 text-sm text-ink outline-none focus:border-brand" placeholder="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
              <Button size="sm" loading={busy} onClick={() => void submit()}>
                {mode === "signin" ? "Sign In" : "Sign Up"}
              </Button>
              {error && <p className={cn(typography.caption, "text-error")}>{error}</p>}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

function Avatar({ user, size }: { user: CloudUser; size: number }) {
  const label = initials(user.displayName, user.email);
  return (
    <span className="grid shrink-0 place-items-center overflow-hidden rounded-full bg-brand-soft font-semibold text-brand" style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }} aria-hidden>
      {label}
    </span>
  );
}

function initials(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.trim() || "";
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}
