import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockAdd } = vi.hoisted(() => {
  const mockAdd = vi.fn().mockResolvedValue({ id: 'call-history-1' });
  return { mockAdd };
});

// Mock firebase-admin before importing anything that uses it
vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(),
}));

vi.mock('firebase-admin/messaging', () => ({
  getMessaging: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => {
  const mockCollection2 = vi.fn().mockReturnValue({ add: mockAdd });
  const mockDoc = vi.fn().mockReturnValue({ collection: mockCollection2 });
  const mockCollection1 = vi.fn().mockReturnValue({ doc: mockDoc });
  return {
    getFirestore: vi.fn().mockReturnValue({ collection: mockCollection1 }),
    FieldValue: { serverTimestamp: vi.fn().mockReturnValue('server-timestamp') },
  };
});

vi.mock('firebase-functions/v2/https', () => ({
  onCall: vi.fn((...args: unknown[]) => {
    // Handle both onCall(handler) and onCall(options, handler)
    return args.length === 2 ? args[1] : args[0];
  }),
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
  onDocumentWritten: vi.fn((_path, fn) => fn),
}));

vi.mock('jsonwebtoken', () => ({
  default: { sign: vi.fn().mockReturnValue('mock-token') },
}));

import { writeCallHistoryForMissedOrDeclined } from './index.js';
import { getFirestore } from 'firebase-admin/firestore';

describe('writeCallHistoryForMissedOrDeclined', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function getDb() {
    return getFirestore() as unknown as import('firebase-admin/firestore').Firestore;
  }

  it('writes callHistory entry when status changes to missed', async () => {
    const after = { status: 'missed', callerName: 'Alex', timestamp: undefined };
    const result = await writeCallHistoryForMissedOrDeclined(
      getDb(),
      'elderly-1',
      undefined,
      after,
    );

    expect(result).toBe(true);
    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: '',
        contactName: 'Alex',
        direction: 'incoming',
        outcome: 'missed',
        duration: 0,
      }),
    );
  });

  it('writes callHistory entry when status changes to declined', async () => {
    const after = { status: 'declined', callerName: 'Bob' };
    const result = await writeCallHistoryForMissedOrDeclined(
      getDb(),
      'elderly-1',
      undefined,
      after,
    );

    expect(result).toBe(true);
    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'declined',
        contactName: 'Bob',
      }),
    );
  });

  it('does NOT write when status is ringing', async () => {
    const after = { status: 'ringing', callerName: 'Alex' };
    const result = await writeCallHistoryForMissedOrDeclined(
      getDb(),
      'elderly-1',
      undefined,
      after,
    );

    expect(result).toBe(false);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('does NOT write when status is active', async () => {
    const after = { status: 'active', callerName: 'Alex' };
    const result = await writeCallHistoryForMissedOrDeclined(
      getDb(),
      'elderly-1',
      undefined,
      after,
    );

    expect(result).toBe(false);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('does NOT write when status unchanged', async () => {
    const before = { status: 'missed' };
    const after = { status: 'missed', callerName: 'Alex' };
    const result = await writeCallHistoryForMissedOrDeclined(getDb(), 'elderly-1', before, after);

    expect(result).toBe(false);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('does NOT write when after is undefined (doc deleted)', async () => {
    const result = await writeCallHistoryForMissedOrDeclined(
      getDb(),
      'elderly-1',
      undefined,
      undefined,
    );

    expect(result).toBe(false);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('includes callerName in history entry', async () => {
    const after = { status: 'missed', callerName: 'Sarah' };
    await writeCallHistoryForMissedOrDeclined(getDb(), 'elderly-1', undefined, after);

    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        contactName: 'Sarah',
      }),
    );
  });

  it('truncates callerName to 100 chars', async () => {
    const longName = 'A'.repeat(200);
    const after = { status: 'missed', callerName: longName };
    await writeCallHistoryForMissedOrDeclined(getDb(), 'elderly-1', undefined, after);

    const callArg = mockAdd.mock.calls[0]?.[0] as { contactName: string };
    expect(callArg.contactName).toHaveLength(100);
  });

  it('defaults callerName to Unknown when missing', async () => {
    const after = { status: 'missed' };
    await writeCallHistoryForMissedOrDeclined(getDb(), 'elderly-1', undefined, after);

    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        contactName: 'Unknown',
      }),
    );
  });
});
