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

const mockBatchDelete = vi.fn();
const mockBatchSet = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);

const mockDocGet = vi.fn();
const mockCollectionGet = vi.fn();

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: vi.fn((path: string) => {
      if (path === 'auditLog') {
        return { doc: vi.fn(() => ({ id: 'audit-doc-ref' })) };
      }
      if (path === 'pairingCodes') {
        return {
          where: vi.fn(() => ({
            get: vi.fn().mockResolvedValue({ docs: [] }),
          })),
        };
      }
      if (path === 'users') {
        return {
          doc: vi.fn(() => ({
            collection: vi.fn((sub: string) => {
              if (sub === 'caregivers') {
                return { doc: vi.fn(() => ({ id: 'caregiver-doc', get: mockDocGet })) };
              }
              return { get: mockCollectionGet };
            }),
            get: mockDocGet,
          })),
        };
      }
      // Handle full subcollection paths like "users/e1/contacts"
      return { get: mockCollectionGet, doc: vi.fn(() => ({ get: mockDocGet })) };
    }),
    doc: vi.fn(() => ({ get: mockDocGet })),
    batch: vi.fn(() => ({
      delete: mockBatchDelete,
      set: mockBatchSet,
      commit: mockBatchCommit,
    })),
    collectionGroup: vi.fn(() => ({ where: vi.fn(() => ({ get: vi.fn() })) })),
  })),
  FieldValue: {
    serverTimestamp: vi.fn(() => 'server-ts'),
    arrayRemove: vi.fn((...vals: unknown[]) => ({ _arrayRemove: vals })),
    arrayUnion: vi.fn((...vals: unknown[]) => ({ _arrayUnion: vals })),
  },
  Timestamp: { now: vi.fn(), fromMillis: vi.fn() },
}));

import { unlinkElderlyUser } from './index.js';

const callUnlink = unlinkElderlyUser as unknown as (request: {
  auth: { uid: string } | null;
  data: unknown;
}) => Promise<{ success: boolean }>;

describe('unlinkElderlyUser Cloud Function', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: empty subcollections
    mockCollectionGet.mockResolvedValue({ docs: [] });
  });

  it('rejects unauthenticated requests', async () => {
    await expect(callUnlink({ auth: null, data: { elderlyUserId: 'e1' } })).rejects.toThrow(
      'Authentication required.',
    );
  });

  it('rejects missing elderlyUserId', async () => {
    mockDocGet.mockResolvedValue({ exists: true, data: () => ({ role: 'caregiver' }) });

    await expect(callUnlink({ auth: { uid: 'cg1' }, data: {} })).rejects.toThrow(
      'elderlyUserId is required.',
    );
  });

  it('rejects non-string elderlyUserId', async () => {
    mockDocGet.mockResolvedValue({ exists: true, data: () => ({ role: 'caregiver' }) });

    await expect(
      callUnlink({ auth: { uid: 'cg1' }, data: { elderlyUserId: 123 } }),
    ).rejects.toThrow('elderlyUserId is required.');
  });

  it('rejects non-caregiver role', async () => {
    mockDocGet.mockResolvedValue({ exists: true, data: () => ({ role: 'elderly' }) });

    await expect(
      callUnlink({ auth: { uid: 'e1' }, data: { elderlyUserId: 'e2' } }),
    ).rejects.toThrow('Only caregivers can perform this action.');
  });

  it('rejects if caregiver is not linked to elderly user', async () => {
    // First call: requireCaregiver (role check) — returns caregiver role
    // Second call: linkDoc.get() — returns not exists
    // Third call: elderlyDoc.get() — should not be reached
    let callCount = 0;
    mockDocGet.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // requireCaregiver role check
        return Promise.resolve({ exists: true, data: () => ({ role: 'caregiver' }) });
      }
      // linkDoc — not linked
      return Promise.resolve({ exists: false, data: () => undefined });
    });

    await expect(
      callUnlink({ auth: { uid: 'cg1' }, data: { elderlyUserId: 'e1' } }),
    ).rejects.toThrow('You are not linked to this member.');
  });

  it('succeeds and removes all caregiver links', async () => {
    let callCount = 0;
    mockDocGet.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // requireCaregiver
        return Promise.resolve({ exists: true, data: () => ({ role: 'caregiver' }) });
      }
      if (callCount === 2) {
        // linkDoc exists
        return Promise.resolve({ exists: true, data: () => ({ linkedAt: 'ts' }) });
      }
      // elderlyDoc with displayName
      return Promise.resolve({
        exists: true,
        data: () => ({ displayName: 'Grandma', settings: {} }),
      });
    });

    // contacts: 1 doc, callHistory: 1 doc, caregivers: 1 doc (acting caregiver)
    const mockContactRef = { id: 'contact-1' };
    const mockHistoryRef = { id: 'history-1' };
    const mockCaregiverRef = { id: 'cg1' };
    mockCollectionGet
      .mockResolvedValueOnce({ docs: [{ ref: mockContactRef }] }) // contacts
      .mockResolvedValueOnce({ docs: [{ ref: mockHistoryRef }] }) // callHistory
      .mockResolvedValueOnce({ docs: [{ ref: mockCaregiverRef }] }); // caregivers

    const result = await callUnlink({ auth: { uid: 'cg1' }, data: { elderlyUserId: 'e1' } });

    expect(result).toEqual({ success: true });
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    // Deletes: 1 caregiver link + 1 contact + 1 history + activeCall + incomingCall = 5
    expect(mockBatchDelete).toHaveBeenCalledTimes(5);
    // Sets: 1 arrayRemove on caregiver doc + reset elderly doc + audit log = 3
    expect(mockBatchSet).toHaveBeenCalledTimes(3);
  });

  it('removes ALL caregiver links when member has multiple caregivers', async () => {
    let callCount = 0;
    mockDocGet.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ exists: true, data: () => ({ role: 'caregiver' }) });
      }
      if (callCount === 2) {
        return Promise.resolve({ exists: true, data: () => ({ linkedAt: 'ts' }) });
      }
      return Promise.resolve({
        exists: true,
        data: () => ({ displayName: 'Grandma', settings: {} }),
      });
    });

    // No contacts/history, but TWO caregiver links
    const mockCg1Ref = { id: 'cg1' };
    const mockCg2Ref = { id: 'cg2' };
    mockCollectionGet
      .mockResolvedValueOnce({ docs: [] }) // contacts
      .mockResolvedValueOnce({ docs: [] }) // callHistory
      .mockResolvedValueOnce({ docs: [{ ref: mockCg1Ref }, { ref: mockCg2Ref }] }); // caregivers

    const result = await callUnlink({ auth: { uid: 'cg1' }, data: { elderlyUserId: 'e1' } });

    expect(result).toEqual({ success: true });
    // Deletes: 2 caregiver links + activeCall + incomingCall = 4
    expect(mockBatchDelete).toHaveBeenCalledTimes(4);
    // Sets: 2 arrayRemove (one per caregiver) + reset elderly doc + audit log = 4
    expect(mockBatchSet).toHaveBeenCalledTimes(4);
  });

  it('captures elderlyDisplayName in audit log', async () => {
    let callCount = 0;
    mockDocGet.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ exists: true, data: () => ({ role: 'caregiver' }) });
      }
      if (callCount === 2) {
        return Promise.resolve({ exists: true, data: () => ({ linkedAt: 'ts' }) });
      }
      return Promise.resolve({
        exists: true,
        data: () => ({ displayName: 'Rose', settings: {} }),
      });
    });
    mockCollectionGet.mockResolvedValue({ docs: [] });

    await callUnlink({ auth: { uid: 'cg1' }, data: { elderlyUserId: 'e1' } });

    // Find the audit log set call — it's the one with action field
    const auditCall = mockBatchSet.mock.calls.find(
      (call: unknown[]) => (call[1] as Record<string, unknown>)?.action === 'unlink_elderly_user',
    );
    expect(auditCall).toBeDefined();
    const auditData = auditCall![1] as Record<string, unknown>;
    expect(auditData).toMatchObject({
      action: 'unlink_elderly_user',
      caregiverUid: 'cg1',
      elderlyUserId: 'e1',
      elderlyDisplayName: 'Rose',
    });
    expect(auditData).toHaveProperty('timestamp');
  });

  it('succeeds with empty subcollections', async () => {
    let callCount = 0;
    mockDocGet.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ exists: true, data: () => ({ role: 'caregiver' }) });
      }
      if (callCount === 2) {
        return Promise.resolve({ exists: true, data: () => ({ linkedAt: 'ts' }) });
      }
      return Promise.resolve({ exists: true, data: () => ({ settings: {} }) });
    });
    mockCollectionGet.mockResolvedValue({ docs: [] });

    const result = await callUnlink({ auth: { uid: 'cg1' }, data: { elderlyUserId: 'e1' } });
    expect(result).toEqual({ success: true });
    // Only fixed ops: activeCall + incomingCall = 2 deletes (no caregivers returned)
    expect(mockBatchDelete).toHaveBeenCalledTimes(2);
  });
});
