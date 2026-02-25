import { describe, it, expect, vi } from 'vitest';

const mockApp = { name: '[DEFAULT]' };
const mockAuth = { app: mockApp };
const mockDb = { app: mockApp, type: 'firestore' };
const mockMessaging = { app: mockApp, type: 'messaging' };

function mockAllFirebaseModules() {
  vi.doMock('firebase/app', () => ({
    initializeApp: vi.fn(() => mockApp),
  }));
  vi.doMock('firebase/auth', () => ({
    getAuth: vi.fn(() => mockAuth),
  }));
  vi.doMock('firebase/firestore', () => ({
    getFirestore: vi.fn(() => mockDb),
  }));
}

describe('Firebase service layer', () => {
  describe('eager exports (app, auth, db)', () => {
    it('exports app as the result of initializeApp', async () => {
      vi.resetModules();
      mockAllFirebaseModules();
      vi.doMock('firebase/messaging', () => ({
        getMessaging: vi.fn(() => mockMessaging),
        isSupported: vi.fn(),
      }));

      const { app } = await import('./firebase');
      expect(app).toBe(mockApp);
    });

    it('exports auth as the result of getAuth', async () => {
      vi.resetModules();
      mockAllFirebaseModules();
      vi.doMock('firebase/messaging', () => ({
        getMessaging: vi.fn(() => mockMessaging),
        isSupported: vi.fn(),
      }));

      const { auth } = await import('./firebase');
      expect(auth).toBe(mockAuth);
    });

    it('exports db as the result of getFirestore', async () => {
      vi.resetModules();
      mockAllFirebaseModules();
      vi.doMock('firebase/messaging', () => ({
        getMessaging: vi.fn(() => mockMessaging),
        isSupported: vi.fn(),
      }));

      const { db } = await import('./firebase');
      expect(db).toBe(mockDb);
    });

    it('calls initializeApp with config containing apiKey and projectId', async () => {
      vi.resetModules();
      mockAllFirebaseModules();
      vi.doMock('firebase/messaging', () => ({
        getMessaging: vi.fn(() => mockMessaging),
        isSupported: vi.fn(),
      }));

      await import('./firebase');
      const { initializeApp } = await import('firebase/app');
      expect(initializeApp).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: expect.any(String),
          projectId: expect.any(String),
        }),
      );
    });
  });

  describe('getFirebaseMessaging (lazy)', () => {
    it('is exported as a function', async () => {
      vi.resetModules();
      mockAllFirebaseModules();
      vi.doMock('firebase/messaging', () => ({
        getMessaging: vi.fn(() => mockMessaging),
        isSupported: vi.fn(),
      }));

      const { getFirebaseMessaging } = await import('./firebase');
      expect(typeof getFirebaseMessaging).toBe('function');
    });

    it('returns null when isSupported() resolves false', async () => {
      vi.resetModules();
      mockAllFirebaseModules();
      vi.doMock('firebase/messaging', () => ({
        getMessaging: vi.fn(() => mockMessaging),
        isSupported: vi.fn(() => Promise.resolve(false)),
      }));

      const { getFirebaseMessaging } = await import('./firebase');
      const result = await getFirebaseMessaging();
      expect(result).toBeNull();
    });

    it('returns a messaging instance when isSupported() resolves true', async () => {
      vi.resetModules();
      mockAllFirebaseModules();
      vi.doMock('firebase/messaging', () => ({
        getMessaging: vi.fn(() => mockMessaging),
        isSupported: vi.fn(() => Promise.resolve(true)),
      }));

      const { getFirebaseMessaging } = await import('./firebase');
      const result = await getFirebaseMessaging();
      expect(result).toBe(mockMessaging);
    });
  });
});
