# Firebase Staging Deployment Preparation

Status: prepared for manual staging setup. No Firebase resources have been deployed from this repository.

## Strategy

Use a separate Firebase staging project.

Recommended project and alias shape:

- Firebase project display name: PrintPilot Staging
- Firebase project ID: choose a unique ID such as `printpilot-staging`
- Firebase CLI alias: `staging`
- Production alias: `production`, only when a separate production project exists

Do not reuse production resources for staging. A separate project gives the cleanest isolation for Authentication users, Firestore documents, Storage objects, Functions logs, App Check settings, quotas, and emergency shutdown.

## Local Configuration

Copy `.firebaserc.example` to `.firebaserc` locally and replace placeholders with real project IDs. The committed deployment scripts fail if `.firebaserc` is missing or still contains placeholder values.

Copy `.env.example` to `.env.local` and fill only the staging Firebase web app configuration:

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_MEASUREMENT_ID=
```

Do not commit `.firebaserc`, `.env.local`, credentials, service-account keys, emulator exports, uploaded PDFs, or cloud caches.

## Safe Deploy Commands

These commands require a concrete local `.firebaserc` alias. They do not deploy to an implicit default project.

```bash
npm run firebase:deploy:staging:rules
npm run firebase:deploy:staging:indexes
npm run firebase:deploy:staging:functions
npm run firebase:deploy:staging
```

Production deployment is intentionally separate and requires:

```bash
PRINTPILOT_CONFIRM_PRODUCTION_DEPLOY=deploy-production npm run firebase:deploy:production
```

Do not run any deployment command until Firebase Console setup, billing status, App Check, and budget alerts have been reviewed.

## Spark and Blaze Notes

Current implementation uses:

- Firebase Authentication email/password
- Cloud Firestore
- Firebase Storage
- Cloud Functions for Firebase callable functions
- Firebase Emulator Suite
- Firebase App Check, planned but not wired in client code

Authentication email/password, Firestore, Storage, App Check, and emulators can be evaluated on no-cost tiers subject to current quotas. Cloud Functions for Firebase is not available on Spark in Firebase pricing, so live Functions deployment is expected to require Blaze eligibility. Do not enable Blaze or billing without explicit approval.

Official references to re-check immediately before deployment:

- Firebase pricing: https://firebase.google.com/pricing
- Firebase App Check: https://firebase.google.com/docs/app-check
- App Check web debug provider: https://firebase.google.com/docs/app-check/web/debug-provider
- Google Cloud budgets: https://cloud.google.com/billing/docs/how-to/budgets

## Expected Live Operations

Approximate operations for one new automatic PDF archive:

- Authentication: existing signed-in user token attached to callable requests.
- Functions: 2 callable invocations, `reservePdfArchive` and `finalizePdfArchive`.
- Firestore in reserve: reads quota and hash index; may read an existing document for duplicate states; writes quota, document metadata, and hash index for a new upload.
- Storage: 1 PDF upload.
- Firestore in finalize: reads document metadata; writes document status and quota accounting.
- Storage metadata: Functions reads object metadata to confirm byte size.

Approximate operations for duplicate archive:

- Functions: 1 callable invocation, `reservePdfArchive`.
- Firestore: reads quota/hash index and existing document; updates `lastOpenedAt` and `updatedAt` when the existing document is already synced.
- Storage: no upload.
- Quota: no additional used bytes.

Approximate operations for cloud open/download:

- Firestore: Cloud Documents list reads up to 200 owner-scoped documents plus quota.
- Storage: 1 signed download URL lookup and 1 PDF download.
- Rust/local cache: verifies SHA-256 before opening through the existing preview workflow.
- Firestore: `markOpened` updates timestamps.

Approximate operations for delete:

- Functions: 1 callable invocation, `deletePdfArchive`.
- Firestore: reads document metadata, deletes document metadata, deletes hash index, updates quota.
- Storage: deletes the object with ignore-not-found behavior.
- Repeat delete: 1 callable invocation and 1 document read; returns success without double accounting when metadata is absent.

Cost and abuse risks:

- A 500 MB upload can consume significant Storage bandwidth and quota even when app logic is correct.
- A 5 GB/user quota allows at most ten 500 MB documents per account before quota exhaustion.
- Downloads can create egress costs and are the largest abuse risk if accounts repeatedly open large PDFs.
- Automatic upload retries can amplify Storage and Functions usage unless client backoff and server-side rate limits are added.

## App Check

PrintPilot is a Tauri desktop app using Firebase's web SDK inside a webview. Standard web reCAPTCHA App Check is useful as a friction signal, but it should not be treated as strong native desktop attestation.

Staging approach:

- Register the Firebase web app for App Check.
- Use the web debug provider only for controlled staging machines.
- Keep debug tokens private and do not commit them.
- Do not enable enforcement until staging smoke tests prove token flow.

Production approach:

- Use App Check where practical, but pair it with server-side abuse controls.
- Keep Functions authenticated.
- Preserve owner checks in callable Functions.
- Add server-side rate limits before wider rollout.
- Monitor Storage, Firestore, and Functions usage.

## Budget and Abuse Protection

Recommended staging budget: low monthly alert-only budget, for example USD 5 to USD 10, after billing is explicitly approved. Google Cloud budgets alert but do not automatically cap usage or spending.

Recommended alert thresholds:

- 50 percent
- 90 percent
- 100 percent
- 150 percent

Before live staging:

- Confirm project is staging only.
- Confirm no production users or PDFs exist.
- Set Storage usage monitoring.
- Set Functions invocation and error monitoring.
- Set Firestore read/write/delete monitoring.
- Set egress monitoring.
- Limit the app to one automatic PDF upload per selected local file.
- Add exponential retry backoff before broader rollout.
- Add callable Function rate limits before production.
- Keep the 500 MB per-PDF and 5 GB per-user quota enforcement.

Emergency shutdown runbook:

1. Disable the Firebase web app config in local `.env.local` or remove staging env vars from CI.
2. Disable Authentication provider sign-in if needed.
3. Disable Storage writes by deploying deny-write rules.
4. Disable or delete callable Functions if abuse continues.
5. Review Storage objects, Firestore quota documents, and Functions logs before re-enabling.

## Manual Firebase Console Steps

1. Create a separate Firebase project named PrintPilot Staging.
2. Confirm the project remains on Spark unless billing is explicitly approved.
3. Add a web app and copy the web config into local `.env.local`.
4. Enable Email/Password Authentication.
5. Create a Firestore database in locked mode.
6. Create the default Storage bucket in a region appropriate for staging. Prefer a region with no-cost quota eligibility when using the newer `firebasestorage.app` bucket type.
7. Choose a Functions region before deploy. Current code uses the SDK default region unless changed.
8. Register App Check for the web app; use debug provider only for controlled staging machines.
9. If and only if Blaze is approved, create budget alerts before Functions deployment.
10. Run `firebase login` locally, then map aliases with `firebase use --add`.
11. Confirm `.firebaserc` contains staging and production aliases and is not committed.
12. Deploy rules first, then indexes, then Functions only if billing and eligibility are approved.

## Controlled Live Smoke Test

Do not run this test until manual staging setup is complete.

Account A:

1. Create Account A.
2. Sign in.
3. Open a small valid PDF.
4. Confirm local preview opens immediately.
5. Confirm local printing remains available.
6. Confirm automatic upload begins.
7. Confirm reserve function succeeds.
8. Confirm Storage object exists.
9. Confirm finalize succeeds.
10. Confirm metadata is synced.
11. Confirm quota is correct.
12. Restart app.
13. Confirm session restores.
14. Confirm Cloud Documents shows PDF.
15. Open cloud PDF.
16. Confirm checksum verification.
17. Confirm existing local preview workflow opens it.
18. Open same local PDF again.
19. Confirm deduplication.
20. Confirm quota is not charged twice.

Account B:

21. Create Account B.
22. Confirm Account B cannot see Account A PDF.
23. Confirm direct cross-user Firestore access is denied.
24. Confirm direct cross-user Storage access is denied.
25. Confirm callable cross-user operations are denied.

Failure:

26. Disable network during automatic upload.
27. Confirm local preview remains usable.
28. Confirm local printing remains available.
29. Confirm cloud failure state.
30. Restore network.
31. Retry.
32. Confirm upload completes without duplicate quota charge.

Delete:

33. Open cloud PDF.
34. Delete from Cloud Documents.
35. Confirm cloud object is removed.
36. Confirm metadata is removed.
37. Confirm hash index is removed.
38. Confirm quota is released once.
39. Confirm currently open PDF remains usable.
40. Repeat delete request where practical.
41. Confirm idempotent behavior.

Cross-Mac:

42. Upload a small PDF from Intel MacBook Pro.
43. Sign into the same account on Mac mini M4.
44. Confirm Cloud Documents shows PDF.
45. Download/open.
46. Confirm checksum verification.
47. Confirm existing preview workflow works.
48. Confirm local printing remains local.

## Deployment Blockers

- No authenticated Firebase CLI account was available during this audit.
- No `.firebaserc` project aliases are configured in the repository.
- Current live project, billing plan, App Check state, budget alerts, Auth provider state, Firestore database, Storage bucket, and Functions status could not be verified locally.
- Cloud Functions deployment should be treated as blocked until Blaze eligibility and budget alerts are explicitly approved.
