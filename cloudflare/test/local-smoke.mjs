import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const BASE_URL = "http://127.0.0.1:8787";
const WORKSPACE_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const WRANGLER_HOME = join(WORKSPACE_DIR, ".wrangler-home");
const WRANGLER_ENV = { ...process.env, HOME: WRANGLER_HOME };
const TEST_KID = "printpilot-test-key";
const FIREBASE_PROJECT_ID = "printpilot-local";
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

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: WORKSPACE_DIR,
      env: WRANGLER_ENV,
      stdio: "inherit"
    });
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function signFirebaseToken() {
  const header = { alg: "RS256", kid: TEST_KID, typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: FIREBASE_PROJECT_ID,
    iss: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    sub: "local-smoke-user",
    iat: now,
    exp: now + 3600
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

function writeLocalAuthVars() {
  const publicKeys = JSON.stringify({ [TEST_KID]: TEST_PUBLIC_JWK });
  writeFileSync(
    join(WORKSPACE_DIR, ".dev.vars"),
    `FIREBASE_PUBLIC_KEYS='${publicKeys}'\n`,
    "utf8"
  );
}

function removeLocalAuthVars() {
  const path = join(WORKSPACE_DIR, ".dev.vars");
  if (existsSync(path)) unlinkSync(path);
}

function startWorker() {
  const child = spawn(
    "npx",
    ["wrangler", "dev", "--local", "--ip", "127.0.0.1", "--port", "8787"],
    {
      cwd: WORKSPACE_DIR,
      env: WRANGLER_ENV,
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  return child;
}

async function waitForHealth() {
  let lastError;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.ok) return response;
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }
  throw lastError ?? new Error("Worker did not become ready");
}

async function readJson(path, init) {
  const response = await fetch(`${BASE_URL}${path}`, init);
  const body = await response.json();
  assert.equal(response.ok, true, `${path} failed: ${JSON.stringify(body)}`);
  assert.equal(body.ok, true, `${path} returned ok=false: ${JSON.stringify(body)}`);
  return body;
}

async function readAuthenticatedJson(path, token, init = {}) {
  return readJson(path, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      authorization: `Bearer ${token}`
    }
  });
}

async function runMultipartArchiveSmoke(token) {
  const runId = crypto.randomUUID();
  const prefix = new TextEncoder().encode(`%PDF-1.7\n% PrintPilot local multipart smoke ${runId}\n`);
  const suffix = new TextEncoder().encode("\n%%EOF\n");
  const pdfBytes = new Uint8Array(5 * 1024 * 1024);
  pdfBytes.set(prefix, 0);
  pdfBytes.fill(0x20, prefix.byteLength, pdfBytes.byteLength - suffix.byteLength);
  pdfBytes.set(suffix, pdfBytes.byteLength - suffix.byteLength);
  const sha256 = createHash("sha256").update(pdfBytes).digest("hex");
  const reservation = await readAuthenticatedJson("/v1/archive/reserve", token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sha256,
      originalFileName: "local-smoke.pdf",
      displayName: "Local smoke PDF",
      byteSize: pdfBytes.byteLength,
      pageCount: 1,
      idempotencyKey: `local-smoke-${runId}`
    })
  });

  const documentId = reservation.document.documentId;
  const storageKey = reservation.document.storageKey;
  const initiated = await readAuthenticatedJson(`/v1/archive/${documentId}/upload/initiate`, token, {
    method: "POST"
  });
  assert.equal(initiated.upload.storageKey, storageKey);

  const part = await readAuthenticatedJson(`/v1/archive/${documentId}/upload/parts/1`, token, {
    method: "PUT",
    headers: { "content-length": String(pdfBytes.byteLength) },
    body: pdfBytes
  });
  assert.equal(part.partNumber, 1);
  assert.equal(typeof part.etag, "string");

  const completed = await readAuthenticatedJson(`/v1/archive/${documentId}/upload/complete`, token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ parts: [{ partNumber: 1, etag: part.etag }] })
  });
  assert.equal(completed.upload.status, "completed");

  const outputFile = join(tmpdir(), `printpilot-r2-${runId}.pdf`);
  try {
    await run("npx", [
      "wrangler",
      "r2",
      "object",
      "get",
      `printpilot-local-archive/${storageKey}`,
      "--local",
      "--file",
      outputFile
    ]);
    const storedBytes = readFileSync(outputFile);
    assert.equal(storedBytes.byteLength, pdfBytes.byteLength);
    assert.equal(Buffer.compare(storedBytes, Buffer.from(pdfBytes)), 0);
  } finally {
    if (existsSync(outputFile)) unlinkSync(outputFile);
  }
}

writeLocalAuthVars();
await run("npx", ["wrangler", "d1", "migrations", "apply", "printpilot-local", "--local"]);

const worker = startWorker();
try {
  const token = await signFirebaseToken();
  await waitForHealth();
  const health = await readJson("/health");
  assert.deepEqual(health.bindings, { d1: true, r2: true });

  const d1 = await readJson("/probe/d1", { method: "POST" });
  assert.equal(d1.document.owner_uid, "local-single-user");
  assert.equal(d1.usage.quota_bytes, 5_368_709_120);

  const r2 = await readJson("/probe/r2", { method: "POST" });
  assert.equal(r2.readMatchesWrite, true);
  assert.equal(r2.deleted, true);

  await runMultipartArchiveSmoke(token);

  console.log("Local Cloudflare smoke test passed.");
} finally {
  worker.kill("SIGTERM");
  removeLocalAuthVars();
}
