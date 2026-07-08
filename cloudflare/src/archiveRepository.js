export const MAX_PDF_BYTES = 524_288_000;
export const USER_QUOTA_BYTES = 5_368_709_120;

class ArchiveError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function badRequest(code) {
  throw new ArchiveError(400, code);
}

function conflict(code) {
  throw new ArchiveError(409, code);
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeString(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function validateReserveInput(input) {
  if (!isObject(input)) badRequest("invalid_request");

  const sha256 = normalizeString(input.sha256).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256)) badRequest("invalid_sha256");

  const byteSize = input.byteSize;
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0 || byteSize > MAX_PDF_BYTES) {
    badRequest("invalid_byte_size");
  }

  const idempotencyKey = normalizeString(input.idempotencyKey);
  if (!idempotencyKey || idempotencyKey.length > 128) badRequest("invalid_idempotency_key");

  const originalFileName = normalizeString(input.originalFileName, "document.pdf") || "document.pdf";
  const displayName = normalizeString(input.displayName, originalFileName) || originalFileName;
  const pageCount = input.pageCount === null || input.pageCount === undefined ? null : input.pageCount;
  if (pageCount !== null && (!Number.isSafeInteger(pageCount) || pageCount <= 0)) {
    badRequest("invalid_page_count");
  }

  return {
    sha256,
    originalFileName: originalFileName.slice(0, 255),
    displayName: displayName.slice(0, 255),
    byteSize,
    pageCount,
    idempotencyKey
  };
}

function changes(result) {
  return result?.meta?.changes ?? result?.changes ?? 0;
}

function mapDocument(row) {
  if (!row) return null;
  return {
    documentId: row.document_id,
    ownerUid: row.owner_uid,
    sha256: row.sha256,
    storageKey: row.storage_key,
    originalFileName: row.original_file_name,
    displayName: row.display_name,
    contentType: row.content_type,
    byteSize: row.byte_size,
    pageCount: row.page_count,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastOpenedAt: row.last_opened_at
  };
}

async function ensureUser(db, uid, now) {
  await db.prepare(
    `INSERT OR IGNORE INTO users (uid, quota_bytes, used_bytes, reserved_bytes, created_at, updated_at)
     VALUES (?, ?, 0, 0, ?, ?)`
  )
    .bind(uid, USER_QUOTA_BYTES, now, now)
    .run();
}

async function findDocumentByIdempotencyKey(db, uid, idempotencyKey) {
  return db.prepare(
    `SELECT document_id, owner_uid, sha256, storage_key, original_file_name, display_name,
            content_type, byte_size, page_count, status, idempotency_key,
            created_at, updated_at, last_opened_at
     FROM documents
     WHERE owner_uid = ? AND idempotency_key = ?`
  )
    .bind(uid, idempotencyKey)
    .first();
}

async function findDocumentBySha(db, uid, sha256) {
  return db.prepare(
    `SELECT document_id, owner_uid, sha256, storage_key, original_file_name, display_name,
            content_type, byte_size, page_count, status, idempotency_key,
            created_at, updated_at, last_opened_at
     FROM documents
     WHERE owner_uid = ? AND sha256 = ?`
  )
    .bind(uid, sha256)
    .first();
}

async function readUsage(db, uid) {
  return db.prepare(
    `SELECT owner_uid, used_bytes, reserved_bytes, quota_bytes
     FROM storage_usage
     WHERE owner_uid = ?`
  )
    .bind(uid)
    .first();
}

async function reserveQuota(db, uid, byteSize, now) {
  const result = await db.prepare(
    `UPDATE users
     SET reserved_bytes = reserved_bytes + ?, updated_at = ?
     WHERE uid = ? AND used_bytes + reserved_bytes + ? <= quota_bytes`
  )
    .bind(byteSize, now, uid, byteSize)
    .run();
  if (changes(result) !== 1) conflict("quota_exceeded");
}

async function rollbackReservation(db, uid, byteSize, now) {
  await db.prepare(
    `UPDATE users
     SET reserved_bytes = MAX(reserved_bytes - ?, 0), updated_at = ?
     WHERE uid = ?`
  )
    .bind(byteSize, now, uid)
    .run();
}

async function insertDocument(db, uid, input, documentId, storageKey, now) {
  await db.prepare(
    `INSERT INTO documents (
       document_id, owner_uid, sha256, storage_key, original_file_name,
       display_name, content_type, byte_size, page_count, status,
       idempotency_key, created_at, updated_at, last_opened_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      documentId,
      uid,
      input.sha256,
      storageKey,
      input.originalFileName,
      input.displayName,
      "application/pdf",
      input.byteSize,
      input.pageCount,
      "reserved",
      input.idempotencyKey,
      now,
      now,
      now
    )
    .run();
}

export async function reserveArchiveDocument(db, uid, rawInput) {
  const input = validateReserveInput(rawInput);
  const now = new Date().toISOString();
  await ensureUser(db, uid, now);

  const byIdempotency = await findDocumentByIdempotencyKey(db, uid, input.idempotencyKey);
  if (byIdempotency) {
    return {
      duplicate: byIdempotency.sha256 === input.sha256,
      idempotent: true,
      document: mapDocument(byIdempotency),
      quota: await readUsage(db, uid)
    };
  }

  const bySha = await findDocumentBySha(db, uid, input.sha256);
  if (bySha) {
    return {
      duplicate: true,
      idempotent: false,
      document: mapDocument(bySha),
      quota: await readUsage(db, uid)
    };
  }

  const documentId = crypto.randomUUID();
  const storageKey = `users/${uid}/documents/${documentId}/original.pdf`;
  await reserveQuota(db, uid, input.byteSize, now);

  try {
    await insertDocument(db, uid, input, documentId, storageKey, now);
  } catch (error) {
    await rollbackReservation(db, uid, input.byteSize, now);
    const existing = await findDocumentByIdempotencyKey(db, uid, input.idempotencyKey)
      ?? await findDocumentBySha(db, uid, input.sha256);
    if (existing) {
      return {
        duplicate: existing.sha256 === input.sha256,
        idempotent: existing.idempotency_key === input.idempotencyKey,
        document: mapDocument(existing),
        quota: await readUsage(db, uid)
      };
    }
    throw error;
  }

  return {
    duplicate: false,
    idempotent: false,
    document: mapDocument(await findDocumentByIdempotencyKey(db, uid, input.idempotencyKey)),
    quota: await readUsage(db, uid)
  };
}

export { ArchiveError };

