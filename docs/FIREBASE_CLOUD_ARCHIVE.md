# Firebase Cloud Archive

PrintPilot's authenticated cloud document archive uses:

- Firebase Authentication for email/password accounts.
- Cloud Firestore for private per-user document metadata and quota state.
- Firebase Storage for private PDF objects.
- Firebase Cloud Functions for trusted quota reservation, duplicate handling, finalization, and deletion accounting.

## Limits

- Maximum PDF size: 500 MB (`524,288,000` bytes).
- Per-user quota: 5 GB (`5,368,709,120` bytes).
- Deduplication scope: same authenticated user + same SHA-256.
- Cross-user deduplication is intentionally not used and is not exposed.

## Cost and Billing

Automatic upload can incur Firebase Authentication, Firestore document reads/writes, Storage bytes, Storage egress, and Cloud Functions invocations. Cloud Functions for Firebase generally require a Blaze/pay-as-you-go Firebase project.

Do not enable billing or deploy paid resources without explicit approval. Before production deployment:

- enable Firebase budget alerts;
- review Storage lifecycle/retention policy;
- consider App Check and abuse protections;
- run emulator security-rules tests;
- run a quota-exceeded fixture test.

## Deployment Files

- `firebase.json`
- `firestore.rules`
- `storage.rules`
- `firestore.indexes.json`
- `functions/src/index.ts`

## Local Emulator Plan

Install Firebase CLI before running the emulators:

```bash
cd functions
npm install
npm run build
cd ..
firebase emulators:start
```

The desktop app requires `VITE_FIREBASE_*` configuration values. The app does not commit Firebase secrets or service-account keys.

## Verification Status

Local implementation verification passed:

- root TypeScript no-emit build;
- root ESLint;
- Vite production build;
- Rust `cargo check`;
- Rust `cargo test`;
- Firebase Functions TypeScript build.

`npm audit --prefix functions --audit-level=high` passes the high-severity gate but reports moderate transitive `uuid` advisories through the Firebase Admin dependency graph. npm's automatic fix currently requires `firebase-admin@14`, while the latest Firebase Functions SDK peer range supports Firebase Admin through v13. Keep the peer-compatible dependency set until Firebase Functions supports the newer Admin line.

## Recovery Notes

The trusted functions use Firestore transactions for reservation/finalization/deletion accounting. Deferred production hardening remains:

- scheduled cleanup for stale `uploading` reservations;
- resumable native streaming upload through signed URLs;
- App Check enforcement;
- full emulator security-rules test suite in CI.
- production billing and budget-alert setup before deployment.
