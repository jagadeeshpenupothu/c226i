import { useSyncExternalStore } from "react";
import { cloudDocumentService } from "./cloudDocumentService";
import { guestHistoryRepository } from "./guestHistoryRepository";
import type { CurrentDocumentCloudState, GuestHistoryItem } from "./documentTypes";

export function useCurrentDocumentCloudState(): CurrentDocumentCloudState | null {
  return useSyncExternalStore(cloudDocumentService.subscribe, cloudDocumentService.getSnapshot, cloudDocumentService.getSnapshot);
}

export function useGuestHistory(): GuestHistoryItem[] {
  return useSyncExternalStore(guestHistoryRepository.subscribe, guestHistoryRepository.getSnapshot, guestHistoryRepository.getSnapshot);
}
