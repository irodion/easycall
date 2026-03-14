import { useState, useEffect, useCallback } from 'react';
import { getDoc } from 'firebase/firestore';
import { activeCallRef, clearActiveCall } from '@/services/callHistory';
import type { ActiveCallData } from '@/types/user';

export function useActiveCall(userId: string | null) {
  const [activeCall, setActiveCall] = useState<ActiveCallData | null>(null);

  useEffect(() => {
    setActiveCall(null);

    if (!userId) return;

    let cancelled = false;

    async function checkActiveCall() {
      const snap = await getDoc(activeCallRef(userId));
      if (cancelled) return;
      if (!snap.exists()) return;
      const raw = snap.data();

      // Validate shape before trusting the data
      if (
        typeof raw?.['status'] !== 'string' ||
        !raw['startedAt'] ||
        typeof (raw['startedAt'] as { toDate?: unknown }).toDate !== 'function'
      ) {
        void clearActiveCall(userId);
        return;
      }

      const data = raw as ActiveCallData;

      // Only show rejoin if call is active and started within 5 minutes
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      const startedAtMs = data.startedAt.toDate().getTime();
      if (data.status === 'active' && startedAtMs > fiveMinutesAgo) {
        setActiveCall(data);
      } else {
        // Clean up stale/ended activeCall docs
        void clearActiveCall(userId);
      }
    }

    void checkActiveCall();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const dismiss = useCallback(() => setActiveCall(null), []);

  return { activeCall, dismiss };
}
