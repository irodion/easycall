import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockUnsubscribe = vi.fn();
let snapshotCallback: (snap: unknown) => void;
let errorCallback: (err: unknown) => void;

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  onSnapshot: vi.fn(
    (_ref: unknown, onNext: (snap: unknown) => void, onError: (err: unknown) => void) => {
      snapshotCallback = onNext;
      errorCallback = onError;
      return mockUnsubscribe;
    },
  ),
}));

vi.mock('@/services/firebase', () => ({
  db: {},
}));

function makeSnap(data: Record<string, unknown> | null) {
  return {
    exists: () => data !== null,
    data: () => data,
  };
}

describe('useBillingAlert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('returns null alert when doc does not exist', async () => {
    const { useBillingAlert } = await import('./useBillingAlert');
    const { result } = renderHook(() => useBillingAlert());

    act(() => snapshotCallback(makeSnap(null)));

    expect(result.current.alert).toBeNull();
    expect(result.current.dismissed).toBe(false);
  });

  it('returns warning severity for threshold 0.6', async () => {
    const { useBillingAlert } = await import('./useBillingAlert');
    const { result } = renderHook(() => useBillingAlert());

    act(() =>
      snapshotCallback(
        makeSnap({
          costAmount: 12,
          budgetAmount: 20,
          currencyCode: 'ILS',
          thresholdExceeded: 0.6,
          updatedAt: null,
        }),
      ),
    );

    expect(result.current.alert).not.toBeNull();
    expect(result.current.alert!.severity).toBe('warning');
    expect(result.current.alert!.thresholdExceeded).toBe(0.6);
  });

  it('returns error severity for threshold 0.9', async () => {
    const { useBillingAlert } = await import('./useBillingAlert');
    const { result } = renderHook(() => useBillingAlert());

    act(() =>
      snapshotCallback(
        makeSnap({
          costAmount: 18,
          budgetAmount: 20,
          currencyCode: 'ILS',
          thresholdExceeded: 0.9,
          updatedAt: null,
        }),
      ),
    );

    expect(result.current.alert!.severity).toBe('error');
  });

  it('returns critical severity for threshold 1.0', async () => {
    const { useBillingAlert } = await import('./useBillingAlert');
    const { result } = renderHook(() => useBillingAlert());

    act(() =>
      snapshotCallback(
        makeSnap({
          costAmount: 22,
          budgetAmount: 20,
          currencyCode: 'ILS',
          thresholdExceeded: 1.0,
          updatedAt: null,
        }),
      ),
    );

    expect(result.current.alert!.severity).toBe('critical');
  });

  it('dismiss writes correct localStorage key and sets dismissed=true', async () => {
    const { useBillingAlert } = await import('./useBillingAlert');
    const { result } = renderHook(() => useBillingAlert());

    act(() =>
      snapshotCallback(
        makeSnap({
          costAmount: 12,
          budgetAmount: 20,
          currencyCode: 'ILS',
          thresholdExceeded: 0.6,
          updatedAt: null,
        }),
      ),
    );

    act(() => result.current.dismiss());

    expect(result.current.dismissed).toBe(true);
    expect(localStorage.getItem('easycall_billing_alert_dismissed_0.6')).toBe('true');
  });

  it('new higher threshold shows as not dismissed after lower was dismissed', async () => {
    localStorage.setItem('easycall_billing_alert_dismissed_0.6', 'true');

    const { useBillingAlert } = await import('./useBillingAlert');
    const { result } = renderHook(() => useBillingAlert());

    act(() =>
      snapshotCallback(
        makeSnap({
          costAmount: 18,
          budgetAmount: 20,
          currencyCode: 'ILS',
          thresholdExceeded: 0.9,
          updatedAt: null,
        }),
      ),
    );

    expect(result.current.alert).not.toBeNull();
    expect(result.current.dismissed).toBe(false);
  });

  it('error callback clears alert to null', async () => {
    const { useBillingAlert } = await import('./useBillingAlert');
    const { result } = renderHook(() => useBillingAlert());

    act(() =>
      snapshotCallback(
        makeSnap({
          costAmount: 12,
          budgetAmount: 20,
          currencyCode: 'ILS',
          thresholdExceeded: 0.6,
          updatedAt: null,
        }),
      ),
    );
    expect(result.current.alert).not.toBeNull();

    act(() => errorCallback(new Error('permission-denied')));

    expect(result.current.alert).toBeNull();
  });

  it('cleanup calls unsubscribe', async () => {
    const { useBillingAlert } = await import('./useBillingAlert');
    const { unmount } = renderHook(() => useBillingAlert());

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});
