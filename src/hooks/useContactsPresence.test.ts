import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockRef = vi.fn().mockImplementation((_db, path) => ({ path }));

const onValueCallbacks = new Map<string, (snap: { val: () => unknown }) => void>();
const mockUnsubscribes: Array<ReturnType<typeof vi.fn>> = [];
const mockOnValue = vi.fn().mockImplementation((dbRef: { path: string }, callback) => {
  onValueCallbacks.set(dbRef.path, callback);
  const unsub = vi.fn();
  mockUnsubscribes.push(unsub);
  return unsub;
});

vi.mock('firebase/database', () => ({
  ref: (...args: unknown[]) => mockRef(...args),
  onValue: (...args: unknown[]) => mockOnValue(...args),
}));

vi.mock('@/services/firebase', () => ({
  rtdb: { type: 'database' },
}));

describe('useContactsPresence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onValueCallbacks.clear();
    mockUnsubscribes.length = 0;
  });

  async function importAndRender(ids: string[]) {
    const { useContactsPresence } = await import('./useContactsPresence');
    return renderHook(({ contactUserIds }) => useContactsPresence(contactUserIds), {
      initialProps: { contactUserIds: ids },
    });
  }

  it('returns empty map for empty contactUserIds array', async () => {
    const { result } = await importAndRender([]);
    expect(result.current.size).toBe(0);
  });

  it('subscribes to RTDB for each contactUserId', async () => {
    await importAndRender(['user-1', 'user-2']);
    expect(mockRef).toHaveBeenCalledWith({ type: 'database' }, '/status/user-1');
    expect(mockRef).toHaveBeenCalledWith({ type: 'database' }, '/status/user-2');
    expect(mockOnValue).toHaveBeenCalledTimes(2);
  });

  it('returns correct online/in-call/offline state per contact', async () => {
    const { result } = await importAndRender(['user-1', 'user-2', 'user-3']);

    act(() => {
      onValueCallbacks.get('/status/user-1')!({
        val: () => ({ state: 'online', lastChanged: 1000 }),
      });
      onValueCallbacks.get('/status/user-2')!({
        val: () => ({ state: 'in-call', lastChanged: 2000 }),
      });
      onValueCallbacks.get('/status/user-3')!({
        val: () => ({ state: 'offline', lastChanged: 3000 }),
      });
    });

    expect(result.current.get('user-1')?.state).toBe('online');
    expect(result.current.get('user-2')?.state).toBe('in-call');
    expect(result.current.get('user-3')?.state).toBe('offline');
  });

  it('defaults to offline for unknown state values', async () => {
    const { result } = await importAndRender(['user-1']);

    act(() => {
      onValueCallbacks.get('/status/user-1')!({
        val: () => ({ state: 'unknown-state', lastChanged: 1000 }),
      });
    });

    expect(result.current.get('user-1')?.state).toBe('offline');
  });

  it('defaults to offline when snapshot is null', async () => {
    const { result } = await importAndRender(['user-1']);

    act(() => {
      onValueCallbacks.get('/status/user-1')!({ val: () => null });
    });

    expect(result.current.get('user-1')?.state).toBe('offline');
  });

  it('filters out empty string contactUserIds', async () => {
    await importAndRender(['user-1', '', 'user-2']);
    expect(mockOnValue).toHaveBeenCalledTimes(2);
  });

  it('cleans up listeners on unmount', async () => {
    const { unmount } = await importAndRender(['user-1', 'user-2']);
    unmount();
    // Each onValue returned an unsubscribe function that should be called
    expect(mockUnsubscribes).toHaveLength(2);
    for (const unsub of mockUnsubscribes) {
      expect(unsub).toHaveBeenCalled();
    }
  });

  it('re-subscribes when contactUserIds change', async () => {
    const { rerender } = await importAndRender(['user-1']);

    const initialOnValueCalls = mockOnValue.mock.calls.length;
    const initialUnsubs = [...mockUnsubscribes];

    rerender({ contactUserIds: ['user-2', 'user-3'] });

    // Old listeners cleaned up
    for (const unsub of initialUnsubs) {
      expect(unsub).toHaveBeenCalled();
    }
    // New listeners created
    expect(mockOnValue.mock.calls.length).toBeGreaterThan(initialOnValueCalls);
  });
});
