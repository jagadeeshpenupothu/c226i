CREATE TABLE IF NOT EXISTS users (
  uid TEXT PRIMARY KEY,
  quota_bytes INTEGER NOT NULL DEFAULT 5368709120,
  used_bytes INTEGER NOT NULL DEFAULT 0,
  reserved_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS documents (
  document_id TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  original_file_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/pdf',
  byte_size INTEGER NOT NULL,
  page_count INTEGER,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'uploading', 'synced', 'failed', 'deleting')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_opened_at TEXT,
  FOREIGN KEY (owner_uid) REFERENCES users(uid)
);

CREATE INDEX IF NOT EXISTS documents_owner_status_idx ON documents (owner_uid, status);
CREATE INDEX IF NOT EXISTS documents_owner_sha256_idx ON documents (owner_uid, sha256);

CREATE VIEW IF NOT EXISTS storage_usage AS
SELECT
  uid AS owner_uid,
  used_bytes,
  reserved_bytes,
  quota_bytes,
  updated_at
FROM users;

