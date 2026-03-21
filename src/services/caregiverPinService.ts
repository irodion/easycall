import { doc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, db } from '@/services/firebase';

/** Public status doc — only { pinSet: boolean }. No secrets, safe for client reads. */
const CAREGIVER_PIN_REF = doc(db, 'config', 'caregiverPinStatus');

export interface CaregiverPinConfig {
  pinSet: boolean;
}

/**
 * Returns whether a caregiver PIN has been configured for this instance.
 */
export async function isCaregiverPinSet(): Promise<boolean> {
  const snap = await getDoc(CAREGIVER_PIN_REF);
  return snap.exists() && snap.data()['pinSet'] === true;
}

/**
 * Sets the instance-wide caregiver PIN via Cloud Function.
 * The server verifies the caller is a caregiver and writes atomically.
 */
export async function setCaregiverPin(pin: string): Promise<void> {
  const functions = getFunctions(app);
  const fn = httpsCallable<{ pin: string }, { success: boolean }>(
    functions,
    'setCaregiverPinConfig',
  );
  await fn({ pin });
}

/**
 * Verifies a PIN attempt via server-side Cloud Function.
 * The hash is never exposed to the client.
 */
export async function verifyCaregiverPin(pin: string): Promise<boolean> {
  const functions = getFunctions(app);
  const fn = httpsCallable<{ pin: string }, { valid: boolean }>(functions, 'verifyCaregiverPin');
  const result = await fn({ pin });
  return result.data.valid;
}

/**
 * Removes the caregiver PIN via Cloud Function.
 * The server verifies the caller is a caregiver.
 */
export async function removeCaregiverPin(): Promise<void> {
  const functions = getFunctions(app);
  const fn = httpsCallable<{ remove: boolean }, { success: boolean }>(
    functions,
    'setCaregiverPinConfig',
  );
  await fn({ remove: true });
}

export { CAREGIVER_PIN_REF };
