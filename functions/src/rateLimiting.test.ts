import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/messaging', () => ({ getMessaging: vi.fn() }));
vi.mock('firebase-functions/v2/https', () => ({
  onCall: vi.fn((...args: unknown[]) => (args.length === 2 ? args[1] : args[0])),
  onRequest: vi.fn((fn: unknown) => fn),
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
const mockRunTransaction = vi.fn(async (fn: (txn: Record<string, unknown>) => unknown) =>
  fn({ get: mockTxnGet, set: mockTxnSet, update: vi.fn() }),
);
const mockDocRef = { id: 'doc' };
const mockDoc = vi.fn(() => mockDocRef);
const mockCollection = vi.fn(() => ({ doc: mockDoc }));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: mockCollection,
    runTransaction: mockRunTransaction,
    collectionGroup: vi.fn(() => ({ where: vi.fn(() => ({ get: vi.fn() })) })),
  })),
  FieldValue: { serverTimestamp: vi.fn(() => 'server-ts') },
  Timestamp: { now: vi.fn() },
}));

import { checkPairingCodeRateLimit, checkPinVerifyRateLimit } from './index.js';
import { getFirestore } from 'firebase-admin/firestore';

describe('checkPairingCodeRateLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows first attempt when no rate limit doc exists', async () => {
    mockTxnGet.mockResolvedValue({ data: () => undefined });
    const db = getFirestore();
    await expect(checkPairingCodeRateLimit(db, 'user-1')).resolves.toBeUndefined();
    expect(mockTxnSet).toHaveBeenCalled();
  });

  it('allows up to 5 attempts within the window', async () => {
    const now = Date.now();
    mockTxnGet.mockResolvedValue({
      data: () => ({ attempts: [now - 1000, now - 2000, now - 3000, now - 4000] }),
    });
    const db = getFirestore();
    await expect(checkPairingCodeRateLimit(db, 'user-1')).resolves.toBeUndefined();
  });

  it('rejects the 6th attempt within 10 minutes', async () => {
    const now = Date.now();
    mockTxnGet.mockResolvedValue({
      data: () => ({
        attempts: [now - 1000, now - 2000, now - 3000, now - 4000, now - 5000],
      }),
    });
    const db = getFirestore();
    await expect(checkPairingCodeRateLimit(db, 'user-1')).rejects.toThrow(
      'Too many pairing attempts',
    );
  });

  it('allows attempts after the 10-minute window expires', async () => {
    const elevenMinutesAgo = Date.now() - 11 * 60 * 1000;
    mockTxnGet.mockResolvedValue({
      data: () => ({
        attempts: [
          elevenMinutesAgo,
          elevenMinutesAgo + 1000,
          elevenMinutesAgo + 2000,
          elevenMinutesAgo + 3000,
          elevenMinutesAgo + 4000,
        ],
      }),
    });
    const db = getFirestore();
    await expect(checkPairingCodeRateLimit(db, 'user-1')).resolves.toBeUndefined();
  });

  it('uses correct Firestore path', async () => {
    mockTxnGet.mockResolvedValue({ data: () => undefined });
    const db = getFirestore();
    await checkPairingCodeRateLimit(db, 'caregiver-abc');
    expect(mockCollection).toHaveBeenCalledWith('rateLimits');
    expect(mockDoc).toHaveBeenCalledWith('pairingCode:caregiver-abc');
  });
});

describe('checkPinVerifyRateLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows first attempt when no rate limit docs exist', async () => {
    mockTxnGet.mockResolvedValue({ data: () => undefined });
    const db = getFirestore();
    await expect(checkPinVerifyRateLimit(db, '192.168.1.1')).resolves.toBeUndefined();
    // Should check both per-IP and global rate limits
    expect(mockTxnSet).toHaveBeenCalled();
  });

  it('rejects per-IP when 6th attempt within 5 minutes', async () => {
    const now = Date.now();
    mockTxnGet.mockResolvedValue({
      data: () => ({
        attempts: [now - 1000, now - 2000, now - 3000, now - 4000, now - 5000],
      }),
    });
    const db = getFirestore();
    await expect(checkPinVerifyRateLimit(db, '10.0.0.1')).rejects.toThrow('Too many PIN attempts');
  });

  it('allows attempts after the 5-minute window expires', async () => {
    const sixMinutesAgo = Date.now() - 6 * 60 * 1000;
    mockTxnGet.mockResolvedValue({
      data: () => ({
        attempts: [
          sixMinutesAgo,
          sixMinutesAgo + 1000,
          sixMinutesAgo + 2000,
          sixMinutesAgo + 3000,
          sixMinutesAgo + 4000,
        ],
      }),
    });
    const db = getFirestore();
    await expect(checkPinVerifyRateLimit(db, '10.0.0.1')).resolves.toBeUndefined();
  });

  it('sanitizes IP for Firestore doc ID and uses pinVerifyIp prefix', async () => {
    mockTxnGet.mockResolvedValue({ data: () => undefined });
    const db = getFirestore();
    await checkPinVerifyRateLimit(db, '192.168.1.1');
    expect(mockCollection).toHaveBeenCalledWith('rateLimits');
    // IP dots replaced with underscores for doc ID
    expect(mockDoc).toHaveBeenCalledWith('pinVerifyIp:192_168_1_1');
  });
});
