import { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { chunkArray } from '@/utils/chunkArray';

const EMPTY_MAP = new Map<string, string>();

export function useLinkedUserNames(userIds: string[]): Map<string, string> {
  const [names, setNames] = useState<Map<string, string>>(EMPTY_MAP);

  // Stable dependency: sorted, deduplicated, non-empty IDs
  const stableKey = userIds
    .filter((id) => id !== '')
    .sort()
    .join(',');

  useEffect(() => {
    if (!stableKey) {
      return;
    }

    const uniqueIds = stableKey.split(',');
    let cancelled = false;

    async function fetchNames() {
      try {
        const chunks = chunkArray(uniqueIds, 30);
        const snapshots = await Promise.all(
          chunks.map((chunk) =>
            getDocs(query(collection(db, 'users'), where('__name__', 'in', chunk))),
          ),
        );

        if (!cancelled) {
          const map = new Map<string, string>();
          for (const snap of snapshots) {
            for (const d of snap.docs) {
              const name = d.data()['displayName'];
              if (typeof name === 'string' && name.trim()) {
                map.set(d.id, name);
              }
            }
          }
          setNames(map);
        }
      } catch {
        // Silently fail — caller falls back to stored contact.name
      }
    }

    void fetchNames();
    return () => {
      cancelled = true;
    };
  }, [stableKey]);

  return names;
}
