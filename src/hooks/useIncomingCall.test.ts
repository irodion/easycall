import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { useCallStore } from '@/stores/callStore';

type SnapshotCallback = (snap: {
  exists: () => boolean;
  data: () => Record<string, unknown> | undefined;
}) => void;

let capturedCallback: SnapshotCallback | null = null;
const mockUnsubscribe = vi.fn();

vi.mock('firebase/firestore', () => ({
  onSnapshot: vi.fn((_ref: unknown, cb: SnapshotCallback) => {
    capturedCallback = cb;
    return mockUnsubscribe;
  }),
}));

vi.mock('@/services/callSignaling', () => ({
  incomingCallRef: vi.fn(() => 'doc-ref'),
}));

import { useIncomingCall } from './useIncomingCall';

describe('useIncomingCall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedCallback = null;
    useCallStore.setState({ isRinging: false, incomingCall: null });
  });

  afterEach(() => {
    cleanup();
  });

  it('does not subscribe when userId is null', () => {
    renderHook(() => useIncomingCall(null));
    expect(capturedCallback).toBeNull();
  });

  it('subscribes to incomingCall/current when userId is provided', async () => {
    const { onSnapshot } = await import('firebase/firestore');
    renderHook(() => useIncomingCall('user-1'));
    expect(onSnapshot).toHaveBeenCalled();
    expect(capturedCallback).not.toBeNull();
  });

  it('calls setIncomingCall when snapshot has status=ringing and is recent', () => {
    renderHook(() => useIncomingCall('user-1'));
    capturedCallback!({
      exists: () => true,
      data: () => ({
        status: 'ringing',
        callerName: 'Alex',
        callerPhotoURL: 'https://example.com/alex.jpg',
        jitsiRoomId: 'room-1',
        timestamp: { toDate: () => new Date() },
      }),
    });

    const state = useCallStore.getState();
    expect(state.isRinging).toBe(true);
    expect(state.incomingCall).toEqual({
      callerName: 'Alex',
      callerPhotoURL: 'https://example.com/alex.jpg',
      roomId: 'room-1',
      elderlyUserId: 'user-1',
    });
  });

  it('calls clearIncomingCall when snapshot has status=ended', () => {
    useCallStore.getState().setIncomingCall({
      callerName: 'Alex',
      callerPhotoURL: '',
      roomId: 'room-1',
      elderlyUserId: 'user-1',
    });

    renderHook(() => useIncomingCall('user-1'));
    capturedCallback!({
      exists: () => true,
      data: () => ({ status: 'ended' }),
    });

    expect(useCallStore.getState().isRinging).toBe(false);
  });

  it('calls clearIncomingCall when snapshot does not exist', () => {
    useCallStore.getState().setIncomingCall({
      callerName: 'Alex',
      callerPhotoURL: '',
      roomId: 'room-1',
      elderlyUserId: 'user-1',
    });

    renderHook(() => useIncomingCall('user-1'));
    capturedCallback!({
      exists: () => false,
      data: () => undefined,
    });

    expect(useCallStore.getState().isRinging).toBe(false);
  });

  it('ignores stale calls (timestamp >60s ago)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-13T12:01:01Z'));

    renderHook(() => useIncomingCall('user-1'));
    capturedCallback!({
      exists: () => true,
      data: () => ({
        status: 'ringing',
        callerName: 'Alex',
        callerPhotoURL: '',
        jitsiRoomId: 'room-1',
        timestamp: { toDate: () => new Date('2026-03-13T12:00:00Z') },
      }),
    });

    expect(useCallStore.getState().isRinging).toBe(false);
    vi.useRealTimers();
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useIncomingCall('user-1'));
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});
