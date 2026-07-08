import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";

initializeApp();

const db = getFirestore();
const MAX_PDF_BYTES = 524_288_000;
const USER_QUOTA_BYTES = 5_368_709_120;

interface ReserveInput {
  ownerUid: string;
  sha256: string;
  originalFileName: string;
  displayName: string;
  byteSize: number;
  pageCount: number | null;
}

interface FinalizeInput {
  ownerUid: string;
  documentId: string;
  storagePath: string;
  sha256: string;
  byteSize: number;
}

function requireOwner(authUid: string | undefined, ownerUid: string): void {
  if (!authUid) throw new HttpsError("unauthenticated", "Sign in required.");
  if (authUid !== ownerUid) throw new HttpsError("permission-denied", "Cannot access another user's documents.");
}

function assertPdfInput(input: ReserveInput): void {
  if (!/^[a-f0-9]{64}$/i.test(input.sha256)) throw new HttpsError("invalid-argument", "Invalid PDF checksum.");
  if (!Number.isFinite(input.byteSize) || input.byteSize <= 0) throw new HttpsError("invalid-argument", "Invalid PDF size.");
  if (input.byteSize > MAX_PDF_BYTES) throw new HttpsError("resource-exhausted", "PDF exceeds 500 MB limit.");
}

export const reservePdfArchive = onCall<ReserveInput>(async (request) => {
  const input = request.data;
  requireOwner(request.auth?.uid, input.ownerUid);
  assertPdfInput(input);

  const userRoot = db.collection("users").doc(input.ownerUid);
  const quotaRef = userRoot.collection("account").doc("quota");
  const hashRef = userRoot.collection("hashIndex").doc(input.sha256);
  const now = FieldValue.serverTimestamp();

  return db.runTransaction(async (tx) => {
    const [quotaSnap, hashSnap] = await Promise.all([tx.get(quotaRef), tx.get(hashRef)]);
    if (hashSnap.exists) {
      const existingDocumentId = String(hashSnap.get("documentId"));
      const existingRef = userRoot.collection("documents").doc(existingDocumentId);
      const existingSnap = await tx.get(existingRef);
      if (existingSnap.exists) {
        const status = String(existingSnap.get("status") || "uploading");
        if (status === "synced") {
          tx.update(existingRef, { lastOpenedAt: now, updatedAt: now });
          return {
            documentId: existingDocumentId,
            storagePath: String(existingSnap.get("storagePath")),
            duplicate: true,
            document: { documentId: existingDocumentId, ...existingSnap.data() }
          };
        }

        return {
          documentId: existingDocumentId,
          storagePath: String(existingSnap.get("storagePath")),
          duplicate: false,
          document: { documentId: existingDocumentId, ...existingSnap.data() }
        };
      }
    }

    const quota = quotaSnap.exists ? quotaSnap.data() || {} : {};
    const usedBytes = Number(quota.usedBytes || 0);
    const reservedBytes = Number(quota.reservedBytes || 0);
    const quotaBytes = Number(quota.quotaBytes || USER_QUOTA_BYTES);
    if (usedBytes + reservedBytes + input.byteSize > quotaBytes) {
      throw new HttpsError("resource-exhausted", "Storage quota exceeded.");
    }

    const documentRef = userRoot.collection("documents").doc();
    const storagePath = `users/${input.ownerUid}/documents/${documentRef.id}/original.pdf`;
    tx.set(quotaRef, {
      usedBytes,
      reservedBytes: reservedBytes + input.byteSize,
      quotaBytes,
      updatedAt: now
    }, { merge: true });
    tx.set(documentRef, {
      schemaVersion: 1,
      documentId: documentRef.id,
      ownerUid: input.ownerUid,
      sha256: input.sha256,
      originalFileName: input.originalFileName,
      displayName: input.displayName || input.originalFileName,
      contentType: "application/pdf",
      byteSize: input.byteSize,
      pageCount: input.pageCount ?? null,
      storagePath,
      status: "uploading",
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now
    });
    tx.set(hashRef, { documentId: documentRef.id, createdAt: now });

    return {
      documentId: documentRef.id,
      storagePath,
      duplicate: false,
      quota: { usedBytes, reservedBytes: reservedBytes + input.byteSize, quotaBytes }
    };
  });
});

export const finalizePdfArchive = onCall<FinalizeInput>(async (request) => {
  const input = request.data;
  requireOwner(request.auth?.uid, input.ownerUid);
  const documentRef = db.collection("users").doc(input.ownerUid).collection("documents").doc(input.documentId);
  const quotaRef = db.collection("users").doc(input.ownerUid).collection("account").doc("quota");
  const bucket = getStorage().bucket();
  const [metadata] = await bucket.file(input.storagePath).getMetadata().catch(() => {
    throw new HttpsError("failed-precondition", "Uploaded PDF object is missing.");
  });
  const actualSize = Number(metadata.size || 0);
  if (actualSize !== input.byteSize) throw new HttpsError("failed-precondition", "Uploaded PDF size mismatch.");

  const now = FieldValue.serverTimestamp();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(documentRef);
    if (!snap.exists) throw new HttpsError("not-found", "Cloud document reservation is missing.");
    if (snap.get("ownerUid") !== input.ownerUid || snap.get("storagePath") !== input.storagePath || snap.get("sha256") !== input.sha256) {
      throw new HttpsError("permission-denied", "Cloud document reservation mismatch.");
    }
    if (snap.get("status") === "synced") {
      return { documentId: input.documentId, ...snap.data(), status: "synced" };
    }
    tx.update(documentRef, { status: "synced", updatedAt: now });
    tx.set(quotaRef, {
      usedBytes: FieldValue.increment(input.byteSize),
      reservedBytes: FieldValue.increment(-input.byteSize),
      quotaBytes: USER_QUOTA_BYTES,
      updatedAt: now
    }, { merge: true });
    const updated = { documentId: input.documentId, ...snap.data(), status: "synced" };
    return updated;
  });
});

export const deletePdfArchive = onCall<{ ownerUid: string; documentId: string }>(async (request) => {
  const { ownerUid, documentId } = request.data;
  requireOwner(request.auth?.uid, ownerUid);
  const userRoot = db.collection("users").doc(ownerUid);
  const documentRef = userRoot.collection("documents").doc(documentId);
  const quotaRef = userRoot.collection("account").doc("quota");
  const now = FieldValue.serverTimestamp();

  const snap = await documentRef.get();
  if (!snap.exists) return { ok: true };
  const data = snap.data() || {};
  const byteSize = Number(data.byteSize || 0);
  const storagePath = String(data.storagePath || "");
  const sha256 = String(data.sha256 || "");
  const status = String(data.status || "uploading");

  await getStorage().bucket().file(storagePath).delete({ ignoreNotFound: true });
  await db.runTransaction(async (tx) => {
    tx.delete(documentRef);
    tx.delete(userRoot.collection("hashIndex").doc(sha256));
    tx.set(quotaRef, {
      usedBytes: status === "synced" ? FieldValue.increment(-byteSize) : FieldValue.increment(0),
      reservedBytes: status === "synced" ? FieldValue.increment(0) : FieldValue.increment(-byteSize),
      updatedAt: now
    }, { merge: true });
  });
  return { ok: true };
});
