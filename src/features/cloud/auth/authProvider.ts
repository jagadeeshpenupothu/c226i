import type { CloudUser } from "../cloudTypes";
import type { AuthMethod, AuthMethodDescriptor } from "./authTypes";

// The only surface the app (via cloudManager) uses to authenticate. A concrete
// backend implements this in a later phase; today only stubs exist. Business
// logic never imports a provider directly, so swapping Firebase for another
// backend changes nothing above this interface.
export interface AuthenticationProvider {
  readonly supportedMethods: AuthMethodDescriptor[];

  // Begin a sign-in. Concrete providers open the OAuth flow; the stub rejects.
  signIn(method: AuthMethod): Promise<CloudUser>;

  signOut(): Promise<void>;

  // The current user if a session can be restored, else null.
  getCurrentUser(): Promise<CloudUser | null>;

  // A short-lived id token used to authorize sync calls. Callers never persist
  // it — the provider sources it from SecureTokenStorage.
  getIdToken(forceRefresh?: boolean): Promise<string | null>;

  // Realtime auth changes (sign-in on another device, token expiry, sign-out).
  // Returns an unsubscribe function.
  onAuthStateChanged(listener: (user: CloudUser | null) => void): () => void;
}
