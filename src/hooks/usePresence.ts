import { useEffect, useRef, useCallback } from 'react';
import { ref, onValue, onDisconnect, set, serverTimestamp, off } from 'firebase/database';
import type { DatabaseReference } from 'firebase/database';
import { rtdb } from '@/services/firebase';
import type { PresenceState } from '@/types/user';

interface RtdbPresencePayload {
  state: PresenceState;
  lastChanged: ReturnType<typeof serverTimestamp>;
}

function presencePayload(state: PresenceState): RtdbPresencePayload {
  return { state, lastChanged: serverTimestamp() };
}

export function usePresence(userId: string | null): { setInCall: (inCall: boolean) => void } {
  const statusRefRef = useRef<DatabaseReference | null>(null);

  useEffect(() => {
    if (!userId) {
      statusRefRef.current = null;
      return;
    }

    const statusRef = ref(rtdb, `/status/${userId}`);
    statusRefRef.current = statusRef;
    const connectedRef = ref(rtdb, '.info/connected');

    const onConnectedChange = onValue(connectedRef, (snap) => {
      if (snap.val() !== true) return;

      void onDisconnect(statusRef)
        .set(presencePayload('offline'))
        .then(() => {
          void set(statusRef, presencePayload('online'));
        });
    });

    return () => {
      off(connectedRef, 'value', onConnectedChange);
      // Write offline explicitly — onDisconnect only fires on socket close,
      // not on React unmount (e.g. logout while socket stays connected)
      void set(statusRef, presencePayload('offline'));
      void onDisconnect(statusRef).cancel();
      statusRefRef.current = null;
    };
  }, [userId]);

  const setInCall = useCallback((inCall: boolean) => {
    const statusRef = statusRefRef.current;
    if (!statusRef) return;
    void set(statusRef, presencePayload(inCall ? 'in-call' : 'online'));
  }, []);

  return { setInCall };
}
