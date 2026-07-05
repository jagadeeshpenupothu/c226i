import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LogIn, LogOut } from "lucide-react";
import { Button, IconButton, typography } from "@/design";
import { cn } from "@/lib/utils";
import { cloudManager } from "../cloudManager";
import { useCloudUser } from "../hooks/useCloud";
import type { CloudUser } from "../cloudTypes";
import { CloudStatusBadge } from "./CloudStatusBadge";
import { GoogleSignInButton } from "./GoogleSignInButton";

// Header account control. Provider-agnostic: it reads the reactive CloudUser and
// calls cloudManager.signIn/signOut — it has no idea Firebase is underneath.
// Signed out → a compact button opening a sign-in panel. Signed in → an avatar
// opening a profile panel with status + sign-out. Auth state changes anywhere in
// the app update this instantly via useCloudUser().
export function AccountMenu() {
  const user = useCloudUser();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  function toggle() {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (rect) setPos({ right: window.innerWidth - rect.right, top: rect.bottom + 6 });
    setError(null);
    setOpen((value) => !value);
  }

  async function handleSignIn() {
    setBusy(true);
    setError(null);
    const result = await cloudManager.signIn("google");
    setBusy(false);
    if (result.ok) {
      setOpen(false);
      return;
    }
    // A user-cancelled sign-in isn't an error to surface.
    if (result.error.code !== "cancelled") setError(result.error.message);
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
        <button
          ref={anchorRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Account"
          onClick={toggle}
          className="rounded-full outline-none ring-offset-1 ring-offset-app transition focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Avatar user={user} size={28} />
        </button>
      ) : (
        <IconButton ref={anchorRef} icon={LogIn} label="Sign in" onClick={toggle} />
      )}

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: "fixed", right: pos.right, top: pos.top, width: 300 }}
            className="z-[95] overflow-hidden rounded-lg border border-edge-subtle bg-elevated shadow-dialog"
          >
            {user ? (
              <>
                <div className="flex items-center gap-3 border-b border-edge-subtle px-4 py-3">
                  <Avatar user={user} size={40} />
                  <div className="min-w-0">
                    <p className={cn(typography.bodySmall, "truncate font-medium text-ink")}>{user.displayName || "Signed in"}</p>
                    {user.email && <p className={cn(typography.caption, "truncate text-ink-muted")}>{user.email}</p>}
                  </div>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className={cn(typography.caption, "text-ink-muted")}>Cloud status</span>
                  <CloudStatusBadge />
                </div>
                <div className="border-t border-edge-subtle p-2">
                  <Button variant="secondary" size="sm" className="w-full" leadingIcon={LogOut} loading={busy} onClick={handleSignOut}>
                    Sign out
                  </Button>
                </div>
              </>
            ) : (
              <div className="grid gap-2 p-4">
                <p className={cn(typography.label, "text-ink")}>Sign in to PrintPilot</p>
                <p className={cn(typography.caption, "text-ink-muted")}>Sync your profiles and settings across devices. PrintPilot keeps working normally without an account.</p>
                <GoogleSignInButton loading={busy} onClick={handleSignIn} className="mt-1" />
                {error && <p className={cn(typography.caption, "text-error")}>{error}</p>}
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}

// Avatar with a graceful fallback: the provider photo when it loads, initials
// otherwise (covers CSP-blocked or offline avatar URLs).
function Avatar({ user, size }: { user: CloudUser; size: number }) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(user.avatarUrl) && !failed;
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-full bg-brand-soft font-semibold text-brand"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      aria-hidden
    >
      {showImage ? (
        <img src={user.avatarUrl ?? undefined} alt="" width={size} height={size} className="h-full w-full object-cover" onError={() => setFailed(true)} referrerPolicy="no-referrer" />
      ) : (
        initials(user.displayName, user.email)
      )}
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
