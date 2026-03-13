import { useEffect, useRef } from 'react';
import { useMediaPermissions } from '@/hooks/useMediaPermissions';
import { EasyCallText } from '@/components/shared/EasyCallText';
import { EasyCallButton } from '@/components/shared/EasyCallButton';

interface PermissionCheckProps {
  onReady: () => void;
}

export function PermissionCheck({ onReady }: PermissionCheckProps) {
  const { status, retry } = useMediaPermissions();
  const firedRef = useRef(false);

  useEffect(() => {
    if (status === 'granted' && !firedRef.current) {
      firedRef.current = true;
      onReady();
    }
  }, [status, onReady]);

  if (status === 'checking') {
    return (
      <div className="min-h-screen bg-base-100 flex items-center justify-center">
        <div role="status" aria-label="Checking camera and microphone permissions">
          <span className="loading loading-spinner loading-lg text-primary" />
          <span className="sr-only">Checking camera and microphone permissions</span>
        </div>
      </div>
    );
  }

  if (status === 'prompt') {
    return (
      <div className="min-h-screen bg-base-100 flex flex-col items-center justify-center gap-6 p-8">
        <EasyCallText as="h1" variant="heading" className="text-center">
          Camera & Microphone
        </EasyCallText>
        <EasyCallText as="p" variant="body" className="text-center text-[length:var(--text-body)]">
          Tap ALLOW when asked to enable your camera and microphone.
        </EasyCallText>
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <div className="min-h-screen bg-base-100 flex flex-col items-center justify-center gap-6 p-8">
        <EasyCallText as="h1" variant="heading" className="text-center">
          Camera Blocked
        </EasyCallText>
        <EasyCallText as="p" variant="body" className="text-center">
          Please allow camera and microphone access in your browser settings, then tap Try Again.
        </EasyCallText>
        <EasyCallButton onClick={retry} aria-label="Try again">
          Try Again
        </EasyCallButton>
      </div>
    );
  }

  if (status === 'no-device') {
    return (
      <div className="min-h-screen bg-base-100 flex flex-col items-center justify-center gap-6 p-8">
        <EasyCallText as="h1" variant="heading" className="text-center">
          No Camera Found
        </EasyCallText>
        <EasyCallText as="p" variant="body" className="text-center">
          Camera or microphone not found. Please connect a camera and microphone and try again.
        </EasyCallText>
      </div>
    );
  }

  // granted — onReady already called, render empty (parent will navigate)
  return null;
}
