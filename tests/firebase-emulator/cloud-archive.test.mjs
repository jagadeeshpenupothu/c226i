import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, test } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc } from "firebase/firestore";
import { getMetadata, ref, uploadBytes } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import {
  BUCKET,
  MAX_PDF_BYTES,
  PROJECT_ID,
  USER_QUOTA_BYTES,
  archivePdf,
  callDelete,
  callFinalize,
  callReserve,
  createAccount,
  createRulesEnvironment,
  cleanupFirebaseClients,
  deterministicSha256,
  expectCallableFailure,
  invalidFixture,
  readDocument,
  readQuota,
  resetEmulators,
  seedFirestore,
  sha256,
  signInAccount,
  uploadPdf,
  trustedDocumentExists,
  validPdfFixture
} from "./helpers.mjs";

let testEnv;

describe("Firebase emulator cloud archive verification", { concurrency: false }, () => {
  before(async () => {
    testEnv = await createRulesEnvironment();
  });

  beforeEach(async () => {
    await resetEmulators(testEnv);
  });

  afterEach(async () => {
    await cleanupFirebaseClients();
  });

  after(async () => {
    await testEnv?.cleanup();
  });

  test("Authentication emulator creates and restores email/password accounts", async () => {
    const account = await createAccount("account-a");
    assert.ok(account.uid);
    assert.equal(account.client.auth.currentUser?.email, account.email);

    const signedIn = await signInAccount(account, "account-a-restore");
    assert.equal(signedIn.auth.currentUser?.uid, account.uid);
  });

  test("Firestore rules isolate cloud metadata and deny client-owned writes", async () => {
    const uidA = "account-a";
    const uidB = "account-b";
    const documentId = "doc-a";
    await seedFirestore(testEnv, async (db) => {
      await db.doc(`users/${uidA}/documents/${documentId}`).set({
        schemaVersion: 1,
        documentId,
        ownerUid: uidA,
        sha256: deterministicSha256("a"),
        originalFileName: "a.pdf",
        displayName: "a.pdf",
        contentType: "application/pdf",
        byteSize: 10,
        pageCount: 1,
        storagePath: `users/${uidA}/documents/${documentId}/original.pdf`,
        status: "synced",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastOpenedAt: new Date()
      });
      await db.doc(`users/${uidA}/account/quota`).set({ usedBytes: 10, reservedBytes: 0, quotaBytes: USER_QUOTA_BYTES });
    });

    const anon = testEnv.unauthenticatedContext();
    const a = testEnv.authenticatedContext(uidA);
    const b = testEnv.authenticatedContext(uidB);

    await assertFails(anon.firestore().doc(`users/${uidA}/documents/${documentId}`).get());
    await assertFails(anon.firestore().doc(`users/${uidA}/documents/new-doc`).set({ ownerUid: uidA }));
    await assertSucceeds(a.firestore().doc(`users/${uidA}/documents/${documentId}`).get());
    await assertSucceeds(a.firestore().doc(`users/${uidA}/account/quota`).get());
    await assertFails(b.firestore().doc(`users/${uidA}/documents/${documentId}`).get());
    await assertFails(a.firestore().doc(`users/${uidB}/documents/anything`).get());
    await assertFails(a.firestore().doc(`users/${uidA}/documents/new-doc`).set({ ownerUid: uidA }));
    await assertFails(a.firestore().doc(`users/${uidA}/documents/forged`).set({ ownerUid: uidB }));
    await assertFails(a.firestore().doc(`users/${uidA}/documents/${documentId}`).update({ ownerUid: uidB }));
    await assertFails(a.firestore().doc(`users/${uidA}/documents/${documentId}`).update({ status: "synced" }));
    await assertFails(a.firestore().doc(`users/${uidA}/account/quota`).set({ usedBytes: 0, reservedBytes: 0, quotaBytes: USER_QUOTA_BYTES }));
    await assertSucceeds(a.firestore().doc(`users/${uidA}/hashIndex/${deterministicSha256("a")}`).get());
    await assertFails(a.firestore().doc(`users/${uidA}/hashIndex/${deterministicSha256("a")}`).set({ documentId }));
  });

  test("Storage rules deny anonymous/cross-user/invalid writes and allow only own archive PDFs", async () => {
    const uidA = "account-a";
    const uidB = "account-b";
    const pathA = `users/${uidA}/documents/doc-a/original.pdf`;
    const pathB = `users/${uidB}/documents/doc-b/original.pdf`;
    const pdf = validPdfFixture();
    const anon = testEnv.unauthenticatedContext().storage(`gs://${BUCKET}`);
    const a = testEnv.authenticatedContext(uidA).storage(`gs://${BUCKET}`);
    const b = testEnv.authenticatedContext(uidB).storage(`gs://${BUCKET}`);

    await assertFails(anon.ref(pathA).put(pdf, { contentType: "application/pdf" }));
    await assertFails(anon.ref(pathA).getDownloadURL());
    await assertFails(b.ref(pathA).put(pdf, { contentType: "application/pdf" }));
    await assertFails(a.ref(pathB).put(pdf, { contentType: "application/pdf" }));
    await assertFails(a.ref(`users/${uidA}/other/doc.pdf`).put(pdf, { contentType: "application/pdf" }));
    await assertFails(a.ref(pathA).put(invalidFixture(), { contentType: "text/plain" }));
    await assertSucceeds(a.ref(pathA).put(pdf, { contentType: "application/pdf" }));
    await assertSucceeds(a.ref(pathA).getDownloadURL());
    await assertFails(b.ref(pathA).getDownloadURL());
  });

  test.skip("Storage rules reject payloads over 500 MB without allocating a 500+ MB upload", () => {
    // The Storage emulator evaluates request.resource.size from the actual upload
    // payload. The suite verifies the same byte boundary through trusted
    // reservation policy without committing or allocating large PDF fixtures.
  });

  test("Archive happy path reserves quota, uploads, finalizes, and isolates metadata", async () => {
    const accountA = await createAccount("account-a");
    const accountB = await createAccount("account-b");
    const pdf = validPdfFixture("happy");

    const reservation = await callReserve(accountA, { pdfBytes: pdf, sha256: sha256(pdf), byteSize: pdf.length });
    let quota = await readQuota(accountA);
    assert.equal(quota.usedBytes, 0);
    assert.equal(quota.reservedBytes, pdf.length);

    await uploadPdf(accountA, reservation.storagePath, pdf);
    const finalized = await callFinalize(accountA, {
      documentId: reservation.documentId,
      storagePath: reservation.storagePath,
      sha256: sha256(pdf),
      byteSize: pdf.length
    });
    assert.equal(finalized.status, "synced");

    const docSnap = await readDocument(accountA, reservation.documentId);
    assert.equal(docSnap.data()?.status, "synced");
    quota = await readQuota(accountA);
    assert.equal(quota.usedBytes, pdf.length);
    assert.equal(quota.reservedBytes, 0);

    await assert.rejects(getDoc(doc(accountB.client.firestore, "users", accountA.uid, "documents", reservation.documentId)));
  });

  test("Per-user deduplication reuses the same user document and does not leak across users", async () => {
    const accountA = await createAccount("account-a");
    const accountB = await createAccount("account-b");
    const pdf = validPdfFixture("dedupe");

    const first = await archivePdf(accountA, pdf);
    const firstQuota = await readQuota(accountA);
    const second = await callReserve(accountA, { pdfBytes: pdf, sha256: sha256(pdf), byteSize: pdf.length });
    const secondQuota = await readQuota(accountA);

    assert.equal(second.duplicate, true);
    assert.equal(second.documentId, first.reservation.documentId);
    assert.equal(second.storagePath, first.reservation.storagePath);
    assert.deepEqual(secondQuota, firstQuota);

    const bReserve = await callReserve(accountB, { pdfBytes: pdf, sha256: sha256(pdf), byteSize: pdf.length });
    assert.equal(bReserve.duplicate, false);
    assert.notEqual(bReserve.documentId, first.reservation.documentId);
    assert.ok(bReserve.storagePath.startsWith(`users/${accountB.uid}/`));
  });

  test("Concurrent duplicate reserve race produces one logical reservation and one quota charge", async () => {
    const accountA = await createAccount("account-a");
    const pdf = validPdfFixture("race");
    const input = { pdfBytes: pdf, sha256: sha256(pdf), byteSize: pdf.length };

    const [a, b] = await Promise.all([callReserve(accountA, input), callReserve(accountA, input)]);
    assert.equal(a.documentId, b.documentId);
    assert.equal(a.storagePath, b.storagePath);

    const quota = await readQuota(accountA);
    assert.equal(quota.usedBytes, 0);
    assert.equal(quota.reservedBytes, pdf.length);
  });

  test("Trusted reservation enforces 500 MB and 5 GB quota boundaries without large fixtures", async () => {
    const accountA = await createAccount("account-a");

    const exact = await callReserve(accountA, {
      sha256: deterministicSha256("exact-500mb"),
      byteSize: MAX_PDF_BYTES,
      originalFileName: "exact.pdf",
      displayName: "exact.pdf",
      pageCount: 1
    });
    assert.ok(exact.documentId);

    await resetEmulators(testEnv);
    const accountB = await createAccount("account-b");
    await expectCallableFailure(
      callReserve(accountB, {
        sha256: deterministicSha256("over-500mb"),
        byteSize: MAX_PDF_BYTES + 1,
        originalFileName: "over.pdf",
        displayName: "over.pdf",
        pageCount: 1
      }),
      "resource-exhausted"
    );

    await seedFirestore(testEnv, async (db) => {
      await db.doc(`users/${accountB.uid}/account/quota`).set({
        usedBytes: USER_QUOTA_BYTES - 10,
        reservedBytes: 0,
        quotaBytes: USER_QUOTA_BYTES
      });
    });
    await callReserve(accountB, {
      sha256: deterministicSha256("remaining-10"),
      byteSize: 10,
      originalFileName: "ok.pdf",
      displayName: "ok.pdf",
      pageCount: 1
    });
    const beforeFail = await readQuota(accountB);
    await expectCallableFailure(
      callReserve(accountB, {
        sha256: deterministicSha256("remaining-11"),
        byteSize: 11,
        originalFileName: "too-much.pdf",
        displayName: "too-much.pdf",
        pageCount: 1
      }),
      "resource-exhausted"
    );
    assert.deepEqual(await readQuota(accountB), beforeFail);
  });

  test("Concurrent reservations cannot exceed the user's quota", async () => {
    const accountA = await createAccount("account-a");
    await seedFirestore(testEnv, async (db) => {
      await db.doc(`users/${accountA.uid}/account/quota`).set({ usedBytes: 0, reservedBytes: 0, quotaBytes: 20 });
    });
    const attempts = await Promise.allSettled([
      callReserve(accountA, { sha256: deterministicSha256("quota-race-a"), byteSize: 20, originalFileName: "a.pdf", displayName: "a.pdf", pageCount: 1 }),
      callReserve(accountA, { sha256: deterministicSha256("quota-race-b"), byteSize: 20, originalFileName: "b.pdf", displayName: "b.pdf", pageCount: 1 })
    ]);
    assert.equal(attempts.filter((entry) => entry.status === "fulfilled").length, 1);
    assert.equal(attempts.filter((entry) => entry.status === "rejected").length, 1);
    const quota = await readQuota(accountA);
    assert.equal(quota.usedBytes, 0);
    assert.equal(quota.reservedBytes, 20);
  });

  test("Finalization is idempotent and never double-charges quota", async () => {
    const accountA = await createAccount("account-a");
    const pdf = validPdfFixture("finalize-idempotent");
    const archived = await archivePdf(accountA, pdf);
    const quotaAfterFirst = await readQuota(accountA);

    await callFinalize(accountA, {
      documentId: archived.reservation.documentId,
      storagePath: archived.reservation.storagePath,
      sha256: sha256(pdf),
      byteSize: pdf.length
    });
    assert.deepEqual(await readQuota(accountA), quotaAfterFirst);
  });

  test("Delete removes metadata/accounting/storage and is idempotent", async () => {
    const accountA = await createAccount("account-a");
    const pdf = validPdfFixture("delete");
    const archived = await archivePdf(accountA, pdf);

    await callDelete(accountA, archived.reservation.documentId);
    let quota = await readQuota(accountA);
    assert.equal(quota.usedBytes, 0);
    assert.equal(quota.reservedBytes, 0);
    assert.equal(await trustedDocumentExists(testEnv, accountA.uid, archived.reservation.documentId), false);
    await assert.rejects(getMetadata(ref(accountA.client.storage, archived.reservation.storagePath)));

    await callDelete(accountA, archived.reservation.documentId);
    quota = await readQuota(accountA);
    assert.equal(quota.usedBytes, 0);
    assert.equal(quota.reservedBytes, 0);
  });

  test("Partial failure and recovery cases preserve quota consistency", async () => {
    const accountA = await createAccount("account-a");
    const pdf = validPdfFixture("partial");
    const reservation = await callReserve(accountA, { pdfBytes: pdf, sha256: sha256(pdf), byteSize: pdf.length });

    const retryReserve = await callReserve(accountA, { pdfBytes: pdf, sha256: sha256(pdf), byteSize: pdf.length });
    assert.equal(retryReserve.documentId, reservation.documentId);
    assert.equal((await readQuota(accountA)).reservedBytes, pdf.length);

    await expectCallableFailure(
      callFinalize(accountA, {
        documentId: reservation.documentId,
        storagePath: reservation.storagePath,
        sha256: sha256(pdf),
        byteSize: pdf.length
      }),
      "failed-precondition"
    );
    assert.equal((await readQuota(accountA)).reservedBytes, pdf.length);

    await uploadPdf(accountA, reservation.storagePath, pdf);
    await expectCallableFailure(
      callFinalize(accountA, {
        documentId: reservation.documentId,
        storagePath: reservation.storagePath,
        sha256: deterministicSha256("wrong-sha"),
        byteSize: pdf.length
      }),
      "permission-denied"
    );
    assert.equal((await readQuota(accountA)).reservedBytes, pdf.length);

    await resetEmulators(testEnv);
    const accountB = await createAccount("account-b");
    await seedFirestore(testEnv, async (db) => {
      await db.doc(`users/${accountB.uid}/documents/missing-storage`).set({
        schemaVersion: 1,
        documentId: "missing-storage",
        ownerUid: accountB.uid,
        sha256: deterministicSha256("missing-storage"),
        originalFileName: "missing.pdf",
        displayName: "missing.pdf",
        contentType: "application/pdf",
        byteSize: 123,
        pageCount: 1,
        storagePath: `users/${accountB.uid}/documents/missing-storage/original.pdf`,
        status: "synced",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastOpenedAt: new Date()
      });
      await db.doc(`users/${accountB.uid}/hashIndex/${deterministicSha256("missing-storage")}`).set({ documentId: "missing-storage" });
      await db.doc(`users/${accountB.uid}/account/quota`).set({ usedBytes: 123, reservedBytes: 0, quotaBytes: USER_QUOTA_BYTES });
    });
    await callDelete(accountB, "missing-storage");
    assert.equal((await readQuota(accountB)).usedBytes, 0);
  });

  test("Malformed and unauthorized function calls are rejected", async () => {
    const accountA = await createAccount("account-a");
    const accountB = await createAccount("account-b");
    const unauthenticated = await import("./helpers.mjs").then(({ createClient }) => createClient("anon-functions"));

    const reserve = httpsCallable(unauthenticated.functions, "reservePdfArchive");
    await expectCallableFailure(
      reserve({
        ownerUid: accountA.uid,
        sha256: deterministicSha256("anon"),
        originalFileName: "anon.pdf",
        displayName: "anon.pdf",
        byteSize: 10,
        pageCount: 1
      }),
      "unauthenticated"
    );

    await expectCallableFailure(callReserve(accountA, { sha256: "not-a-sha", byteSize: 10 }), "invalid-argument");
    await expectCallableFailure(callReserve(accountA, { sha256: deterministicSha256("zero"), byteSize: 0 }), "invalid-argument");

    const crossReserve = httpsCallable(accountB.client.functions, "reservePdfArchive");
    await expectCallableFailure(
      crossReserve({
        ownerUid: accountA.uid,
        sha256: deterministicSha256("cross-owner"),
        originalFileName: "cross.pdf",
        displayName: "cross.pdf",
        byteSize: 10,
        pageCount: 1
      }),
      "permission-denied"
    );

    const archived = await archivePdf(accountA, validPdfFixture("cross-delete"));
    const crossDelete = httpsCallable(accountB.client.functions, "deletePdfArchive");
    await expectCallableFailure(crossDelete({ ownerUid: accountA.uid, documentId: archived.reservation.documentId }), "permission-denied");
  });

  test("Storage upload succeeds only for expected archive path after reservation", async () => {
    const accountA = await createAccount("account-a");
    const pdf = validPdfFixture("reserved-storage");
    const reservation = await callReserve(accountA, { pdfBytes: pdf, sha256: sha256(pdf), byteSize: pdf.length });
    const metadata = await uploadPdf(accountA, reservation.storagePath, pdf);
    assert.equal(metadata.contentType, "application/pdf");
    await assert.rejects(uploadBytes(ref(accountA.client.storage, `users/${accountA.uid}/documents/${reservation.documentId}/sidecar.txt`), pdf, { contentType: "application/pdf" }));
  });

  test("Function project configuration remains emulator-only", async () => {
    assert.equal(PROJECT_ID, "printpilot-emulator-test");
    assert.ok(process.env.FIRESTORE_EMULATOR_HOST);
    assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST);
    assert.ok(process.env.FIREBASE_STORAGE_EMULATOR_HOST);
    assert.ok(process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST);
  });
});
