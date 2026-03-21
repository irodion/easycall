import { signOut } from 'firebase/auth';
import { deleteToken } from 'firebase/messaging';
import { app, auth, getFirebaseMessaging } from '@/services/firebase';

/**
 * Performs full client-side cleanup: signs out Firebase, deletes FCM token,
 * unregisters service workers, clears caches/storage/IndexedDB, then reloads.
 * All steps are best-effort — one failure does not block subsequent steps.
 */
export async function resetAppData(): Promise<void> {
  // 1. Delete FCM token (best-effort, with timeout to avoid hanging on unreachable FCM servers)
  try {
    const makeTimeout = () => new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
    const messaging = await Promise.race([getFirebaseMessaging(), makeTimeout()]);
    if (messaging) {
      await Promise.race([deleteToken(messaging), makeTimeout()]);
    }
  } catch {
    /* best-effort */
  }

  // 2. Sign out Firebase Auth
  try {
    await signOut(auth);
  } catch {
    /* best-effort */
  }

  // 3. Unregister all service workers
  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    } catch {
      /* best-effort */
    }
  }

  // 4. Clear all Cache Storage
  if ('caches' in window) {
    try {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    } catch {
      /* best-effort */
    }
  }

  // 5. Clear localStorage and sessionStorage
  try {
    localStorage.clear();
  } catch {
    /* best-effort */
  }
  try {
    sessionStorage.clear();
  } catch {
    /* best-effort */
  }

  // 6. Clear IndexedDB — deleteDatabase can block if Firebase holds open connections,
  //    so we add onblocked handler + timeout. On Safari/Firefox where databases() is
  //    unavailable, delete known Firebase databases by name.
  if (typeof indexedDB !== 'undefined') {
    const deleteDb = (name: string) =>
      Promise.race([
        new Promise<void>((resolve, reject) => {
          const req = indexedDB.deleteDatabase(name);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
          req.onblocked = () => resolve();
        }),
        new Promise<void>((resolve) => setTimeout(resolve, 3000)),
      ]);

    try {
      let dbNames: string[];
      if (indexedDB.databases) {
        const dbs = await indexedDB.databases();
        dbNames = dbs.map((d) => d.name).filter((n): n is string => !!n);
      } else {
        // Safari/Firefox: databases() unavailable, delete known Firebase DBs by name
        const projectId = app.options.projectId ?? '';
        dbNames = [
          'firebaseLocalStorageDb',
          `firestore/[DEFAULT]/${projectId}/main`,
          'firebase-messaging-database',
          'firebase-heartbeat-database',
          'firebase-installations-database',
        ];
      }
      await Promise.all(dbNames.map(deleteDb));
    } catch {
      /* best-effort */
    }
  }

  // 7. Reload to clean state
  window.location.replace('/');
}
