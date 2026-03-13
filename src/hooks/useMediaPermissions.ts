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

async function requestMediaAccess(): Promise<MediaPermissionStatus> {
  // Fast path: if permissions API says both are granted, skip getUserMedia
  const alreadyGranted = await checkViaPermissionsApi();
  if (alreadyGranted) return 'granted';

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return 'granted';
  } catch (err) {
    if (err instanceof Error) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        return 'denied';
      }
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        return 'no-device';
      }
    }
    return 'denied';
  }
}

export function useMediaPermissions(): UseMediaPermissionsResult {
  const [status, setStatus] = useState<MediaPermissionStatus>('checking');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    requestMediaAccess().then((result) => {
      if (!cancelled) setStatus(result);
    });
    return () => { cancelled = true; };
  }, [retryCount]);

  const retry = useCallback(() => {
    setStatus('checking');
    setRetryCount((c) => c + 1);
  }, []);

  return { status, retry };
}
