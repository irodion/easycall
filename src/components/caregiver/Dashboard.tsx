import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { formatRelativeTime } from '@/utils/formatTime';
import { EasyCallText } from '@/components/shared/EasyCallText';
import { AccountBanner } from './AccountBanner';
import type { EasyCallUser } from '@/types/user';

interface DashboardProps {
  userId: string;
}

type LinkedUser = Pick<EasyCallUser, 'uid' | 'displayName' | 'lastSeen'>;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export function Dashboard({ userId }: DashboardProps) {
  const { t } = useTranslation();
  const [linkedUsers, setLinkedUsers] = useState<LinkedUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      if (!cancelled) {
        setLinkedUsers([]);
        setLoading(true);
      }

      try {
        const caregiverDocSnap = await getDoc(doc(db, 'users', userId));
        if (cancelled) return;

        if (!caregiverDocSnap.exists()) {
          setLinkedUsers([]);
          setLoading(false);
          return;
        }

        const caregiverData = caregiverDocSnap.data();
        const linkedIds: string[] = Array.isArray(caregiverData['linkedElderlyUsers'])
          ? (caregiverData['linkedElderlyUsers'] as string[])
          : [];

        if (linkedIds.length === 0) {
          if (!cancelled) setLoading(false);
          return;
        }

        const chunks = chunkArray(linkedIds, 30);
        const snapshots = await Promise.all(
          chunks.map((chunk) =>
            getDocs(query(collection(db, 'users'), where('__name__', 'in', chunk))),
          ),
        );

        if (!cancelled) {
          const users: LinkedUser[] = snapshots.flatMap((snap) =>
            snap.docs.map((d) => ({
              uid: d.id,
              displayName: String(d.data()['displayName'] ?? 'Unknown'),
              lastSeen: d.data()['lastSeen'] as EasyCallUser['lastSeen'],
            })),
          );
          setLinkedUsers(users);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchData();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <div className="min-h-screen bg-base-100 p-6 flex flex-col gap-6">
      <EasyCallText as="h1" variant="heading">
        {t('dashboard.title')}
      </EasyCallText>

      <AccountBanner />

      <Link
        to="/caregiver/pair"
        className="btn btn-secondary touch-target-min min-h-14 font-bold text-[length:var(--text-button)]"
        aria-label={t('dashboard.linkUser')}
      >
        + {t('dashboard.linkUser')}
      </Link>

      {loading ? (
        <div role="status" aria-label={t('common.loading')}>
          <span className="loading loading-spinner loading-lg" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {linkedUsers.map((user) => (
            <div key={user.uid} className="card card-body bg-base-200 gap-3">
              <EasyCallText as="h2" variant="button" className="font-bold">
                {user.displayName}
              </EasyCallText>
              {user.lastSeen && (
                <EasyCallText variant="body" className="text-base-content/60">
                  {t('dashboard.lastSeen', { time: formatRelativeTime(user.lastSeen) })}
                </EasyCallText>
              )}
              <div className="flex gap-3">
                <Link
                  to={`/caregiver/manage/${user.uid}`}
                  className="btn btn-primary touch-target-min min-h-14 font-bold text-[length:var(--text-button)]"
                  aria-label={t('dashboard.manageContacts')}
                >
                  {t('dashboard.manageContacts')}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
