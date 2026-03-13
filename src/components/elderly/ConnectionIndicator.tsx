import { useEffect, useState, useRef } from 'react';
import { EasyCallText } from '@/components/shared/EasyCallText';
import type { JitsiMeetExternalAPI } from '@/types/jitsi';

type Quality = 'good' | 'fair' | 'poor';

function getQuality(score: number): Quality {
  if (score < 40) return 'poor';
  if (score <= 70) return 'fair';
  return 'good';
}

const qualityConfig: Record<Quality, { label: string; color: string }> = {
  good: { label: 'Good connection', color: 'bg-success' },
  fair: { label: 'Fair connection', color: 'bg-warning' },
  poor: { label: 'Poor connection', color: 'bg-error' },
};

interface ConnectionIndicatorProps {
  api: JitsiMeetExternalAPI;
}

export function ConnectionIndicator({ api }: ConnectionIndicatorProps) {
  const [quality, setQuality] = useState<Quality>('good');
  const [showToast, setShowToast] = useState(false);
  const degradedRef = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (data: unknown) => {
      const d = data as { connectionQuality: number };
      const q = getQuality(d.connectionQuality);
      setQuality(q);

      if (q === 'poor' && !degradedRef.current) {
        degradedRef.current = true;
        api.executeCommand('setVideoQuality', 180);
        setShowToast(true);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setShowToast(false), 3000);
      }
    };

    api.addListener('connectionQuality', handler);
    return () => {
      api.removeListener('connectionQuality', handler);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [api]);

  const config = qualityConfig[quality];

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-2">
        <span
          className={`w-3 h-3 rounded-full ${config.color}`}
          aria-hidden="true"
        />
        <EasyCallText as="span" variant="body">
          {config.label}
        </EasyCallText>
      </div>
      {showToast && (
        <div role="alert" className="alert alert-warning text-sm p-2 mt-1">
          Video quality reduced due to weak signal
        </div>
      )}
    </div>
  );
}
