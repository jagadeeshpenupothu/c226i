import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { initializeApp, deleteApp } from "firebase/app";
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword
} from "firebase/auth";
import { connectFirestoreEmulator, doc, getDoc, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { connectStorageEmulator, getMetadata, getStorage, ref, uploadBytes } from "firebase/storage";

export const PROJECT_ID = "printpilot-emulator-test";
export const BUCKET = `${PROJECT_ID}.appspot.com`;
export const PORTS = {
  auth: 9099,
  firestore: 8080,
  functions: 5001,
  storage: 9199
};
export const MAX_PDF_BYTES = 524_288_000;
export const USER_QUOTA_BYTES = 5_368_709_120;

let appCounter = 0;
const clients = new Set();

export function requireEmulatorEnvironment() {
  const required = {
    FIREBASE_AUTH_EMULATOR_HOST: PORTS.auth,
    FIRESTORE_EMULATOR_HOST: PORTS.firestore,
    FIREBASE_STORAGE_EMULATOR_HOST: PORTS.storage,
    FIREBASE_FUNCTIONS_EMULATOR_HOST: PORTS.functions
  };
  for (const [name, port] of Object.entries(required)) {
    const value = process.env[name];
    assert.ok(value, `${name} must be set; refusing to run against production Firebase`);
    assert.ok(value.includes(String(port)), `${name} must point at deterministic emulator port ${port}; got ${value}`);
    assert.ok(!value.includes("googleapis.com"), `${name} points at a production host`);
  }
  if (process.env.GCLOUD_PROJECT) {
    assert.equal(process.env.GCLOUD_PROJECT, PROJECT_ID, "GCLOUD_PROJECT must be the emulator test project");
  }
}

export async function createRulesEnvironment() {
  requireEmulatorEnvironment();
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: "127.0.0.1",
      port: PORTS.firestore,
      rules: fs.readFileSync("firestore.rules", "utf8")
    },
    storage: {
      host: "127.0.0.1",
      port: PORTS.storage,
      rules: fs.readFileSync("storage.rules", "utf8")
    }
  });
}

export async function resetEmulators(testEnv) {
  await Promise.all([testEnv.clearFirestore(), testEnv.clearStorage(), clearAuthEmulator()]);
}

async function clearAuthEmulator() {
  const response = await fetch(`http://127.0.0.1:${PORTS.auth}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
    method: "DELETE"
  });
  assert.ok(response.ok, `Auth emulator reset failed: ${response.status} ${await response.text()}`);
}

export function validPdfFixture(label = "PrintPilot") {
  return Buffer.from(
    `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] >>
endobj
4 0 obj
<< /Producer (${label}) >>
endobj
trailer
<< /Root 1 0 R >>
%%EOF
`,
    "utf8"
  );
}

export function invalidFixture() {
  return Buffer.from("not a pdf", "utf8");
}

export function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function deterministicSha256(seed) {
  return crypto.createHash("sha256").update(`printpilot:${seed}`).digest("hex");
}

export async function createClient(label) {
  const app = initializeApp(
    {
      apiKey: "demo-api-key",
      authDomain: `${PROJECT_ID}.firebaseapp.com`,
      projectId: PROJECT_ID,
      appId: `demo-${label}`,
      storageBucket: BUCKET
    },
    `client-${label}-${appCounter++}`
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${PORTS.auth}`, { disableWarnings: true });
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, "127.0.0.1", PORTS.firestore);
  const storage = getStorage(app, `gs://${BUCKET}`);
  connectStorageEmulator(storage, "127.0.0.1", PORTS.storage);
  const functions = getFunctions(app, "us-central1");
  connectFunctionsEmulator(functions, "127.0.0.1", PORTS.functions);
  const client = { app, auth, firestore, storage, functions };
  clients.add(client);
  return client;
}

export async function disposeClient(client) {
  clients.delete(client);
  await deleteApp(client.app);
}

export async function cleanupFirebaseClients() {
  await Promise.all(Array.from(clients, (client) => disposeClient(client).catch(() => undefined)));
}

export async function createAccount(label) {
  const client = await createClient(label);
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const password = "Correct-Horse-Battery-Staple-42";
  const credential = await createUserWithEmailAndPassword(client.auth, email, password);
  return {
    label,
    uid: credential.user.uid,
    email,
    password,
    client
  };
}

export async function signInAccount(account, label) {
  const client = await createClient(label);
  await signInWithEmailAndPassword(client.auth, account.email, account.password);
  return client;
}

export async function callReserve(account, overrides = {}) {
  const pdf = overrides.pdfBytes ?? validPdfFixture();
  const input = {
    ownerUid: account.uid,
    sha256: sha256(pdf),
    originalFileName: "fixture.pdf",
    displayName: "fixture.pdf",
    byteSize: pdf.length,
    pageCount: 1,
    ...overrides
  };
  delete input.pdfBytes;
  const callable = httpsCallable(account.client.functions, "reservePdfArchive");
  const result = await callable(input);
  return result.data;
}

export async function callFinalize(account, input) {
  const callable = httpsCallable(account.client.functions, "finalizePdfArchive");
  const result = await callable({ ownerUid: account.uid, ...input });
  return result.data;
}

export async function callDelete(account, documentId) {
  const callable = httpsCallable(account.client.functions, "deletePdfArchive");
  const result = await callable({ ownerUid: account.uid, documentId });
  return result.data;
}

export async function uploadPdf(account, storagePath, pdfBytes = validPdfFixture()) {
  const uploadRef = ref(account.client.storage, storagePath);
  await uploadBytes(uploadRef, pdfBytes, { contentType: "application/pdf" });
  return getMetadata(uploadRef);
}

export async function readDocument(account, documentId) {
  return getDoc(doc(account.client.firestore, "users", account.uid, "documents", documentId));
}

export async function readQuota(account) {
  const snap = await getDoc(doc(account.client.firestore, "users", account.uid, "account", "quota"));
  return snap.exists() ? snap.data() : { usedBytes: 0, reservedBytes: 0, quotaBytes: USER_QUOTA_BYTES };
}

export async function seedFirestore(testEnv, callback) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await callback(context.firestore());
  });
}

export async function trustedDocumentExists(testEnv, uid, documentId) {
  let exists = false;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const snap = await context.firestore().doc(`users/${uid}/documents/${documentId}`).get();
    exists = snap.exists;
  });
  return exists;
}

export async function archivePdf(account, pdfBytes = validPdfFixture()) {
  const reservation = await callReserve(account, {
    pdfBytes,
    sha256: sha256(pdfBytes),
    byteSize: pdfBytes.length
  });
  await uploadPdf(account, reservation.storagePath, pdfBytes);
  const finalized = await callFinalize(account, {
    documentId: reservation.documentId,
    storagePath: reservation.storagePath,
    sha256: sha256(pdfBytes),
    byteSize: pdfBytes.length
  });
  return { reservation, finalized };
}

export async function expectCallableFailure(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, `functions/${code}`);
    return true;
  });
}
