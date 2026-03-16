import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';
import type { Messaging } from 'firebase/messaging';

const firebaseConfig: Record<string, string | undefined> = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// databaseURL is optional — getDatabase() derives it from projectId when unset
const databaseURL = import.meta.env.VITE_FIREBASE_DATABASE_URL;
if (databaseURL) {
  firebaseConfig.databaseURL = databaseURL;
}

if (import.meta.env.MODE !== 'test') {
  const missing = Object.entries(firebaseConfig)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(
      `Missing Firebase config: ${missing.join(', ')}. ` + 'Check your .env.local file.',
    );
  }
}

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);

if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectDatabaseEmulator(rtdb, '127.0.0.1', 9000);
}

/**
 * Ensures a Firebase user exists. Returns the current user or signs in anonymously.
 */
export async function ensureAuthenticated(): Promise<User> {
  if (auth.currentUser) return auth.currentUser;
  const cred = await signInAnonymously(auth);
  return cred.user;
}

let cachedMessaging: Messaging | null | undefined;

export async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (cachedMessaging !== undefined) return cachedMessaging;

  const { isSupported, getMessaging } = await import('firebase/messaging');
  const supported = await isSupported();
  cachedMessaging = supported ? getMessaging(app) : null;
  return cachedMessaging;
}
