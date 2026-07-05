import type { CloudProviderId } from "../cloudTypes";
import type { AuthenticationProvider } from "../auth/authProvider";
import type { SyncProvider } from "../sync/syncProvider";
import type { SecureTokenStorage, StorageProvider } from "../storage/storageProvider";

export interface CloudProviderCapabilities {
  auth: boolean;
  sync: boolean;
  storage: boolean;
  realtime: boolean;
}

export interface CloudProviderMetadata {
  id: CloudProviderId;
  label: string;
  capabilities: CloudProviderCapabilities;
  // true once real config/SDK is present (Phase 9+). Stubs report false so the
  // manager can register a provider without ever acting as though it can sync.
  configured: boolean;
}

// The single object the cloudManager talks to. A concrete backend bundles its
// auth / sync / storage / token implementations behind this composite. Swapping
// Firebase for Supabase / Appwrite / Azure / a custom backend means providing a
// different CloudProvider — no business-logic changes anywhere.
export interface CloudProvider {
  readonly metadata: CloudProviderMetadata;
  readonly auth: AuthenticationProvider;
  readonly sync: SyncProvider;
  readonly storage: StorageProvider;
  readonly tokens: SecureTokenStorage;

  // Prepare the provider (SDK init, restore a session). A safe no-op for stubs.
  initialize(): Promise<void>;
  // Tear down listeners / SDK.
  dispose(): Promise<void>;
  isConfigured(): boolean;
}
