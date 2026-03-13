import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, db } from '@/services/firebase';

export function incomingCallRef(elderlyUserId: string) {
  return doc(db, 'users', elderlyUserId, 'incomingCall', 'current');
}

export async function validatePairingCode(code: string): Promise<{ elderlyUserId: string }> {
  const functions = getFunctions(app);
  const fn = httpsCallable<{ code: string }, { elderlyUserId: string }>(
    functions, 'validatePairingCode'
  );
  return (await fn({ code })).data;
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
