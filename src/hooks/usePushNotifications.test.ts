import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCallStore } from '@/stores/callStore';

vi.mock('firebase/messaging', () => ({
  getToken: vi.fn(),
  onMessage: vi.fn(() => vi.fn()),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  arrayUnion: vi.fn((v: unknown) => ({ _type: 'arrayUnion', value: v })),
  arrayRemove: vi.fn((v: unknown) => ({ _type: 'arrayRemove', value: v })),
}));

vi.mock('@/services/firebase', () => ({
  db: {},
  getFirebaseMessaging: vi.fn(),
}));

import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc } from 'firebase/firestore';
import { getFirebaseMessaging } from '@/services/firebase';
import { usePushNotifications } from './usePushNotifications';

const mockGetToken = vi.mocked(getToken);
const mockOnMessage = vi.mocked(onMessage);
const mockDoc = vi.mocked(doc);
const mockUpdateDoc = vi.mocked(updateDoc);
const mockGetFirebaseMessaging = vi.mocked(getFirebaseMessaging);

// Helper to create a mock Messaging instance with the correct type
function createMockMessaging() {
  return {} as Awaited<ReturnType<typeof getFirebaseMessaging>> & object;
}

describe('usePushNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCallStore.setState({ isRinging: false, incomingCall: null });
  });

  describe('requestPermission', () => {
    it('returns null when messaging is not supported', async () => {
      mockGetFirebaseMessaging.mockResolvedValue(null);
      const { requestPermission } = usePushNotifications('user-1');
      const result = await requestPermission();
      expect(result).toBeNull();
    });

    it('returns null when permission is denied', async () => {
      mockGetFirebaseMessaging.mockResolvedValue(createMockMessaging());
      vi.stubGlobal('Notification', { requestPermission: vi.fn().mockResolvedValue('denied') });
      const { requestPermission } = usePushNotifications('user-1');
      const result = await requestPermission();
      expect(result).toBeNull();
      vi.unstubAllGlobals();
    });

    it('returns token and saves to Firestore when permission granted', async () => {
      mockGetFirebaseMessaging.mockResolvedValue(createMockMessaging());
      mockGetToken.mockResolvedValue('fcm-token-123');
      mockDoc.mockReturnValue('doc-ref' as never);
      vi.stubGlobal('Notification', { requestPermission: vi.fn().mockResolvedValue('granted') });

      const { requestPermission } = usePushNotifications('user-1');
      const result = await requestPermission();

      expect(result).toBe('fcm-token-123');
      expect(mockGetToken).toHaveBeenCalled();
      expect(mockUpdateDoc).toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });

  describe('removeToken', () => {
    it('calls updateDoc with arrayRemove', async () => {
      mockDoc.mockReturnValue('doc-ref' as never);
      const { removeToken } = usePushNotifications('user-1');
      await removeToken('fcm-token-123');
      expect(mockUpdateDoc).toHaveBeenCalled();
    });
  });

  describe('subscribeForeground', () => {
    it('returns noop when messaging is not supported', async () => {
      mockGetFirebaseMessaging.mockResolvedValue(null);
      const { subscribeForeground } = usePushNotifications('user-1');
      const unsub = await subscribeForeground();
      expect(typeof unsub).toBe('function');
      expect(mockOnMessage).not.toHaveBeenCalled();
    });

    it('calls onMessage and sets callStore on incoming_call', async () => {
      mockGetFirebaseMessaging.mockResolvedValue(createMockMessaging());

      // Capture the callback passed to onMessage
      let capturedCallback: ((payload: unknown) => void) | null = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockOnMessage as any).mockImplementation((_m: unknown, cb: (payload: unknown) => void) => {
        capturedCallback = cb;
        return vi.fn();
      });

      const { subscribeForeground } = usePushNotifications('user-1');
      await subscribeForeground();

      expect(mockOnMessage).toHaveBeenCalled();

      capturedCallback!({
        data: {
          type: 'incoming_call',
          callerName: 'Alex',
          callerPhoto: 'https://example.com/alex.jpg',
          roomId: 'room-1',
          elderlyUserId: 'user-1',
        },
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

    it('does not set callStore for non-incoming_call messages', async () => {
      mockGetFirebaseMessaging.mockResolvedValue(createMockMessaging());

      let capturedCallback: ((payload: unknown) => void) | null = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockOnMessage as any).mockImplementation((_m: unknown, cb: (payload: unknown) => void) => {
        capturedCallback = cb;
        return vi.fn();
      });

      const { subscribeForeground } = usePushNotifications('user-1');
      await subscribeForeground();

      capturedCallback!({ data: { type: 'other' } });

      const state = useCallStore.getState();
      expect(state.isRinging).toBe(false);
    });
  });
});
