import {
  doc,
  collection,
  query,
  orderBy,
  where,
  limit,
  startAfter,
  getDocs,
  setDoc,
  deleteDoc,
  addDoc,
  Timestamp,
  type QueryConstraint,
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import type { CallHistoryEntry, ActiveCallData } from '@/types/user';

export function activeCallRef(userId: string) {
  return doc(db, 'users', userId, 'activeCall', 'current');
}

export async function setActiveCall(
  userId: string,
  data: Omit<ActiveCallData, 'status'>,
): Promise<void> {
  await setDoc(activeCallRef(userId), { ...data, status: 'active' });
}

export async function clearActiveCall(userId: string): Promise<void> {
  await deleteDoc(activeCallRef(userId));
}

export async function fetchCallHistory(
  userId: string,
  pageSize: number = 20,
  lastDocSnapshot?: unknown,
): Promise<{ entries: CallHistoryEntry[]; lastDoc: unknown | null; hasMore: boolean }> {
  const thirtyDaysAgo = Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const constraints: QueryConstraint[] = [
    orderBy('startedAt', 'desc'),
    where('startedAt', '>=', thirtyDaysAgo),
    limit(pageSize),
  ];
  if (lastDocSnapshot) constraints.push(startAfter(lastDocSnapshot));

  const q = query(collection(db, 'users', userId, 'callHistory'), ...constraints);
  const snap = await getDocs(q);
  const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CallHistoryEntry);
  const newLastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;

  return { entries, lastDoc: newLastDoc, hasMore: snap.docs.length === pageSize };
}

export async function writeCallHistoryEntry(
  userId: string,
  entry: Omit<CallHistoryEntry, 'id'>,
): Promise<string> {
  const ref = await addDoc(collection(db, 'users', userId, 'callHistory'), entry);
  return ref.id;
}
