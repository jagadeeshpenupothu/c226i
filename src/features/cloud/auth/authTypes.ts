// Authentication — provider-agnostic types.
//
// No OAuth, no token exchange, no SDK here. This only describes the *shapes* the
// AuthenticationProvider works with. The concrete flow (Google, Microsoft, …)
// arrives in a later phase behind these same types.

export type AuthMethod =
  | "google" // Phase 9
  | "microsoft" // future
  | "github" // future
  | "sso" // future — enterprise SSO
  | "password" // future
  | "anonymous"; // local-only / not signed in

export interface AuthMethodDescriptor {
  method: AuthMethod;
  label: string;
  // false until the phase that enables the method ships. Lets the UI render a
  // provider list where only the supported options are actionable.
  available: boolean;
}

// Lifecycle of an auth session, independent of provider.
export type AuthStatus = "unauthenticated" | "authenticating" | "authenticated" | "expired" | "error";

export interface AuthState {
  status: AuthStatus;
  method: AuthMethod | null;
  error: string | null;
}

// Opaque session descriptor. NOTE: there are deliberately no access/refresh
// token fields here — tokens live only in SecureTokenStorage, never in app
// state and never in localStorage.
export interface AuthSession {
  userId: string;
  method: AuthMethod;
  issuedAt: string; // ISO
  expiresAt: string | null; // ISO, null = provider-managed
}
