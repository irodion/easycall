import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatRelativeTime, formatDuration, formatDateTime } from './formatTime';

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

describe('formatDuration', () => {
  it('returns seconds for < 60s', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(45)).toBe('45s');
  });

  it('returns minutes and seconds', () => {
    expect(formatDuration(90)).toBe('1m 30s');
    expect(formatDuration(125)).toBe('2m 5s');
  });

  it('returns minutes only when no remainder', () => {
    expect(formatDuration(60)).toBe('1m');
    expect(formatDuration(300)).toBe('5m');
  });

  it('returns hours and minutes', () => {
    expect(formatDuration(3660)).toBe('1h 1m');
    expect(formatDuration(7500)).toBe('2h 5m');
  });

  it('returns hours only when no remainder', () => {
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(7200)).toBe('2h');
  });
});

describe('formatDateTime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function ts(date: Date) {
    return {
      seconds: Math.floor(date.getTime() / 1000),
      nanoseconds: 0,
      toDate: () => date,
    };
  }

  it('returns "Today HH:MM" for today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T15:00:00'));
    const result = formatDateTime(ts(new Date('2026-03-14T10:30:00')));
    expect(result).toMatch(/^Today /);
  });

  it('returns "Yesterday HH:MM" for yesterday', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T15:00:00'));
    const result = formatDateTime(ts(new Date('2026-03-13T18:00:00')));
    expect(result).toMatch(/^Yesterday /);
  });

  it('returns "Mon DD HH:MM" for older dates', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T15:00:00'));
    const date = new Date('2026-03-10T09:00:00');
    const result = formatDateTime(ts(date));
    const expectedDate = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    expect(result).toContain(expectedDate);
  });
});
