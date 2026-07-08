import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import { DatabaseSync } from "node:sqlite";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function migration(name) {
  return readFileSync(join(ROOT, "migrations", name), "utf8");
}

function insertDocument(db, documentId, sha256, createdAt) {
  db.prepare(
    `INSERT INTO documents (
       document_id, owner_uid, sha256, storage_key, original_file_name,
       display_name, content_type, byte_size, page_count, status,
       created_at, updated_at, last_opened_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    documentId,
    "local-single-user",
    sha256,
    `users/local-single-user/documents/${documentId}/original.pdf`,
    "local-probe.pdf",
    "local-probe.pdf",
    "application/pdf",
    12,
    1,
    "reserved",
    createdAt,
    createdAt,
    createdAt
  );
}

describe("Cloudflare D1 migrations", () => {
  test("0002 preserves duplicate probe rows before enforcing per-user SHA uniqueness", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(migration("0001_initial.sql"));
    db.prepare(
      `INSERT INTO users (uid, quota_bytes, used_bytes, reserved_bytes, created_at, updated_at)
       VALUES (?, ?, 0, 0, ?, ?)`
    ).run("local-single-user", 5_368_709_120, "2026-07-08T00:00:00.000Z", "2026-07-08T00:00:00.000Z");

    const duplicateSha = "0".repeat(64);
    insertDocument(db, "probe-a", duplicateSha, "2026-07-08T00:00:01.000Z");
    insertDocument(db, "probe-b", duplicateSha, "2026-07-08T00:00:02.000Z");
    insertDocument(db, "probe-c", duplicateSha, "2026-07-08T00:00:03.000Z");

    db.exec(migration("0002_reservations.sql"));
    db.exec(migration("0003_multipart_uploads.sql"));

    const rows = db.prepare("SELECT document_id, sha256 FROM documents ORDER BY created_at").all();
    assert.equal(rows.length, 3);
    assert.equal(rows[0].sha256, duplicateSha);
    assert.equal(new Set(rows.map((row) => row.sha256)).size, 3);
    assert.equal(rows.every((row) => /^[a-f0-9]{64}$/.test(row.sha256)), true);

    const duplicateGroups = db.prepare(
      `SELECT owner_uid, sha256, COUNT(*) AS count
       FROM documents
       GROUP BY owner_uid, sha256
       HAVING count > 1`
    ).all();
    assert.deepEqual(duplicateGroups, []);

    assert.throws(() => {
      insertDocument(db, "probe-d", rows[0].sha256, "2026-07-08T00:00:04.000Z");
    }, /UNIQUE constraint failed/);

    db.prepare(
      `INSERT INTO multipart_uploads (
         document_id, owner_uid, upload_id, storage_key, status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "probe-a",
      "local-single-user",
      "upload-1",
      "users/local-single-user/documents/probe-a/original.pdf",
      "active",
      "2026-07-08T00:00:05.000Z",
      "2026-07-08T00:00:05.000Z"
    );
    const upload = db.prepare("SELECT status FROM multipart_uploads WHERE document_id = ?").get("probe-a");
    assert.equal(upload.status, "active");
  });
});
