import { getFunctions, httpsCallable } from 'firebase/functions';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import { app, db } from '@/services/firebase';

export interface DirectLink {
  linkId: string;
  roomId: string;
  elderlyUserId: string;
  contactUserId: string;
  contactName: string;
  callerDisplayName: string;
  createdBy: string;
  createdAt: { seconds: number };
  expiresAt: { seconds: number };
  revoked: boolean;
}

export async function generateDirectLink(
  elderlyUserId: string,
  contactId: string,
  callerDisplayName: string,
): Promise<{ linkId: string; url: string }> {
  const functions = getFunctions(app);
  const callable = httpsCallable<
    { elderlyUserId: string; contactId: string; callerDisplayName: string },
    { linkId: string; url: string }
  >(functions, 'generateDirectLink');
  const { data } = await callable({ elderlyUserId, contactId, callerDisplayName });
  return data;
}

export async function revokeDirectLink(linkId: string): Promise<void> {
  const functions = getFunctions(app);
  const callable = httpsCallable<{ linkId: string }, { success: boolean }>(
    functions,
    'revokeDirectLink',
  );
  await callable({ linkId });
}

export function subscribeToDirectLinks(
  elderlyUserId: string,
  createdBy: string,
  callback: (links: DirectLink[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'directLinks'),
    where('elderlyUserId', '==', elderlyUserId),
    where('createdBy', '==', createdBy),
    orderBy('createdAt', 'desc'),
  );

  return onSnapshot(q, (snap) => {
    const links = snap.docs.map((doc) => ({ ...doc.data(), linkId: doc.id }) as DirectLink);
    callback(links);
  });
}
