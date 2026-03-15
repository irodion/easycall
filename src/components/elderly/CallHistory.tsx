import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { fetchCallHistory } from '@/services/callHistory';
import { formatDuration, formatDateTime } from '@/utils/formatTime';
import { EasyCallText } from '@/components/shared/EasyCallText';
import { EasyCallButton } from '@/components/shared/EasyCallButton';
import type { CallHistoryEntry } from '@/types/user';

interface CallHistoryProps {
  userId: string;
}

const OUTCOME_STYLES: Record<
  CallHistoryEntry['outcome'],
  { key: string; badge: string; rowBg: string }
> = {
  completed: { key: 'callHistory.completed', badge: 'badge-success', rowBg: '' },
  missed: { key: 'callHistory.missed', badge: 'badge-error', rowBg: 'bg-error/10' },
  declined: { key: 'callHistory.declined', badge: 'badge-ghost', rowBg: '' },
};

export function CallHistory({ userId }: CallHistoryProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<CallHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState<unknown>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const result = await fetchCallHistory(userId);
        setEntries(result.entries);
        setLastDoc(result.lastDoc);
        setHasMore(result.hasMore);
      } catch {
        setEntries([]);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [userId]);

  const handleShowMore = async () => {
    setLoadingMore(true);
    try {
      const result = await fetchCallHistory(userId, 20, lastDoc);
      setEntries((prev) => [...prev, ...result.entries]);
      setLastDoc(result.lastDoc);
      setHasMore(result.hasMore);
    } catch {
      // Keep existing entries on pagination failure
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="min-h-screen bg-base-100 p-4 flex flex-col">
      <div className="flex items-center gap-3 mb-6">
        <EasyCallButton
          variant="secondary"
          size="default"
          onClick={() => void navigate('/elderly')}
          aria-label={t('callHistory.backToContacts')}
        >
          {t('common.back')}
        </EasyCallButton>
        <EasyCallText as="h1" variant="heading">
          {t('callHistory.title')}
        </EasyCallText>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span
            className="loading loading-spinner loading-lg text-primary"
            role="status"
            aria-label={t('callHistory.loadingHistory')}
          />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <EasyCallText as="p" variant="body" className="text-center text-base-content/60">
            {t('callHistory.noCalls')}
          </EasyCallText>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry) => {
            const style = OUTCOME_STYLES[entry.outcome];
            return (
              <button
                key={entry.id}
                className={`flex items-center gap-3 p-3 rounded-xl min-h-14 w-full text-left ${style.rowBg}`}
                onClick={() => void navigate(`/call/${entry.contactId}`)}
                aria-label={t('callHistory.callContact', { name: entry.contactName })}
              >
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-lg font-bold text-primary-content flex-shrink-0">
                  {entry.contactName[0] ?? '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <EasyCallText as="span" variant="button" className="font-bold block truncate">
                    {entry.contactName}
                  </EasyCallText>
                  <EasyCallText
                    as="span"
                    variant="body"
                    className="text-sm text-base-content/60 block"
                  >
                    {formatDateTime(entry.startedAt)} · {formatDuration(entry.duration)}
                  </EasyCallText>
                </div>
                <span className={`badge ${style.badge} badge-sm`}>{t(style.key)}</span>
              </button>
            );
          })}

          {hasMore && (
            <EasyCallButton
              variant="secondary"
              onClick={() => void handleShowMore()}
              disabled={loadingMore}
              className="mt-2"
            >
              {loadingMore ? t('common.loading') : t('callHistory.showMore')}
            </EasyCallButton>
          )}
        </div>
      )}
    </div>
  );
}
