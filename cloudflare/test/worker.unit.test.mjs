import assert from "node:assert/strict";
import { describe, test } from "node:test";
import worker from "../src/index.js";

class FakeD1Statement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async run() {
    const normalized = this.sql.replace(/\s+/g, " ").trim();
    if (normalized.startsWith("INSERT OR IGNORE INTO users")) {
      const [uid, quotaBytes, createdAt, updatedAt] = this.values;
      if (!this.db.users.has(uid)) {
        this.db.users.set(uid, {
          uid,
          quota_bytes: quotaBytes,
          used_bytes: 0,
          reserved_bytes: 0,
          created_at: createdAt,
          updated_at: updatedAt
        });
      }
      return { success: true };
    }

    if (normalized.startsWith("INSERT INTO documents")) {
      const [
        document_id,
        owner_uid,
        sha256,
        storage_key,
        original_file_name,
        display_name,
        content_type,
        byte_size,
        page_count,
        status,
        created_at,
        updated_at,
        last_opened_at
      ] = this.values;
      this.db.documents.set(document_id, {
        document_id,
        owner_uid,
        sha256,
        storage_key,
        original_file_name,
        display_name,
        content_type,
        byte_size,
        page_count,
        status,
        created_at,
        updated_at,
        last_opened_at
      });
      return { success: true };
    }

    throw new Error(`Unhandled fake D1 run: ${normalized}`);
  }

  async first() {
    const normalized = this.sql.replace(/\s+/g, " ").trim();
    if (normalized.startsWith("SELECT document_id")) {
      return this.db.documents.get(this.values[0]) ?? null;
    }

    if (normalized.startsWith("SELECT owner_uid")) {
      const user = this.db.users.get(this.values[0]);
      if (!user) return null;
      return {
        owner_uid: user.uid,
        used_bytes: user.used_bytes,
        reserved_bytes: user.reserved_bytes,
        quota_bytes: user.quota_bytes
      };
    }

    throw new Error(`Unhandled fake D1 first: ${normalized}`);
  }
}

class FakeD1Database {
  constructor() {
    this.users = new Map();
    this.documents = new Map();
  }

  prepare(sql) {
    return new FakeD1Statement(this, sql);
  }
}

class FakeR2Bucket {
  constructor() {
    this.objects = new Map();
  }

  async put(key, value) {
    this.objects.set(key, String(value));
  }

  async get(key) {
    const value = this.objects.get(key);
    if (value === undefined) return null;
    return { text: async () => value };
  }

  async delete(key) {
    this.objects.delete(key);
  }
}

function makeEnv() {
  return {
    PRINTPILOT_DB: new FakeD1Database(),
    PRINTPILOT_ARCHIVE: new FakeR2Bucket()
  };
}

async function request(path, init = {}, env = makeEnv()) {
  const response = await worker.fetch(new Request(`http://local.test${path}`, init), env);
  return {
    response,
    body: await response.json()
  };
}

describe("PrintPilot Cloudflare Worker probes", () => {
  test("health endpoint reports configured local bindings", async () => {
    const { response, body } = await request("/health");
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.service, "printpilot-cloudflare-local");
    assert.deepEqual(body.bindings, { d1: true, r2: true });
  });

  test("D1 probe writes and reads document metadata and storage usage", async () => {
    const { response, body } = await request("/probe/d1", { method: "POST" });
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.probe, "d1");
    assert.equal(body.document.owner_uid, "local-single-user");
    assert.equal(body.document.status, "reserved");
    assert.equal(body.usage.quota_bytes, 5_368_709_120);
  });

  test("R2 probe puts, gets, and deletes a private object", async () => {
    const { response, body } = await request("/probe/r2", { method: "POST" });
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.probe, "r2");
    assert.equal(body.readMatchesWrite, true);
    assert.equal(body.deleted, true);
  });

  test("unknown routes return 404 JSON", async () => {
    const { response, body } = await request("/missing");
    assert.equal(response.status, 404);
    assert.equal(body.ok, false);
  });
});

