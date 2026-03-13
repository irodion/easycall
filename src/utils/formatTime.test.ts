import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from './formatTime';

describe('formatRelativeTime', () => {
  const now = new Date('2026-03-13T12:00:00Z');

  function ts(date: Date) {
    return {
      seconds: Math.floor(date.getTime() / 1000),
      nanoseconds: 0,
      toDate: () => date,
    };
  }

  it('returns "just now" for timestamps within 1 minute', () => {
    const t = ts(new Date(now.getTime() - 30_000)); // 30s ago
    expect(formatRelativeTime(t, now)).toBe('just now');
  });

  it('returns "X minutes ago" for timestamps within 1 hour', () => {
    const t = ts(new Date(now.getTime() - 5 * 60_000)); // 5 min ago
    expect(formatRelativeTime(t, now)).toBe('5 minutes ago');
  });

  it('returns "1 minute ago" for exactly 1 minute', () => {
    const t = ts(new Date(now.getTime() - 60_000));
    expect(formatRelativeTime(t, now)).toBe('1 minute ago');
  });

  it('returns "X hours ago" for timestamps within 24 hours', () => {
    const t = ts(new Date(now.getTime() - 3 * 3600_000)); // 3h ago
    expect(formatRelativeTime(t, now)).toBe('3 hours ago');
  });

  it('returns "1 hour ago" for exactly 1 hour', () => {
    const t = ts(new Date(now.getTime() - 3600_000));
    expect(formatRelativeTime(t, now)).toBe('1 hour ago');
  });

  it('returns "X days ago" for timestamps older than 24 hours', () => {
    const t = ts(new Date(now.getTime() - 2 * 86400_000));
    expect(formatRelativeTime(t, now)).toBe('2 days ago');
  });

  it('returns "1 day ago" for exactly 1 day', () => {
    const t = ts(new Date(now.getTime() - 86400_000));
    expect(formatRelativeTime(t, now)).toBe('1 day ago');
  });
});
