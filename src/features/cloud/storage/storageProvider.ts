// Storage abstractions.
//
// Two separate concerns, deliberately split so a backend can implement one
// without the other:
//   1. StorageProvider     — remote object/blob/document storage.
//   2. SecureTokenStorage  — where auth tokens live (NEVER localStorage).

// --- Remote object storage -------------------------------------------------

export interface StorageObject {
  contentType: string;
  data: Uint8Array | string;
  metadata?: Record<string, string>;
}

export interface StorageProvider {
  get(path: string): Promise<StorageObject | null>;
  put(path: string, data: StorageObject): Promise<void>;
  delete(path: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

// --- Secure token storage --------------------------------------------------
//
// SECURITY: auth tokens MUST NOT be placed in localStorage / sessionStorage —
// both are readable by any injected script (XSS). This interface is the single
// approved home for tokens. The production implementation targets the OS
// keychain via a Tauri secure-store plugin (e.g. Stronghold / keyring). No token
// logic exists in this phase — only the contract.
export interface SecureTokenStorage {
  getToken(key: string): Promise<string | null>;
  setToken(key: string, value: string): Promise<void>;
  deleteToken(key: string): Promise<void>;
  clear(): Promise<void>;
}

// Ephemeral, in-memory fallback used until the OS-backed store is wired. Tokens
// live only for the session and are intentionally NOT persisted anywhere — this
// exists so the abstraction is usable in dev/tests without ever touching
// localStorage. Do not ship real credentials through this in production.
export class InMemorySecureTokenStorage implements SecureTokenStorage {
  private readonly tokens = new Map<string, string>();

  async getToken(key: string): Promise<string | null> {
    return this.tokens.get(key) ?? null;
  }

  async setToken(key: string, value: string): Promise<void> {
    this.tokens.set(key, value);
  }

  async deleteToken(key: string): Promise<void> {
    this.tokens.delete(key);
  }

  async clear(): Promise<void> {
    this.tokens.clear();
  }
}
