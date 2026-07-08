#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const [, , alias, only] = process.argv;
const allowedAliases = new Set(["staging", "production"]);

function fail(message) {
  console.error(`Firebase deploy blocked: ${message}`);
  process.exit(1);
}

if (!alias || !allowedAliases.has(alias)) {
  fail("expected an explicit project alias: staging or production.");
}

if (!only || only.trim().length === 0) {
  fail("expected an explicit --only target list.");
}

if (!existsSync(".firebaserc")) {
  fail("missing .firebaserc. Create it locally from .firebaserc.example and map the requested alias first.");
}

const firebaseRc = JSON.parse(readFileSync(".firebaserc", "utf8"));
const projectId = firebaseRc.projects?.[alias];
if (!projectId || typeof projectId !== "string" || projectId.includes("<")) {
  fail(`.firebaserc does not define a concrete projects.${alias} value.`);
}

if (alias === "production" && process.env.PRINTPILOT_CONFIRM_PRODUCTION_DEPLOY !== "deploy-production") {
  fail("production deploys require PRINTPILOT_CONFIRM_PRODUCTION_DEPLOY=deploy-production.");
}

const args = ["firebase", "deploy", "--project", alias, "--only", only];
const result = spawnSync("npx", args, {
  stdio: "inherit",
  env: {
    ...process.env,
    FIREBASE_CLI_DISABLE_UPDATE_CHECK: "true"
  }
});

process.exit(result.status ?? 1);
