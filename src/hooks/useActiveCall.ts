import { useState, useEffect, useCallback } from 'react';
import { getDoc } from 'firebase/firestore';
import { activeCallRef, clearActiveCall } from '@/services/callHistory';
import type { ActiveCallData } from '@/types/user';

const REJOIN_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

function isValidActiveCallData(raw: Record<string, unknown>): boolean {
  return (
    typeof raw['status'] === 'string' &&
    typeof raw['contactId'] === 'string' &&
    typeof raw['contactName'] === 'string' &&
    typeof raw['jitsiRoomId'] === 'string' &&
    raw['startedAt'] != null &&
    typeof (raw['startedAt'] as { toDate?: unknown }).toDate === 'function'
  );
}

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

        if (!isValidActiveCallData(raw)) {
          await clearActiveCall(uid);
          return;
        }

        const data = raw as ActiveCallData;
        const startedAtMs = data.startedAt.toDate().getTime();
        if (data.status === 'active' && startedAtMs > Date.now() - REJOIN_TIMEOUT_MS) {
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
