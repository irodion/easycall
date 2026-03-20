import { useState, useEffect } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { REGISTRATION_CONFIG_REF } from '@/services/registrationLock';
import { useSnapshotRetry } from '@/hooks/useSnapshotRetry';

export function useRegistrationLock(): { isOpen: boolean; loading: boolean } {
  const [isOpen, setIsOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const { retryTick, scheduleRetry, resetRetry } = useSnapshotRetry();

  useEffect(() => {
    const unsub = onSnapshot(
      REGISTRATION_CONFIG_REF,
      (snap) => {
        resetRetry();
        if (!snap.exists()) {
          setIsOpen(true); // Default: open
        } else {
          setIsOpen(snap.data()['open'] !== false);
        }
        setLoading(false);
      },
      () => scheduleRetry(),
    );
    return unsub;
  }, [retryTick, scheduleRetry, resetRetry]);

  return { isOpen, loading };
}
