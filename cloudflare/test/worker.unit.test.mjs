import assert from "node:assert/strict";
import { describe, test } from "node:test";
import worker from "../src/index.js";

const FIREBASE_PROJECT_ID = "printpilot-test";
const TEST_KID = "printpilot-test-key";
const TEST_PUBLIC_JWK = {
  kty: "RSA",
  n: "sCipSvHVxhEk7_7HS0UcAgGTNxv-jgXnbWRR909M4OxlcJ_k90xNVDD90kzLqZ4bu6q8erUhH-6rA-bqJ09n1J3vQxnCVWLIEIyexpdIeann1MvgsCB4JPoTEKUBKXIkD65wtVe1sIkigllm2Zpk7vOcJph6M5Wdgd26oOC20HFBBuLsQZIvAzBLae58FJ1zve0kNfwk3UlWUWPZQrvocAqCXbo2qfkt_jbgNQJFfv6J3vBtJ44HOBfyeaoWPNt-KuoQrjCa874jajZudw6Sx3pGaRGjxnlQ_rzFNTtkJoKTPhst_ACA6Kv2rhno6me0sBy1RQWvMSX7RlD-_oFCyQ",
  e: "AQAB"
};
const TEST_PRIVATE_JWK = {
  ...TEST_PUBLIC_JWK,
  d: "Abm0KAzkvqsnXo69ZTg-Kvk0HWPJurSho1hw5XVB5BYe43a9sB6JAGk9WwUjdCsS6ctoQPgLhwhMjdlDeYAyhqiBqGT7zc-PoqH5IowHbofgANTUJ1WcXMaO_428Asc7CYdcyDbeoQ1LNNZrZJzygU1GOLdN9u9ig9GVMIuvLBrQv05jkpxw1ObEsSolVxcRkpAY1Cyn8mgTqxqNgWIt-RsoEgxdudkBzBucETxnRcsEa_lJuAvV918aBX7mfJCd48PlaxyUpDZZF5wQkdi1tpiwGBTXJB3zld5IasxlEg4lCx_jkFJ5pxO_O_7AjdoIKtHw06bQqmHq3D1y4F7T",
  p: "4XE3T8lBhVJtzMRvd722j4KbdB0EYULiiwTHP-9bPPIRsGESqkJt9y5clftg-ZHBkDSLUTMghx1Iewwl34xEh_FeAvzBnPjiuSE2L9_KM3bvi0rwOyom40_bOIyygDVsGpbSwn9PCyrn0K4kLojlWA4fQzVMKP_bmT10l8nV3wc",
  q: "yAlTAjnkPx3tklALpAforpFeyHoXwkCcy4waH3pUigk4zZCuKYQY8JXh10mh8_0mCb8x0an206bIPpwYo0GT4XQHoThFpyYe22Tf8zD0pJ3K9vmlpksJjvd3cI8z8b__sEbO95aGwYfA1Z-769PWfnlYFkiRWaGEqJXglE7ji68",
  dp: "jPGoYAR2JzEinmuNOPJtyYkhQVXG4DvdwIZLP8iYZSD-OCRoc_O2Jlxg3A_eUAl1V3_SPgDV7EM9hlhQ8VMToV4gpYN6VHYx4QZHh2TFWKmaF57RVFwFFgZeCxvDmW5M2M7Ek37eXyAC8C9_RWym3gduOil_JP7ZPxPx6dfxE08",
  dq: "D2VIUj-KZaE0C7LFcpZ5PhZKKTvcYEMAzlm2GP4dS5JyIMAl52QXV0zx2NP99v1g1Bc3Cl_-c0O-3bK94rLFYvC_NZVTJw40Cca1xc3axmCuoluMeEQGNE6vjqY25UBVuYd5nmyjanm8SbTFjdz8ATfto6lqJm_b-e2vHzsDIFk",
  qi: "3bGtLAy-__BfHimfu-48RTRI6PaqQ6A7hDzZCZYkEbULxIXp_f7PZrDA4xvdTcNPR4N-iRJGEBN-qifpAKkrAzjllyjVsf76uPcPZEhXs2S7JfxLmZzhhBbj5mg8JKE8A-h19dxNhHP-8MZ-aTSuTQChdQP1Cu1uzH3T2vrhklo"
};

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function signFirebaseToken(payloadOverrides = {}, headerOverrides = {}) {
  const header = { alg: "RS256", kid: TEST_KID, typ: "JWT", ...headerOverrides };
  const payload = {
    aud: FIREBASE_PROJECT_ID,
    iss: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    sub: "user-123",
    iat: 1_700_000_000,
    exp: 4_102_444_800,
    ...payloadOverrides
  };
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    TEST_PRIVATE_JWK,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${Buffer.from(signature).toString("base64url")}`;
}

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
        maybe_idempotency_key,
        maybe_created_at,
        maybe_updated_at,
        maybe_last_opened_at
      ] = this.values;
      const hasIdempotencyKey = this.values.length === 14;
      const idempotency_key = hasIdempotencyKey ? maybe_idempotency_key : null;
      const created_at = hasIdempotencyKey ? maybe_created_at : maybe_idempotency_key;
      const updated_at = hasIdempotencyKey ? maybe_updated_at : maybe_created_at;
      const last_opened_at = hasIdempotencyKey ? maybe_last_opened_at : maybe_updated_at;

      for (const document of this.db.documents.values()) {
        if (document.owner_uid === owner_uid && document.sha256 === sha256) {
          throw new Error("unique sha256 constraint");
        }
        if (idempotency_key && document.owner_uid === owner_uid && document.idempotency_key === idempotency_key) {
          throw new Error("unique idempotency constraint");
        }
      }

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
        idempotency_key,
        created_at,
        updated_at,
        last_opened_at
      });
      return { success: true };
    }

    if (normalized.startsWith("UPDATE users SET reserved_bytes = reserved_bytes +")) {
      const [byteSize, updatedAt, uid, requestedBytes] = this.values;
      const user = this.db.users.get(uid);
      if (!user || user.used_bytes + user.reserved_bytes + requestedBytes > user.quota_bytes) {
        return { success: true, meta: { changes: 0 } };
      }
      user.reserved_bytes += byteSize;
      user.updated_at = updatedAt;
      return { success: true, meta: { changes: 1 } };
    }

    if (normalized.startsWith("UPDATE users SET reserved_bytes = MAX")) {
      const [byteSize, updatedAt, uid] = this.values;
      const user = this.db.users.get(uid);
      if (user) {
        user.reserved_bytes = Math.max(user.reserved_bytes - byteSize, 0);
        user.updated_at = updatedAt;
      }
      return { success: true, meta: { changes: user ? 1 : 0 } };
    }

    if (normalized.startsWith("UPDATE documents SET status = ?")) {
      const [status, updatedAt, documentId] = this.values;
      const document = this.db.documents.get(documentId);
      if (document) {
        document.status = status;
        document.updated_at = updatedAt;
      }
      return { success: true, meta: { changes: document ? 1 : 0 } };
    }

    if (normalized.startsWith("INSERT INTO multipart_uploads")) {
      const [document_id, owner_uid, upload_id, storage_key, status, created_at, updated_at] = this.values;
      if (this.db.multipartUploads.has(document_id)) {
        throw new Error("unique multipart upload constraint");
      }
      this.db.multipartUploads.set(document_id, {
        document_id,
        owner_uid,
        upload_id,
        storage_key,
        status,
        created_at,
        updated_at,
        completed_at: null,
        aborted_at: null
      });
      return { success: true };
    }

    if (normalized.startsWith("INSERT OR REPLACE INTO multipart_upload_parts")) {
      const [document_id, part_number, etag, byte_size, uploaded_at] = this.values;
      this.db.multipartParts.set(`${document_id}:${part_number}`, {
        document_id,
        part_number,
        etag,
        byte_size,
        uploaded_at
      });
      return { success: true };
    }

    if (normalized.startsWith("UPDATE multipart_uploads SET status = 'completed'")) {
      const [updatedAt, completedAt, documentId] = this.values;
      const upload = this.db.multipartUploads.get(documentId);
      if (!upload || upload.status !== "active") {
        return { success: true, meta: { changes: 0 } };
      }
      upload.status = "completed";
      upload.updated_at = updatedAt;
      upload.completed_at = completedAt;
      return { success: true, meta: { changes: 1 } };
    }

    if (normalized.startsWith("UPDATE multipart_uploads SET status = 'aborted'")) {
      const [updatedAt, abortedAt, documentId] = this.values;
      const upload = this.db.multipartUploads.get(documentId);
      if (upload) {
        upload.status = "aborted";
        upload.updated_at = updatedAt;
        upload.aborted_at = abortedAt;
      }
      return { success: true, meta: { changes: upload ? 1 : 0 } };
    }

    if (normalized.startsWith("DELETE FROM multipart_upload_parts")) {
      const [documentId] = this.values;
      for (const key of [...this.db.multipartParts.keys()]) {
        if (key.startsWith(`${documentId}:`)) this.db.multipartParts.delete(key);
      }
      return { success: true };
    }

    throw new Error(`Unhandled fake D1 run: ${normalized}`);
  }

  async first() {
    const normalized = this.sql.replace(/\s+/g, " ").trim();
    if (normalized.startsWith("SELECT document_id") && normalized.includes("FROM multipart_uploads")) {
      return this.db.multipartUploads.get(this.values[0]) ?? null;
    }

    if (normalized.startsWith("SELECT document_id") && normalized.includes("WHERE document_id = ?")) {
      return this.db.documents.get(this.values[0]) ?? null;
    }

    if (normalized.startsWith("SELECT document_id") && normalized.includes("WHERE owner_uid = ? AND idempotency_key = ?")) {
      const [uid, idempotencyKey] = this.values;
      return [...this.db.documents.values()].find((document) => (
        document.owner_uid === uid && document.idempotency_key === idempotencyKey
      )) ?? null;
    }

    if (normalized.startsWith("SELECT document_id") && normalized.includes("WHERE owner_uid = ? AND sha256 = ?")) {
      const [uid, sha256] = this.values;
      return [...this.db.documents.values()].find((document) => (
        document.owner_uid === uid && document.sha256 === sha256
      )) ?? null;
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

    if (normalized.startsWith("SELECT etag")) {
      const [documentId, partNumber] = this.values;
      return this.db.multipartParts.get(`${documentId}:${partNumber}`) ?? null;
    }

    throw new Error(`Unhandled fake D1 first: ${normalized}`);
  }
}

class FakeD1Database {
  constructor() {
    this.users = new Map();
    this.documents = new Map();
    this.multipartUploads = new Map();
    this.multipartParts = new Map();
  }

  prepare(sql) {
    return new FakeD1Statement(this, sql);
  }
}

const validReserveInput = {
  sha256: "a".repeat(64),
  originalFileName: "proof.pdf",
  displayName: "Proof",
  byteSize: 1024,
  pageCount: 2,
  idempotencyKey: "reserve-1"
};

async function authHeaders(payloadOverrides = {}) {
  const token = await signFirebaseToken(payloadOverrides);
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json"
  };
}

async function reserve(input, env = makeEnv(), payloadOverrides = {}) {
  return request("/v1/archive/reserve", {
    method: "POST",
    headers: await authHeaders(payloadOverrides),
    body: JSON.stringify(input)
  }, env);
}

async function reserveDocument(env = makeEnv(), input = validReserveInput, payloadOverrides = {}) {
  const result = await reserve(input, env, payloadOverrides);
  assert.equal(result.response.status, 200);
  return result.body.document;
}

async function authRequest(path, init = {}, env = makeEnv(), payloadOverrides = {}) {
  return request(path, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...(await authHeaders(payloadOverrides))
    }
  }, env);
}

class FakeR2Bucket {
  constructor() {
    this.objects = new Map();
    this.multipartUploads = new Map();
    this.nextUploadId = 1;
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

  async createMultipartUpload(key) {
    const uploadId = `upload-${this.nextUploadId}`;
    this.nextUploadId += 1;
    const state = {
      key,
      uploadId,
      status: "active",
      parts: new Map()
    };
    this.multipartUploads.set(uploadId, state);
    return this.resumeMultipartUpload(key, uploadId);
  }

  resumeMultipartUpload(key, uploadId) {
    const state = this.multipartUploads.get(uploadId);
    if (!state || state.key !== key) throw new Error("missing multipart upload");
    return {
      key,
      uploadId,
      uploadPart: async (partNumber, body) => {
        if (state.status !== "active") throw new Error("multipart upload is not active");
        assert.ok(body, "multipart upload received a streaming body");
        const etag = `etag-${uploadId}-${partNumber}`;
        state.parts.set(partNumber, { partNumber, etag, body });
        return { etag };
      },
      complete: async (parts) => {
        if (state.status !== "active") throw new Error("multipart upload is not active");
        for (const part of parts) {
          const uploaded = state.parts.get(part.partNumber);
          if (!uploaded || uploaded.etag !== part.etag) throw new Error("missing part");
        }
        state.status = "completed";
        this.objects.set(key, { multipart: true, parts });
        return { key };
      },
      abort: async () => {
        state.status = "aborted";
        state.parts.clear();
      }
    };
  }
}

function makeEnv() {
  return {
    PRINTPILOT_DB: new FakeD1Database(),
    PRINTPILOT_ARCHIVE: new FakeR2Bucket(),
    FIREBASE_PROJECT_ID,
    FIREBASE_PUBLIC_KEYS: JSON.stringify({ [TEST_KID]: TEST_PUBLIC_JWK })
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

  test("Firebase token auth accepts a valid signed token", async () => {
    const token = await signFirebaseToken();
    const { response, body } = await request("/probe/auth", {
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.uid, "user-123");
  });

  test("Firebase token auth rejects a missing token", async () => {
    const { response, body } = await request("/probe/auth");
    assert.equal(response.status, 401);
    assert.equal(body.ok, false);
  });

  test("Firebase token auth rejects a malformed token", async () => {
    const { response, body } = await request("/probe/auth", {
      headers: { authorization: "Bearer not-a-jwt" }
    });
    assert.equal(response.status, 401);
    assert.equal(body.ok, false);
  });

  test("Firebase token auth rejects an invalid signature", async () => {
    const token = await signFirebaseToken();
    const brokenToken = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
    const { response, body } = await request("/probe/auth", {
      headers: { authorization: `Bearer ${brokenToken}` }
    });
    assert.equal(response.status, 401);
    assert.equal(body.ok, false);
  });

  test("Firebase token auth rejects an expired token", async () => {
    const token = await signFirebaseToken({ exp: 1 });
    const { response, body } = await request("/probe/auth", {
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.status, 401);
    assert.equal(body.ok, false);
  });

  test("Firebase token auth rejects the wrong audience", async () => {
    const token = await signFirebaseToken({ aud: "other-project" });
    const { response, body } = await request("/probe/auth", {
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.status, 401);
    assert.equal(body.ok, false);
  });

  test("Firebase token auth rejects the wrong issuer", async () => {
    const token = await signFirebaseToken({ iss: "https://securetoken.google.com/other-project" });
    const { response, body } = await request("/probe/auth", {
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.status, 401);
    assert.equal(body.ok, false);
  });

  test("archive reserve creates user storage row and document metadata", async () => {
    const env = makeEnv();
    const { response, body } = await reserve(validReserveInput, env);
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.duplicate, false);
    assert.equal(body.idempotent, false);
    assert.equal(body.document.ownerUid, "user-123");
    assert.equal(body.document.sha256, validReserveInput.sha256);
    assert.equal(body.document.storageKey, `users/user-123/documents/${body.document.documentId}/original.pdf`);
    assert.equal(body.document.byteSize, validReserveInput.byteSize);
    assert.equal(body.quota.used_bytes, 0);
    assert.equal(body.quota.reserved_bytes, validReserveInput.byteSize);
    assert.equal(body.quota.quota_bytes, 5_368_709_120);
  });

  test("archive reserve deduplicates same-user SHA-256 without reserving quota twice", async () => {
    const env = makeEnv();
    const first = await reserve(validReserveInput, env);
    const second = await reserve({
      ...validReserveInput,
      originalFileName: "again.pdf",
      displayName: "Again",
      byteSize: 4096,
      idempotencyKey: "reserve-duplicate-sha"
    }, env);

    assert.equal(first.response.status, 200);
    assert.equal(second.response.status, 200);
    assert.equal(second.body.duplicate, true);
    assert.equal(second.body.idempotent, false);
    assert.equal(second.body.document.documentId, first.body.document.documentId);
    assert.equal(second.body.quota.reserved_bytes, validReserveInput.byteSize);
  });

  test("archive reserve rejects reservation exceeding the 5 GiB logical quota", async () => {
    const env = makeEnv();
    env.PRINTPILOT_DB.users.set("user-123", {
      uid: "user-123",
      quota_bytes: 5_368_709_120,
      used_bytes: 0,
      reserved_bytes: 5_368_709_100,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    const { response, body } = await reserve({
      ...validReserveInput,
      byteSize: 25,
      idempotencyKey: "over-quota"
    }, env);
    assert.equal(response.status, 409);
    assert.equal(body.ok, false);
    assert.equal(body.error, "quota_exceeded");
  });

  test("archive reserve repeats with the same idempotency key safely", async () => {
    const env = makeEnv();
    const first = await reserve(validReserveInput, env);
    const second = await reserve(validReserveInput, env);

    assert.equal(first.response.status, 200);
    assert.equal(second.response.status, 200);
    assert.equal(second.body.idempotent, true);
    assert.equal(second.body.duplicate, true);
    assert.equal(second.body.document.documentId, first.body.document.documentId);
    assert.equal(second.body.quota.reserved_bytes, validReserveInput.byteSize);
  });

  test("archive reserve rejects invalid SHA-256", async () => {
    const { response, body } = await reserve({
      ...validReserveInput,
      sha256: "not-a-sha",
      idempotencyKey: "invalid-sha"
    });
    assert.equal(response.status, 400);
    assert.equal(body.ok, false);
    assert.equal(body.error, "invalid_sha256");
  });

  test("archive reserve rejects invalid PDF byte sizes", async () => {
    for (const [byteSize, idempotencyKey, sha256] of [
      [0, "zero", "0".repeat(64)],
      [-1, "negative", "1".repeat(64)],
      [524_288_001, "over-500mb", "2".repeat(64)]
    ]) {
      const { response, body } = await reserve({
        ...validReserveInput,
        sha256,
        byteSize,
        idempotencyKey
      });
      assert.equal(response.status, 400);
      assert.equal(body.ok, false);
      assert.equal(body.error, "invalid_byte_size");
    }
  });

  test("archive reserve rejects unauthenticated requests", async () => {
    const { response, body } = await request("/v1/archive/reserve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validReserveInput)
    });
    assert.equal(response.status, 401);
    assert.equal(body.ok, false);
  });

  test("archive reserve cannot over-reserve quota with concurrent requests", async () => {
    const env = makeEnv();
    env.PRINTPILOT_DB.users.set("user-123", {
      uid: "user-123",
      quota_bytes: 1_200,
      used_bytes: 0,
      reserved_bytes: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    const [first, second] = await Promise.all([
      reserve({ ...validReserveInput, sha256: "1".repeat(64), byteSize: 800, idempotencyKey: "race-a" }, env),
      reserve({ ...validReserveInput, sha256: "2".repeat(64), byteSize: 800, idempotencyKey: "race-b" }, env)
    ]);

    const statuses = [first.response.status, second.response.status].sort();
    assert.deepEqual(statuses, [200, 409]);
    assert.equal(env.PRINTPILOT_DB.users.get("user-123").reserved_bytes, 800);
    assert.equal(env.PRINTPILOT_DB.documents.size, 1);
  });

  test("multipart upload initiate succeeds for an owned active reservation", async () => {
    const env = makeEnv();
    const document = await reserveDocument(env);
    const { response, body } = await authRequest(`/v1/archive/${document.documentId}/upload/initiate`, {
      method: "POST"
    }, env);

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.repeated, false);
    assert.equal(body.upload.documentId, document.documentId);
    assert.equal(body.upload.status, "active");
    assert.equal(body.upload.storageKey, document.storageKey);
    assert.equal(env.PRINTPILOT_DB.documents.get(document.documentId).status, "uploading");
  });

  test("multipart upload initiate rejects unauthenticated requests", async () => {
    const env = makeEnv();
    const document = await reserveDocument(env);
    const { response, body } = await request(`/v1/archive/${document.documentId}/upload/initiate`, {
      method: "POST"
    }, env);

    assert.equal(response.status, 401);
    assert.equal(body.ok, false);
  });

  test("multipart upload initiate enforces reservation ownership", async () => {
    const env = makeEnv();
    const document = await reserveDocument(env);
    const { response, body } = await authRequest(`/v1/archive/${document.documentId}/upload/initiate`, {
      method: "POST"
    }, env, { sub: "other-user" });

    assert.equal(response.status, 403);
    assert.equal(body.ok, false);
    assert.equal(body.error, "reservation_forbidden");
  });

  test("multipart upload initiate rejects non-active reservations", async () => {
    const env = makeEnv();
    const document = await reserveDocument(env);
    env.PRINTPILOT_DB.documents.get(document.documentId).status = "failed";
    const { response, body } = await authRequest(`/v1/archive/${document.documentId}/upload/initiate`, {
      method: "POST"
    }, env);

    assert.equal(response.status, 409);
    assert.equal(body.ok, false);
    assert.equal(body.error, "reservation_not_active");
  });

  test("multipart upload accepts a streamed part", async () => {
    const env = makeEnv();
    const document = await reserveDocument(env);
    await authRequest(`/v1/archive/${document.documentId}/upload/initiate`, { method: "POST" }, env);
    const { response, body } = await authRequest(`/v1/archive/${document.documentId}/upload/parts/1`, {
      method: "PUT",
      body: "part-one"
    }, env);

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.partNumber, 1);
    assert.equal(body.etag, "etag-upload-1-1");
    assert.equal(env.PRINTPILOT_DB.multipartParts.get(`${document.documentId}:1`).etag, body.etag);
  });

  test("multipart upload rejects invalid part number and oversized part", async () => {
    const env = makeEnv();
    const document = await reserveDocument(env);
    await authRequest(`/v1/archive/${document.documentId}/upload/initiate`, { method: "POST" }, env);

    const invalidPart = await authRequest(`/v1/archive/${document.documentId}/upload/parts/0`, {
      method: "PUT",
      body: "part"
    }, env);
    assert.equal(invalidPart.response.status, 400);
    assert.equal(invalidPart.body.error, "invalid_part_number");

    const oversized = await authRequest(`/v1/archive/${document.documentId}/upload/parts/1`, {
      method: "PUT",
      headers: { "content-length": String(64 * 1024 * 1024 + 1) },
      body: "part"
    }, env);
    assert.equal(oversized.response.status, 400);
    assert.equal(oversized.body.error, "invalid_part_size");
  });

  test("multipart upload completes with validated uploaded parts", async () => {
    const env = makeEnv();
    const document = await reserveDocument(env);
    await authRequest(`/v1/archive/${document.documentId}/upload/initiate`, { method: "POST" }, env);
    const part = await authRequest(`/v1/archive/${document.documentId}/upload/parts/1`, {
      method: "PUT",
      body: "part-one"
    }, env);

    const { response, body } = await authRequest(`/v1/archive/${document.documentId}/upload/complete`, {
      method: "POST",
      body: JSON.stringify({ parts: [{ partNumber: 1, etag: part.body.etag }] })
    }, env);

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.repeated, false);
    assert.equal(body.upload.status, "completed");
    assert.equal(env.PRINTPILOT_ARCHIVE.objects.has(document.storageKey), true);
  });

  test("multipart upload complete rejects missing or invalid parts", async () => {
    const env = makeEnv();
    const document = await reserveDocument(env);
    await authRequest(`/v1/archive/${document.documentId}/upload/initiate`, { method: "POST" }, env);

    const missing = await authRequest(`/v1/archive/${document.documentId}/upload/complete`, {
      method: "POST",
      body: JSON.stringify({ parts: [{ partNumber: 1, etag: "missing" }] })
    }, env);
    assert.equal(missing.response.status, 400);
    assert.equal(missing.body.error, "missing_upload_part");

    const invalid = await authRequest(`/v1/archive/${document.documentId}/upload/complete`, {
      method: "POST",
      body: JSON.stringify({ parts: [] })
    }, env);
    assert.equal(invalid.response.status, 400);
    assert.equal(invalid.body.error, "invalid_parts");
  });

  test("multipart upload repeated complete is safe", async () => {
    const env = makeEnv();
    const document = await reserveDocument(env);
    await authRequest(`/v1/archive/${document.documentId}/upload/initiate`, { method: "POST" }, env);
    const part = await authRequest(`/v1/archive/${document.documentId}/upload/parts/1`, {
      method: "PUT",
      body: "part-one"
    }, env);
    const completeInput = {
      method: "POST",
      body: JSON.stringify({ parts: [{ partNumber: 1, etag: part.body.etag }] })
    };

    const first = await authRequest(`/v1/archive/${document.documentId}/upload/complete`, completeInput, env);
    const second = await authRequest(`/v1/archive/${document.documentId}/upload/complete`, completeInput, env);

    assert.equal(first.response.status, 200);
    assert.equal(second.response.status, 200);
    assert.equal(second.body.repeated, true);
    assert.equal(second.body.upload.status, "completed");
  });

  test("multipart upload abort succeeds and repeated abort is safe", async () => {
    const env = makeEnv();
    const document = await reserveDocument(env);
    await authRequest(`/v1/archive/${document.documentId}/upload/initiate`, { method: "POST" }, env);
    await authRequest(`/v1/archive/${document.documentId}/upload/parts/1`, {
      method: "PUT",
      body: "part-one"
    }, env);

    const first = await authRequest(`/v1/archive/${document.documentId}/upload/abort`, { method: "POST" }, env);
    const second = await authRequest(`/v1/archive/${document.documentId}/upload/abort`, { method: "POST" }, env);

    assert.equal(first.response.status, 200);
    assert.equal(first.body.upload.status, "aborted");
    assert.equal(second.response.status, 200);
    assert.equal(second.body.repeated, true);
    assert.equal(env.PRINTPILOT_DB.multipartParts.size, 0);
    assert.equal(env.PRINTPILOT_DB.documents.get(document.documentId).status, "reserved");
  });

  test("multipart upload rejects cross-user part upload access", async () => {
    const env = makeEnv();
    const document = await reserveDocument(env);
    await authRequest(`/v1/archive/${document.documentId}/upload/initiate`, { method: "POST" }, env);

    const { response, body } = await authRequest(`/v1/archive/${document.documentId}/upload/parts/1`, {
      method: "PUT",
      body: "part-one"
    }, env, { sub: "other-user" });

    assert.equal(response.status, 403);
    assert.equal(body.ok, false);
    assert.equal(body.error, "reservation_forbidden");
  });
});
