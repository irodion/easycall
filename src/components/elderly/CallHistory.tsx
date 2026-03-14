import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
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
  { label: string; badge: string; rowBg: string }
> = {
  completed: { label: 'Completed', badge: 'badge-success', rowBg: '' },
  missed: { label: 'Missed', badge: 'badge-error', rowBg: 'bg-error/10' },
  declined: { label: 'Declined', badge: 'badge-ghost', rowBg: '' },
};

export function CallHistory({ userId }: CallHistoryProps) {
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
          aria-label="Back to contacts"
        >
          Back
        </EasyCallButton>
        <EasyCallText as="h1" variant="heading">
          Call History
        </EasyCallText>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span
            className="loading loading-spinner loading-lg text-primary"
            role="status"
            aria-label="Loading call history"
          />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <EasyCallText as="p" variant="body" className="text-center text-base-content/60">
            No calls yet
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
                aria-label={`Call ${entry.contactName}`}
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
                <span className={`badge ${style.badge} badge-sm`}>{style.label}</span>
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
              {loadingMore ? 'Loading...' : 'Show more'}
            </EasyCallButton>
          )}
        </div>
      )}
    </div>
  );
}
