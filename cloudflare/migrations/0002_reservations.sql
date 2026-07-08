ALTER TABLE documents ADD COLUMN idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS documents_owner_sha256_unique_idx ON documents (owner_uid, sha256);
CREATE UNIQUE INDEX IF NOT EXISTS documents_owner_idempotency_unique_idx ON documents (owner_uid, idempotency_key);

