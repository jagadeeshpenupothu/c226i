import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const BASE_URL = "http://127.0.0.1:8787";
const WORKSPACE_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const WRANGLER_HOME = join(WORKSPACE_DIR, ".wrangler-home");
const WRANGLER_ENV = { ...process.env, HOME: WRANGLER_HOME };

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

await run("npx", ["wrangler", "d1", "migrations", "apply", "printpilot-local", "--local"]);

const worker = startWorker();
try {
  await waitForHealth();
  const health = await readJson("/health");
  assert.deepEqual(health.bindings, { d1: true, r2: true });

  const d1 = await readJson("/probe/d1", { method: "POST" });
  assert.equal(d1.document.owner_uid, "local-single-user");
  assert.equal(d1.usage.quota_bytes, 5_368_709_120);

  const r2 = await readJson("/probe/r2", { method: "POST" });
  assert.equal(r2.readMatchesWrite, true);
  assert.equal(r2.deleted, true);

  console.log("Local Cloudflare smoke test passed.");
} finally {
  worker.kill("SIGTERM");
}
