// Cloud Foundation — core domain types.
//
// Everything here is provider-agnostic. No file in the app's business logic
// references Firebase / Supabase / Azure directly — the concrete backend is
// chosen once, at the edge (see providers/), and the rest of the app depends
// only on these models and the interfaces.

import type { AuthMethod } from "./auth/authTypes";
import type { SyncState, SyncStatus } from "./sync/syncTypes";
import type { NetworkStatus } from "./network/networkMonitor";

// Which cloud backend owns an identity / provides sync + storage.
export type CloudProviderId = "firebase" | "supabase" | "appwrite" | "azure" | "custom";

export type SubscriptionTier = "free" | "pro" | "team" | "enterprise";

// The signed-in account, normalized across every provider. A Firebase user, a
// Supabase user, and an Azure AD user all map onto this same shape — see the
// ACCOUNT MODEL section of the spec.
export interface CloudUser {
  id: string; // provider-issued stable user id (uid)
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  provider: CloudProviderId; // the cloud backend that issued this identity
  authMethod: AuthMethod; // how they signed in (google / microsoft / …)
  createdAt: string; // ISO
  lastLoginAt: string; // ISO
  lastSyncAt: string | null; // ISO — null until the first successful sync
  syncStatus: SyncStatus;
  // Reserved for future phases; present now so storage schemas + downstream code
  // are stable before the features land.
  subscription?: SubscriptionTier;
  organizationId?: string | null;
}

// Top-level snapshot the cloud store exposes to hooks / UI.
export interface CloudState {
  initialized: boolean;
  providerId: CloudProviderId | null; // null → running fully local / offline
  user: CloudUser | null; // null → not signed in (local-only)
  sync: SyncState;
  network: NetworkStatus;
}

// Uniform result type so callers never catch provider-specific errors. Cloud
// operations return this instead of throwing.
export type CloudResult<T> = { ok: true; value: T } | { ok: false; error: CloudError };

export type CloudErrorCode =
  | "not-configured" // no provider wired yet
  | "not-implemented" // stubbed extension point
  | "offline"
  | "unauthenticated"
  | "cancelled" // user dismissed the sign-in flow
  | "popup-blocked" // the browser/webview blocked the auth popup
  | "timeout" // the auth flow took too long
  | "conflict"
  | "unknown";

export interface CloudError {
  code: CloudErrorCode;
  message: string;
  cause?: unknown;
}

export class NotConfiguredError extends Error {
  readonly code: CloudErrorCode = "not-configured";
  constructor(message = "No cloud provider is configured yet.") {
    super(message);
    this.name = "NotConfiguredError";
  }
}

export class NotImplementedError extends Error {
  readonly code: CloudErrorCode = "not-implemented";
  constructor(feature: string) {
    super(`${feature} is not implemented in the Cloud Foundation — it arrives in a later phase.`);
    this.name = "NotImplementedError";
  }
}

// Carries a normalized code + user-friendly message from a provider (e.g. the
// FirebaseProvider maps Firebase auth error codes onto this). Business logic and
// UI stay provider-agnostic — they only ever see CloudErrorCode + message.
export class CloudAuthError extends Error {
  readonly code: CloudErrorCode;
  constructor(code: CloudErrorCode, message: string) {
    super(message);
    this.name = "CloudAuthError";
    this.code = code;
  }
}

// Normalizes any thrown value into a CloudError for CloudResult.
export function toCloudError(error: unknown): CloudError {
  if (error instanceof CloudAuthError) return { code: error.code, message: error.message, cause: error };
  if (error instanceof NotConfiguredError) return { code: "not-configured", message: error.message, cause: error };
  if (error instanceof NotImplementedError) return { code: "not-implemented", message: error.message, cause: error };
  if (error instanceof Error) return { code: "unknown", message: error.message, cause: error };
  return { code: "unknown", message: String(error), cause: error };
}
