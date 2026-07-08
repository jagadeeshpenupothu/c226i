ALTER TABLE documents ADD COLUMN idempotency_key TEXT;

-- CF-1 local probes used a fixed SHA-256 value, so existing local D1
-- databases can contain duplicate probe rows. Keep every row, preserve the
-- first row's original checksum per user/hash, and give older duplicates a
-- valid unique placeholder before enforcing future per-user deduplication.
WITH duplicate_documents AS (
  SELECT duplicate_rowid
  FROM (
    SELECT
      rowid AS duplicate_rowid,
      ROW_NUMBER() OVER (
        PARTITION BY owner_uid, sha256
        ORDER BY created_at, document_id
      ) AS duplicate_rank
    FROM documents
  )
  WHERE duplicate_rank > 1
)
UPDATE documents
SET sha256 = lower(hex(randomblob(32)))
WHERE rowid IN (SELECT duplicate_rowid FROM duplicate_documents);

CREATE UNIQUE INDEX IF NOT EXISTS documents_owner_sha256_unique_idx ON documents (owner_uid, sha256);
CREATE UNIQUE INDEX IF NOT EXISTS documents_owner_idempotency_unique_idx ON documents (owner_uid, idempotency_key);
