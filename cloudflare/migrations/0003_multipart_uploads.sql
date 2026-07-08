CREATE TABLE IF NOT EXISTS multipart_uploads (
  document_id TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL,
  upload_id TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'aborted')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  aborted_at TEXT,
  FOREIGN KEY (document_id) REFERENCES documents(document_id)
);

CREATE TABLE IF NOT EXISTS multipart_upload_parts (
  document_id TEXT NOT NULL,
  part_number INTEGER NOT NULL,
  etag TEXT NOT NULL,
  byte_size INTEGER,
  uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (document_id, part_number),
  FOREIGN KEY (document_id) REFERENCES documents(document_id)
);

CREATE INDEX IF NOT EXISTS multipart_uploads_owner_status_idx ON multipart_uploads (owner_uid, status);

