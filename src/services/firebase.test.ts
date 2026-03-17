import { describe, it, expect, vi, afterEach } from 'vitest';

const mockApp = { name: '[DEFAULT]' };
const mockAuth = { app: mockApp };
const mockDb = { app: mockApp, type: 'firestore' };
const mockRtdb = { app: mockApp, type: 'database' };
const mockMessaging = { app: mockApp, type: 'messaging' };

function mockAllFirebaseModules() {
  vi.doMock('firebase/app', () => ({
    initializeApp: vi.fn(() => mockApp),
  }));
  vi.doMock('firebase/auth', () => ({
    getAuth: vi.fn(() => mockAuth),
    connectAuthEmulator: vi.fn(),
  }));
  vi.doMock('firebase/firestore', () => ({
    getFirestore: vi.fn(() => mockDb),
    connectFirestoreEmulator: vi.fn(),
  }));
  vi.doMock('firebase/database', () => ({
    getDatabase: vi.fn(() => mockRtdb),
    connectDatabaseEmulator: vi.fn(),
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

    it('exports rtdb as the result of getDatabase', async () => {
      vi.resetModules();
      mockAllFirebaseModules();
      vi.doMock('firebase/messaging', () => ({
        getMessaging: vi.fn(() => mockMessaging),
        isSupported: vi.fn(),
      }));

      const { rtdb } = await import('./firebase');
      expect(rtdb).toBe(mockRtdb);
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

  describe('emulator wiring (VITE_USE_EMULATORS)', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('calls connectAuthEmulator and connectFirestoreEmulator when VITE_USE_EMULATORS=true', async () => {
      vi.resetModules();
      vi.stubEnv('VITE_USE_EMULATORS', 'true');
      mockAllFirebaseModules();
      vi.doMock('firebase/messaging', () => ({
        getMessaging: vi.fn(() => mockMessaging),
        isSupported: vi.fn(),
      }));

      await import('./firebase');
      const { connectAuthEmulator } = await import('firebase/auth');
      const { connectFirestoreEmulator } = await import('firebase/firestore');
      expect(connectAuthEmulator).toHaveBeenCalledWith(mockAuth, 'http://127.0.0.1:9099', {
        disableWarnings: true,
      });
      expect(connectFirestoreEmulator).toHaveBeenCalledWith(mockDb, '127.0.0.1', 8080);
    });

    it('calls connectDatabaseEmulator when VITE_USE_EMULATORS=true', async () => {
      vi.resetModules();
      vi.stubEnv('VITE_USE_EMULATORS', 'true');
      mockAllFirebaseModules();
      vi.doMock('firebase/messaging', () => ({
        getMessaging: vi.fn(() => mockMessaging),
        isSupported: vi.fn(),
      }));

      await import('./firebase');
      const { connectDatabaseEmulator } = await import('firebase/database');
      expect(connectDatabaseEmulator).toHaveBeenCalledWith(mockRtdb, '127.0.0.1', 9000);
    });

    it('does NOT call emulator connectors when VITE_USE_EMULATORS is false', async () => {
      vi.resetModules();
      vi.stubEnv('VITE_USE_EMULATORS', 'false');
      mockAllFirebaseModules();
      vi.doMock('firebase/messaging', () => ({
        getMessaging: vi.fn(() => mockMessaging),
        isSupported: vi.fn(),
      }));

      await import('./firebase');
      const { connectAuthEmulator } = await import('firebase/auth');
      const { connectFirestoreEmulator } = await import('firebase/firestore');
      const { connectDatabaseEmulator } = await import('firebase/database');
      expect(connectAuthEmulator).not.toHaveBeenCalled();
      expect(connectFirestoreEmulator).not.toHaveBeenCalled();
      expect(connectDatabaseEmulator).not.toHaveBeenCalled();
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
