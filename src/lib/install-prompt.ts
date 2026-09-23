/**
 * PWA install support for the "Get app" tab (src/components/InstallAppTab.tsx).
 *
 * Chrome/Android fire `beforeinstallprompt` once, early — often before the
 * tab mounts — so it's captured here at module load and held for later.
 * iOS Safari never fires it (installing is manual: Share → Add to Home
 * Screen), so callers fall back to instructions there.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferredPrompt = null;
    notify();
  });
}

export function subscribeInstallState(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True when running as the installed app (or just installed). */
export function isRunningInstalled() {
  if (installed) return true;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia("(display-mode: standalone)").matches;
}

export function canPromptInstall() {
  return deferredPrompt !== null;
}

/** Shows the browser's own install dialog. Returns false if unavailable. */
export async function promptInstall() {
  if (!deferredPrompt) return false;
  const prompt = deferredPrompt;
  deferredPrompt = null;
  await prompt.prompt();
  await prompt.userChoice;
  notify();
  return true;
}

export function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
