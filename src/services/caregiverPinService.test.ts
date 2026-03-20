import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetDoc, mockDoc } = vi.hoisted(() => ({
  mockGetDoc: vi.fn<(ref: unknown) => unknown>(),
  mockDoc: vi.fn<(...args: unknown[]) => string>(() => 'doc-ref'),
}));

const mockHttpsCallable = vi.fn();

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (ref: unknown) => mockGetDoc(ref),
}));

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => 'mock-functions'),
  httpsCallable: (...args: unknown[]) => mockHttpsCallable(...args),
}));

vi.mock('@/services/firebase', () => ({ db: { type: 'mock-db' }, app: { name: 'mock-app' } }));

import {
  isCaregiverPinSet,
  setCaregiverPin,
  verifyCaregiverPin,
  removeCaregiverPin,
} from './caregiverPinService';

describe('caregiverPinService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockReturnValue('doc-ref');
  });

  describe('isCaregiverPinSet', () => {
    it('returns false when doc does not exist', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => false });
      expect(await isCaregiverPinSet()).toBe(false);
    });

    it('returns true when pinSet is true', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ pinSet: true }) });
      expect(await isCaregiverPinSet()).toBe(true);
    });

    it('returns false when pinSet is false', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ pinSet: false }) });
      expect(await isCaregiverPinSet()).toBe(false);
    });
  });

  describe('setCaregiverPin', () => {
    it('calls Cloud Function with PIN', async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: { success: true } });
      mockHttpsCallable.mockReturnValue(mockFn);

      await setCaregiverPin('1234');
      expect(mockHttpsCallable).toHaveBeenCalledWith('mock-functions', 'setCaregiverPinConfig');
      expect(mockFn).toHaveBeenCalledWith({ pin: '1234' });
    });
  });

  describe('verifyCaregiverPin', () => {
    it('calls Cloud Function and returns result', async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: { valid: true } });
      mockHttpsCallable.mockReturnValue(mockFn);

      expect(await verifyCaregiverPin('1234')).toBe(true);
      expect(mockHttpsCallable).toHaveBeenCalledWith('mock-functions', 'verifyCaregiverPin');
      expect(mockFn).toHaveBeenCalledWith({ pin: '1234' });
    });

    it('returns false when Cloud Function returns invalid', async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: { valid: false } });
      mockHttpsCallable.mockReturnValue(mockFn);

      expect(await verifyCaregiverPin('0000')).toBe(false);
    });
  });

  describe('removeCaregiverPin', () => {
    it('calls Cloud Function with remove flag', async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: { success: true } });
      mockHttpsCallable.mockReturnValue(mockFn);

      await removeCaregiverPin();
      expect(mockHttpsCallable).toHaveBeenCalledWith('mock-functions', 'setCaregiverPinConfig');
      expect(mockFn).toHaveBeenCalledWith({ remove: true });
    });
  });
});
