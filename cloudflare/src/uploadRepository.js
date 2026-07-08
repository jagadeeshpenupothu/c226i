import { ArchiveError, MAX_PDF_BYTES } from "./archiveRepository.js";

export const MAX_UPLOAD_PARTS = 100;
export const MAX_PART_BYTES = 64 * 1024 * 1024;

function badRequest(code) {
  throw new ArchiveError(400, code);
}

function forbidden(code) {
  throw new ArchiveError(403, code);
}

function notFound(code) {
  throw new ArchiveError(404, code);
}

function conflict(code) {
  throw new ArchiveError(409, code);
}

function changes(result) {
  return result?.meta?.changes ?? result?.changes ?? 0;
}

function mapUpload(row) {
  if (!row) return null;
  return {
    documentId: row.document_id,
    uploadId: row.upload_id,
    storageKey: row.storage_key,
    status: row.status
  };
}

function validatePartNumber(partNumber) {
  const parsed = Number(partNumber);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_UPLOAD_PARTS) {
    badRequest("invalid_part_number");
  }
  return parsed;
}

function validateContentLength(request) {
  const header = request.headers.get("content-length");
  if (!header) return null;
  const byteSize = Number(header);
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0 || byteSize > MAX_PART_BYTES) {
    badRequest("invalid_part_size");
  }
  return byteSize;
}

function validateCompleteParts(parts) {
  if (!Array.isArray(parts) || parts.length === 0 || parts.length > MAX_UPLOAD_PARTS) {
    badRequest("invalid_parts");
  }
  const seen = new Set();
  return parts.map((part) => {
    const partNumber = validatePartNumber(part?.partNumber);
    const etag = typeof part?.etag === "string" ? part.etag.trim() : "";
    if (!etag) badRequest("invalid_part_etag");
    if (seen.has(partNumber)) badRequest("duplicate_part_number");
    seen.add(partNumber);
    return { partNumber, etag };
  }).sort((a, b) => a.partNumber - b.partNumber);
}

async function findDocument(db, documentId) {
  return db.prepare(
    `SELECT document_id, owner_uid, storage_key, byte_size, status
     FROM documents
     WHERE document_id = ?`
  )
    .bind(documentId)
    .first();
}

async function requireOwnedActiveReservation(db, uid, documentId) {
  const document = await findDocument(db, documentId);
  if (!document) notFound("reservation_not_found");
  if (document.owner_uid !== uid) forbidden("reservation_forbidden");
  if (!["reserved", "uploading"].includes(document.status)) {
    conflict("reservation_not_active");
  }
  if (document.byte_size > MAX_PDF_BYTES) badRequest("invalid_byte_size");
  return document;
}

async function readUpload(db, documentId) {
  return db.prepare(
    `SELECT document_id, owner_uid, upload_id, storage_key, status
     FROM multipart_uploads
     WHERE document_id = ?`
  )
    .bind(documentId)
    .first();
}

async function setDocumentStatus(db, documentId, status, now) {
  await db.prepare(
    `UPDATE documents
     SET status = ?, updated_at = ?
     WHERE document_id = ?`
  )
    .bind(status, now, documentId)
    .run();
}

async function insertUpload(db, document, uploadId, now) {
  await db.prepare(
    `INSERT INTO multipart_uploads (
       document_id, owner_uid, upload_id, storage_key, status,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(document.document_id, document.owner_uid, uploadId, document.storage_key, "active", now, now)
    .run();
}

export async function initiateMultipartUpload(db, bucket, uid, documentId) {
  const document = await requireOwnedActiveReservation(db, uid, documentId);
  const existing = await readUpload(db, documentId);
  if (existing) return { upload: mapUpload(existing), repeated: true };

  const upload = await bucket.createMultipartUpload(document.storage_key, {
    httpMetadata: { contentType: "application/pdf" }
  });
  const now = new Date().toISOString();
  await insertUpload(db, document, upload.uploadId, now);
  await setDocumentStatus(db, documentId, "uploading", now);
  return {
    upload: {
      documentId,
      uploadId: upload.uploadId,
      storageKey: document.storage_key,
      status: "active"
    },
    repeated: false
  };
}

async function requireActiveUpload(db, uid, documentId) {
  await requireOwnedActiveReservation(db, uid, documentId);
  const upload = await readUpload(db, documentId);
  if (!upload) notFound("upload_not_found");
  if (upload.owner_uid !== uid) forbidden("upload_forbidden");
  if (upload.status !== "active") conflict(`upload_${upload.status}`);
  return upload;
}

export async function uploadMultipartPart(db, bucket, uid, documentId, partNumberValue, request) {
  const partNumber = validatePartNumber(partNumberValue);
  const byteSize = validateContentLength(request);
  if (!request.body) badRequest("missing_part_body");
  const upload = await requireActiveUpload(db, uid, documentId);
  const multipart = bucket.resumeMultipartUpload(upload.storage_key, upload.upload_id);
  const uploadedPart = await multipart.uploadPart(partNumber, request.body);
  const etag = uploadedPart.etag;
  if (typeof etag !== "string" || etag.length === 0) conflict("missing_r2_etag");
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT OR REPLACE INTO multipart_upload_parts (
       document_id, part_number, etag, byte_size, uploaded_at
     ) VALUES (?, ?, ?, ?, ?)`
  )
    .bind(documentId, partNumber, etag, byteSize, now)
    .run();
  return { partNumber, etag };
}

async function requireUploadedPart(db, documentId, part) {
  const row = await db.prepare(
    `SELECT etag
     FROM multipart_upload_parts
     WHERE document_id = ? AND part_number = ?`
  )
    .bind(documentId, part.partNumber)
    .first();
  if (!row || row.etag !== part.etag) badRequest("missing_upload_part");
}

export async function completeMultipartUpload(db, bucket, uid, documentId, rawInput) {
  await requireOwnedActiveReservation(db, uid, documentId);
  const upload = await readUpload(db, documentId);
  if (!upload) notFound("upload_not_found");
  if (upload.owner_uid !== uid) forbidden("upload_forbidden");
  if (upload.status === "completed") return { upload: mapUpload(upload), repeated: true };
  if (upload.status === "aborted") conflict("upload_aborted");

  const parts = validateCompleteParts(rawInput?.parts);
  for (const part of parts) {
    await requireUploadedPart(db, documentId, part);
  }

  const multipart = bucket.resumeMultipartUpload(upload.storage_key, upload.upload_id);
  await multipart.complete(parts);
  const now = new Date().toISOString();
  const result = await db.prepare(
    `UPDATE multipart_uploads
     SET status = 'completed', updated_at = ?, completed_at = ?
     WHERE document_id = ? AND status = 'active'`
  )
    .bind(now, now, documentId)
    .run();
  if (changes(result) !== 1) conflict("upload_not_active");
  return {
    upload: {
      documentId,
      uploadId: upload.upload_id,
      storageKey: upload.storage_key,
      status: "completed"
    },
    repeated: false
  };
}

export async function abortMultipartUpload(db, bucket, uid, documentId) {
  await requireOwnedActiveReservation(db, uid, documentId);
  const upload = await readUpload(db, documentId);
  if (!upload) return { upload: null, repeated: true };
  if (upload.owner_uid !== uid) forbidden("upload_forbidden");
  if (upload.status === "aborted") return { upload: mapUpload(upload), repeated: true };
  if (upload.status === "completed") conflict("upload_completed");

  const multipart = bucket.resumeMultipartUpload(upload.storage_key, upload.upload_id);
  await multipart.abort();
  const now = new Date().toISOString();
  await db.prepare(
    `UPDATE multipart_uploads
     SET status = 'aborted', updated_at = ?, aborted_at = ?
     WHERE document_id = ?`
  )
    .bind(now, now, documentId)
    .run();
  await db.prepare("DELETE FROM multipart_upload_parts WHERE document_id = ?").bind(documentId).run();
  await setDocumentStatus(db, documentId, "reserved", now);
  return {
    upload: {
      documentId,
      uploadId: upload.upload_id,
      storageKey: upload.storage_key,
      status: "aborted"
    },
    repeated: false
  };
}

