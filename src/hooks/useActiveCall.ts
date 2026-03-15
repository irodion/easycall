import { useState, useEffect, useCallback } from 'react';
import { getDoc } from 'firebase/firestore';
import { activeCallRef, clearActiveCall } from '@/services/callHistory';
import type { ActiveCallData } from '@/types/user';

export function useActiveCall(userId: string | null) {
  const [activeCall, setActiveCall] = useState<ActiveCallData | null>(null);

  // Reset activeCall when userId changes via state-derived-from-props pattern
  const [prevUserId, setPrevUserId] = useState(userId);
  if (prevUserId !== userId) {
    setPrevUserId(userId);
    setActiveCall(null);
  }

  useEffect(() => {
    if (!userId) return;

    const uid = userId;
    let cancelled = false;

    async function checkActiveCall() {
      try {
        const snap = await getDoc(activeCallRef(uid));
        if (cancelled) return;
        if (!snap.exists()) return;
        const raw = snap.data();

        // Validate shape before trusting the data
        if (
          typeof raw?.['status'] !== 'string' ||
          !raw['startedAt'] ||
          typeof (raw['startedAt'] as { toDate?: unknown }).toDate !== 'function'
        ) {
          await clearActiveCall(uid);
          return;
        }

        const data = raw as ActiveCallData;

        // Only show rejoin if call is active and started within 5 minutes
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        const startedAtMs = data.startedAt.toDate().getTime();
        if (data.status === 'active' && startedAtMs > fiveMinutesAgo) {
          setActiveCall(data);
        } else {
          await clearActiveCall(uid);
        }
      } catch {
        // Network/permission errors — silently fail, no rejoin prompt shown
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
