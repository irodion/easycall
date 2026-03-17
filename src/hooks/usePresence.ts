import { useEffect, useRef, useCallback } from 'react';
import { ref, onValue, onDisconnect, set, serverTimestamp } from 'firebase/database';
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
  const inCallRef = useRef(false);

  useEffect(() => {
    if (!userId) {
      statusRefRef.current = null;
      return;
    }

    const statusRef = ref(rtdb, `/status/${userId}`);
    statusRefRef.current = statusRef;
    const connectedRef = ref(rtdb, '.info/connected');

    const unsubscribe = onValue(connectedRef, (snap) => {
      if (snap.val() !== true) return;

      void onDisconnect(statusRef)
        .set(presencePayload('offline'))
        .then(() => {
          // Don't overwrite 'in-call' on reconnect
          if (!inCallRef.current) {
            void set(statusRef, presencePayload('online'));
          }
        });
    });

    return () => {
      unsubscribe();
      // Use locally-captured statusRef (not statusRefRef.current) to ensure
      // cleanup always writes to the correct ref, even if a subsequent effect
      // run has already set statusRefRef.current = null.
      void set(statusRef, presencePayload('offline'));
      void onDisconnect(statusRef).cancel();
      statusRefRef.current = null;
      inCallRef.current = false;
    };
  }, [userId]);

  const setInCall = useCallback((inCall: boolean) => {
    inCallRef.current = inCall;
    const statusRef = statusRefRef.current;
    if (!statusRef) return;
    void set(statusRef, presencePayload(inCall ? 'in-call' : 'online'));
  }, []);

  return { setInCall };
}
