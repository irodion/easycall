import { useEffect } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { useCallStore } from '@/stores/callStore';
import { incomingCallRef } from '@/services/callSignaling';

export function useIncomingCall(userId: string | null): void {
  useEffect(() => {
    // Clear stale incoming call state when userId changes (logout/switch)
    useCallStore.getState().clearIncomingCall();

    if (!userId) return;

    const ref = incomingCallRef(userId);

    const unsubscribe = onSnapshot(ref, (snap) => {
      const store = useCallStore.getState();

      if (!snap.exists()) {
        if (store.isRinging) store.clearIncomingCall();
        return;
      }

      const data = snap.data();
      const status = data['status'] as string;

      if (status !== 'ringing') {
        if (store.isRinging) store.clearIncomingCall();
        return;
      }

      // Ignore stale calls (>60 seconds old)
      const timestamp = (data['timestamp'] as { toDate?: () => Date })?.toDate?.() ?? new Date(0);
      if (Date.now() - timestamp.getTime() > 60_000) {
        if (store.isRinging) store.clearIncomingCall();
        return;
      }

      useCallStore.getState().setIncomingCall({
        callerName: String(data['callerName'] ?? ''),
        callerPhotoURL: String(data['callerPhotoURL'] ?? ''),
        roomId: String(data['jitsiRoomId'] ?? ''),
        elderlyUserId: userId,
      });
    });

    return unsubscribe;
  }, [userId]);
}
