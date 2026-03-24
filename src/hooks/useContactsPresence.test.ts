import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockRef = vi.fn().mockImplementation((_db, path) => ({ path }));

const onValueCallbacks = new Map<string, (snap: { val: () => unknown }) => void>();
const onValueErrorCallbacks = new Map<string, (error: Error) => void>();
const mockUnsubscribes: Array<ReturnType<typeof vi.fn>> = [];
const mockOnValue = vi
  .fn()
  .mockImplementation(
    (
      dbRef: { path: string },
      callback: (snap: { val: () => unknown }) => void,
      errorCb?: (error: Error) => void,
    ) => {
      onValueCallbacks.set(dbRef.path, callback);
      if (errorCb) onValueErrorCallbacks.set(dbRef.path, errorCb);
      const unsub = vi.fn();
      mockUnsubscribes.push(unsub);
      return unsub;
    },
  );

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
    vi.useFakeTimers();
    onValueCallbacks.clear();
    onValueErrorCallbacks.clear();
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

  it('passes an error callback to onValue', async () => {
    await importAndRender(['user-1']);
    expect(onValueErrorCallbacks.has('/status/user-1')).toBe(true);
  });

  it('re-subscribes after an onValue error with backoff', async () => {
    await importAndRender(['user-1']);
    const initialCalls = mockOnValue.mock.calls.length;

    // Simulate error — Firebase cancels the listener
    act(() => {
      onValueErrorCallbacks.get('/status/user-1')!(new Error('permission_denied'));
    });

    // No immediate re-subscription
    expect(mockOnValue.mock.calls.length).toBe(initialCalls);

    // After the first backoff delay (2s)
    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(mockOnValue.mock.calls.length).toBeGreaterThan(initialCalls);
  });

  it('uses exponential backoff for consecutive errors', async () => {
    await importAndRender(['user-1']);

    // First error → 2s backoff
    act(() => {
      onValueErrorCallbacks.get('/status/user-1')!(new Error('permission_denied'));
    });
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    const callsAfterFirst = mockOnValue.mock.calls.length;

    // Second error → 4s backoff
    act(() => {
      onValueErrorCallbacks.get('/status/user-1')!(new Error('permission_denied'));
    });
    // After 2s — should NOT have retried yet
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(mockOnValue.mock.calls.length).toBe(callsAfterFirst);

    // After another 2s (total 4s) — should retry
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(mockOnValue.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it('resets retry counter on successful onValue callback', async () => {
    await importAndRender(['user-1']);

    // First error → retry
    act(() => {
      onValueErrorCallbacks.get('/status/user-1')!(new Error('permission_denied'));
    });
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    const callsAfterRetry = mockOnValue.mock.calls.length;

    // Successful callback resets the counter
    act(() => {
      onValueCallbacks.get('/status/user-1')!({
        val: () => ({ state: 'online', lastChanged: 1000 }),
      });
    });

    // Next error should use first-attempt delay (2s), not second (4s)
    act(() => {
      onValueErrorCallbacks.get('/status/user-1')!(new Error('permission_denied'));
    });
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(mockOnValue.mock.calls.length).toBeGreaterThan(callsAfterRetry);
  });

  it('stops retrying after MAX_RETRIES (5) attempts', async () => {
    await importAndRender(['user-1']);

    for (let i = 0; i < 5; i++) {
      act(() => {
        onValueErrorCallbacks.get('/status/user-1')!(new Error('permission_denied'));
      });
      act(() => {
        // Advance past the max backoff (60s) to ensure any pending timer fires
        vi.advanceTimersByTime(60_000);
      });
    }
    const callsAfterMaxRetries = mockOnValue.mock.calls.length;

    // 6th error should NOT schedule a retry
    act(() => {
      onValueErrorCallbacks.get('/status/user-1')!(new Error('permission_denied'));
    });
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(mockOnValue.mock.calls.length).toBe(callsAfterMaxRetries);
  });

  it('cancels pending retry timer on unmount', async () => {
    const { unmount } = await importAndRender(['user-1']);

    act(() => {
      onValueErrorCallbacks.get('/status/user-1')!(new Error('permission_denied'));
    });

    // Unmount before the retry timer fires
    unmount();

    const callsBefore = mockOnValue.mock.calls.length;
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    // No new subscriptions should have been created
    expect(mockOnValue.mock.calls.length).toBe(callsBefore);
  });

  it('coalesces multiple listener errors into a single retry', async () => {
    await importAndRender(['user-1', 'user-2', 'user-3']);
    const initialCalls = mockOnValue.mock.calls.length; // 3 listeners

    // All three listeners error from the same outage
    act(() => {
      onValueErrorCallbacks.get('/status/user-1')!(new Error('permission_denied'));
      onValueErrorCallbacks.get('/status/user-2')!(new Error('permission_denied'));
      onValueErrorCallbacks.get('/status/user-3')!(new Error('permission_denied'));
    });

    // After the backoff only ONE retry should fire (re-subscribing all 3 listeners)
    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    // Exactly 3 new onValue calls (one per contact), not 9
    expect(mockOnValue.mock.calls.length).toBe(initialCalls + 3);
  });

  it('preserves existing presenceMap entries during retry', async () => {
    const { result } = await importAndRender(['user-1', 'user-2']);

    // Populate both entries
    act(() => {
      onValueCallbacks.get('/status/user-1')!({
        val: () => ({ state: 'online', lastChanged: 1000 }),
      });
      onValueCallbacks.get('/status/user-2')!({
        val: () => ({ state: 'offline', lastChanged: 2000 }),
      });
    });

    expect(result.current.get('user-1')?.state).toBe('online');
    expect(result.current.get('user-2')?.state).toBe('offline');

    // Error on one listener — entries should persist
    act(() => {
      onValueErrorCallbacks.get('/status/user-1')!(new Error('permission_denied'));
    });

    expect(result.current.get('user-1')?.state).toBe('online');
    expect(result.current.get('user-2')?.state).toBe('offline');
  });
});
