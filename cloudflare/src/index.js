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

async function handleD1Probe(env) {
  const documentId = crypto.randomUUID();
  const storageKey = `users/${DEV_UID}/documents/${documentId}/original.pdf`;
  const now = new Date().toISOString();

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
      "0".repeat(64),
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

  return notFound();
}

export default { fetch };

