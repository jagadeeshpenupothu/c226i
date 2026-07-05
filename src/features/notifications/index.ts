// Toast Notification System — public API.
//
// A transient presentation layer over the existing Notification Center. Toasts
// mirror center entries (never duplicate them) and auto-dismiss; the center
// remains the permanent history.
//
//   toastManager.start()          → begin mirroring the Notification Center
//   <ToastViewport onOpenJob />    → the floating top-right stack
//   useToasts()                    → reactive list of visible toasts
export { toastManager, MAX_VISIBLE_TOASTS, AUTO_DISMISS_MS, type Toast } from "./toastManager";
export { useToasts } from "./useToasts";
export { ToastViewport } from "./components/ToastViewport";
export { ToastItem } from "./components/ToastItem";
