import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ref, onValue } from 'firebase/database';
import { rtdb } from '@/services/firebase';
import type { PresenceState } from '@/types/user';

export interface PresenceInfo {
  state: PresenceState;
  lastChanged: number | null;
}

const EMPTY_MAP = new Map<string, PresenceInfo>();

/** Base delay for exponential backoff (ms) */
const RETRY_BASE_MS = 2_000;
/** Maximum backoff delay (ms) */
const RETRY_MAX_MS = 60_000;
/** Maximum number of retry attempts before giving up until stableKey changes */
const MAX_RETRIES = 5;

function backoffDelay(attempt: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS);
}

export function useContactsPresence(contactUserIds: string[]): Map<string, PresenceInfo> {
  const [presenceMap, setPresenceMap] = useState<Map<string, PresenceInfo>>(EMPTY_MAP);
  // Bump retryKey to force the effect to re-run (re-subscribe all listeners)
  const [retryKey, setRetryKey] = useState(0);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derive a stable key from the IDs to detect real changes
  const stableKey = contactUserIds
    .filter((id) => id)
    .sort()
    .join(',');

  // Reset retry counter when the tracked IDs change
  useEffect(() => {
    retryCountRef.current = 0;
  }, [stableKey]);

  const scheduleRetry = useCallback(() => {
    // Coalesce: if a retry is already pending, don't queue another.
    // Multiple listeners may error from the same outage.
    if (retryTimerRef.current !== null) return;
    if (retryCountRef.current >= MAX_RETRIES) return;
    const delay = backoffDelay(retryCountRef.current);
    retryCountRef.current += 1;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      setRetryKey((k) => k + 1);
    }, delay);
  }, []);

  useEffect(() => {
    const filteredIds = stableKey ? stableKey.split(',') : [];

    if (filteredIds.length === 0) {
      return;
    }

    const unsubscribes: Array<() => void> = [];
    let cancelled = false;

    for (const uid of filteredIds) {
      const dbRef = ref(rtdb, `/status/${uid}`);

      const unsubscribe = onValue(
        dbRef,
        (snap) => {
          // Successful read — reset retry counter
          retryCountRef.current = 0;

          const val = snap.val() as { state?: string; lastChanged?: number } | null;
          const state: PresenceState =
            val?.state === 'online' || val?.state === 'in-call' ? val.state : 'offline';
          const lastChanged = val?.lastChanged ?? null;

          setPresenceMap((prev) => {
            const existing = prev.get(uid);
            if (existing && existing.state === state && existing.lastChanged === lastChanged) {
              return prev;
            }
            const next = new Map(prev);
            next.set(uid, { state, lastChanged });
            return next;
          });
        },
        () => {
          // Error callback — listener is now cancelled by Firebase SDK.
          // Schedule a retry to re-subscribe all listeners.
          if (!cancelled) {
            scheduleRetry();
          }
        },
      );

      unsubscribes.push(unsubscribe);
    }

    return () => {
      cancelled = true;
      for (const unsub of unsubscribes) {
        unsub();
      }
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [stableKey, retryKey, scheduleRetry]);

  const prunedMap = useMemo(() => {
    if (!stableKey) return EMPTY_MAP;
    const trackedIds = new Set(stableKey.split(','));
    let hasStale = false;
    for (const key of presenceMap.keys()) {
      if (!trackedIds.has(key)) {
        hasStale = true;
        break;
      }
    }
    if (!hasStale) return presenceMap; // Same reference, no re-render
    const pruned = new Map<string, PresenceInfo>();
    for (const [uid, info] of presenceMap) {
      if (trackedIds.has(uid)) pruned.set(uid, info);
    }
    return pruned;
  }, [presenceMap, stableKey]);

  return prunedMap;
}
