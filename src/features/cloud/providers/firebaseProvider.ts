// FirebaseProvider — the ONLY file in the app that imports the Firebase SDK.
//
// Everything above this file depends solely on the CloudProvider interfaces, so
// the rest of PrintPilot is unaware Firebase exists. Swapping to Supabase /
// Appwrite / Azure means writing a sibling provider and changing one line in the
// cloud bootstrap — no business-logic changes.
//
// This phase implements Google authentication only. Sync + storage remain
// stubbed (Phase 10: Google Drive Storage & Cloud Sync).
//
// SECURITY: auth persistence is IN-MEMORY on purpose (`inMemoryPersistence`), so
// the SDK never writes tokens to IndexedDB / localStorage / sessionStorage.
// Rotated id/refresh tokens are mirrored into the SecureTokenStorage abstraction
// instead, so a future keychain-backed implementation (Tauri Stronghold, OS
// Keychain, Windows Credential Manager, macOS Keychain, Linux Secret Service)
// can enable cross-restart session restore without any change above this file.

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  GoogleAuthProvider,
  browserPopupRedirectResolver,
  getAuth,
  inMemoryPersistence,
  initializeAuth,
  onAuthStateChanged,
  onIdTokenChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type Auth,
  type User
} from "firebase/auth";
import { CloudAuthError, NotImplementedError, type CloudUser } from "../cloudTypes";
import type { AuthenticationProvider } from "../auth/authProvider";
import type { AuthMethod, AuthMethodDescriptor } from "../auth/authTypes";
import type { SyncProvider, SyncPullResult, SyncPushResult } from "../sync/syncProvider";
import { InMemorySecureTokenStorage, type SecureTokenStorage, type StorageObject, type StorageProvider } from "../storage/storageProvider";
import type { CloudProvider, CloudProviderMetadata } from "./cloudProvider";

// Plain configuration shape (structurally compatible with FirebaseOptions) so
// the composition root can pass config without importing the Firebase SDK.
export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
}

const TOKEN_ID = "firebase.idToken";
const TOKEN_REFRESH = "firebase.refreshToken";

// --- Firebase → normalized model mapping -----------------------------------

function toIso(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? new Date().toISOString() : new Date(time).toISOString();
}

function mapAuthMethod(user: User): AuthMethod {
  const providerId = user.providerData[0]?.providerId ?? "";
  if (providerId.includes("google")) return "google";
  if (providerId.includes("microsoft")) return "microsoft";
  if (providerId.includes("github")) return "github";
  return "google";
}

// The single place a Firebase User becomes the app's provider-agnostic CloudUser.
function mapFirebaseUser(user: User): CloudUser {
  return {
    id: user.uid,
    displayName: user.displayName,
    email: user.email,
    avatarUrl: user.photoURL,
    provider: "firebase",
    authMethod: mapAuthMethod(user),
    createdAt: toIso(user.metadata.creationTime),
    lastLoginAt: toIso(user.metadata.lastSignInTime),
    lastSyncAt: null,
    syncStatus: "idle"
  };
}

// Firebase auth error codes → provider-agnostic, user-friendly CloudAuthError.
function mapFirebaseAuthError(error: unknown): CloudAuthError {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  switch (code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
    case "auth/user-cancelled":
      return new CloudAuthError("cancelled", "Sign-in was cancelled.");
    case "auth/popup-blocked":
      return new CloudAuthError("popup-blocked", "The sign-in window was blocked. Allow pop-ups and try again.");
    case "auth/network-request-failed":
      return new CloudAuthError("offline", "No internet connection. Check your network and try again.");
    case "auth/timeout":
      return new CloudAuthError("timeout", "Sign-in timed out. Please try again.");
    case "auth/invalid-api-key":
    case "auth/configuration-not-found":
    case "auth/operation-not-allowed":
      return new CloudAuthError("not-configured", "Google sign-in isn't configured for this app yet.");
    default:
      return new CloudAuthError("unknown", "Couldn't sign in. Please try again.");
  }
}

// --- Authentication --------------------------------------------------------

class FirebaseAuthProvider implements AuthenticationProvider {
  readonly supportedMethods: AuthMethodDescriptor[] = [
    { method: "google", label: "Google", available: true },
    { method: "microsoft", label: "Microsoft", available: false },
    { method: "github", label: "GitHub", available: false },
    { method: "sso", label: "Enterprise SSO", available: false }
  ];

  private readonly auth: Auth;
  private readonly tokens: SecureTokenStorage;
  private readonly ready: Promise<void>;
  private tokenUnsub: (() => void) | null = null;

  constructor(auth: Auth, tokens: SecureTokenStorage) {
    this.auth = auth;
    this.tokens = tokens;
    // Resolves once Firebase has reported its initial auth state — this is the
    // "silent sign-in" / session-restore signal.
    this.ready = new Promise((resolve) => {
      const unsub = onAuthStateChanged(
        this.auth,
        () => {
          unsub();
          resolve();
        },
        () => {
          unsub();
          resolve();
        }
      );
    });
  }

  async signIn(method: AuthMethod): Promise<CloudUser> {
    if (method !== "google") {
      throw new CloudAuthError("not-implemented", `Sign-in with "${method}" isn't available yet.`);
    }
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(this.auth, provider);
      return mapFirebaseUser(result.user);
    } catch (error) {
      throw mapFirebaseAuthError(error);
    }
  }

  async signOut(): Promise<void> {
    await firebaseSignOut(this.auth);
    await this.tokens.clear();
  }

  // Silent restore: returns the current session if Firebase has one, else null.
  async getCurrentUser(): Promise<CloudUser | null> {
    await this.ready;
    return this.auth.currentUser ? mapFirebaseUser(this.auth.currentUser) : null;
  }

  async getIdToken(forceRefresh = false): Promise<string | null> {
    const user = this.auth.currentUser;
    if (!user) return null;
    try {
      return await user.getIdToken(forceRefresh);
    } catch {
      return null;
    }
  }

  onAuthStateChanged(listener: (user: CloudUser | null) => void): () => void {
    return onAuthStateChanged(this.auth, (user) => listener(user ? mapFirebaseUser(user) : null));
  }

  // Mirror rotated tokens into SecureTokenStorage (never browser storage).
  startTokenSync(): void {
    if (this.tokenUnsub) return;
    this.tokenUnsub = onIdTokenChanged(this.auth, (user) => {
      void this.persistTokens(user);
    });
  }

  stopTokenSync(): void {
    this.tokenUnsub?.();
    this.tokenUnsub = null;
  }

  private async persistTokens(user: User | null): Promise<void> {
    if (!user) {
      await this.tokens.clear();
      return;
    }
    try {
      const idToken = await user.getIdToken();
      await this.tokens.setToken(TOKEN_ID, idToken);
      if (user.refreshToken) await this.tokens.setToken(TOKEN_REFRESH, user.refreshToken);
    } catch {
      // Best-effort — a failed token persist must never break authentication.
    }
  }
}

// --- Sync + Storage (still stubbed — Phase 10) -----------------------------

class FirebaseSyncProvider implements SyncProvider {
  async push(): Promise<SyncPushResult[]> {
    throw new NotImplementedError("Firestore push");
  }

  async pull(): Promise<SyncPullResult> {
    throw new NotImplementedError("Firestore pull");
  }

  subscribe(): () => void {
    return () => {};
  }
}

class FirebaseStorageProvider implements StorageProvider {
  async get(): Promise<StorageObject | null> {
    throw new NotImplementedError("Firebase Storage get");
  }

  async put(): Promise<void> {
    throw new NotImplementedError("Firebase Storage put");
  }

  async delete(): Promise<void> {
    throw new NotImplementedError("Firebase Storage delete");
  }

  async list(): Promise<string[]> {
    throw new NotImplementedError("Firebase Storage list");
  }
}

// --- Composite provider ----------------------------------------------------

export class FirebaseProvider implements CloudProvider {
  readonly metadata: CloudProviderMetadata;
  readonly auth: FirebaseAuthProvider;
  readonly sync: SyncProvider = new FirebaseSyncProvider();
  readonly storage: StorageProvider = new FirebaseStorageProvider();
  readonly tokens: SecureTokenStorage;
  private readonly app: FirebaseApp;

  constructor(config: FirebaseConfig, tokens: SecureTokenStorage = new InMemorySecureTokenStorage()) {
    this.tokens = tokens;
    // Idempotent across StrictMode remounts / HMR — reuse the default app if it
    // already exists rather than throwing "app already exists".
    this.app = getApps().length ? getApp() : initializeApp(config);
    this.auth = new FirebaseAuthProvider(resolveAuth(this.app), tokens);
    this.metadata = {
      id: "firebase",
      label: "Firebase",
      capabilities: { auth: true, sync: false, storage: false, realtime: false },
      configured: true
    };
  }

  async initialize(): Promise<void> {
    this.auth.startTokenSync();
  }

  async dispose(): Promise<void> {
    this.auth.stopTokenSync();
  }

  isConfigured(): boolean {
    return this.metadata.configured;
  }
}

// Initialize Auth with in-memory persistence + a popup resolver. Falls back to
// getAuth() if Auth was already initialized on this app (remount / HMR).
function resolveAuth(app: FirebaseApp): Auth {
  try {
    return initializeAuth(app, {
      persistence: inMemoryPersistence,
      popupRedirectResolver: browserPopupRedirectResolver
    });
  } catch {
    return getAuth(app);
  }
}
