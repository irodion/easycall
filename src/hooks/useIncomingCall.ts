import { useEffect } from 'react';
import { onSnapshot, type Timestamp as FirestoreTimestamp } from 'firebase/firestore';
import { useCallStore } from '@/stores/callStore';
import { incomingCallRef, declineCall, clearIncomingCallDoc } from '@/services/callSignaling';

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

    // Check for decline intent passed via URL query param (from SW notification
    // Decline action when no client tab was open).
    let declineRoomId: string | null = null;
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('action') === 'decline-call') {
        declineRoomId = params.get('roomId');
        params.delete('action');
        params.delete('roomId');
        const remaining = params.toString();
        const cleanUrl = window.location.pathname + (remaining ? `?${remaining}` : '');
        window.history.replaceState({}, '', cleanUrl);
      }
    }

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

        // Auto-decline if the app was opened with decline intent from SW notification.
        // Only decline if the roomId matches to avoid rejecting a different call.
        if (declineRoomId !== null) {
          const targetRoom = declineRoomId;
          declineRoomId = null; // consume the intent
          if (!targetRoom || targetRoom === String(data.jitsiRoomId ?? '')) {
            void declineCall(userId)
              .then(() => clearIncomingCallDoc(userId))
              .catch(() => {});
            return;
          }
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

    // Listen for decline-call messages from the service worker (notification
    // Decline action). The SW has no Firebase Auth, so it delegates to us.
    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'decline-call') {
        const store = useCallStore.getState();
        const msgRoomId = typeof event.data.roomId === 'string' ? event.data.roomId : null;
        // Only decline if this tab's ringing call matches the targeted roomId
        if (store.isRinging && (!msgRoomId || store.incomingCall?.roomId === msgRoomId)) {
          store.clearIncomingCall();
          void declineCall(userId)
            .then(() => clearIncomingCallDoc(userId))
            .catch(() => {});
        }
      }
    };
    navigator.serviceWorker?.addEventListener('message', onSwMessage);

    return () => {
      unsubscribe();
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
    };
  }, [userId]);
}
