import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

const mockGetDoc = vi.fn();
const mockClearActiveCall = vi.fn().mockResolvedValue(undefined);
const mockActiveCallRef = vi.fn().mockReturnValue('doc-ref');

vi.mock('firebase/firestore', () => ({
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
}));

vi.mock('@/services/callHistory', () => ({
  activeCallRef: (...args: unknown[]) => mockActiveCallRef(...args),
  clearActiveCall: (...args: unknown[]) => mockClearActiveCall(...args),
}));

import { useActiveCall } from './useActiveCall';

function makeActiveCallData(startedAt: Date, status: 'active' | 'ended' = 'active') {
  return {
    contactId: 'c1',
    contactName: 'Alice',
    jitsiRoomId: 'room-1',
    startedAt: {
      seconds: Math.floor(startedAt.getTime() / 1000),
      nanoseconds: 0,
      toDate: () => startedAt,
    },
    status,
  };
}

describe('useActiveCall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('does not call getDoc when userId is null', () => {
    renderHook(() => useActiveCall(null));
    expect(mockGetDoc).not.toHaveBeenCalled();
  });

  it('returns activeCall when call is active and within 2 minutes', async () => {
    const data = makeActiveCallData(new Date());
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => data });

    const { result } = renderHook(() => useActiveCall('user-1'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.activeCall).toEqual(data);
  });

  it('returns null and clears when call is older than 2 minutes', async () => {
    const overTwoMinAgo = new Date(Date.now() - 2 * 60 * 1000 - 5000);
    const data = makeActiveCallData(overTwoMinAgo);
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => data });

    const { result } = renderHook(() => useActiveCall('user-1'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.activeCall).toBeNull();
    expect(mockClearActiveCall).toHaveBeenCalledWith('user-1');
  });

  it('returns null when no activeCall doc exists', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false });

    const { result } = renderHook(() => useActiveCall('user-1'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.activeCall).toBeNull();
    expect(mockClearActiveCall).not.toHaveBeenCalled();
  });

  it('returns null and clears when status is ended', async () => {
    const data = makeActiveCallData(new Date(), 'ended');
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => data });

    const { result } = renderHook(() => useActiveCall('user-1'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.activeCall).toBeNull();
    expect(mockClearActiveCall).toHaveBeenCalledWith('user-1');
  });

  it('dismiss sets activeCall to null', async () => {
    const data = makeActiveCallData(new Date());
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => data });

    const { result } = renderHook(() => useActiveCall('user-1'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.activeCall).not.toBeNull();

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.activeCall).toBeNull();
  });

  it('resets activeCall when userId changes', async () => {
    const data = makeActiveCallData(new Date());
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => data });

    const { result, rerender } = renderHook(
      ({ uid }: { uid: string | null }) => useActiveCall(uid),
      { initialProps: { uid: 'user-1' } },
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(result.current.activeCall).not.toBeNull();

    rerender({ uid: 'user-2' });
    // activeCall should be reset to null on userId change
    expect(result.current.activeCall).toBeNull();
  });

  it('clears active call when data has invalid shape', async () => {
    // Data missing startedAt.toDate function
    const invalidData = { status: 'active', startedAt: { seconds: 123 } };
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => invalidData });

    const { result } = renderHook(() => useActiveCall('user-1'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.activeCall).toBeNull();
    expect(mockClearActiveCall).toHaveBeenCalledWith('user-1');
  });
});
