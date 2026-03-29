import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSet = vi.fn().mockResolvedValue(undefined);
const mockGet = vi.fn();
const mockQueryGet = vi.fn();
const mockSendEachForMulticast = vi.fn().mockResolvedValue({ responses: [] });

vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(),
}));

vi.mock('firebase-admin/messaging', () => ({
  getMessaging: vi.fn(() => ({
    sendEachForMulticast: mockSendEachForMulticast,
  })),
}));

vi.mock('firebase-admin/firestore', () => {
  const mockTimestamp = {
    fromMillis: vi.fn((ms: number) => ({ _seconds: Math.floor(ms / 1000) })),
  };
  return {
    getFirestore: vi.fn(),
    FieldValue: { serverTimestamp: vi.fn() },
    Timestamp: mockTimestamp,
  };
});

vi.mock('firebase-functions/v2/https', () => ({
  onCall: vi.fn((...args: unknown[]) => {
    // Handle both onCall(handler) and onCall(options, handler)
    return args.length === 2 ? args[1] : args[0];
  }),
  onRequest: vi.fn((...args: unknown[]) => (args.length === 2 ? args[1] : args[0])),
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

vi.mock('firebase-functions/v2/database', () => ({
  onValueWritten: vi.fn((_path, fn) => fn),
}));

vi.mock('jsonwebtoken', () => ({
  default: { sign: vi.fn().mockReturnValue('mock-token') },
}));

import { handleStatusChange } from './index.js';

function createMockDb(
  overrides: {
    userData?: Record<string, unknown>;
    userExists?: boolean;
    missedDocs?: Array<{ data: () => Record<string, unknown> }>;
  } = {},
) {
  const { userData = {}, userExists = true, missedDocs = [] } = overrides;

  const mockQueryObj = { get: mockQueryGet };
  const mockCallHistoryCollection = {
    where: vi.fn().mockReturnValue({
      orderBy: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue(mockQueryObj),
          get: mockQueryGet,
        }),
      }),
    }),
  };

  mockGet.mockResolvedValue({
    exists: userExists,
    data: () => userData,
  });

  mockQueryGet.mockResolvedValue({
    empty: missedDocs.length === 0,
    size: missedDocs.length,
    docs: missedDocs,
  });

  const mockDocObj = {
    set: mockSet,
    get: mockGet,
    collection: vi.fn().mockReturnValue(mockCallHistoryCollection),
  };

  return {
    doc: vi.fn().mockReturnValue(mockDocObj),
    collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(mockDocObj) }),
  } as unknown as import('firebase-admin/firestore').Firestore;
}

describe('handleStatusChange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates Firestore user doc with presenceState: online', async () => {
    const db = createMockDb();
    await handleStatusChange(db, 'user-1', 'offline', 'online', Date.now());

    expect(mockSet).toHaveBeenCalledWith({ presenceState: 'online' }, { merge: true });
  });

  it('updates Firestore user doc with presenceState: in-call', async () => {
    const db = createMockDb();
    await handleStatusChange(db, 'user-1', 'online', 'in-call', Date.now());

    expect(mockSet).toHaveBeenCalledWith({ presenceState: 'in-call' }, { merge: true });
  });

  it('updates Firestore user doc with presenceState: offline and lastSeen', async () => {
    const db = createMockDb();
    const now = Date.now();
    await handleStatusChange(db, 'user-1', 'online', 'offline', now);

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        presenceState: 'offline',
        lastSeen: expect.anything(),
      }),
      { merge: true },
    );
  });

  it('does not set lastSeen when lastChanged is null and going offline', async () => {
    const db = createMockDb();
    await handleStatusChange(db, 'user-1', 'online', 'offline', null);

    expect(mockSet).toHaveBeenCalledWith({ presenceState: 'offline' }, { merge: true });
  });

  it('sends FCM notification on offline → online transition when missed calls exist', async () => {
    const db = createMockDb({
      userData: {
        pushTokens: ['token-1'],
        lastSeen: { _seconds: 1000 },
      },
      missedDocs: [{ data: () => ({ contactName: 'Alice' }) }],
    });

    await handleStatusChange(db, 'user-1', 'offline', 'online', Date.now());

    expect(mockSendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: ['token-1'],
        notification: expect.objectContaining({
          title: 'Missed Call',
          body: 'Missed call from Alice',
        }),
      }),
    );
  });

  it('notification body shows count + caller names for multiple missed calls', async () => {
    const db = createMockDb({
      userData: {
        pushTokens: ['token-1'],
        lastSeen: { _seconds: 1000 },
      },
      missedDocs: [
        { data: () => ({ contactName: 'Alice' }) },
        { data: () => ({ contactName: 'Bob' }) },
        { data: () => ({ contactName: 'Alice' }) },
      ],
    });

    await handleStatusChange(db, 'user-1', 'offline', 'online', Date.now());

    expect(mockSendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({
        notification: expect.objectContaining({
          body: '3 missed calls from Alice, Bob',
        }),
      }),
    );
  });

  it('does NOT send notification on online → in-call transition', async () => {
    const db = createMockDb({
      userData: { pushTokens: ['token-1'] },
    });

    await handleStatusChange(db, 'user-1', 'online', 'in-call', Date.now());

    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it('does NOT send notification on in-call → online transition', async () => {
    const db = createMockDb({
      userData: { pushTokens: ['token-1'] },
    });

    await handleStatusChange(db, 'user-1', 'in-call', 'online', Date.now());

    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it('does NOT send notification when no missed calls exist since lastSeen', async () => {
    const db = createMockDb({
      userData: {
        pushTokens: ['token-1'],
        lastSeen: { _seconds: 1000 },
      },
      missedDocs: [],
    });

    await handleStatusChange(db, 'user-1', 'offline', 'online', Date.now());

    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it('does NOT send notification when user has no push tokens', async () => {
    const db = createMockDb({
      userData: { pushTokens: [] },
      missedDocs: [{ data: () => ({ contactName: 'Alice' }) }],
    });

    await handleStatusChange(db, 'user-1', 'offline', 'online', Date.now());

    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it('handles null beforeState (first-time user comes online) — should check for missed calls', async () => {
    const db = createMockDb({
      userData: {
        pushTokens: ['token-1'],
        lastSeen: { _seconds: 1000 },
      },
      missedDocs: [{ data: () => ({ contactName: 'Sarah' }) }],
    });

    await handleStatusChange(db, 'user-1', null, 'online', Date.now());

    expect(mockSendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({
        notification: expect.objectContaining({
          body: 'Missed call from Sarah',
        }),
      }),
    );
  });

  it('handles non-existent user doc gracefully', async () => {
    const db = createMockDb({ userExists: false });

    // Should not throw
    await handleStatusChange(db, 'user-1', 'offline', 'online', Date.now());
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });
});
