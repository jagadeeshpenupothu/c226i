import { verifyFirebaseIdToken } from "./auth.js";
import { ArchiveError, reserveArchiveDocument } from "./archiveRepository.js";
import {
  abortMultipartUpload,
  completeMultipartUpload,
  initiateMultipartUpload,
  uploadMultipartPart
} from "./uploadRepository.js";

const SERVICE_NAME = "printpilot-cloudflare-local";
const DEV_UID = "local-single-user";
const USER_QUOTA_BYTES = 5_368_709_120;

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function notFound() {
  return json({ ok: false, error: "not_found" }, 404);
}

function unauthorized() {
  return json({ ok: false, error: "unauthorized" }, 401);
}

function errorResponse(error) {
  if (error instanceof ArchiveError) {
    return json({ ok: false, error: error.code }, error.status);
  }
  return json({ ok: false, error: "internal_error" }, 500);
}

async function authenticate(request, env) {
  try {
    return await verifyFirebaseIdToken(request, env);
  } catch {
    return null;
  }
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    throw new ArchiveError(400, "invalid_json");
  }
}

async function handleD1Probe(env) {
  const documentId = crypto.randomUUID();
  const storageKey = `users/${DEV_UID}/documents/${documentId}/original.pdf`;
  const now = new Date().toISOString();
  const sha256 = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");

  await env.PRINTPILOT_DB.prepare(
    `INSERT OR IGNORE INTO users (uid, quota_bytes, used_bytes, reserved_bytes, created_at, updated_at)
     VALUES (?, ?, 0, 0, ?, ?)`
  )
    .bind(DEV_UID, USER_QUOTA_BYTES, now, now)
    .run();

  await env.PRINTPILOT_DB.prepare(
    `INSERT INTO documents (
       document_id, owner_uid, sha256, storage_key, original_file_name,
       display_name, content_type, byte_size, page_count, status,
       created_at, updated_at, last_opened_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      documentId,
      DEV_UID,
      sha256,
      storageKey,
      "local-probe.pdf",
      "local-probe.pdf",
      "application/pdf",
      12,
      1,
      "reserved",
      now,
      now,
      now
    )
    .run();

  const document = await env.PRINTPILOT_DB.prepare(
    `SELECT document_id, owner_uid, storage_key, byte_size, status
     FROM documents
     WHERE document_id = ?`
  )
    .bind(documentId)
    .first();

  const usage = await env.PRINTPILOT_DB.prepare(
    `SELECT owner_uid, used_bytes, reserved_bytes, quota_bytes
     FROM storage_usage
     WHERE owner_uid = ?`
  )
    .bind(DEV_UID)
    .first();

  return json({
    ok: true,
    probe: "d1",
    document,
    usage
  });
}

async function handleR2Probe(env) {
  const key = `probes/${crypto.randomUUID()}.txt`;
  const expected = `printpilot-r2-probe:${new Date().toISOString()}`;

  await env.PRINTPILOT_ARCHIVE.put(key, expected, {
    httpMetadata: { contentType: "text/plain; charset=utf-8" }
  });

  const object = await env.PRINTPILOT_ARCHIVE.get(key);
  const actual = object ? await object.text() : null;
  await env.PRINTPILOT_ARCHIVE.delete(key);
  const afterDelete = await env.PRINTPILOT_ARCHIVE.get(key);

  return json({
    ok: actual === expected && afterDelete === null,
    probe: "r2",
    key,
    bytes: expected.length,
    readMatchesWrite: actual === expected,
    deleted: afterDelete === null
  });
}

async function fetch(request, env) {
  const url = new URL(request.url);
  const uploadRoute = url.pathname.match(/^\/v1\/archive\/([^/]+)\/upload(?:\/([^/]+)(?:\/([^/]+))?)?$/);

  if (request.method === "GET" && url.pathname === "/health") {
    return json({
      ok: true,
      service: SERVICE_NAME,
      bindings: {
        d1: Boolean(env.PRINTPILOT_DB),
        r2: Boolean(env.PRINTPILOT_ARCHIVE)
      }
    });
  }

  if (request.method === "POST" && url.pathname === "/probe/d1") {
    return handleD1Probe(env);
  }

  if (request.method === "POST" && url.pathname === "/probe/r2") {
    return handleR2Probe(env);
  }

  if (request.method === "GET" && url.pathname === "/probe/auth") {
    const auth = await authenticate(request, env);
    if (!auth) return unauthorized();
    return json({ ok: true, uid: auth.uid });
  }

  if (request.method === "POST" && url.pathname === "/v1/archive/reserve") {
    const auth = await authenticate(request, env);
    if (!auth) return unauthorized();
    try {
      const result = await reserveArchiveDocument(env.PRINTPILOT_DB, auth.uid, await readJsonBody(request));
      return json({ ok: true, ...result });
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (uploadRoute) {
    const auth = await authenticate(request, env);
    if (!auth) return unauthorized();
    const [, documentId, action, partNumber] = uploadRoute;
    try {
      if (request.method === "POST" && action === "initiate") {
        const result = await initiateMultipartUpload(env.PRINTPILOT_DB, env.PRINTPILOT_ARCHIVE, auth.uid, documentId);
        return json({ ok: true, ...result });
      }
      if (request.method === "PUT" && action === "parts") {
        const result = await uploadMultipartPart(env.PRINTPILOT_DB, env.PRINTPILOT_ARCHIVE, auth.uid, documentId, partNumber, request);
        return json({ ok: true, ...result });
      }
      if (request.method === "POST" && action === "complete") {
        const result = await completeMultipartUpload(env.PRINTPILOT_DB, env.PRINTPILOT_ARCHIVE, auth.uid, documentId, await readJsonBody(request));
        return json({ ok: true, ...result });
      }
      if (request.method === "POST" && action === "abort") {
        const result = await abortMultipartUpload(env.PRINTPILOT_DB, env.PRINTPILOT_ARCHIVE, auth.uid, documentId);
        return json({ ok: true, ...result });
      }
    } catch (error) {
      return errorResponse(error);
    }
  }

  return notFound();
}

export default { fetch };
