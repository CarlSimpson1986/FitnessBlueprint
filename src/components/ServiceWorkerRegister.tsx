"use client";

import { useEffect } from "react";

/**
 * Registers the service worker for offline support. Mounted once from
 * the root layout. This is what lets the live session cockpit keep
 * working (queueing attendance/notes locally) if gym WiFi drops.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch((error) => {
      // Don't crash the app over this — offline support degrading
      // gracefully to "just works when online" is fine.
      console.error("Service worker registration failed:", error);
    });
  }, []);

  return null;
}
