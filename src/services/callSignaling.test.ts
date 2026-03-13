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

import { getFunctions, httpsCallable } from 'firebase/functions';
import { initiateCall, declineCall, validatePairingCode } from './callSignaling';

const mockGetFunctions = vi.mocked(getFunctions);
const mockHttpsCallable = vi.mocked(httpsCallable);

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

  describe('validatePairingCode', () => {
    it('calls httpsCallable with correct function name and payload', async () => {
      const mockCallable = vi.fn().mockResolvedValue({ data: { elderlyUserId: 'elderly-42' } });
      mockGetFunctions.mockReturnValue('functions-instance' as never);
      mockHttpsCallable.mockReturnValue(mockCallable as never);

      const result = await validatePairingCode('123456');

      expect(mockGetFunctions).toHaveBeenCalledWith({});
      expect(mockHttpsCallable).toHaveBeenCalledWith('functions-instance', 'validatePairingCode');
      expect(mockCallable).toHaveBeenCalledWith({ code: '123456' });
      expect(result).toEqual({ elderlyUserId: 'elderly-42' });
    });
  });
});
