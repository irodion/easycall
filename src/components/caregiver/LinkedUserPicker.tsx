import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { chunkArray } from '@/utils/chunkArray';
import { EasyCallButton } from '@/components/shared/EasyCallButton';
import { EasyCallText } from '@/components/shared/EasyCallText';

interface LinkedUser {
  uid: string;
  displayName: string;
}

interface LinkedUserPickerProps {
  elderlyUserId: string;
  caregiverUserId: string;
  existingContactUserIds: string[];
  onAdd: (userId: string, displayName: string) => Promise<void>;
}

export function LinkedUserPicker({
  elderlyUserId,
  caregiverUserId,
  existingContactUserIds,
  onAdd,
}: LinkedUserPickerProps) {
  const { t } = useTranslation();
  const [availableUsers, setAvailableUsers] = useState<LinkedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchLinkedUsers() {
      try {
        const caregiverSnap = await getDoc(doc(db, 'users', caregiverUserId));
        if (cancelled) return;

        const caregiverData = caregiverSnap.data();
        const linkedIds: string[] = Array.isArray(caregiverData?.['linkedElderlyUsers'])
          ? (caregiverData['linkedElderlyUsers'] as string[])
          : [];

        const allIds = [...new Set([caregiverUserId, ...linkedIds])];

        const excludeSet = new Set([elderlyUserId, ...existingContactUserIds]);
        const candidateIds = allIds.filter((id) => !excludeSet.has(id));

        if (candidateIds.length === 0) {
          if (!cancelled) {
            setAvailableUsers([]);
            setLoading(false);
          }
          return;
        }

        const chunks = chunkArray(candidateIds, 30);
        const snapshots = await Promise.all(
          chunks.map((chunk) =>
            getDocs(query(collection(db, 'users'), where('__name__', 'in', chunk))),
          ),
        );

        if (!cancelled) {
          const users: LinkedUser[] = snapshots.flatMap((snap) =>
            snap.docs.map((d) => {
              const data = d.data();
              const name = data['displayName'];
              const isCaregiverSelf = d.id === caregiverUserId;
              return {
                uid: d.id,
                displayName:
                  typeof name === 'string' && name.trim()
                    ? name
                    : isCaregiverSelf
                      ? t('linkedUserPicker.adminFallback')
                      : t('linkedUserPicker.memberFallback'),
              };
            }),
          );
          setAvailableUsers(users);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            t('linkedUserPicker.addFailed', {
              error: err instanceof Error ? err.message : String(err),
            }),
          );
          setLoading(false);
        }
      }
    }

    void fetchLinkedUsers();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elderlyUserId, caregiverUserId, existingContactUserIds.join(',')]);

  const handleAdd = async (user: LinkedUser) => {
    if (addingId) return;
    setAddingId(user.uid);
    setError(null);
    try {
      await onAdd(user.uid, user.displayName);
      setAvailableUsers((prev) => prev.filter((u) => u.uid !== user.uid));
    } catch (err) {
      setError(
        t('linkedUserPicker.addFailed', {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setAddingId(null);
    }
  };

  if (loading) {
    return (
      <div role="status" aria-label={t('common.loading')}>
        <span className="loading loading-spinner loading-md" />
      </div>
    );
  }

  return (
    <div className="card card-body bg-base-200 gap-3">
      <EasyCallText as="h3" variant="button" className="font-bold">
        {t('linkedUserPicker.title')}
      </EasyCallText>

      {error && (
        <div role="alert" className="alert alert-error">
          <EasyCallText as="span" variant="body">
            {error}
          </EasyCallText>
        </div>
      )}

      {availableUsers.length === 0 ? (
        <EasyCallText as="p" variant="body" className="text-base-content/60">
          {t('linkedUserPicker.noAvailableUsers')}
        </EasyCallText>
      ) : (
        <div className="flex flex-col gap-2">
          {availableUsers.map((user) => (
            <div
              key={user.uid}
              className="flex items-center justify-between gap-3 p-2 rounded-lg bg-base-100"
            >
              <EasyCallText as="span" variant="body" className="font-semibold">
                {user.displayName}
              </EasyCallText>
              <EasyCallButton
                variant="primary"
                onClick={() => void handleAdd(user)}
                disabled={addingId !== null}
                aria-label={t('linkedUserPicker.addUser', { name: user.displayName })}
              >
                {addingId === user.uid ? t('linkedUserPicker.adding') : t('common.save')}
              </EasyCallButton>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
