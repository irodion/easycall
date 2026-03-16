import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDoc = vi.fn().mockReturnValue('doc-ref');
const mockCollection = vi.fn().mockReturnValue('col-ref');
const mockQuery = vi.fn().mockReturnValue('query-ref');
const mockOrderBy = vi.fn().mockReturnValue('orderBy-constraint');
const mockWhere = vi.fn().mockReturnValue('where-constraint');
const mockLimit = vi.fn().mockReturnValue('limit-constraint');
const mockStartAfter = vi.fn().mockReturnValue('startAfter-constraint');
const mockSetDoc = vi.fn().mockResolvedValue(undefined);
const mockDeleteDoc = vi.fn().mockResolvedValue(undefined);
const mockAddDoc = vi.fn().mockResolvedValue({ id: 'new-call-id' });
const mockGetDocs = vi.fn();

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...args),
  collection: (...args: unknown[]) => mockCollection(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  orderBy: (...args: unknown[]) => mockOrderBy(...args),
  where: (...args: unknown[]) => mockWhere(...args),
  limit: (...args: unknown[]) => mockLimit(...args),
  startAfter: (...args: unknown[]) => mockStartAfter(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
  addDoc: (...args: unknown[]) => mockAddDoc(...args),
  Timestamp: {
    fromDate: (d: Date) => ({ seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0 }),
  },
}));

vi.mock('@/services/firebase', () => ({
  db: 'mock-db',
}));

import {
  activeCallRef,
  setActiveCall,
  clearActiveCall,
  fetchCallHistory,
  writeCallHistoryEntry,
} from './callHistory';

describe('callHistory service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('activeCallRef', () => {
    it('returns doc reference for activeCall/current', () => {
      activeCallRef('user-1');
      expect(mockDoc).toHaveBeenCalledWith('mock-db', 'users', 'user-1', 'activeCall', 'current');
    });
  });

  describe('setActiveCall', () => {
    it('calls setDoc with data and status active', async () => {
      const data = {
        contactId: 'c1',
        contactName: 'Alice',
        jitsiRoomId: 'room-1',
        startedAt: { seconds: 100, nanoseconds: 0, toDate: () => new Date() },
      };
      await setActiveCall('user-1', data);
      expect(mockSetDoc).toHaveBeenCalledWith('doc-ref', { ...data, status: 'active' });
    });
  });

  describe('clearActiveCall', () => {
    it('calls deleteDoc', async () => {
      await clearActiveCall('user-1');
      expect(mockDeleteDoc).toHaveBeenCalledWith('doc-ref');
    });
  });

  describe('fetchCallHistory', () => {
    it('queries with orderBy, where, and limit', async () => {
      mockGetDocs.mockResolvedValue({ docs: [] });
      await fetchCallHistory('user-1');
      expect(mockOrderBy).toHaveBeenCalledWith('startedAt', 'desc');
      expect(mockWhere).toHaveBeenCalledWith(
        'startedAt',
        '>=',
        expect.objectContaining({ seconds: expect.any(Number) }),
      );
      expect(mockLimit).toHaveBeenCalledWith(20);
    });

    it('maps docs to CallHistoryEntry objects', async () => {
      const mockData = {
        contactId: 'c1',
        contactName: 'Alice',
        direction: 'outgoing',
        outcome: 'completed',
        duration: 60,
      };
      mockGetDocs.mockResolvedValue({
        docs: [{ id: 'call-1', data: () => mockData }],
      });
      const result = await fetchCallHistory('user-1');
      expect(result.entries).toEqual([{ id: 'call-1', ...mockData }]);
    });

    it('returns hasMore true when results equal pageSize', async () => {
      const docs = Array.from({ length: 20 }, (_, i) => ({
        id: `call-${i}`,
        data: () => ({ contactName: `C${i}` }),
      }));
      mockGetDocs.mockResolvedValue({ docs });
      const result = await fetchCallHistory('user-1', 20);
      expect(result.hasMore).toBe(true);
    });

    it('returns hasMore false when results less than pageSize', async () => {
      mockGetDocs.mockResolvedValue({ docs: [{ id: 'call-1', data: () => ({}) }] });
      const result = await fetchCallHistory('user-1', 20);
      expect(result.hasMore).toBe(false);
    });

    it('uses startAfter when lastDocSnapshot provided', async () => {
      mockGetDocs.mockResolvedValue({ docs: [] });
      const mockSnap = { id: 'snap-1', data: () => ({}) } as never;
      await fetchCallHistory('user-1', 20, mockSnap);
      expect(mockStartAfter).toHaveBeenCalledWith(mockSnap);
    });
  });

  describe('writeCallHistoryEntry', () => {
    it('calls addDoc with entry data and returns id', async () => {
      const entry = {
        contactId: 'c1',
        contactName: 'Alice',
        direction: 'outgoing' as const,
        outcome: 'completed' as const,
        duration: 120,
        startedAt: { seconds: 100, nanoseconds: 0, toDate: () => new Date() },
        endedAt: { seconds: 220, nanoseconds: 0, toDate: () => new Date() },
      };
      const id = await writeCallHistoryEntry('user-1', entry);
      expect(mockAddDoc).toHaveBeenCalledWith('col-ref', entry);
      expect(id).toBe('new-call-id');
    });
  });
});
