// Reusable, provider-agnostic network monitor.
//
// Wraps `navigator.onLine` plus the browser `online` / `offline` events behind a
// small observable so the rest of the app never touches the DOM API directly.
// A `reconnect()` hook is provided as the seam for future *active* reachability
// polling (a heartbeat to a health endpoint), so "online" can eventually mean
// "the cloud is actually reachable" rather than merely "a network interface
// exists". Nothing here knows about Firebase or any cloud provider.

export type NetworkStatus = "online" | "offline" | "unknown";

class NetworkMonitor {
  private status: NetworkStatus = "unknown";
  private started = false;
  private readonly listeners = new Set<(status: NetworkStatus) => void>();

  readonly subscribe = (listener: (status: NetworkStatus) => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  // Stable primitive — safe as a useSyncExternalStore snapshot.
  readonly getStatus = (): NetworkStatus => this.status;

  isOnline(): boolean {
    return this.status === "online";
  }

  // Idempotent — safe to call repeatedly (e.g. React StrictMode double-invoke).
  start(): void {
    if (this.started) return;
    this.started = true;
    this.status = readNavigatorStatus();
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline);
      window.addEventListener("offline", this.handleOffline);
    }
    this.emit();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleOnline);
      window.removeEventListener("offline", this.handleOffline);
    }
  }

  // Force a re-check now — used by a manual "Reconnect" action. Future phases
  // will make this ping a health endpoint and only resolve "online" on success.
  reconnect(): NetworkStatus {
    this.setStatus(readNavigatorStatus());
    return this.status;
  }

  private readonly handleOnline = () => this.setStatus("online");
  private readonly handleOffline = () => this.setStatus("offline");

  private setStatus(next: NetworkStatus): void {
    if (next === this.status) return;
    this.status = next;
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener(this.status));
  }
}

function readNavigatorStatus(): NetworkStatus {
  if (typeof navigator === "undefined" || typeof navigator.onLine !== "boolean") return "unknown";
  return navigator.onLine ? "online" : "offline";
}

export const networkMonitor = new NetworkMonitor();
