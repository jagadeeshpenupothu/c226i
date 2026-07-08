// Cloud Foundation — public API.
//
// The provider-agnostic cloud layer. Business logic depends ONLY on this barrel
// (cloudManager + hooks + types), never on a concrete backend. A later phase
// registers a configured FirebaseProvider via cloudManager.registerProvider();
// nothing above this line changes.
//
//   cloudManager.initialize()       → start network monitoring + cloud state
//   cloudManager.recordChange(op)    → local-first: queue an already-local write
//   cloudManager.signIn(method)      → delegates to the active provider (Phase 9)
//   useCloudState() / useSyncState() → reactive reads for the UI

export { cloudManager } from "./cloudManager";
export { cloudStore } from "./cloudStore";
export { bootstrapCloud } from "./bootstrap/cloudBootstrap";
export { networkMonitor } from "./network/networkMonitor";
export { syncQueue } from "./queue/syncQueue";
export { DefaultConflictResolver } from "./conflict/conflictResolver";
export { FirebaseProvider, type FirebaseConfig } from "./providers/firebaseProvider";
export { InMemorySecureTokenStorage } from "./storage/storageProvider";
export { CloudAuthError } from "./cloudTypes";

export { useCloudState, useCloudUser, useSyncState, useNetworkStatus, useSyncQueue } from "./hooks/useCloud";
export { CloudStatusBadge } from "./components/CloudStatusBadge";
export { AccountMenu } from "./components/AccountMenu";
export { AuthEntryScreen } from "./components/AuthEntryScreen";
export { CloudDocumentsDialog } from "./components/CloudDocumentsDialog";
export { DocumentCloudBadge } from "./components/DocumentCloudBadge";
export { cloudDocumentService } from "./documents/cloudDocumentService";
export { guestHistoryRepository } from "./documents/guestHistoryRepository";
export { useCurrentDocumentCloudState, useGuestHistory } from "./documents/hooks";

// Types
export type { CloudUser, CloudState, CloudProviderId, CloudResult, CloudError, CloudErrorCode, SubscriptionTier } from "./cloudTypes";
export type { CloudDocument, GuestHistoryItem, DocumentOrigin } from "./documents/documentTypes";
export type { NetworkStatus } from "./network/networkMonitor";
export type { SyncState, SyncStatus, SyncOperation, SyncOperationType, SyncOperationStatus, SyncEntity } from "./sync/syncTypes";
export type { EnqueueInput } from "./queue/syncQueue";
export type { AuthMethod, AuthMethodDescriptor, AuthState, AuthStatus, AuthSession } from "./auth/authTypes";
export type { AuthenticationProvider } from "./auth/authProvider";
export type { SyncProvider, SyncPushResult, SyncPullResult, RemoteDocument, RemoteChange } from "./sync/syncProvider";
export type { StorageProvider, StorageObject, SecureTokenStorage } from "./storage/storageProvider";
export type { CloudProvider, CloudProviderMetadata, CloudProviderCapabilities } from "./providers/cloudProvider";
export type { ConflictResolver, ConflictStrategy, Conflict, ConflictOutcome } from "./conflict/conflictResolver";
