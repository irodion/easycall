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
  const appId = import.meta.env.VITE_JAAS_APP_ID as string | undefined;
  if (!appId && import.meta.env.MODE !== 'test') {
    throw new Error('VITE_JAAS_APP_ID is not set. Check your .env.local file.');
  }
  return appId ?? '';
}

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
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      loadPromise = null;
      reject(new Error('Failed to load Jitsi external API'));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}
