# PrintPilot — Cloud Architecture (Phase 8: Cloud Foundation)

> Status: **architecture only.** No Firebase SDK, no Firestore, no OAuth, no auth
> UI, no realtime listeners, no API keys. This phase builds the abstraction layer
> that a concrete backend plugs into. PrintPilot continues to function exactly as
> before — fully local and offline-first.

---

## 1. Overall architecture

PrintPilot is moving from a local-only desktop app to an **offline-first,
cloud-enabled** app. The design goal is a hard rule:

> **No business logic knows which cloud provider is used.**

Everything is expressed in terms of **provider interfaces**. The concrete backend
(Firebase today; Supabase / Appwrite / Azure / a custom backend tomorrow) is
selected once, at the edge, and injected into the `cloudManager`. Nothing above
that line imports a vendor SDK.

```
        ┌──────────────────────────────────────────────────────────┐
        │                    Business logic / UI                    │
        │   (profiles, settings, jobs, printers … unchanged)        │
        └───────────────┬──────────────────────────────────────────┘
                        │  depends ONLY on interfaces + cloudManager
                        ▼
        ┌──────────────────────────────────────────────────────────┐
        │                       cloudManager                        │
        │  orchestration surface — the one thing the app calls      │
        │  • initialize / dispose      • recordChange (local-first) │
        │  • signIn / signOut          • pause / resume sync        │
        │  • registerProvider          • conflict strategy          │
        └───┬───────────┬───────────┬───────────┬──────────────┬────┘
            ▼           ▼           ▼           ▼              ▼
      cloudStore   networkMonitor  syncQueue  conflictResolver  CloudProvider
      (reactive)   (online/offline)(durable)  (strategy stub)   (interface)
                                                                    │
                                          ┌─────────────────────────┘
                                          ▼
                        ┌───────────────────────────────────────┐
                        │  CloudProvider (composite interface)   │
                        │   auth  ·  sync  ·  storage  ·  tokens │
                        └───────────────────────────────────────┘
                                          ▲
                     implemented by  ┌────┴─────┬──────────┬─────────┐
                                     │ Firebase │ Supabase │  Azure  │ …
                                     │ (stub)   │ (future) │(future) │
                                     └──────────┴──────────┴─────────┘
```

**Feature location:** `src/features/cloud/`

```
cloud/
  cloudTypes.ts            core models (CloudUser, CloudState, CloudResult, errors)
  cloudStore.ts            reactive snapshot (useSyncExternalStore)
  cloudManager.ts          orchestration surface (the only thing app code calls)
  index.ts                 public barrel
  providers/
    cloudProvider.ts       CloudProvider composite interface + metadata
    firebaseProvider.ts    STUB — no SDK, typed non-fatal errors
  auth/
    authProvider.ts        AuthenticationProvider interface
    authTypes.ts           AuthMethod, AuthState, AuthSession
  sync/
    syncProvider.ts        SyncProvider interface (push/pull/subscribe)
    syncTypes.ts           SyncState, SyncStatus, SyncOperation
  storage/
    storageProvider.ts     StorageProvider + SecureTokenStorage (+ in-memory stub)
  network/
    networkMonitor.ts      reusable online/offline observable
  queue/
    syncQueue.ts           durable, offline-first operation queue
  conflict/
    conflictResolver.ts    strategy enum + resolver skeleton (no logic yet)
  hooks/
    useCloud.ts            useCloudState / useSyncState / useNetworkStatus …
  components/
    CloudStatusBadge.tsx   presentational status pill (not mounted yet)
```

---

## 2. Authentication flow (prepared, not implemented)

Authentication is fully abstracted behind `AuthenticationProvider`. The app never
touches Google OAuth, Firebase Auth, or tokens directly.

```
UI ──► cloudManager.signIn(method)
             │
             ▼
       CloudProvider.auth.signIn(method)     ← concrete provider (Phase 9)
             │
             ├─ opens the provider's OAuth flow          (future)
             ├─ receives tokens                          (future)
             ├─ stores tokens in SecureTokenStorage      (never localStorage)
             └─ returns a normalized CloudUser
             │
             ▼
       cloudStore.update({ user })  ──►  hooks re-render
```

- `signIn` / `signOut` return a **`CloudResult<T>`** (never throw into business
  logic). With no provider registered they return `{ ok: false, code:
  "not-configured" }`.
- `AuthMethod` already enumerates `google` (Phase 9), `microsoft`, `github`,
  `sso`, `password` — the future logins named in the spec.
- `onAuthStateChanged` is the seam for multi-device / multi-tab session changes.
- **Tokens** are never held in app state or localStorage — see §Security.

---

## 3. Sync flow (prepared, not implemented)

Sync is **local-first**. The order is always: *write locally → record intent →
(later) replay to cloud.*

```
1. User edits a profile.
2. Local store writes immediately  ──►  UI updates. (source of truth)
3. cloudManager.recordChange({ entity:"profile", type:"update", … })
      └─ syncQueue.enqueue(op)  ── persisted locally (survives restart / offline)
4. (FUTURE) drain loop, when online + authenticated:
      └─ SyncProvider.push([ops]) ─► per-op result: applied | conflict | rejected
            ├─ applied  → syncQueue.markDone(op)
            ├─ conflict → conflictResolver.resolve(...)   (see §5)
            └─ rejected → syncQueue.markFailed(op, err)   → retry w/ backoff
5. (FUTURE) SyncProvider.subscribe(entity) streams remote changes for
   reconciliation — never blindly overwriting local.
```

Nothing in steps 4–5 exists yet. Today `recordChange` simply persists to the
queue and returns; **no operation is ever sent anywhere.**

`SyncState` (surfaced to the UI): `online · offline · syncing · idle · waiting ·
failed · conflict`, plus `lastSyncTime`, `pendingOperations`, `retryCount`,
`paused`.

---

## 4. Offline-first strategy

The non-negotiable invariants:

1. **Local is always the source of truth.** The cloud is a replica, never the
   authority. Reconciliation may inform local state but never silently replaces
   it — divergence goes through the ConflictResolver.
2. **Every operation writes locally first.** `recordChange()` is called *after*
   the local write already succeeded; it never gates or blocks it.
3. **The queue is durable.** Pending operations persist to local storage so they
   survive restarts and long offline periods, then flush when connectivity and
   auth return.
4. **The app is fully functional offline.** With no provider/user (the current
   default), the cloud layer is inert — the app behaves exactly as it did before
   Phase 8.
5. **The network monitor** distinguishes "has connectivity" now and, via the
   `reconnect()` seam, "cloud is actually reachable" later.

---

## 5. Conflict resolution strategy (prepared, not implemented)

`conflict/conflictResolver.ts` defines the contract and a skeleton resolver.
**No merge logic is implemented** — every branch returns `{ resolution:
"deferred" }` so nothing is ever silently lost.

Planned strategies (each a defined extension point):

| Strategy            | Behavior (future)                                              |
| ------------------- | ------------------------------------------------------------- |
| `lastWriteWins`     | Compare `updatedAt`; keep the newer write.                    |
| `versionComparison` | Compare version vectors; fast-forward if one dominates.       |
| `manualMerge`       | Field-level three-way merge against a common ancestor.        |
| `userPrompt`        | Surface a resolution dialog and await the user's choice.      |

Each `SyncOperation` already carries a `baseVersion` so conflicts can be detected
(local base vs. remote version) the moment sync is implemented.

---

## 6. Provider abstraction

`CloudProvider` is a **composite** of four focused interfaces so a backend can
implement them independently:

| Interface                | Responsibility                                             |
| ------------------------ | ---------------------------------------------------------- |
| `AuthenticationProvider` | sign-in/out, current user, id token, auth-state changes    |
| `SyncProvider`           | `push` queued ops, `pull` remote state, `subscribe` (RT)   |
| `StorageProvider`        | remote object/blob/document storage                        |
| `SecureTokenStorage`     | where auth tokens live (OS keychain; never localStorage)   |

`FirebaseProvider` is the **current, stubbed** implementation — it imports no SDK,
makes no network calls, and reports `configured: false`. Swapping to a different
backend means writing a new `CloudProvider` and calling
`cloudManager.registerProvider(...)`. **Zero business-logic changes.**

### Network monitoring

`networkMonitor` is a standalone, reusable observable over `navigator.onLine` +
the `online`/`offline` events. It exposes `getStatus()`, `isOnline()`,
`subscribe()`, `start()/stop()` (idempotent), and `reconnect()` — the seam for
future active reachability polling (a heartbeat to a health endpoint).

### Sync queue

`syncQueue` is a durable, offline-first queue. Each entry is a `SyncOperation`
(`create | update | delete | rename | favorite` on an entity). It supports
**retry** (with a max-retries dead-letter), **pause/resume**, **offline
durability** (localStorage persistence), and **conflict flagging**. It is
observable (`useSyncQueue()`), and nothing drains it in this phase.

### Security — secure token storage

- `SecureTokenStorage` is the **single approved home for auth tokens**.
- Tokens **must never** be placed in `localStorage`/`sessionStorage` (XSS-
  readable). The queue persists operations there, but **never credentials**.
- Production target: the OS keychain via a Tauri secure-store plugin (Stronghold
  / keyring). `InMemorySecureTokenStorage` is an ephemeral dev/test fallback that
  persists nothing.
- No OAuth, token exchange, API keys, or Firebase config exist in this phase.

---

## 7. Future roadmap

| Phase | Deliverable                                                              |
| ----- | ----------------------------------------------------------------------- |
| **9** | **Google Authentication & Firebase Integration** — real `FirebaseProvider`: `initializeApp`, Google sign-in, session restore, id tokens in the OS keychain. |
| 10    | Firestore sync: implement `SyncProvider.push/pull`, the queue drain loop, backoff, and the real conflict strategies. |
| 11    | Realtime listeners (`subscribe`) + multi-device reconciliation.         |
| 12    | Microsoft / GitHub / Enterprise SSO logins (already in `AuthMethod`).   |
| 13    | Subscriptions & organizations (fields already reserved on `CloudUser`). |

### How Phase 9 plugs in (no business-logic changes)

```ts
// composition root, e.g. in App bootstrap
import { cloudManager, FirebaseProvider } from "@/features/cloud";

const firebase = new FirebaseProvider(/* real config */); // configured: true
cloudManager.registerProvider(firebase);
await cloudManager.initialize();
// UI already reads useCloudState()/useSyncState(); sign-in uses cloudManager.signIn("google")
```

---

## Guarantees delivered by this phase

- ✅ Complete, provider-agnostic cloud architecture.
- ✅ Firebase can be plugged in without modifying existing business logic.
- ✅ Local-first architecture intact; app behaves exactly as before.
- ✅ Every cloud feature has a defined extension point.
- ✅ Ready for Google Authentication in the next phase.
