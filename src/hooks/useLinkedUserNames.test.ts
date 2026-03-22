import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockGetDocs = vi.fn();

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(),
  collection: vi.fn(),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  query: vi.fn(),
  where: vi.fn(),
}));

vi.mock('@/services/firebase', () => ({
  db: {},
}));

function createMockSnapshot(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  return {
    docs: docs.map((d) => ({
      id: d.id,
      data: () => d.data,
    })),
  };
}

describe('useLinkedUserNames', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty map for empty userIds array', async () => {
    const { useLinkedUserNames } = await import('./useLinkedUserNames');
    const { result } = renderHook(() => useLinkedUserNames([]));
    expect(result.current.size).toBe(0);
  });

  it('returns empty map for array of empty strings', async () => {
    const { useLinkedUserNames } = await import('./useLinkedUserNames');
    const { result } = renderHook(() => useLinkedUserNames(['', '']));
    expect(result.current.size).toBe(0);
  });

  it('resolves displayNames from Firestore', async () => {
    mockGetDocs.mockResolvedValue(
      createMockSnapshot([
        { id: 'user-1', data: { displayName: 'Alice' } },
        { id: 'user-2', data: { displayName: 'Bob' } },
      ]),
    );

    const { useLinkedUserNames } = await import('./useLinkedUserNames');
    const { result } = renderHook(() => useLinkedUserNames(['user-1', 'user-2']));

    await waitFor(() => {
      expect(result.current.size).toBe(2);
    });

    expect(result.current.get('user-1')).toBe('Alice');
    expect(result.current.get('user-2')).toBe('Bob');
  });

  it('handles missing users gracefully', async () => {
    mockGetDocs.mockResolvedValue(
      createMockSnapshot([{ id: 'user-1', data: { displayName: 'Alice' } }]),
    );

    const { useLinkedUserNames } = await import('./useLinkedUserNames');
    const { result } = renderHook(() => useLinkedUserNames(['user-1', 'user-missing']));

    await waitFor(() => {
      expect(result.current.size).toBe(1);
    });

    expect(result.current.get('user-1')).toBe('Alice');
    expect(result.current.has('user-missing')).toBe(false);
  });

  it('skips users with empty or missing displayName', async () => {
    mockGetDocs.mockResolvedValue(
      createMockSnapshot([
        { id: 'user-1', data: { displayName: 'Alice' } },
        { id: 'user-2', data: { displayName: '' } },
        { id: 'user-3', data: {} },
      ]),
    );

    const { useLinkedUserNames } = await import('./useLinkedUserNames');
    const { result } = renderHook(() => useLinkedUserNames(['user-1', 'user-2', 'user-3']));

    await waitFor(() => {
      expect(result.current.size).toBe(1);
    });

    expect(result.current.get('user-1')).toBe('Alice');
  });

  it('handles Firestore errors silently', async () => {
    mockGetDocs.mockRejectedValue(new Error('Firestore error'));

    const { useLinkedUserNames } = await import('./useLinkedUserNames');
    const { result } = renderHook(() => useLinkedUserNames(['user-1']));

    // Should not throw, returns empty map
    await waitFor(() => {
      expect(mockGetDocs).toHaveBeenCalled();
    });
    expect(result.current.size).toBe(0);
  });
});
