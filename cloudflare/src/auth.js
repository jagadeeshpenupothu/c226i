const FIREBASE_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const CLOCK_SKEW_SECONDS = 300;

let publicKeyCache = null;

function unauthorized(reason) {
  const error = new Error(reason);
  error.status = 401;
  return error;
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function decodeJsonSegment(value) {
  const text = new TextDecoder().decode(decodeBase64Url(value));
  return JSON.parse(text);
}

function cacheExpiryFromHeaders(headers, nowMs) {
  const cacheControl = headers.get("cache-control") ?? "";
  const match = cacheControl.match(/(?:^|,\s*)max-age=(\d+)/i);
  if (!match) return nowMs;
  return nowMs + Number(match[1]) * 1000;
}

async function importPublicKey(keyMaterial) {
  return crypto.subtle.importKey(
    "jwk",
    keyMaterial,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
}

async function loadPublicKeys(env) {
  const nowMs = Date.now();
  if (env.FIREBASE_PUBLIC_KEYS) {
    return JSON.parse(env.FIREBASE_PUBLIC_KEYS);
  }

  if (publicKeyCache && publicKeyCache.expiresAt > nowMs) {
    return publicKeyCache.keys;
  }

  const response = await fetch(FIREBASE_JWKS_URL);
  if (!response.ok) {
    throw unauthorized("public_keys_unavailable");
  }
  const jwks = await response.json();
  const keys = Object.fromEntries((jwks.keys ?? []).map((key) => [key.kid, key]));
  publicKeyCache = {
    keys,
    expiresAt: cacheExpiryFromHeaders(response.headers, nowMs)
  };
  return keys;
}

function parseAuthorization(request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw unauthorized("missing_bearer_token");
  return match[1].trim();
}

function validateClaims(payload, projectId, nowSeconds) {
  if (payload.aud !== projectId) throw unauthorized("wrong_audience");
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw unauthorized("wrong_issuer");
  if (typeof payload.sub !== "string" || payload.sub.length === 0) throw unauthorized("missing_subject");
  if (!Number.isFinite(payload.exp) || payload.exp <= nowSeconds) throw unauthorized("expired_token");
  if (!Number.isFinite(payload.iat) || payload.iat > nowSeconds + CLOCK_SKEW_SECONDS) {
    throw unauthorized("invalid_issued_at");
  }
}

export async function verifyFirebaseIdToken(request, env, nowSeconds = Math.floor(Date.now() / 1000)) {
  const projectId = env.FIREBASE_PROJECT_ID;
  if (typeof projectId !== "string" || projectId.length === 0) {
    throw unauthorized("firebase_project_not_configured");
  }

  const token = parseAuthorization(request);
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    throw unauthorized("malformed_token");
  }

  let header;
  let payload;
  try {
    header = decodeJsonSegment(parts[0]);
    payload = decodeJsonSegment(parts[1]);
  } catch {
    throw unauthorized("malformed_token");
  }

  if (header.alg !== "RS256") throw unauthorized("unsupported_algorithm");
  if (typeof header.kid !== "string" || header.kid.length === 0) throw unauthorized("missing_key_id");

  const keys = await loadPublicKeys(env);
  const keyMaterial = keys[header.kid];
  if (!keyMaterial) throw unauthorized("unknown_key_id");

  const publicKey = await importPublicKey(keyMaterial);
  const signatureValid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    decodeBase64Url(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  if (!signatureValid) throw unauthorized("invalid_signature");

  validateClaims(payload, projectId, nowSeconds);
  return { uid: payload.sub };
}
