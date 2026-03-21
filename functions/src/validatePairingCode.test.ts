import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/messaging', () => ({ getMessaging: vi.fn() }));
vi.mock('firebase-functions/v2/https', () => ({
  onCall: vi.fn((...args: unknown[]) => (args.length === 2 ? args[1] : args[0])),
  HttpsError: class HttpsError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: vi.fn((_path: unknown, fn: unknown) => fn),
}));
vi.mock('firebase-functions/v2/database', () => ({
  onValueWritten: vi.fn((_path: unknown, fn: unknown) => fn),
}));
vi.mock('jsonwebtoken', () => ({
  default: { sign: vi.fn().mockReturnValue('mock-token') },
}));

const mockTxnGet = vi.fn();
const mockTxnSet = vi.fn();
const mockTxnUpdate = vi.fn();
const mockDocGet = vi.fn();
const mockDocRef = { id: 'doc' };
const mockDoc = vi.fn(() => ({ ...mockDocRef, get: mockDocGet }));

const mockRunTransaction = vi.fn(async (fn: (txn: Record<string, unknown>) => unknown) =>
  fn({ get: mockTxnGet, set: mockTxnSet, update: mockTxnUpdate }),
);

const mockCollectionDoc = vi.fn(() => ({
  collection: vi.fn(() => ({
    doc: vi.fn(() => ({ id: 'caregiver-doc' })),
  })),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: vi.fn((path: string) => {
      if (path === 'users') return { doc: mockCollectionDoc };
      return { doc: mockDoc };
    }),
    doc: vi.fn((path: string) => {
      if (path.startsWith('users/')) return { get: mockDocGet };
      return { get: mockDocGet };
    }),
    runTransaction: mockRunTransaction,
    collectionGroup: vi.fn(() => ({ where: vi.fn(() => ({ get: vi.fn() })) })),
  })),
  FieldValue: {
    serverTimestamp: vi.fn(() => 'server-ts'),
    arrayUnion: vi.fn((...vals: unknown[]) => ({ _arrayUnion: vals })),
  },
  Timestamp: { now: vi.fn() },
}));

import { validatePairingCode } from './index.js';

// The onCall mock extracts the handler; cast for direct invocation
const callValidate = validatePairingCode as unknown as (request: {
  auth: { uid: string } | null;
  data: unknown;
}) => Promise<{ elderlyUserId: string }>;

describe('validatePairingCode Cloud Function', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: rate limit passes
    mockTxnGet.mockResolvedValue({ data: () => undefined });
  });

  it('rejects unauthenticated requests', async () => {
    await expect(callValidate({ auth: null, data: { code: '123456' } })).rejects.toThrow(
      'Authentication required.',
    );
  });

  it('rejects invalid code format (non-6-digit)', async () => {
    // Caregiver role check must pass first
    mockDocGet.mockResolvedValue({ exists: true, data: () => ({ role: 'caregiver' }) });

    await expect(callValidate({ auth: { uid: 'cg1' }, data: { code: '12345' } })).rejects.toThrow(
      'code must be a 6-digit numeric string.',
    );
  });

  it('rejects non-numeric code', async () => {
    mockDocGet.mockResolvedValue({ exists: true, data: () => ({ role: 'caregiver' }) });

    await expect(callValidate({ auth: { uid: 'cg1' }, data: { code: 'abcdef' } })).rejects.toThrow(
      'code must be a 6-digit numeric string.',
    );
  });

  describe('role enforcement (P0 fix)', () => {
    it('rejects anonymous users (no user doc)', async () => {
      mockDocGet.mockResolvedValue({ exists: false, data: () => undefined });

      await expect(
        callValidate({ auth: { uid: 'anon-user' }, data: { code: '123456' } }),
      ).rejects.toThrow('Only caregivers can perform this action.');
    });

    it('rejects elderly users', async () => {
      mockDocGet.mockResolvedValue({ exists: true, data: () => ({ role: 'elderly' }) });

      await expect(
        callValidate({ auth: { uid: 'elderly-user' }, data: { code: '123456' } }),
      ).rejects.toThrow('Only caregivers can perform this action.');
    });

    it('rejects users with no role set', async () => {
      mockDocGet.mockResolvedValue({ exists: true, data: () => ({}) });

      await expect(
        callValidate({ auth: { uid: 'norole-user' }, data: { code: '123456' } }),
      ).rejects.toThrow('Only caregivers can perform this action.');
    });

    it('allows caregiver role to proceed', async () => {
      mockDocGet.mockResolvedValue({ exists: true, data: () => ({ role: 'caregiver' }) });

      // Transaction will fail because pairing code doesn't exist, but that's
      // after the role check — which is what we're testing passes.
      mockTxnGet.mockResolvedValue({ exists: false, data: () => undefined });

      await expect(
        callValidate({ auth: { uid: 'cg1' }, data: { code: '123456' } }),
      ).rejects.toThrow('Invalid pairing code.');
    });
  });

  describe('pairing code validation (with caregiver role)', () => {
    beforeEach(() => {
      // All tests in this block assume caller has caregiver role
      mockDocGet.mockResolvedValue({ exists: true, data: () => ({ role: 'caregiver' }) });
    });

    it('rejects non-existent pairing code', async () => {
      mockTxnGet.mockResolvedValue({ exists: false, data: () => undefined });

      await expect(
        callValidate({ auth: { uid: 'cg1' }, data: { code: '123456' } }),
      ).rejects.toThrow('Invalid pairing code.');
    });

    it('rejects already-used pairing code', async () => {
      mockTxnGet.mockResolvedValue({
        exists: true,
        data: () => ({
          used: true,
          elderlyUserId: 'e1',
          expiresAt: { toDate: () => new Date(Date.now() + 60000) },
        }),
      });

      await expect(
        callValidate({ auth: { uid: 'cg1' }, data: { code: '123456' } }),
      ).rejects.toThrow('Pairing code has already been used.');
    });

    it('rejects expired pairing code', async () => {
      mockTxnGet.mockResolvedValue({
        exists: true,
        data: () => ({
          used: false,
          elderlyUserId: 'e1',
          expiresAt: { toDate: () => new Date(Date.now() - 60000) },
        }),
      });

      await expect(
        callValidate({ auth: { uid: 'cg1' }, data: { code: '123456' } }),
      ).rejects.toThrow('Pairing code has expired.');
    });

    it('rejects self-pairing', async () => {
      mockTxnGet.mockResolvedValue({
        exists: true,
        data: () => ({
          used: false,
          elderlyUserId: 'cg1',
          expiresAt: { toDate: () => new Date(Date.now() + 60000) },
        }),
      });

      await expect(
        callValidate({ auth: { uid: 'cg1' }, data: { code: '123456' } }),
      ).rejects.toThrow('Cannot pair an account with itself.');
    });

    it('succeeds for valid caregiver with valid code', async () => {
      mockTxnGet.mockResolvedValue({
        exists: true,
        data: () => ({
          used: false,
          elderlyUserId: 'elderly-1',
          expiresAt: { toDate: () => new Date(Date.now() + 60000) },
        }),
      });

      const result = await callValidate({ auth: { uid: 'cg1' }, data: { code: '123456' } });
      expect(result).toEqual({ elderlyUserId: 'elderly-1' });
      expect(mockTxnUpdate).toHaveBeenCalled();
      // txn.set is called for: rate limit, caregivers subcollection, caregiver user doc
      expect(mockTxnSet).toHaveBeenCalledTimes(3);
    });

    it('writes linkedElderlyUsers to caregiver user doc', async () => {
      mockTxnGet.mockResolvedValue({
        exists: true,
        data: () => ({
          used: false,
          elderlyUserId: 'elderly-1',
          expiresAt: { toDate: () => new Date(Date.now() + 60000) },
        }),
      });

      await callValidate({ auth: { uid: 'cg1' }, data: { code: '123456' } });

      // Find the txn.set call that writes linkedElderlyUsers (the one with merge: true)
      const linkedSetCall = mockTxnSet.mock.calls.find(
        (call: unknown[]) => (call[2] as Record<string, unknown> | undefined)?.merge === true,
      );
      expect(linkedSetCall).toBeDefined();
      const setData = linkedSetCall![1] as Record<string, unknown>;
      expect(setData).toHaveProperty('linkedElderlyUsers');
      const setOptions = linkedSetCall![2] as Record<string, unknown>;
      expect(setOptions).toEqual({ merge: true });
    });
  });
});
