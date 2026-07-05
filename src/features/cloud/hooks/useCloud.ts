import { useSyncExternalStore } from "react";
import { cloudStore } from "../cloudStore";
import { networkMonitor, type NetworkStatus } from "../network/networkMonitor";
import { syncQueue } from "../queue/syncQueue";
import type { CloudState, CloudUser } from "../cloudTypes";
import type { SyncOperation, SyncState } from "../sync/syncTypes";

// Reactive reads over the cloud store / network monitor / sync queue. Selectors
// return stable references between updates so subscribers only re-render on a
// real change.

export function useCloudState(): CloudState {
  return useSyncExternalStore(cloudStore.subscribe, cloudStore.getSnapshot, cloudStore.getSnapshot);
}

export function useCloudUser(): CloudUser | null {
  return useSyncExternalStore(cloudStore.subscribe, selectUser, selectUser);
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(cloudStore.subscribe, selectSync, selectSync);
}

export function useNetworkStatus(): NetworkStatus {
  return useSyncExternalStore(networkMonitor.subscribe, networkMonitor.getStatus, networkMonitor.getStatus);
}

export function useSyncQueue(): SyncOperation[] {
  return useSyncExternalStore(syncQueue.subscribe, syncQueue.getSnapshot, syncQueue.getSnapshot);
}

const selectUser = (): CloudUser | null => cloudStore.getSnapshot().user;
const selectSync = (): SyncState => cloudStore.getSnapshot().sync;
