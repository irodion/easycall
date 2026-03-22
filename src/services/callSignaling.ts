import { doc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, db } from '@/services/firebase';

export function incomingCallRef(elderlyUserId: string) {
  return doc(db, 'users', elderlyUserId, 'incomingCall', 'current');
}

export async function validatePairingCode(code: string): Promise<{ elderlyUserId: string }> {
  const functions = getFunctions(app);
  const fn = httpsCallable<{ code: string }, { elderlyUserId: string }>(
    functions,
    'validatePairingCode',
  );
  return (await fn({ code })).data;
}

export async function unlinkElderlyUser(elderlyUserId: string): Promise<void> {
  const functions = getFunctions(app);
  const fn = httpsCallable<{ elderlyUserId: string }, { success: boolean }>(
    functions,
    'unlinkElderlyUser',
  );
  await fn({ elderlyUserId });
}

interface InitiateCallParams {
  elderlyUserId: string;
  callerId: string;
  callerName: string;
  callerPhotoURL?: string;
  jitsiRoomId: string;
}

export async function initiateCall(params: InitiateCallParams): Promise<void> {
  const { elderlyUserId, callerId, callerName, callerPhotoURL, jitsiRoomId } = params;
  const ref = incomingCallRef(elderlyUserId);
  // Delete any stale doc first (previous declined/answered call) so create rule applies
  try {
    await deleteDoc(ref);
  } catch {
    // May not exist or caller may lack delete permission — safe to ignore
  }
  // nosemgrep: no-unvalidated-firestore-input — params are typed, Firestore rules enforce schema
  await setDoc(ref, {
    callerId,
    callerName,
    callerPhotoURL: callerPhotoURL ?? null,
    jitsiRoomId,
    status: 'ringing',
    timestamp: serverTimestamp(),
  });
}

export async function declineCall(elderlyUserId: string): Promise<void> {
  const ref = incomingCallRef(elderlyUserId);
  await updateDoc(ref, { status: 'declined' });
}

/** Delete the incomingCall signaling doc (used after answer, decline, or hangup). */
export async function clearIncomingCallDoc(elderlyUserId: string): Promise<void> {
  const ref = incomingCallRef(elderlyUserId);
  try {
    await deleteDoc(ref);
  } catch {
    // Doc may already be deleted by the other party — safe to ignore
  }
}
