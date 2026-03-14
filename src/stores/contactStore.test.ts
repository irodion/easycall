import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('useContactStore', () => {
  let getDocs: ReturnType<typeof vi.fn>;
  let addDoc: ReturnType<typeof vi.fn>;
  let deleteDoc: ReturnType<typeof vi.fn>;
  let onSnapshot: ReturnType<typeof vi.fn>;
  let collection: ReturnType<typeof vi.fn>;
  let query: ReturnType<typeof vi.fn>;
  let orderBy: ReturnType<typeof vi.fn>;
  let doc: ReturnType<typeof vi.fn>;
  let serverTimestamp: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getDocs = vi.fn().mockResolvedValue({ docs: [] });
    addDoc = vi.fn().mockResolvedValue({ id: 'new-id' });
    deleteDoc = vi.fn().mockResolvedValue(undefined);
    onSnapshot = vi.fn().mockReturnValue(() => {});
    collection = vi.fn().mockReturnValue('collection-ref');
    query = vi.fn().mockReturnValue('query-ref');
    orderBy = vi.fn().mockReturnValue('orderBy-ref');
    doc = vi.fn().mockReturnValue('doc-ref');
    serverTimestamp = vi.fn().mockReturnValue({ seconds: 0, nanoseconds: 0 });

    vi.resetModules();
    vi.doMock('firebase/firestore', () => ({
      getFirestore: vi.fn(),
      collection,
      getDocs,
      addDoc,
      deleteDoc,
      onSnapshot,
      query,
      orderBy,
      doc,
      serverTimestamp,
    }));
    vi.doMock('@/services/firebase', () => ({ db: {} }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with empty state', async () => {
    const { useContactStore } = await import('./contactStore');
    const { contacts, loading, error } = useContactStore.getState();
    expect(contacts).toEqual([]);
    expect(loading).toBe(false);
    expect(error).toBeNull();
  });

  it('fetchContacts calls getDocs on users/{userId}/contacts ordered by displayOrder', async () => {
    const mockDoc1 = {
      id: 'contact-1',
      data: () => ({
        name: 'Alice',
        photoURL: null,
        jitsiRoomId: 'room-1',
        contactUserId: 'user-2',
        displayOrder: 1,
        createdAt: { seconds: 0, nanoseconds: 0 },
      }),
    };
    const mockDoc2 = {
      id: 'contact-2',
      data: () => ({
        name: 'Bob',
        photoURL: null,
        jitsiRoomId: 'room-2',
        contactUserId: 'user-3',
        displayOrder: 2,
        createdAt: { seconds: 0, nanoseconds: 0 },
      }),
    };
    getDocs.mockResolvedValue({ docs: [mockDoc1, mockDoc2] });

    const { useContactStore } = await import('./contactStore');
    await useContactStore.getState().fetchContacts('user-1');

    expect(collection).toHaveBeenCalledWith({}, 'users', 'user-1', 'contacts');
    expect(orderBy).toHaveBeenCalledWith('displayOrder');
    const { contacts, loading, error } = useContactStore.getState();
    expect(contacts).toHaveLength(2);
    expect(contacts[0]?.name).toBe('Alice');
    expect(contacts[1]?.name).toBe('Bob');
    expect(loading).toBe(false);
    expect(error).toBeNull();
  });

  it('addContact calls addDoc and appends to local state', async () => {
    const { useContactStore } = await import('./contactStore');
    const newContactData = {
      name: 'Carol',
      photoURL: null,
      jitsiRoomId: 'room-carol',
      contactUserId: 'user-carol',
      displayOrder: 1,
    };
    await useContactStore.getState().addContact('user-1', newContactData);

    expect(addDoc).toHaveBeenCalled();
    const { contacts } = useContactStore.getState();
    expect(contacts).toHaveLength(1);
    expect(contacts[0]?.id).toBe('new-id');
    expect(contacts[0]?.name).toBe('Carol');
  });

  it('removeContact calls deleteDoc and removes from local state', async () => {
    const { useContactStore } = await import('./contactStore');
    // Seed the store with a contact
    useContactStore.setState({
      contacts: [
        {
          id: 'contact-1',
          name: 'Alice',
          photoURL: null,
          jitsiRoomId: 'room-1',
          contactUserId: 'user-2',
          displayOrder: 1,
          createdAt: { seconds: 0, nanoseconds: 0, toDate: () => new Date() },
        },
      ],
    });

    await useContactStore.getState().removeContact('user-1', 'contact-1');

    expect(deleteDoc).toHaveBeenCalledWith('doc-ref');
    expect(doc).toHaveBeenCalledWith({}, 'users', 'user-1', 'contacts', 'contact-1');
    expect(useContactStore.getState().contacts).toHaveLength(0);
  });

  it('subscribeToContacts calls onSnapshot and updates state on change', async () => {
    let snapshotCallback: ((snap: unknown) => void) | undefined;
    onSnapshot.mockImplementation((_q: unknown, cb: (snap: unknown) => void) => {
      snapshotCallback = cb;
      return () => {};
    });

    const { useContactStore } = await import('./contactStore');
    useContactStore.getState().subscribeToContacts('user-1');

    expect(onSnapshot).toHaveBeenCalled();

    // Simulate snapshot firing
    const mockSnap = {
      docs: [
        {
          id: 'contact-1',
          data: () => ({
            name: 'Alice',
            photoURL: null,
            jitsiRoomId: 'room-1',
            contactUserId: 'user-2',
            displayOrder: 1,
            createdAt: { seconds: 0, nanoseconds: 0 },
          }),
        },
      ],
    };
    snapshotCallback?.(mockSnap);

    expect(useContactStore.getState().contacts).toHaveLength(1);
    expect(useContactStore.getState().contacts[0]?.name).toBe('Alice');
  });

  it('subscribeToContacts returns unsubscribe function', async () => {
    const unsubscribeFn = vi.fn();
    onSnapshot.mockReturnValue(unsubscribeFn);

    const { useContactStore } = await import('./contactStore');
    const unsubscribe = useContactStore.getState().subscribeToContacts('user-1');

    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
    expect(unsubscribeFn).toHaveBeenCalled();
  });
});
