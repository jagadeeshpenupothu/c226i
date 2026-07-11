import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const PUBLIC_RELEASE_ENV = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_GOOGLE_DRIVE_OAUTH_CLIENT_ID",
  "VITE_GOOGLE_DRIVE_SHARED_DRIVE_ID"
];

const NATIVE_RELEASE_ENV = ["PRINTPILOT_GOOGLE_DRIVE_OAUTH_CLIENT_SECRET"];

const FORBIDDEN_TRACKED_PATTERNS = [
  /^\.env$/,
  /^\.env\.local$/,
  /^\.env\..*\.local$/,
  /(^|\/)client_secret.*\.json$/,
  /(^|\/)oauth-client.*\.json$/,
  /(^|\/)google-oauth.*\.json$/,
  /(^|\/)google_credentials.*\.json$/
];

const FRONTEND_SECRET_PATTERNS = [
  /PRINTPILOT_GOOGLE_DRIVE_OAUTH_CLIENT_SECRET/,
  /PRINTPILOT_EMBEDDED_GOOGLE_DRIVE_OAUTH_CLIENT_SECRET/,
  /VITE_.*CLIENT_SECRET/,
  /client_secret/i,
  /refresh_token/i,
  /access_token/i
];

const DIST_FORBIDDEN_NAMES = [
  ".env",
  ".env.local",
  "client_secret",
  "oauth-client",
  "google-oauth",
  "google_credentials"
];

function fail(message) {
  console.error(`[release-config] ${message}`);
  process.exitCode = 1;
}

function requireEnv(names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (!value) fail(`${name} is required for release builds.`);
  }
}

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

function walkFiles(root) {
  if (!existsSync(root)) return [];
  const entries = readdirSync(root);
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function verifySourceSafety() {
  for (const file of trackedFiles()) {
    if (FORBIDDEN_TRACKED_PATTERNS.some((pattern) => pattern.test(file))) {
      fail(`forbidden credential/config file is tracked: ${file}`);
    }
  }

  const tauriConfig = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
  const resources = tauriConfig.bundle?.resources ?? [];
  for (const resource of resources) {
    const value = String(resource);
    if (DIST_FORBIDDEN_NAMES.some((name) => value.includes(name))) {
      fail(`forbidden credential/config resource is packaged: ${value}`);
    }
  }

  const frontendFiles = walkFiles("src").filter((file) => /\.(ts|tsx)$/.test(file));
  for (const file of frontendFiles) {
    const contents = readFileSync(file, "utf8");
    if (FRONTEND_SECRET_PATTERNS.some((pattern) => pattern.test(contents))) {
      fail(`frontend source contains native credential/token wording: ${file}`);
    }
  }
}

function verifyFrontendDist(root = "dist") {
  const secret = process.env.PRINTPILOT_GOOGLE_DRIVE_OAUTH_CLIENT_SECRET?.trim();
  const distFiles = walkFiles(root);
  if (distFiles.length === 0) {
    fail(`${root}/ does not exist; build frontend before scanning release assets.`);
    return;
  }

  for (const file of distFiles) {
    const relative = path.relative(process.cwd(), file);
    if (DIST_FORBIDDEN_NAMES.some((name) => relative.includes(name))) {
      fail(`frontend dist contains forbidden local credential/config file: ${relative}`);
    }

    const contents = readFileSync(file);
    if (secret && contents.includes(Buffer.from(secret))) {
      fail(`frontend dist contains the native OAuth client secret: ${relative}`);
    }
    if (
      contents.includes(Buffer.from("PRINTPILOT_GOOGLE_DRIVE_OAUTH_CLIENT_SECRET")) ||
      contents.includes(Buffer.from("PRINTPILOT_EMBEDDED_GOOGLE_DRIVE_OAUTH_CLIENT_SECRET"))
    ) {
      fail(`frontend dist contains native OAuth credential variable names: ${relative}`);
    }
  }
}

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const frontendDistArg = rawArgs
  .find((arg) => arg.startsWith("--frontend-dist="))
  ?.slice("--frontend-dist=".length);

if (args.has("--release-env")) {
  requireEnv(PUBLIC_RELEASE_ENV);
  requireEnv(NATIVE_RELEASE_ENV);
}

if (args.has("--source-safety")) {
  verifySourceSafety();
}

if (args.has("--frontend-dist") || frontendDistArg) {
  verifyFrontendDist(frontendDistArg || "dist");
}

if (args.size === 0) {
  requireEnv(PUBLIC_RELEASE_ENV);
  requireEnv(NATIVE_RELEASE_ENV);
  verifySourceSafety();
}
