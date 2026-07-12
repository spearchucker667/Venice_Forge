import { useEffect, useRef } from "react";
import StorageService from "../services/storageService";
import { warn } from "../shared/logger";
import { toast } from "../stores/toast-store";
import type { AppState, AppDispatch } from "../types/app";

/**
 * Debounces settings changes and persists them to IndexedDB.
 * Only activates once both the database and initial hydration are ready.
 */
export function useSettingsPersistence(
  settings: AppState["settings"],
  dbReady: boolean,
  settingsHydrated: boolean,
  dispatch: AppDispatch
): void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!dbReady || !settingsHydrated) return;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      StorageService.saveItem("settings", {
        id: "app-settings",
        value: settings,
        timestamp: Date.now(),
      }).catch((err) => {
        warn("Settings save failed", err);
        toast.error("Failed to save settings to local storage.");
      });
    }, 500);
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [dbReady, settingsHydrated, settings, dispatch]);
}
