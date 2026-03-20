import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

let snapshotCallback: ((snap: unknown) => void) | null = null;
let errorCallback: (() => void) | null = null;
const mockUnsub = vi.fn();

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => 'config-ref'),
  onSnapshot: vi.fn((_ref: unknown, onNext: (snap: unknown) => void, onError: () => void) => {
    snapshotCallback = onNext;
    errorCallback = onError;
    return mockUnsub;
  }),
}));

vi.mock('@/services/firebase', () => ({ db: {} }));
vi.mock('@/services/registrationLock', () => ({
  REGISTRATION_CONFIG_REF: 'config-ref',
}));

import { useRegistrationLock } from './useRegistrationLock';

describe('useRegistrationLock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    snapshotCallback = null;
    errorCallback = null;
  });

  it('starts with loading true and isOpen true', () => {
    const { result } = renderHook(() => useRegistrationLock());
    expect(result.current.loading).toBe(true);
    expect(result.current.isOpen).toBe(true);
  });

  it('sets isOpen true when config doc does not exist', () => {
    const { result } = renderHook(() => useRegistrationLock());
    act(() => snapshotCallback!({ exists: () => false }));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it('sets isOpen false when open is false', () => {
    const { result } = renderHook(() => useRegistrationLock());
    act(() => snapshotCallback!({ exists: () => true, data: () => ({ open: false }) }));
    expect(result.current.isOpen).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it('retries indefinitely on error, staying in loading state', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useRegistrationLock());

    // First error — stays loading (retry pending)
    act(() => errorCallback!());
    expect(result.current.loading).toBe(true);

    // Multiple retries — still loading, never gives up
    act(() => { vi.advanceTimersByTime(1000); });
    act(() => errorCallback!());
    expect(result.current.loading).toBe(true);

    act(() => { vi.advanceTimersByTime(2000); });
    act(() => errorCallback!());
    expect(result.current.loading).toBe(true);

    act(() => { vi.advanceTimersByTime(3000); });
    act(() => errorCallback!());
    expect(result.current.loading).toBe(true);

    // Eventually succeeds
    act(() => { vi.advanceTimersByTime(4000); });
    act(() => snapshotCallback!({ exists: () => true, data: () => ({ open: false }) }));
    expect(result.current.isOpen).toBe(false);
    expect(result.current.loading).toBe(false);

    vi.useRealTimers();
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useRegistrationLock());
    unmount();
    expect(mockUnsub).toHaveBeenCalled();
  });
});
