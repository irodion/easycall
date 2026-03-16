import { useState, useEffect, useRef } from 'react';
import { ref, onValue, off } from 'firebase/database';
import { rtdb } from '@/services/firebase';
import type { PresenceState } from '@/types/user';

export interface PresenceInfo {
  state: PresenceState;
  lastChanged: number | null;
}

const EMPTY_MAP = new Map<string, PresenceInfo>();

export function useContactsPresence(contactUserIds: string[]): Map<string, PresenceInfo> {
  const [presenceMap, setPresenceMap] = useState<Map<string, PresenceInfo>>(EMPTY_MAP);
  const prevKeyRef = useRef('');

  // Derive a stable key from the IDs to detect real changes
  const stableKey = contactUserIds
    .filter((id) => id)
    .sort()
    .join(',');

  useEffect(() => {
    if (stableKey === prevKeyRef.current) return;
    prevKeyRef.current = stableKey;

    const filteredIds = stableKey ? stableKey.split(',') : [];

    if (filteredIds.length === 0) {
      return;
    }

    const refs: Array<ReturnType<typeof ref>> = [];

    for (const uid of filteredIds) {
      const dbRef = ref(rtdb, `/status/${uid}`);
      refs.push(dbRef);

      onValue(dbRef, (snap) => {
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
      });
    }

    return () => {
      for (const dbRef of refs) {
        off(dbRef);
      }
    };
  }, [stableKey]);

  // When there are no IDs to track, return empty map without triggering state update
  if (!stableKey) {
    return EMPTY_MAP;
  }

  return presenceMap;
}
