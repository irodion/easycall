import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

let snapshotCallback: ((snap: { empty: boolean }) => void) | null = null;
const mockUnsubscribe = vi.fn();
const mockOnSnapshot = vi.fn(
  (_q: unknown, cb: (snap: { empty: boolean }) => void, _err?: unknown) => {
    snapshotCallback = cb;
    cb({ empty: true });
    return mockUnsubscribe;
  },
);

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => 'doc-ref'),
  setDoc: vi.fn().mockResolvedValue(undefined),
  collection: vi.fn(() => 'collection-ref'),
  query: vi.fn((...args: unknown[]) => args[0]),
  limit: vi.fn(() => 'limit-1'),
  onSnapshot: (...args: unknown[]) =>
    mockOnSnapshot(...(args as Parameters<typeof mockOnSnapshot>)),
}));

vi.mock('@/services/firebase', () => ({
  db: {},
}));

import { setDoc } from 'firebase/firestore';
import { usePairingCode, generateCode } from './usePairingCode';

const mockSetDoc = vi.mocked(setDoc);

describe('generateCode', () => {
  it('returns a 6-digit string', () => {
    const code = generateCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(code).toHaveLength(6);
  });

  it('pads with leading zeros when needed', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.000001);
    const code = generateCode();
    expect(code).toHaveLength(6);
    vi.restoreAllMocks();
  });
});

describe('usePairingCode', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    snapshotCallback = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing when userId is null', async () => {
    renderHook(() => usePairingCode(null));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('calls setDoc on mount with correct fields', async () => {
    renderHook(() => usePairingCode('user-1'));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(mockSetDoc).toHaveBeenCalledWith(
      'doc-ref',
      expect.objectContaining({
        elderlyUserId: 'user-1',
        used: false,
        expiresAt: expect.any(Date),
      }),
    );
  });

  it('code is updated in state after successful setDoc', async () => {
    const { result } = renderHook(() => usePairingCode('user-1'));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(result.current.code).toMatch(/^\d{6}$/);
  });

  it('formattedCountdown is MM:SS format', async () => {
    const { result } = renderHook(() => usePairingCode('user-1'));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(result.current.formattedCountdown).toBe('10:00');
  });

  it('secondsRemaining decrements by 1 each second', async () => {
    const { result } = renderHook(() => usePairingCode('user-1'));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(result.current.secondsRemaining).toBe(600);

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(result.current.secondsRemaining).toBe(599);

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(result.current.secondsRemaining).toBe(598);
  });

  it('refresh generates a new code', async () => {
    const { result } = renderHook(() => usePairingCode('user-1'));
    await act(() => vi.advanceTimersByTimeAsync(0));

    const firstCode = result.current.code;

    mockSetDoc.mockClear();
    await act(() => result.current.refresh());

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    expect(result.current.code).toMatch(/^\d{6}$/);
    expect(result.current.secondsRemaining).toBe(600);
    expect(typeof firstCode).toBe('string');
  });

  it('calls onLinked callback when caregivers collection becomes non-empty', async () => {
    const onLinked = vi.fn();
    renderHook(() => usePairingCode('user-1', { onLinked }));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(onLinked).not.toHaveBeenCalled();

    act(() => {
      snapshotCallback?.({ empty: false });
    });

    expect(onLinked).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes from onSnapshot after detecting link', async () => {
    const onLinked = vi.fn();
    renderHook(() => usePairingCode('user-1', { onLinked }));
    await act(() => vi.advanceTimersByTimeAsync(0));

    act(() => {
      snapshotCallback?.({ empty: false });
    });

    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it('does not subscribe to onSnapshot when no onLinked callback', async () => {
    renderHook(() => usePairingCode('user-1'));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });

  it('cleans up timers on unmount', async () => {
    const { unmount } = renderHook(() => usePairingCode('user-1'));
    await act(() => vi.advanceTimersByTimeAsync(0));
    unmount();

    await act(() => vi.advanceTimersByTimeAsync(601_000));
  });

  it('refresh clears stale code and sets error on failure', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => usePairingCode('user-1'));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(result.current.code).toMatch(/^\d{6}$/);

    mockSetDoc.mockRejectedValueOnce(new Error('Network error'));
    await act(() => result.current.refresh());

    // Stale code should be cleared so error UI is shown
    expect(result.current.code).toBeNull();
    expect(result.current.error).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith('Failed to refresh pairing code:', expect.any(Error));

    consoleSpy.mockRestore();
  });
});
