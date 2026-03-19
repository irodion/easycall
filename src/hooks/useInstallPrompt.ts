import { useState, useEffect, useCallback } from 'react';

// Module-level singleton — shared across all hook consumers
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((cb) => cb());
}

/**
 * Shared hook for PWA install prompt.
 * Returns the deferred prompt and an install trigger function.
 * Can be consumed by both the banner component and Settings.
 */
export function useInstallPrompt() {
  const [prompt, setPrompt] = useState(deferredPrompt);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Subscribe to module-level changes from other consumers
    const syncFromGlobal = () => setPrompt(deferredPrompt);
    listeners.add(syncFromGlobal);

    // Listen for the browser event
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt = e as unknown as BeforeInstallPromptEvent;
      notifyListeners();
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Listen for successful install
    const installedHandler = () => setInstalled(true);
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      listeners.delete(syncFromGlobal);
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const install = useCallback(async () => {
    if (!prompt) return;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') {
        deferredPrompt = null;
        notifyListeners();
        setInstalled(true);
      }
    } catch {
      // prompt() failed — keep prompt available for retry
    }
  }, [prompt]);

  const canInstall = !!prompt && !installed;

  return { canInstall, install };
}
