import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDoc = vi.fn();
const mockSetDoc = vi.fn().mockResolvedValue(undefined);
const mockUpdateDoc = vi.fn().mockResolvedValue(undefined);
const mockServerTimestamp = vi.fn(() => 'SERVER_TIMESTAMP');

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  serverTimestamp: () => mockServerTimestamp(),
}));

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(),
}));

vi.mock('@/services/firebase', () => ({
  app: {},
  db: { type: 'mock-db' },
}));

import { initiateCall, declineCall } from './callSignaling';

describe('callSignaling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockReturnValue('doc-ref');
  });

  describe('initiateCall', () => {
    it('calls setDoc with correct path and fields', async () => {
      await initiateCall({
        elderlyUserId: 'elderly-1',
        callerId: 'caller-1',
        callerName: 'Alex',
        callerPhotoURL: 'https://example.com/alex.jpg',
        jitsiRoomId: 'room-1',
      });

      expect(mockDoc).toHaveBeenCalledWith(
        { type: 'mock-db' },
        'users',
        'elderly-1',
        'incomingCall',
        'current',
      );
      expect(mockSetDoc).toHaveBeenCalledWith('doc-ref', {
        callerId: 'caller-1',
        callerName: 'Alex',
        callerPhotoURL: 'https://example.com/alex.jpg',
        jitsiRoomId: 'room-1',
        status: 'ringing',
        timestamp: 'SERVER_TIMESTAMP',
      });
    });

    it('sets callerPhotoURL to null when not provided', async () => {
      await initiateCall({
        elderlyUserId: 'elderly-1',
        callerId: 'caller-1',
        callerName: 'Alex',
        jitsiRoomId: 'room-1',
      });

      expect(mockSetDoc).toHaveBeenCalledWith(
        'doc-ref',
        expect.objectContaining({ callerPhotoURL: null }),
      );
    });

    it('sets status to ringing', async () => {
      await initiateCall({
        elderlyUserId: 'elderly-1',
        callerId: 'caller-1',
        callerName: 'Alex',
        jitsiRoomId: 'room-1',
      });

      expect(mockSetDoc).toHaveBeenCalledWith(
        'doc-ref',
        expect.objectContaining({ status: 'ringing' }),
      );
    });
  });

  describe('declineCall', () => {
    it('calls updateDoc with status declined', async () => {
      await declineCall('elderly-1');

      expect(mockDoc).toHaveBeenCalledWith(
        { type: 'mock-db' },
        'users',
        'elderly-1',
        'incomingCall',
        'current',
      );
      expect(mockUpdateDoc).toHaveBeenCalledWith('doc-ref', { status: 'declined' });
    });
  });
});
