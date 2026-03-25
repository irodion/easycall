import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { useCallStore } from '@/stores/callStore';

type SnapshotCallback = (snap: {
  exists: () => boolean;
  data: () => Record<string, unknown> | undefined;
}) => void;

let capturedCallback: SnapshotCallback | null = null;
let capturedErrorCallback: ((error: Error) => void) | null = null;
const mockUnsubscribe = vi.fn();

vi.mock('firebase/firestore', () => ({
  onSnapshot: vi.fn((_ref: unknown, cb: SnapshotCallback, errCb?: (error: Error) => void) => {
    capturedCallback = cb;
    capturedErrorCallback = errCb ?? null;
    return mockUnsubscribe;
  }),
}));

vi.mock('@/services/callSignaling', () => ({
  incomingCallRef: vi.fn(() => 'doc-ref'),
  declineCall: vi.fn().mockResolvedValue(undefined),
  clearIncomingCallDoc: vi.fn().mockResolvedValue(undefined),
}));

import { useIncomingCall } from './useIncomingCall';
import { declineCall } from '@/services/callSignaling';

// Mock navigator.serviceWorker for SW message tests
const swListeners = new Map<string, Set<EventListener>>();
const mockServiceWorker = {
  addEventListener: vi.fn((type: string, cb: EventListener) => {
    if (!swListeners.has(type)) swListeners.set(type, new Set());
    swListeners.get(type)!.add(cb);
  }),
  removeEventListener: vi.fn((type: string, cb: EventListener) => {
    swListeners.get(type)?.delete(cb);
  }),
};
Object.defineProperty(navigator, 'serviceWorker', {
  value: mockServiceWorker,
  writable: true,
});

describe('useIncomingCall', () => {
  const originalLocation = window.location.href;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedCallback = null;
    capturedErrorCallback = null;
    swListeners.clear();
    useCallStore.setState({ isRinging: false, incomingCall: null });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    // Restore original URL after tests that modify it
    window.history.replaceState({}, '', originalLocation);
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
  });

  it('clears call store when userId changes', () => {
    useCallStore.getState().setIncomingCall({
      callerName: 'Alex',
      callerPhotoURL: '',
      roomId: 'room-1',
      elderlyUserId: 'user-1',
    });

    const { rerender } = renderHook(({ uid }) => useIncomingCall(uid), {
      initialProps: { uid: 'user-1' as string | null },
    });

    // Simulate auth change — new user
    rerender({ uid: 'user-2' });
    expect(useCallStore.getState().isRinging).toBe(false);
    expect(useCallStore.getState().incomingCall).toBeNull();
  });

  it('clears call store on logout', () => {
    useCallStore.getState().setIncomingCall({
      callerName: 'Alex',
      callerPhotoURL: '',
      roomId: 'room-1',
      elderlyUserId: 'user-1',
    });

    const { rerender } = renderHook(({ uid }) => useIncomingCall(uid), {
      initialProps: { uid: 'user-1' as string | null },
    });

    // Simulate logout
    rerender({ uid: null });
    expect(useCallStore.getState().isRinging).toBe(false);
    expect(useCallStore.getState().incomingCall).toBeNull();
  });

  it('clears incoming call on listener error', () => {
    useCallStore.getState().setIncomingCall({
      callerName: 'Alex',
      callerPhotoURL: '',
      roomId: 'room-1',
      elderlyUserId: 'user-1',
    });

    renderHook(() => useIncomingCall('user-1'));
    expect(capturedErrorCallback).not.toBeNull();

    // Simulate a permission/network error
    capturedErrorCallback!(new Error('permission-denied'));

    expect(useCallStore.getState().isRinging).toBe(false);
    expect(useCallStore.getState().incomingCall).toBeNull();
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useIncomingCall('user-1'));
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it('declines call when receiving decline-call message from service worker', async () => {
    renderHook(() => useIncomingCall('user-1'));

    // Set ringing state after hook mounts (hook clears state on mount)
    useCallStore.getState().setIncomingCall({
      callerName: 'Alex',
      callerPhotoURL: '',
      roomId: 'room-1',
      elderlyUserId: 'user-1',
    });

    // Simulate SW postMessage
    const listeners = swListeners.get('message');
    expect(listeners).toBeDefined();
    expect(listeners!.size).toBeGreaterThan(0);

    for (const listener of listeners!) {
      listener(new MessageEvent('message', { data: { type: 'decline-call', roomId: 'room-1' } }));
    }

    expect(useCallStore.getState().isRinging).toBe(false);
    expect(declineCall).toHaveBeenCalledWith('user-1');
  });

  it('ignores decline-call message when roomId does not match', async () => {
    renderHook(() => useIncomingCall('user-1'));

    // Set ringing state with room-1
    useCallStore.getState().setIncomingCall({
      callerName: 'Alex',
      callerPhotoURL: '',
      roomId: 'room-1',
      elderlyUserId: 'user-1',
    });

    // SW sends decline for a different room
    const listeners = swListeners.get('message');
    for (const listener of listeners!) {
      listener(
        new MessageEvent('message', { data: { type: 'decline-call', roomId: 'room-OTHER' } }),
      );
    }

    // Should NOT decline — different room
    expect(declineCall).not.toHaveBeenCalled();
    expect(useCallStore.getState().isRinging).toBe(true);
  });

  it('ignores decline-call message when not ringing', () => {
    renderHook(() => useIncomingCall('user-1'));

    const listeners = swListeners.get('message');
    for (const listener of listeners!) {
      listener(new MessageEvent('message', { data: { type: 'decline-call', roomId: 'room-1' } }));
    }

    expect(declineCall).not.toHaveBeenCalled();
  });

  it('auto-declines when opened with ?action=decline-call URL param and matching roomId', () => {
    // Simulate the app being opened by SW with decline intent
    window.history.replaceState({}, '', '/elderly?action=decline-call&roomId=room-1');

    renderHook(() => useIncomingCall('user-1'));

    // URL param should be cleaned up immediately
    expect(window.location.search).toBe('');

    // Simulate Firestore snapshot arriving with a ringing call
    capturedCallback!({
      exists: () => true,
      data: () => ({
        status: 'ringing',
        callerName: 'Alex',
        callerPhotoURL: '',
        jitsiRoomId: 'room-1',
        timestamp: { toDate: () => new Date() },
      }),
    });

    // Should auto-decline instead of showing incoming call UI
    expect(declineCall).toHaveBeenCalledWith('user-1');
    expect(useCallStore.getState().isRinging).toBe(false);
  });

  it('does not auto-decline when roomId does not match', () => {
    window.history.replaceState({}, '', '/elderly?action=decline-call&roomId=room-1');

    renderHook(() => useIncomingCall('user-1'));

    // Snapshot arrives with a different roomId
    capturedCallback!({
      exists: () => true,
      data: () => ({
        status: 'ringing',
        callerName: 'Bob',
        callerPhotoURL: '',
        jitsiRoomId: 'room-OTHER',
        timestamp: { toDate: () => new Date() },
      }),
    });

    // Should NOT decline — different call
    expect(declineCall).not.toHaveBeenCalled();
    expect(useCallStore.getState().isRinging).toBe(true);
  });

  it('does not auto-decline on second snapshot after URL param consumed', () => {
    window.history.replaceState({}, '', '/elderly?action=decline-call&roomId=room-1');

    renderHook(() => useIncomingCall('user-1'));

    // First snapshot — auto-declined
    capturedCallback!({
      exists: () => true,
      data: () => ({
        status: 'ringing',
        callerName: 'Alex',
        callerPhotoURL: '',
        jitsiRoomId: 'room-1',
        timestamp: { toDate: () => new Date() },
      }),
    });

    vi.mocked(declineCall).mockClear();

    // Second snapshot (new call) — should show normally
    capturedCallback!({
      exists: () => true,
      data: () => ({
        status: 'ringing',
        callerName: 'Bob',
        callerPhotoURL: '',
        jitsiRoomId: 'room-2',
        timestamp: { toDate: () => new Date() },
      }),
    });

    expect(declineCall).not.toHaveBeenCalled();
    expect(useCallStore.getState().isRinging).toBe(true);
  });

  it('removes SW message listener on unmount', () => {
    const { unmount } = renderHook(() => useIncomingCall('user-1'));

    const listeners = swListeners.get('message');
    expect(listeners!.size).toBe(1);

    unmount();
    expect(mockServiceWorker.removeEventListener).toHaveBeenCalledWith(
      'message',
      expect.any(Function),
    );
  });
});
