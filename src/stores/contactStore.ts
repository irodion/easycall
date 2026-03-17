import { create } from 'zustand';
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import type { Contact } from '@/types/user';

interface ContactStore {
  contacts: Contact[];
  loading: boolean;
  error: string | null;
  fetchContacts: (userId: string) => Promise<void>;
  addContact: (userId: string, data: Omit<Contact, 'id' | 'createdAt'>) => Promise<void>;
  removeContact: (userId: string, contactId: string) => Promise<void>;
  subscribeToContacts: (userId: string) => () => void;
}

export const useContactStore = create<ContactStore>((set) => ({
  contacts: [],
  loading: false,
  error: null,

  fetchContacts: async (userId) => {
    set({ loading: true, error: null });
    try {
      const q = query(collection(db, 'users', userId, 'contacts'), orderBy('displayOrder'));
      const snap = await getDocs(q);
      const contacts = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Contact);
      set({ contacts, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  addContact: async (userId, data) => {
    const ref = await addDoc(collection(db, 'users', userId, 'contacts'), {
      ...data,
      createdAt: serverTimestamp(),
    });
    const newContact: Contact = {
      id: ref.id,
      ...data,
      createdAt: Timestamp.now(),
    };
    set((state) => ({ contacts: [...state.contacts, newContact] }));
  },

  removeContact: async (userId, contactId) => {
    await deleteDoc(doc(db, 'users', userId, 'contacts', contactId));
    set((state) => ({ contacts: state.contacts.filter((c) => c.id !== contactId) }));
  },

  subscribeToContacts: (userId) => {
    const q = query(collection(db, 'users', userId, 'contacts'), orderBy('displayOrder'));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const contacts = (
          snap as { docs: Array<{ id: string; data: () => Record<string, unknown> }> }
        ).docs.map((d) => ({ id: d.id, ...d.data() }) as Contact);
        set({ contacts, error: null });
      },
      (err) => {
        set({ contacts: [], error: String(err) });
      },
    );
    return unsubscribe;
  },
}));
