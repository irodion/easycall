import type { FirestoreTimestamp } from '@/types/user';

export function formatRelativeTime(timestamp: FirestoreTimestamp, now: Date = new Date()): string {
  const then = timestamp.toDate();
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return diffMin === 1 ? '1 minute ago' : `${diffMin} minutes ago`;
  if (diffHours < 24) return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
}
