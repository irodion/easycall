import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSignOut = vi.fn().mockResolvedValue(undefined);
const mockDeleteToken = vi.fn().mockResolvedValue(undefined);
const mockGetFirebaseMessaging = vi.fn().mockResolvedValue(null);

vi.mock('firebase/auth', () => ({
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

vi.mock('firebase/messaging', () => ({
  deleteToken: (...args: unknown[]) => mockDeleteToken(...args),
}));

vi.mock('@/services/firebase', () => ({
  app: { options: { projectId: 'test-project' } },
  auth: { currentUser: { uid: 'test-user' } },
  getFirebaseMessaging: () => mockGetFirebaseMessaging(),
}));

import { resetAppData } from './resetAppData';

const originalLocation = window.location;

describe('resetAppData', () => {
  let mockReplace: ReturnType<typeof vi.fn>;
  let storageClearSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockSignOut.mockClear();
    mockDeleteToken.mockClear();
    mockGetFirebaseMessaging.mockClear();
    mockGetFirebaseMessaging.mockResolvedValue(null);

    mockReplace = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, replace: mockReplace },
      writable: true,
      configurable: true,
    });

    storageClearSpy = vi.spyOn(Storage.prototype, 'clear').mockImplementation(() => {});
  });

  afterEach(() => {
    storageClearSpy.mockRestore();
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  it('calls signOut on Firebase auth', async () => {
    await resetAppData();
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('deletes FCM token when messaging is available', async () => {
    const mockMessaging = { type: 'messaging' };
    mockGetFirebaseMessaging.mockResolvedValue(mockMessaging);

    await resetAppData();
    expect(mockDeleteToken).toHaveBeenCalledWith(mockMessaging);
  });

  it('skips FCM token deletion when messaging is null', async () => {
    mockGetFirebaseMessaging.mockResolvedValue(null);

    await resetAppData();
    expect(mockDeleteToken).not.toHaveBeenCalled();
  });

  it('unregisters all service workers', async () => {
    const mockUnregister = vi.fn().mockResolvedValue(true);
    const mockRegistrations = [{ unregister: mockUnregister }, { unregister: mockUnregister }];
    const mockSW = {
      getRegistrations: vi.fn().mockResolvedValue(mockRegistrations),
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      value: mockSW,
      writable: true,
      configurable: true,
    });

    await resetAppData();
    expect(mockUnregister).toHaveBeenCalledTimes(2);
  });

  it('clears all Cache Storage entries', async () => {
    const mockCacheDelete = vi.fn().mockResolvedValue(true);
    const originalCaches = window.caches;
    Object.defineProperty(window, 'caches', {
      value: {
        keys: vi.fn().mockResolvedValue(['cache-1', 'cache-2']),
        delete: mockCacheDelete,
      },
      writable: true,
      configurable: true,
    });

    await resetAppData();
    expect(mockCacheDelete).toHaveBeenCalledWith('cache-1');
    expect(mockCacheDelete).toHaveBeenCalledWith('cache-2');

    Object.defineProperty(window, 'caches', {
      value: originalCaches,
      writable: true,
      configurable: true,
    });
  });

  it('clears localStorage and sessionStorage', async () => {
    await resetAppData();
    // Storage.prototype.clear is called for both localStorage.clear() and sessionStorage.clear()
    expect(storageClearSpy).toHaveBeenCalled();
  });

  it('clears IndexedDB when databases() is available', async () => {
    const mockDeleteDatabase = vi.fn().mockImplementation(() => {
      const req = {
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
      };
      setTimeout(() => req.onsuccess?.(), 0);
      return req;
    });

    const fakeIndexedDB = {
      databases: vi.fn().mockResolvedValue([{ name: 'db1' }, { name: 'db2' }]),
      deleteDatabase: mockDeleteDatabase,
    };
    vi.stubGlobal('indexedDB', fakeIndexedDB);

    await resetAppData();

    expect(mockDeleteDatabase).toHaveBeenCalledWith('db1');
    expect(mockDeleteDatabase).toHaveBeenCalledWith('db2');

    vi.unstubAllGlobals();
    // Re-apply mocks after unstubbing
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, replace: mockReplace },
      writable: true,
      configurable: true,
    });
    storageClearSpy = vi.spyOn(Storage.prototype, 'clear').mockImplementation(() => {});
  });

  it('skips IndexedDB cleanup when indexedDB is not defined', async () => {
    await resetAppData();
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('deletes known Firebase DBs when databases() is unavailable', async () => {
    const mockDeleteDatabase = vi.fn().mockImplementation(() => {
      const req = {
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onblocked: null as (() => void) | null,
      };
      setTimeout(() => req.onsuccess?.(), 0);
      return req;
    });

    const fakeIndexedDB = {
      // databases is NOT defined — simulates Safari/Firefox
      deleteDatabase: mockDeleteDatabase,
    };
    vi.stubGlobal('indexedDB', fakeIndexedDB);

    await resetAppData();

    expect(mockDeleteDatabase).toHaveBeenCalledWith('firebaseLocalStorageDb');
    expect(mockDeleteDatabase).toHaveBeenCalledWith('firestore/[DEFAULT]/test-project/main');
    expect(mockDeleteDatabase).toHaveBeenCalledWith('firebase-messaging-database');
    expect(mockDeleteDatabase).toHaveBeenCalledWith('firebase-heartbeat-database');
    expect(mockDeleteDatabase).toHaveBeenCalledWith('firebase-installations-database');

    vi.unstubAllGlobals();
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, replace: mockReplace },
      writable: true,
      configurable: true,
    });
    storageClearSpy = vi.spyOn(Storage.prototype, 'clear').mockImplementation(() => {});
  });

  it('reloads to root after cleanup', async () => {
    await resetAppData();
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('continues cleanup when signOut fails', async () => {
    mockSignOut.mockRejectedValueOnce(new Error('network error'));

    await resetAppData();

    expect(storageClearSpy).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('continues cleanup when FCM deleteToken fails', async () => {
    mockGetFirebaseMessaging.mockResolvedValue({ type: 'messaging' });
    mockDeleteToken.mockRejectedValueOnce(new Error('fcm error'));

    await resetAppData();

    expect(mockSignOut).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/');
  });
});
