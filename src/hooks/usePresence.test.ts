import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockSet = vi.fn().mockResolvedValue(undefined);
const mockOnDisconnectCancel = vi.fn().mockReturnValue(Promise.resolve());
const mockOnDisconnectSet = vi.fn().mockReturnValue(Promise.resolve());
const mockOnDisconnect = vi.fn().mockReturnValue({
  set: mockOnDisconnectSet,
  cancel: mockOnDisconnectCancel,
});
const mockServerTimestamp = vi.fn().mockReturnValue('server-timestamp');
const mockRef = vi.fn().mockImplementation((_db, path) => ({ path }));

let onValueCallback: ((snap: { val: () => unknown }) => void) | null = null;
let onValueErrorCallback: ((error: Error) => void) | null = null;
const mockUnsubscribe = vi.fn();
const mockOnValue = vi.fn().mockImplementation((_ref, callback, errorCb?) => {
  onValueCallback = callback;
  if (errorCb) onValueErrorCallback = errorCb;
  return mockUnsubscribe;
});

vi.mock('firebase/database', () => ({
  ref: (...args: unknown[]) => mockRef(...args),
  onValue: (...args: unknown[]) => mockOnValue(...args),
  onDisconnect: (...args: unknown[]) => mockOnDisconnect(...args),
  set: (...args: unknown[]) => mockSet(...args),
  serverTimestamp: () => mockServerTimestamp(),
}));

vi.mock('@/services/firebase', () => ({
  rtdb: { type: 'database' },
}));

describe('usePresence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    onValueCallback = null;
    onValueErrorCallback = null;
  });

  async function importAndRender(userId: string | null) {
    const { usePresence } = await import('./usePresence');
    return renderHook(({ uid }) => usePresence(uid), {
      initialProps: { uid: userId },
    });
  }

  it('does nothing when userId is null', async () => {
    await importAndRender(null);
    expect(mockOnValue).not.toHaveBeenCalled();
  });

  it('listens to .info/connected when userId is provided', async () => {
    await importAndRender('user-1');
    expect(mockRef).toHaveBeenCalledWith({ type: 'database' }, '.info/connected');
    expect(mockOnValue).toHaveBeenCalled();
  });

  it('registers onDisconnect and writes online state when connected', async () => {
    await importAndRender('user-1');
    expect(onValueCallback).not.toBeNull();

    await act(async () => {
      onValueCallback!({ val: () => true });
      // Flush the .then() chain
      await Promise.resolve();
    });

    expect(mockOnDisconnect).toHaveBeenCalled();
    expect(mockOnDisconnectSet).toHaveBeenCalledWith({
      state: 'offline',
      lastChanged: 'server-timestamp',
    });
    // Should also write online state after onDisconnect is registered
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ path: '/status/user-1' }), {
      state: 'online',
      lastChanged: 'server-timestamp',
    });
  });

  it('does not write online state when disconnected', async () => {
    await importAndRender('user-1');

    await act(async () => {
      onValueCallback!({ val: () => false });
    });

    expect(mockSet).not.toHaveBeenCalled();
  });

  it('cleans up listener and writes offline on unmount', async () => {
    const { unmount } = await importAndRender('user-1');
    unmount();
    // Should call the unsubscribe function returned by onValue
    expect(mockUnsubscribe).toHaveBeenCalled();
    // Should write offline state explicitly on cleanup
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ path: '/status/user-1' }), {
      state: 'offline',
      lastChanged: 'server-timestamp',
    });
    // Should cancel the pending onDisconnect handler
    expect(mockOnDisconnectCancel).toHaveBeenCalled();
  });

  it('cleans up and re-subscribes when userId changes', async () => {
    const { rerender } = await importAndRender('user-1');
    const initialUnsubCalls = mockUnsubscribe.mock.calls.length;

    rerender({ uid: 'user-2' });

    expect(mockUnsubscribe.mock.calls.length).toBeGreaterThan(initialUnsubCalls);
    expect(mockRef).toHaveBeenCalledWith({ type: 'database' }, '/status/user-2');
  });

  it('does not overwrite in-call state on reconnect', async () => {
    const { result } = await importAndRender('user-1');

    // Set in-call first
    act(() => {
      result.current.setInCall(true);
    });
    mockSet.mockClear();

    // Simulate reconnect
    await act(async () => {
      onValueCallback!({ val: () => true });
      await Promise.resolve();
    });

    // Should NOT have written 'online' — in-call should be preserved
    const onlineCalls = mockSet.mock.calls.filter(
      (call) =>
        call[1] &&
        typeof call[1] === 'object' &&
        (call[1] as Record<string, unknown>).state === 'online',
    );
    expect(onlineCalls).toHaveLength(0);
  });

  it('setInCall(true) writes state: in-call to RTDB', async () => {
    const { result } = await importAndRender('user-1');

    act(() => {
      result.current.setInCall(true);
    });

    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ path: '/status/user-1' }), {
      state: 'in-call',
      lastChanged: 'server-timestamp',
    });
  });

  it('setInCall(false) writes state: online to RTDB', async () => {
    const { result } = await importAndRender('user-1');

    act(() => {
      result.current.setInCall(false);
    });

    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ path: '/status/user-1' }), {
      state: 'online',
      lastChanged: 'server-timestamp',
    });
  });

  it('setInCall is a stable reference across renders', async () => {
    const { result, rerender } = await importAndRender('user-1');
    const firstRef = result.current.setInCall;

    rerender({ uid: 'user-1' });
    expect(result.current.setInCall).toBe(firstRef);
  });

  it('passes an error callback to onValue', async () => {
    await importAndRender('user-1');
    expect(onValueErrorCallback).not.toBeNull();
  });

  it('re-subscribes after an onValue error with backoff', async () => {
    await importAndRender('user-1');
    const initialCalls = mockOnValue.mock.calls.length;

    // Simulate error — Firebase cancels the listener
    act(() => {
      onValueErrorCallback!(new Error('permission_denied'));
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
    await importAndRender('user-1');

    // First error → 2s backoff
    act(() => {
      onValueErrorCallback!(new Error('permission_denied'));
    });
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    const callsAfterFirst = mockOnValue.mock.calls.length;

    // Second error → 4s backoff
    act(() => {
      onValueErrorCallback!(new Error('permission_denied'));
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
    await importAndRender('user-1');

    // First error → retry
    act(() => {
      onValueErrorCallback!(new Error('permission_denied'));
    });
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    const callsAfterRetry = mockOnValue.mock.calls.length;

    // Successful callback resets the counter
    await act(async () => {
      onValueCallback!({ val: () => true });
      await Promise.resolve();
    });

    // Next error should use first-attempt delay (2s), not second (4s)
    act(() => {
      onValueErrorCallback!(new Error('permission_denied'));
    });
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(mockOnValue.mock.calls.length).toBeGreaterThan(callsAfterRetry);
  });

  it('stops retrying after MAX_RETRIES (5) attempts', async () => {
    await importAndRender('user-1');

    for (let i = 0; i < 5; i++) {
      act(() => {
        onValueErrorCallback!(new Error('permission_denied'));
      });
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
    }
    const callsAfterMax = mockOnValue.mock.calls.length;

    // 6th error should NOT schedule a retry
    act(() => {
      onValueErrorCallback!(new Error('permission_denied'));
    });
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(mockOnValue.mock.calls.length).toBe(callsAfterMax);
  });

  it('cancels pending retry timer on unmount', async () => {
    const { unmount } = await importAndRender('user-1');

    act(() => {
      onValueErrorCallback!(new Error('permission_denied'));
    });

    unmount();

    const callsBefore = mockOnValue.mock.calls.length;
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(mockOnValue.mock.calls.length).toBe(callsBefore);
  });

  it('does not write online from stale .then() after userId changes', async () => {
    // Make onDisconnect.set() return a controllable promise
    let resolveOnDisconnect!: () => void;
    mockOnDisconnectSet.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveOnDisconnect = resolve;
      }),
    );

    const { rerender } = await importAndRender('user-1');

    // Trigger .info/connected → registers onDisconnect, .then() is pending
    await act(async () => {
      onValueCallback!({ val: () => true });
    });
    mockSet.mockClear();

    // Change userId — cleanup runs, sets cancelled = true
    rerender({ uid: 'user-2' });
    mockSet.mockClear();

    // Now resolve the stale onDisconnect promise from user-1's effect
    await act(async () => {
      resolveOnDisconnect();
      await Promise.resolve();
    });

    // The stale .then() should NOT have written 'online' to user-1's ref
    const onlineCalls = mockSet.mock.calls.filter(
      (call) =>
        call[1] &&
        typeof call[1] === 'object' &&
        (call[1] as Record<string, unknown>).state === 'online',
    );
    expect(onlineCalls).toHaveLength(0);
  });

  it('does not write offline or clear inCallRef when retrying after error', async () => {
    const { result } = await importAndRender('user-1');

    // Set in-call state
    act(() => {
      result.current.setInCall(true);
    });
    mockSet.mockClear();
    mockOnDisconnectCancel.mockClear();

    // Trigger error → retry
    act(() => {
      onValueErrorCallback!(new Error('permission_denied'));
    });
    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    // Retry should NOT have written offline or cancelled onDisconnect
    const offlineCalls = mockSet.mock.calls.filter(
      (call) =>
        call[1] &&
        typeof call[1] === 'object' &&
        (call[1] as Record<string, unknown>).state === 'offline',
    );
    expect(offlineCalls).toHaveLength(0);
    expect(mockOnDisconnectCancel).not.toHaveBeenCalled();

    // setInCall should still work (inCallRef was not cleared)
    mockSet.mockClear();
    act(() => {
      result.current.setInCall(false);
    });
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ path: '/status/user-1' }), {
      state: 'online',
      lastChanged: 'server-timestamp',
    });
  });
});
