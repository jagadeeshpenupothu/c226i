import { useSyncExternalStore } from "react";
import { toastManager, type Toast } from "./toastManager";

// Reactive view of the currently-visible toasts (newest first).
export function useToasts(): Toast[] {
  return useSyncExternalStore(toastManager.subscribe, toastManager.getSnapshot, toastManager.getSnapshot);
}
