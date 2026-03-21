import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useCallStore } from '@/stores/callStore';

/** Minimum interval between update checks (1 hour). */
const MIN_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** Matches the call routes in App.tsx: /call/:contactId and /call-room/:roomId */
function isOnCallRoute(): boolean {
  const p = window.location.pathname;
  return p.startsWith('/call/') || p.startsWith('/call-room/');
}

/**
 * Registers the service worker, checks for updates when the app returns to
 * the foreground (energy-friendly — no polling timer), and reloads the page
 * when a new SW activates. Reload is deferred while the user is in a call.
 */
export function useServiceWorkerUpdate(): void {
  const pendingReloadRef = useRef(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const lastCheckRef = useRef(0);

  useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (registration) registrationRef.current = registration;
    },
  });

  // Check for SW updates on visibilitychange (app comes to foreground).
  // This avoids setInterval which keeps the device awake and drains battery.
  useEffect(() => {
    lastCheckRef.current = Date.now();

    function onVisibilityChange() {
      const reg = registrationRef.current;
      if (!reg) return;
      if (document.visibilityState !== 'visible') return;
      if (reg.installing) return;
      if (!navigator.onLine) return;
      if (Date.now() - lastCheckRef.current < MIN_CHECK_INTERVAL_MS) return;

      lastCheckRef.current = Date.now();
      void reg.update();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  // Listen for controller change → reload (deferred if in call).
  // Ignore the initial SW install (controller goes from null → SW) so first-time
  // visitors don't get a spurious reload that resets login/onboarding state.
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker) return;

    const hadControllerAtMount = navigator.serviceWorker.controller != null;
    let initialChangeSeen = false;

    const onControllerChange = () => {
      if (!hadControllerAtMount && !initialChangeSeen) {
        initialChangeSeen = true;
        return;
      }

      if (useCallStore.getState().isRinging || isOnCallRoute()) {
        pendingReloadRef.current = true;
      } else {
        window.location.reload();
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  // When call ends (ringing stops or user navigates away from call route),
  // apply any deferred reload. The no-deps effect is intentional: it runs on
  // every render but short-circuits on a single ref read in the common case.
  const isRinging = useCallStore((s) => s.isRinging);
  useEffect(() => {
    if (!pendingReloadRef.current) return;
    if (!isRinging && !isOnCallRoute()) {
      pendingReloadRef.current = false;
      window.location.reload();
    }
  });
}
