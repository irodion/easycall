import { useEffect } from 'react';
import { onSnapshot, type Timestamp as FirestoreTimestamp } from 'firebase/firestore';
import { useCallStore } from '@/stores/callStore';
import { incomingCallRef } from '@/services/callSignaling';

interface IncomingCallDoc {
  status: string;
  timestamp: FirestoreTimestamp;
  callerId: string;
  callerName: string;
  callerPhotoURL?: string;
  jitsiRoomId: string;
}

export function useIncomingCall(userId: string | null): void {
  useEffect(() => {
    // Clear stale incoming call state when userId changes (logout/switch)
    useCallStore.getState().clearIncomingCall();

    if (!userId) return;

    const ref = incomingCallRef(userId);

    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const store = useCallStore.getState();

        if (!snap.exists()) {
          if (store.isRinging) store.clearIncomingCall();
          return;
        }

        const data = snap.data() as IncomingCallDoc;

        if (data.status !== 'ringing') {
          if (store.isRinging) store.clearIncomingCall();
          return;
        }

        // Ignore stale calls (>60 seconds old)
        const timestamp = data.timestamp?.toDate?.() ?? new Date(0);
        if (Date.now() - timestamp.getTime() > 60_000) {
          if (store.isRinging) store.clearIncomingCall();
          return;
        }

        useCallStore.getState().setIncomingCall({
          callerName: String(data.callerName ?? ''),
          callerPhotoURL: String(data.callerPhotoURL ?? ''),
          roomId: String(data.jitsiRoomId ?? ''),
          elderlyUserId: userId,
        });
      },
      () => {
        // Listener error (permission/network) — clear stale ringing state
        useCallStore.getState().clearIncomingCall();
      },
    );

    return unsubscribe;
  }, [userId]);
}
