import { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { rtdb } from '@/services/firebase';
import type { PresenceState } from '@/types/user';

export interface PresenceInfo {
  state: PresenceState;
  lastChanged: number | null;
}

const EMPTY_MAP = new Map<string, PresenceInfo>();

export function useContactsPresence(contactUserIds: string[]): Map<string, PresenceInfo> {
  const [presenceMap, setPresenceMap] = useState<Map<string, PresenceInfo>>(EMPTY_MAP);

  // Derive a stable key from the IDs to detect real changes
  const stableKey = contactUserIds
    .filter((id) => id)
    .sort()
    .join(',');

  useEffect(() => {
    const filteredIds = stableKey ? stableKey.split(',') : [];

    if (filteredIds.length === 0) {
      return;
    }

    const unsubscribes: Array<() => void> = [];

    for (const uid of filteredIds) {
      const dbRef = ref(rtdb, `/status/${uid}`);

      const unsubscribe = onValue(dbRef, (snap) => {
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

      unsubscribes.push(unsubscribe);
    }

    return () => {
      for (const unsub of unsubscribes) {
        unsub();
      }
    };
  }, [stableKey]);

  // No IDs to track — return constant empty map
  if (!stableKey) {
    return EMPTY_MAP;
  }

  // Prune entries for contacts no longer tracked (derived during render, no state mutation)
  const trackedIds = new Set(stableKey.split(','));
  let hasStale = false;
  for (const key of presenceMap.keys()) {
    if (!trackedIds.has(key)) {
      hasStale = true;
      break;
    }
  }
  if (hasStale) {
    const pruned = new Map<string, PresenceInfo>();
    for (const [uid, info] of presenceMap) {
      if (trackedIds.has(uid)) pruned.set(uid, info);
    }
    return pruned;
  }

  return presenceMap;
}
