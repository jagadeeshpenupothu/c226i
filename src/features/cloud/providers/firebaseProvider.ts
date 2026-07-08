// FirebaseProvider is the only app file that imports Firebase SDK modules.

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  createUserWithEmailAndPassword,
  getAuth,
  initializeAuth,
  onAuthStateChanged,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type Auth,
  type User
} from "firebase/auth";
import { collection, doc, getDoc, getDocs, getFirestore, limit, orderBy, query, serverTimestamp, updateDoc, where, type Firestore, type Timestamp } from "firebase/firestore";
import { getFunctions, httpsCallable, type Functions } from "firebase/functions";
import { deleteObject, getDownloadURL, getStorage, ref, uploadBytesResumable, type FirebaseStorage } from "firebase/storage";
import { CloudAuthError, NotImplementedError, type CloudUser } from "../cloudTypes";
import type { AuthenticationProvider } from "../auth/authProvider";
import type { AuthMethod, AuthMethodDescriptor, EmailPasswordCredentials } from "../auth/authTypes";
import type { SyncProvider, SyncPullResult, SyncPushResult } from "../sync/syncProvider";
import { CLOUD_USER_QUOTA_BYTES } from "../documents/constants";
import type { CloudDocumentProvider } from "../documents/cloudDocumentProvider";
import type { CloudDocument, CloudDocumentLibrarySnapshot, CloudQuotaSnapshot, CloudReservationResult } from "../documents/documentTypes";
import { InMemorySecureTokenStorage, type SecureTokenStorage, type StorageObject, type StorageProvider } from "../storage/storageProvider";
import type { CloudProvider, CloudProviderMetadata } from "./cloudProvider";

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

function toIso(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? new Date().toISOString() : new Date(time).toISOString();
}

function mapAuthMethod(user: User): AuthMethod {
  const providerId = user.providerData[0]?.providerId ?? "";
  if (providerId.includes("password")) return "email";
  return "email";
}

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

function mapFirebaseAuthError(error: unknown): CloudAuthError {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  switch (code) {
    case "auth/network-request-failed":
      return new CloudAuthError("offline", "No internet connection. Check your network and try again.");
    case "auth/invalid-api-key":
    case "auth/configuration-not-found":
    case "auth/operation-not-allowed":
      return new CloudAuthError("not-configured", "Email/password sign-in is not configured for this app yet.");
    case "auth/email-already-in-use":
      return new CloudAuthError("conflict", "An account already exists for this email.");
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return new CloudAuthError("unauthenticated", "Email or password is incorrect.");
    case "auth/weak-password":
      return new CloudAuthError("unknown", "Use a stronger password.");
    case "auth/invalid-email":
      return new CloudAuthError("unknown", "Enter a valid email address.");
    default:
      return new CloudAuthError("unknown", "Authentication failed. Please try again.");
  }
}

class FirebaseAuthProvider implements AuthenticationProvider {
  readonly supportedMethods: AuthMethodDescriptor[] = [
    { method: "email", label: "Email", available: true },
    { method: "google", label: "Google", available: false },
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
    if (method !== "email") {
      throw new CloudAuthError("not-implemented", `Sign-in with "${method}" is not available.`);
    }
    throw new CloudAuthError("not-implemented", "Use email/password sign-in.");
  }

  async signInWithEmail({ email, password }: EmailPasswordCredentials): Promise<CloudUser> {
    try {
      const result = await signInWithEmailAndPassword(this.auth, email.trim(), password);
      return mapFirebaseUser(result.user);
    } catch (error) {
      throw mapFirebaseAuthError(error);
    }
  }

  async signUpWithEmail({ email, password }: EmailPasswordCredentials): Promise<CloudUser> {
    try {
      const result = await createUserWithEmailAndPassword(this.auth, email.trim(), password);
      return mapFirebaseUser(result.user);
    } catch (error) {
      throw mapFirebaseAuthError(error);
    }
  }

  async signOut(): Promise<void> {
    await firebaseSignOut(this.auth);
    await this.tokens.clear();
  }

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
      // Token mirroring is best-effort and never logged.
    }
  }
}

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

function timestampToIso(value: unknown): string {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return (value as Timestamp).toDate().toISOString();
  }
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

function mapCloudDocument(data: Record<string, unknown>, documentId: string): CloudDocument {
  return {
    schemaVersion: Number(data.schemaVersion || 1),
    documentId,
    ownerUid: String(data.ownerUid || ""),
    sha256: String(data.sha256 || ""),
    originalFileName: String(data.originalFileName || "Document.pdf"),
    displayName: String(data.displayName || data.originalFileName || "Document.pdf"),
    contentType: "application/pdf",
    byteSize: Number(data.byteSize || 0),
    pageCount: typeof data.pageCount === "number" ? data.pageCount : null,
    storagePath: String(data.storagePath || ""),
    status: (data.status as CloudDocument["status"]) || "synced",
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
    lastOpenedAt: data.lastOpenedAt ? timestampToIso(data.lastOpenedAt) : null
  };
}

class FirebaseCloudDocumentProvider implements CloudDocumentProvider {
  private readonly db: Firestore;
  private readonly storage: FirebaseStorage;
  private readonly functions: Functions;

  constructor(app: FirebaseApp) {
    this.db = getFirestore(app);
    this.storage = getStorage(app);
    this.functions = getFunctions(app);
  }

  async listDocuments(ownerUid: string): Promise<CloudDocumentLibrarySnapshot> {
    const documentsQuery = query(
      collection(this.db, "users", ownerUid, "documents"),
      where("ownerUid", "==", ownerUid),
      orderBy("updatedAt", "desc"),
      limit(200)
    );
    const [snapshot, quota] = await Promise.all([getDocs(documentsQuery), this.getStorageUsage(ownerUid)]);
    return {
      documents: snapshot.docs.map((entry) => mapCloudDocument(entry.data(), entry.id)),
      quota
    };
  }

  async getStorageUsage(ownerUid: string): Promise<CloudQuotaSnapshot> {
    const snapshot = await getDoc(doc(this.db, "users", ownerUid, "account", "quota"));
    const data = snapshot.exists() ? snapshot.data() : {};
    return {
      usedBytes: Number(data.usedBytes || 0),
      quotaBytes: Number(data.quotaBytes || CLOUD_USER_QUOTA_BYTES),
      reservedBytes: Number(data.reservedBytes || 0)
    };
  }

  async reserveUpload(input: Parameters<CloudDocumentProvider["reserveUpload"]>[0]): Promise<CloudReservationResult> {
    const callable = httpsCallable<typeof input, CloudReservationResult>(this.functions, "reservePdfArchive");
    const result = await callable(input);
    return result.data;
  }

  async uploadPdf({ storagePath, file, onProgress }: Parameters<CloudDocumentProvider["uploadPdf"]>[0]): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const task = uploadBytesResumable(ref(this.storage, storagePath), file, {
        contentType: "application/pdf",
        customMetadata: { printpilotContent: "pdf" }
      });
      task.on(
        "state_changed",
        (snapshot) => onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)),
        reject,
        () => resolve()
      );
    });
  }

  async finalizeUpload(input: Parameters<CloudDocumentProvider["finalizeUpload"]>[0]): Promise<CloudDocument> {
    const callable = httpsCallable<typeof input, CloudDocument>(this.functions, "finalizePdfArchive");
    const result = await callable(input);
    return result.data;
  }

  async getDownloadUrl(document: CloudDocument): Promise<string> {
    return getDownloadURL(ref(this.storage, document.storagePath));
  }

  async markOpened(ownerUid: string, documentId: string): Promise<void> {
    await updateDoc(doc(this.db, "users", ownerUid, "documents", documentId), {
      lastOpenedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  async deleteDocument(ownerUid: string, document: CloudDocument): Promise<void> {
    const callable = httpsCallable<{ ownerUid: string; documentId: string }, { ok: true }>(this.functions, "deletePdfArchive");
    await callable({ ownerUid, documentId: document.documentId });
    try {
      await deleteObject(ref(this.storage, document.storagePath));
    } catch {
      // Server-side function owns consistency and cleanup.
    }
  }
}

export class FirebaseProvider implements CloudProvider {
  readonly metadata: CloudProviderMetadata;
  readonly auth: FirebaseAuthProvider;
  readonly sync: SyncProvider = new FirebaseSyncProvider();
  readonly storage: StorageProvider = new FirebaseStorageProvider();
  readonly documents: CloudDocumentProvider;
  readonly tokens: SecureTokenStorage;
  private readonly app: FirebaseApp;

  constructor(config: FirebaseConfig, tokens: SecureTokenStorage = new InMemorySecureTokenStorage()) {
    this.tokens = tokens;
    this.app = getApps().length ? getApp() : initializeApp(config);
    this.auth = new FirebaseAuthProvider(resolveAuth(this.app), tokens);
    this.documents = new FirebaseCloudDocumentProvider(this.app);
    this.metadata = {
      id: "firebase",
      label: "Firebase",
      capabilities: { auth: true, sync: true, storage: true, realtime: false },
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

function resolveAuth(app: FirebaseApp): Auth {
  try {
    return initializeAuth(app, {
      persistence: browserLocalPersistence,
      popupRedirectResolver: browserPopupRedirectResolver
    });
  } catch {
    return getAuth(app);
  }
}
