import { useState, useCallback, useEffect } from 'react';

export type MediaPermissionStatus = 'checking' | 'granted' | 'denied' | 'no-device' | 'prompt';

export interface UseMediaPermissionsResult {
  status: MediaPermissionStatus;
  retry: () => void;
}

async function checkViaPermissionsApi(): Promise<boolean> {
  try {
    const [camResult, micResult] = await Promise.all([
      navigator.permissions.query({ name: 'camera' as PermissionName }),
      navigator.permissions.query({ name: 'microphone' as PermissionName }),
    ]);
    return camResult.state === 'granted' && micResult.state === 'granted';
  } catch {
    return false;
  }
}

export function useMediaPermissions(): UseMediaPermissionsResult {
  const [status, setStatus] = useState<MediaPermissionStatus>('checking');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      // Fast path: if permissions API says both are granted, skip getUserMedia
      const alreadyGranted = await checkViaPermissionsApi();
      if (cancelled) return;
      if (alreadyGranted) {
        setStatus('granted');
        return;
      }

      // Transition to 'prompt' before invoking getUserMedia so the UI can
      // show a message while the native browser permission dialog is open.
      setStatus('prompt');

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        // Always stop tracks immediately to avoid leaking media resources,
        // even if the component unmounted while getUserMedia was pending.
        stream.getTracks().forEach((t) => t.stop());
        if (cancelled) return;
        setStatus('granted');
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Error) {
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            setStatus('denied');
          } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            setStatus('no-device');
          } else {
            setStatus('denied');
          }
        } else {
          setStatus('denied');
        }
      }
    }

    void check();
    return () => { cancelled = true; };
  }, [retryCount]);

  const retry = useCallback(() => {
    setStatus('checking');
    setRetryCount((c) => c + 1);
  }, []);

  return { status, retry };
}
