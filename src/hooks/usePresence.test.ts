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
const mockUnsubscribe = vi.fn();
const mockOnValue = vi.fn().mockImplementation((_ref, callback) => {
  onValueCallback = callback;
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
    onValueCallback = null;
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
});
