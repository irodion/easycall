import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetDoc, mockDoc } = vi.hoisted(() => ({
  mockGetDoc: vi.fn<(ref: unknown) => unknown>(),
  mockDoc: vi.fn<(...args: unknown[]) => string>(() => 'config-ref'),
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

vi.mock('@/services/firebase', () => ({
  db: { type: 'mock-db' },
  app: { name: 'mock-app' },
}));

import { getRegistrationStatus, setRegistrationLock } from './registrationLock';

describe('registrationLock service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockReturnValue('config-ref');
  });

  describe('getRegistrationStatus', () => {
    it('returns true when config doc does not exist (default open)', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => false });
      expect(await getRegistrationStatus()).toBe(true);
    });

    it('returns true when open is true', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ open: true }) });
      expect(await getRegistrationStatus()).toBe(true);
    });

    it('returns false when open is false', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ open: false }) });
      expect(await getRegistrationStatus()).toBe(false);
    });
  });

  describe('setRegistrationLock', () => {
    it('calls Cloud Function with locked=true', async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: { success: true } });
      mockHttpsCallable.mockReturnValue(mockFn);

      await setRegistrationLock(true);
      expect(mockHttpsCallable).toHaveBeenCalledWith('mock-functions', 'setRegistrationLock');
      expect(mockFn).toHaveBeenCalledWith({ locked: true });
    });

    it('calls Cloud Function with locked=false', async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: { success: true } });
      mockHttpsCallable.mockReturnValue(mockFn);

      await setRegistrationLock(false);
      expect(mockFn).toHaveBeenCalledWith({ locked: false });
    });
  });
});
