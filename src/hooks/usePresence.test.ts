import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockSet = vi.fn().mockResolvedValue(undefined);
const mockOnDisconnectCancel = vi.fn().mockReturnValue(Promise.resolve());
const mockOnDisconnectSet = vi.fn().mockReturnValue(Promise.resolve());
const mockOnDisconnect = vi.fn().mockReturnValue({
  set: mockOnDisconnectSet,
  cancel: mockOnDisconnectCancel,
});
const mockOff = vi.fn();
const mockServerTimestamp = vi.fn().mockReturnValue('server-timestamp');
const mockRef = vi.fn().mockImplementation((_db, path) => ({ path }));

let onValueCallback: ((snap: { val: () => unknown }) => void) | null = null;
const mockOnValue = vi.fn().mockImplementation((_ref, callback) => {
  onValueCallback = callback;
  return callback;
});

vi.mock('firebase/database', () => ({
  ref: (...args: unknown[]) => mockRef(...args),
  onValue: (...args: unknown[]) => mockOnValue(...args),
  onDisconnect: (...args: unknown[]) => mockOnDisconnect(...args),
  set: (...args: unknown[]) => mockSet(...args),
  serverTimestamp: () => mockServerTimestamp(),
  off: (...args: unknown[]) => mockOff(...args),
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

  it('writes online state when connected', async () => {
    await importAndRender('user-1');
    expect(onValueCallback).not.toBeNull();

    await act(async () => {
      onValueCallback!({ val: () => true });
    });

    expect(mockOnDisconnect).toHaveBeenCalled();
    expect(mockOnDisconnectSet).toHaveBeenCalledWith({
      state: 'offline',
      lastChanged: 'server-timestamp',
    });
  });

  it('registers onDisconnect with offline state', async () => {
    await importAndRender('user-1');

    await act(async () => {
      onValueCallback!({ val: () => true });
    });

    expect(mockOnDisconnectSet).toHaveBeenCalledWith(expect.objectContaining({ state: 'offline' }));
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
    expect(mockOff).toHaveBeenCalledWith(
      expect.objectContaining({ path: '.info/connected' }),
      'value',
      expect.any(Function),
    );
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
    const initialOffCalls = mockOff.mock.calls.length;

    rerender({ uid: 'user-2' });

    expect(mockOff.mock.calls.length).toBeGreaterThan(initialOffCalls);
    // Should have created a new ref for user-2
    expect(mockRef).toHaveBeenCalledWith({ type: 'database' }, '/status/user-2');
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
