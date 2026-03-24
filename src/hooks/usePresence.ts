import { useState, useEffect, useRef, useCallback } from 'react';
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

/** Base delay for exponential backoff (ms) */
const RETRY_BASE_MS = 2_000;
/** Maximum backoff delay (ms) */
const RETRY_MAX_MS = 60_000;
/** Maximum retry attempts before giving up until userId changes */
const MAX_RETRIES = 5;

function backoffDelay(attempt: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS);
}

export function usePresence(userId: string | null): { setInCall: (inCall: boolean) => void } {
  const statusRefRef = useRef<DatabaseReference | null>(null);
  const inCallRef = useRef(false);
  const [retryKey, setRetryKey] = useState(0);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset retry counter when userId changes
  useEffect(() => {
    retryCountRef.current = 0;
  }, [userId]);

  // Listener effect — re-runs on retryKey changes without offline teardown
  useEffect(() => {
    if (!userId) {
      statusRefRef.current = null;
      return;
    }

    const statusRef = ref(rtdb, `/status/${userId}`);
    statusRefRef.current = statusRef;
    const connectedRef = ref(rtdb, '.info/connected');
    let cancelled = false;

    const unsubscribe = onValue(
      connectedRef,
      (snap) => {
        // Successful listener — reset retry counter
        retryCountRef.current = 0;

        if (snap.val() !== true) return;

        void onDisconnect(statusRef)
          .set(presencePayload('offline'))
          .then(() => {
            // Don't overwrite 'in-call' on reconnect
            if (!inCallRef.current) {
              void set(statusRef, presencePayload('online'));
            }
          });
      },
      () => {
        // Error callback — listener cancelled by Firebase SDK.
        // Schedule retry with exponential backoff.
        if (!cancelled && retryCountRef.current < MAX_RETRIES) {
          const delay = backoffDelay(retryCountRef.current);
          retryCountRef.current += 1;
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            setRetryKey((k) => k + 1);
          }, delay);
        }
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [userId, retryKey]);

  // Offline teardown — only runs when userId changes or component unmounts.
  // Separated from the listener effect so retryKey-driven re-subscriptions
  // don't write the user offline or clear inCallRef.
  useEffect(() => {
    if (!userId) return;
    const statusRef = ref(rtdb, `/status/${userId}`);

    return () => {
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
