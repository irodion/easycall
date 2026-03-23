import { useState, useEffect, useRef } from 'react';
import { doc, setDoc, collection, query, limit, onSnapshot } from 'firebase/firestore';
import { db } from '@/services/firebase';

export function generateCode(): string {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
}

async function saveCode(userId: string): Promise<string> {
  const newCode = generateCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  // nosemgrep: no-unvalidated-firestore-input — all values are generated/typed, Firestore rules enforce schema
  await setDoc(doc(db, 'pairingCodes', newCode), {
    elderlyUserId: userId,
    expiresAt,
    used: false,
  });
  return newCode;
}

const AUTO_REFRESH_MS = 10 * 60 * 1000;

interface UsePairingCodeOptions {
  onLinked?: () => void;
}

export function usePairingCode(userId: string | null, options?: UsePairingCodeOptions) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(600);
  const refreshRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const countdownRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const mountedRef = useRef(true);
  const userIdRef = useRef(userId);
  const onLinkedRef = useRef(options?.onLinked);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    onLinkedRef.current = options?.onLinked;
  }, [options?.onLinked]);

  function restartCountdown() {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setSecondsRemaining(600);
    countdownRef.current = setInterval(() => {
      setSecondsRemaining((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
  }

  useEffect(() => {
    if (!userId) return;

    mountedRef.current = true;
    let cancelled = false;

    async function generateAndSchedule() {
      clearTimeout(refreshRef.current);
      try {
        const newCode = await saveCode(userId!);
        if (cancelled || !mountedRef.current) return;
        setCode(newCode);
        setError(false);
        restartCountdown();
        refreshRef.current = setTimeout(() => void generateAndSchedule(), AUTO_REFRESH_MS);
      } catch (err) {
        if (cancelled || !mountedRef.current) return;
        // nosemgrep: no-console-log-sensitive — logs error object, not the pairing code
        console.error('Failed to generate pairing code:', err);
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = undefined;
        }
        setCode(null);
        setError(true);
      }
    }

    void generateAndSchedule();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      clearTimeout(refreshRef.current);
      clearInterval(countdownRef.current);
    };
  }, [userId]);

  const refresh = async () => {
    const currentUserId = userIdRef.current;
    if (!currentUserId || !mountedRef.current) return;
    clearTimeout(refreshRef.current);
    try {
      const newCode = await saveCode(currentUserId);
      if (!mountedRef.current) return;
      setCode(newCode);
      setError(false);
      restartCountdown();
      refreshRef.current = setTimeout(() => void refresh(), AUTO_REFRESH_MS);
    } catch (err) {
      // nosemgrep: no-console-log-sensitive — logs error object, not the code itself
      console.error('Failed to refresh pairing code:', err);
      if (!mountedRef.current) return;
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = undefined;
      }
      // Clear stale code so the error UI shows with a retry button
      setCode(null);
      setError(true);
    }
  };

  // Detect caregiver linking via caregivers subcollection
  useEffect(() => {
    if (!userId || !onLinkedRef.current) return;
    const q = query(collection(db, 'users', userId, 'caregivers'), limit(1));
    const unsub = onSnapshot(
      q,
      (snap) => {
        if (!snap.empty) {
          unsub();
          onLinkedRef.current?.();
        }
      },
      (err) => {
        console.error('Failed to listen for caregiver linking:', err);
      },
    );
    return unsub;
  }, [userId]);

  const formattedCountdown = `${String(Math.floor(secondsRemaining / 60)).padStart(2, '0')}:${String(secondsRemaining % 60).padStart(2, '0')}`;

  return { code, error, secondsRemaining, formattedCountdown, refresh };
}
