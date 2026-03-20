import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

let snapshotCallback: ((snap: unknown) => void) | null = null;
let errorCallback: (() => void) | null = null;
const mockUnsub = vi.fn();
const mockVerifyCaregiverPin = vi.fn();

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => 'pin-ref'),
  onSnapshot: vi.fn((_ref: unknown, onNext: (snap: unknown) => void, onError: () => void) => {
    snapshotCallback = onNext;
    errorCallback = onError;
    return mockUnsub;
  }),
}));

vi.mock('@/services/firebase', () => ({ db: {} }));
vi.mock('@/services/caregiverPinService', () => ({
  CAREGIVER_PIN_REF: 'pin-ref',
  verifyCaregiverPin: (...args: unknown[]) => mockVerifyCaregiverPin(...args),
}));

import { useCaregiverPin } from '@/hooks/useCaregiverPin';

// onSnapshot is now called synchronously in useEffect (migration is fire-and-forget)
function renderPinHook() {
  return renderHook(() => useCaregiverPin());
}

describe('useCaregiverPin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    snapshotCallback = null;
    errorCallback = null;
  });

  it('starts with loading true', async () => {
    const { result } = renderPinHook();
    expect(result.current.loading).toBe(true);
  });

  it('sets pinRequired true when pinSet is true', async () => {
    const { result } = renderPinHook();
    act(() => snapshotCallback!({ exists: () => true, data: () => ({ pinSet: true }) }));
    expect(result.current.pinRequired).toBe(true);
    expect(result.current.verified).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it('auto-verifies when no PIN is set', () => {
    const { result } = renderPinHook();
    act(() => snapshotCallback!({ exists: () => false }));
    expect(result.current.pinRequired).toBe(false);
    expect(result.current.verified).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it('sets verified true on correct PIN', async () => {
    mockVerifyCaregiverPin.mockResolvedValue(true);
    const { result } = renderPinHook();
    act(() => snapshotCallback!({ exists: () => true, data: () => ({ pinSet: true }) }));

    let ok: boolean;
    await act(async () => {
      ok = await result.current.submitPin('1234');
    });
    expect(ok!).toBe(true);
    expect(result.current.verified).toBe(true);
  });

  it('increments failedAttempts on wrong PIN', async () => {
    mockVerifyCaregiverPin.mockResolvedValue(false);
    const { result } = renderPinHook();
    act(() => snapshotCallback!({ exists: () => true, data: () => ({ pinSet: true }) }));

    await act(async () => {
      await result.current.submitPin('0000');
    });
    expect(result.current.failedAttempts).toBe(1);
    expect(result.current.verified).toBe(false);
  });

  it('triggers cooldown after 5 failed attempts', async () => {
    mockVerifyCaregiverPin.mockResolvedValue(false);
    const { result } = renderPinHook();
    act(() => snapshotCallback!({ exists: () => true, data: () => ({ pinSet: true }) }));

    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await result.current.submitPin('0000');
      });
    }
    expect(result.current.cooldownRemaining).toBe(300);
    expect(result.current.failedAttempts).toBe(0);
  });

  it('resets verified when PIN is enabled after being auto-verified', async () => {
    const { result } = renderPinHook();
    // Start with no PIN — auto-verified
    act(() => snapshotCallback!({ exists: () => false }));
    expect(result.current.verified).toBe(true);

    // PIN gets enabled — should reset verified
    act(() => snapshotCallback!({ exists: () => true, data: () => ({ pinSet: true }) }));
    expect(result.current.verified).toBe(false);
    expect(result.current.pinRequired).toBe(true);
  });

  it('requires re-verification when PIN is removed then re-enabled, even after prior submitPin', async () => {
    mockVerifyCaregiverPin.mockResolvedValue(true);
    const { result } = renderPinHook();
    act(() => snapshotCallback!({ exists: () => true, data: () => ({ pinSet: true }) }));
    await act(async () => { await result.current.submitPin('1234'); });
    expect(result.current.verified).toBe(true);

    // PIN removed — auto-verifies and clears userVerified ref
    act(() => snapshotCallback!({ exists: () => false }));
    expect(result.current.verified).toBe(true);

    // PIN re-enabled — userVerified was cleared, so must re-verify
    act(() => snapshotCallback!({ exists: () => true, data: () => ({ pinSet: true }) }));
    expect(result.current.verified).toBe(false);
  });

  it('stays verified when PIN snapshot re-fires after explicit verification', async () => {
    mockVerifyCaregiverPin.mockResolvedValue(true);
    const { result } = renderPinHook();
    act(() => snapshotCallback!({ exists: () => true, data: () => ({ pinSet: true }) }));
    await act(async () => { await result.current.submitPin('1234'); });
    expect(result.current.verified).toBe(true);

    // Same snapshot re-fires (e.g. Firestore reconnection) — should stay verified
    act(() => snapshotCallback!({ exists: () => true, data: () => ({ pinSet: true }) }));
    expect(result.current.verified).toBe(true);
  });

  it('retries indefinitely on error, staying in loading state', () => {
    vi.useFakeTimers();
    const { result } = renderPinHook();

    // First error — stays loading (retry pending)
    act(() => errorCallback!());
    expect(result.current.loading).toBe(true);
    expect(result.current.verified).toBe(false);

    // Multiple retries — still loading, never gives up
    act(() => { vi.advanceTimersByTime(1000); });
    act(() => errorCallback!());
    expect(result.current.loading).toBe(true);

    act(() => { vi.advanceTimersByTime(2000); });
    act(() => errorCallback!());
    expect(result.current.loading).toBe(true);

    // Eventually succeeds
    act(() => { vi.advanceTimersByTime(3000); });
    act(() => snapshotCallback!({ exists: () => true, data: () => ({ pinSet: true }) }));
    expect(result.current.pinRequired).toBe(true);
    expect(result.current.loading).toBe(false);

    vi.useRealTimers();
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderPinHook();
    unmount();
    expect(mockUnsub).toHaveBeenCalled();
  });
});
