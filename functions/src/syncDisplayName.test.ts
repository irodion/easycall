import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUpdate = vi.fn();
const mockCommit = vi.fn().mockResolvedValue(undefined);
const mockGet = vi.fn();

const mockBatch = vi.fn().mockReturnValue({
  update: mockUpdate,
  commit: mockCommit,
});

const mockCollectionGroup = vi.fn().mockReturnValue({
  where: vi.fn().mockReturnValue({ get: mockGet }),
});

vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(),
}));

vi.mock('firebase-admin/messaging', () => ({
  getMessaging: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn().mockReturnValue({
    collectionGroup: mockCollectionGroup,
    batch: mockBatch,
  }),
  FieldValue: {
    serverTimestamp: vi.fn(),
    arrayUnion: vi.fn(),
    arrayRemove: vi.fn(),
  },
  Timestamp: { fromMillis: vi.fn() },
}));

vi.mock('firebase-functions/v2/https', () => ({
  onCall: vi.fn((...args: unknown[]) => (args.length === 2 ? args[1] : args[0])),
  onRequest: vi.fn((...args: unknown[]) => (args.length === 2 ? args[1] : args[0])),
  HttpsError: class extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: vi.fn((_path: string, handler: unknown) => handler),
}));

vi.mock('firebase-functions/v2/database', () => ({
  onValueWritten: vi.fn((_path: string, handler: unknown) => handler),
}));

vi.mock('jsonwebtoken', () => ({
  default: { sign: vi.fn().mockReturnValue('mock-jwt') },
}));

describe('syncDisplayNameToContacts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 0 when afterName is undefined', async () => {
    const { syncDisplayNameToContacts } = await import('./index.js');
    const db = (await import('firebase-admin/firestore')).getFirestore();
    const count = await syncDisplayNameToContacts(db, 'user-1', 'Old Name', undefined);
    expect(count).toBe(0);
    expect(mockCollectionGroup).not.toHaveBeenCalled();
  });

  it('returns 0 when name did not change', async () => {
    const { syncDisplayNameToContacts } = await import('./index.js');
    const db = (await import('firebase-admin/firestore')).getFirestore();
    const count = await syncDisplayNameToContacts(db, 'user-1', 'Same', 'Same');
    expect(count).toBe(0);
  });

  it('returns 0 when no contacts reference the user', async () => {
    mockGet.mockResolvedValue({ empty: true, docs: [] });

    const { syncDisplayNameToContacts } = await import('./index.js');
    const db = (await import('firebase-admin/firestore')).getFirestore();
    const count = await syncDisplayNameToContacts(db, 'user-1', 'Old', 'New');
    expect(count).toBe(0);
  });

  it('updates contacts that have a different name', async () => {
    const mockRef1 = { id: 'contact-1' };
    const mockRef2 = { id: 'contact-2' };
    mockGet.mockResolvedValue({
      empty: false,
      docs: [
        { ref: mockRef1, data: () => ({ name: 'Old Name', contactUserId: 'user-1' }) },
        { ref: mockRef2, data: () => ({ name: 'New Name', contactUserId: 'user-1' }) },
      ],
    });

    const { syncDisplayNameToContacts } = await import('./index.js');
    const db = (await import('firebase-admin/firestore')).getFirestore();
    const count = await syncDisplayNameToContacts(db, 'user-1', 'Old Name', 'New Name');

    // Only contact-1 should be updated (contact-2 already has the new name)
    expect(count).toBe(1);
    expect(mockUpdate).toHaveBeenCalledWith(mockRef1, { name: 'New Name' });
    expect(mockCommit).toHaveBeenCalled();
  });

  it('updates all contacts with stale names', async () => {
    const refs = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }];
    mockGet.mockResolvedValue({
      empty: false,
      docs: refs.map((ref) => ({
        ref,
        data: () => ({ name: 'Old', contactUserId: 'user-1' }),
      })),
    });

    const { syncDisplayNameToContacts } = await import('./index.js');
    const db = (await import('firebase-admin/firestore')).getFirestore();
    const count = await syncDisplayNameToContacts(db, 'user-1', 'Old', 'New');

    expect(count).toBe(3);
    expect(mockUpdate).toHaveBeenCalledTimes(3);
    expect(mockCommit).toHaveBeenCalled();
  });
});
