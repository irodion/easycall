let loadPromise: Promise<void> | null = null;

/** Test-only: reset the cached promise between tests */
export function _resetLoadPromise(): void {
  loadPromise = null;
}

/**
 * Returns the JaaS App ID (vpaas-magic-cookie-…) from the environment.
 * Throws if unconfigured (except in test mode).
 */
export function getJaasAppId(): string {
  const raw = import.meta.env.VITE_JAAS_APP_ID as string | undefined;
  const appId = (raw ?? '').trim();
  if (!appId && import.meta.env.MODE !== 'test') {
    throw new Error('VITE_JAAS_APP_ID is not set. Check your .env.local file.');
  }
  return appId;
}

/** Timeout for loading the Jitsi external API script (ms). */
export const LOAD_TIMEOUT_MS = 15_000;

export function loadJitsiApi(): Promise<void> {
  // Already loaded
  if (window.JitsiMeetExternalAPI) {
    return Promise.resolve();
  }

  // Deduplicate concurrent calls
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise<void>((resolve, reject) => {
    const appId = getJaasAppId();
    const src = `https://8x8.vc/${appId}/external_api.js`;

    const script = document.createElement('script');
    script.src = src;
    script.async = true;

    const timer = setTimeout(() => {
      script.remove();
      loadPromise = null;
      reject(new Error('Jitsi external API load timed out'));
    }, LOAD_TIMEOUT_MS);

    script.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    script.onerror = () => {
      clearTimeout(timer);
      script.remove();
      loadPromise = null;
      reject(new Error('Failed to load Jitsi external API'));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}
