import { doc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, db } from '@/services/firebase';

const REGISTRATION_CONFIG_REF = doc(db, 'config', 'registration');

export interface RegistrationConfig {
  open: boolean;
  lockedBy: string | null;
  lockedAt: unknown; // Firestore Timestamp
}

export async function getRegistrationStatus(): Promise<boolean> {
  const snap = await getDoc(REGISTRATION_CONFIG_REF);
  if (!snap.exists()) return true; // Default: open
  return snap.data()['open'] !== false;
}

export async function setRegistrationLock(locked: boolean): Promise<void> {
  const functions = getFunctions(app);
  const fn = httpsCallable<{ locked: boolean }, { success: boolean }>(
    functions,
    'setRegistrationLock',
  );
  await fn({ locked });
}

export { REGISTRATION_CONFIG_REF };
