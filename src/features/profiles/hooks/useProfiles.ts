import { useMemo, useSyncExternalStore } from "react";
import { DEFAULT_PROFILES } from "../defaultProfiles";
import { profileStore } from "../profileStore";
import type { PrintProfile } from "../profileTypes";

// Reactive user profiles (persisted, editable).
export function useUserProfiles(): PrintProfile[] {
  return useSyncExternalStore(profileStore.subscribe, profileStore.getSnapshot, profileStore.getSnapshot);
}

// All profiles: read-only built-in templates first, then the user's profiles.
export function useProfiles(): PrintProfile[] {
  const user = useUserProfiles();
  return useMemo(() => [...DEFAULT_PROFILES, ...user], [user]);
}
