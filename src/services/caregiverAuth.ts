import {
  EmailAuthProvider,
  linkWithCredential,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

/**
 * Links an email/password credential to the current anonymous user.
 * Preserves the existing UID.
 */
export async function linkCaregiverEmail(email: string, password: string): Promise<void> {
  if (!auth.currentUser) throw new Error('No authenticated user');

  const credential = EmailAuthProvider.credential(email, password);
  await linkWithCredential(auth.currentUser, credential);
  await updateDoc(doc(db, 'users', auth.currentUser.uid), { email });
}

/**
 * Signs in a returning caregiver with email/password.
 * Replaces the current anonymous session with the original UID.
 */
export async function signInCaregiverEmail(
  email: string,
  password: string,
): Promise<{ uid: string }> {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return { uid: result.user.uid };
}

/**
 * Sends a password reset email to the given address.
 */
export async function sendCaregiverPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}
