let loadPromise: Promise<void> | null = null;

/** Test-only: reset the cached promise between tests */
export function _resetLoadPromise(): void {
  loadPromise = null;
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
    const appId = import.meta.env.VITE_JAAS_APP_ID ?? '';
    const src = `https://8x8.vc/${appId}/external_api.js`;

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Jitsi external API'));
    document.head.appendChild(script);
  });

  return loadPromise;
}
