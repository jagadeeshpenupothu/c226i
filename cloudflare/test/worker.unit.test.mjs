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
});
