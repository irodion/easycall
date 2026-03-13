import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, getFirebaseMessaging } from '@/services/firebase';
import { useCallStore } from '@/stores/callStore';

export function usePushNotifications(userId: string) {
  const requestPermission = async (): Promise<string | null> => {
    const messaging = await getFirebaseMessaging();
    if (!messaging) return null;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    });

    await updateDoc(doc(db, 'users', userId), {
      pushTokens: arrayUnion(token),
    });

    return token;
  };

  const removeToken = async (token: string): Promise<void> => {
    await updateDoc(doc(db, 'users', userId), {
      pushTokens: arrayRemove(token),
    });
  };

  const subscribeForeground = async () => {
    const messaging = await getFirebaseMessaging();
    if (!messaging) return () => {};

    return onMessage(messaging, (payload) => {
      const data = payload.data as Record<string, string> | undefined;
      if (data?.type === 'incoming_call') {
        useCallStore.getState().setIncomingCall({
          callerName: data.callerName ?? '',
          callerPhotoURL: data.callerPhoto ?? '',
          roomId: data.roomId ?? '',
          elderlyUserId: data.elderlyUserId ?? '',
        });
      }
    });
  };

  return { requestPermission, removeToken, subscribeForeground };
}
