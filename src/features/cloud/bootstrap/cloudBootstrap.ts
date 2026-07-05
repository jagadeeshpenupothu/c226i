import { cloudManager } from "../cloudManager";
import { FirebaseProvider, type FirebaseConfig } from "../providers/firebaseProvider";

// Cloud composition root.
//
// This is the ONE place that decides which cloud provider PrintPilot uses and
// wires it into the CloudManager. It reads configuration from the environment,
// constructs the provider, registers it, and initializes the manager. It imports
// the provider CLASS (not the Firebase SDK) — so App.tsx and all business logic
// stay completely Firebase-unaware.
//
// To switch backends later (Supabase / Appwrite / Azure / custom), only this
// file changes: construct a different provider and register it. Nothing else in
// the app is touched.

// Reads Vite env vars (VITE_FIREBASE_*). Returns null when the essential keys are
// absent so the app runs fully local/offline — a missing config is NOT an error.
function readFirebaseConfig(): FirebaseConfig | null {
  const env = import.meta.env;
  const config: FirebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    measurementId: env.VITE_FIREBASE_MEASUREMENT_ID
  };
  const required = [config.apiKey, config.authDomain, config.projectId, config.appId];
  if (required.some((value) => !value || value.trim().length === 0)) return null;
  return config;
}

// Bootstraps the cloud layer. Always safe to call: with no/invalid config it
// starts the local-first cloud layer (network monitor + state) without any
// provider, so the app behaves exactly as before. Returns a cleanup function
// suitable for a React effect.
export function bootstrapCloud(): () => void {
  // Provider registration is best-effort. If config is missing or construction
  // fails, we simply skip it and run local-only — never a crash.
  try {
    const config = readFirebaseConfig();
    if (config) {
      cloudManager.registerProvider(new FirebaseProvider(config));
    } else if (import.meta.env.DEV) {
      console.info("[cloud] Firebase is not configured (VITE_FIREBASE_*) — running local-only.");
    }
  } catch (error) {
    if (import.meta.env.DEV) console.warn("[cloud] provider registration failed — continuing local-only.", error);
  }

  // Always initialize the cloud layer (network monitor + state), with or without
  // a provider. Fire-and-forget and internally guarded — never blocks or crashes
  // app startup.
  void cloudManager.initialize();

  return () => {
    void cloudManager.dispose();
  };
}
