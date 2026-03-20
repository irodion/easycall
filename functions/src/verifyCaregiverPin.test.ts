import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

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
const mockDocGet = vi.fn();
const mockRunTransaction = vi.fn(async (fn: (txn: Record<string, unknown>) => unknown) =>
  fn({ get: mockTxnGet, set: mockTxnSet, update: vi.fn() }),
);

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: vi.fn(() => ({ doc: vi.fn(() => ({ id: 'doc' })) })),
    doc: vi.fn(() => ({ get: mockDocGet })),
    runTransaction: mockRunTransaction,
    collectionGroup: vi.fn(() => ({ where: vi.fn(() => ({ get: vi.fn() })) })),
  })),
  FieldValue: { serverTimestamp: vi.fn(() => 'server-ts') },
  Timestamp: { now: vi.fn() },
}));

import { verifyCaregiverPin } from './index.js';

// The onCall mock extracts the handler; cast for direct invocation in tests
const callVerifyPin = verifyCaregiverPin as unknown as (
  request: {
    auth: { uid: string } | null;
    data: unknown;
    rawRequest?: { ip?: string; headers: Record<string, string> };
  },
) => Promise<{ valid: boolean }>;

const mockRequest = (data: unknown, auth: { uid: string } | null = { uid: 'u1' }) => ({
  auth,
  data,
  rawRequest: { ip: '127.0.0.1', headers: {} },
});

// Helper: compute expected hash using same algorithm as the server
function computeHash(pin: string, salt?: string): string {
  return crypto
    .createHash('sha256')
    .update('easycall-pin-v1' + (salt ?? '') + pin)
    .digest('hex');
}

describe('verifyCaregiverPin Cloud Function', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: rate limit passes (no existing attempts)
    mockTxnGet.mockResolvedValue({ data: () => undefined });
  });

  it('rejects unauthenticated requests', async () => {
    await expect(
      callVerifyPin(mockRequest({ pin: '1234' }, null)),
    ).rejects.toThrow('Authentication required.');
  });

  it('rejects non-numeric PIN', async () => {
    await expect(
      callVerifyPin(mockRequest({ pin: 'abc' })),
    ).rejects.toThrow('pin must be a 4-8 digit numeric string.');
  });

  it('rejects PIN shorter than 4 digits', async () => {
    await expect(
      callVerifyPin(mockRequest({ pin: '123' })),
    ).rejects.toThrow('pin must be a 4-8 digit numeric string.');
  });

  it('rejects PIN longer than 8 digits', async () => {
    await expect(
      callVerifyPin(mockRequest({ pin: '123456789' })),
    ).rejects.toThrow('pin must be a 4-8 digit numeric string.');
  });

  it('accepts exactly 4-digit PIN', async () => {
    const hash = computeHash('1234', 'caregiver-instance');
    mockDocGet.mockResolvedValue({ exists: true, data: () => ({ pinHash: hash }) });
    const result = await callVerifyPin(mockRequest({ pin: '1234' }));
    expect(result).toEqual({ valid: true });
  });

  it('accepts exactly 8-digit PIN', async () => {
    const hash = computeHash('12345678', 'caregiver-instance');
    mockDocGet.mockResolvedValue({ exists: true, data: () => ({ pinHash: hash }) });
    const result = await callVerifyPin(mockRequest({ pin: '12345678' }));
    expect(result).toEqual({ valid: true });
  });

  it('returns valid: false when no PIN doc exists', async () => {
    mockDocGet.mockResolvedValue({ exists: false, data: () => undefined });
    const result = await callVerifyPin(mockRequest({ pin: '1234' }));
    expect(result).toEqual({ valid: false });
  });

  it('returns valid: true when PIN matches', async () => {
    const hash = computeHash('1234', 'caregiver-instance');
    mockDocGet.mockResolvedValue({ exists: true, data: () => ({ pinHash: hash }) });
    const result = await callVerifyPin(mockRequest({ pin: '1234' }));
    expect(result).toEqual({ valid: true });
  });

  it('returns valid: false when PIN does not match', async () => {
    const hash = computeHash('5678', 'caregiver-instance');
    mockDocGet.mockResolvedValue({ exists: true, data: () => ({ pinHash: hash }) });
    const result = await callVerifyPin(mockRequest({ pin: '0000' }));
    expect(result).toEqual({ valid: false });
  });

  it('falls back to legacy config/caregiverPin doc', async () => {
    const hash = computeHash('4321', 'caregiver-instance');
    // First call (caregiverPinHash) returns not found, second call (legacy) returns hash
    mockDocGet
      .mockResolvedValueOnce({ exists: false, data: () => undefined })
      .mockResolvedValueOnce({ exists: true, data: () => ({ pinHash: hash }) });
    const result = await callVerifyPin(mockRequest({ pin: '4321' }));
    expect(result).toEqual({ valid: true });
  });
});
