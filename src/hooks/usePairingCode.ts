import { useState, useEffect, useRef } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';

export function generateCode(): string {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
}

async function saveCode(userId: string): Promise<string> {
  const newCode = generateCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await setDoc(doc(db, 'pairingCodes', newCode), {
    elderlyUserId: userId,
    expiresAt,
    used: false,
  });
  return newCode;
}

const AUTO_REFRESH_MS = 10 * 60 * 1000;

export function usePairingCode(userId: string | null) {
  const [code, setCode] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(600);
  const refreshRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const countdownRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const mountedRef = useRef(true);

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

    async function generateAndSchedule() {
      clearTimeout(refreshRef.current);
      const newCode = await saveCode(userId!);
      if (!mountedRef.current) return;
      setCode(newCode);
      restartCountdown();
      refreshRef.current = setTimeout(() => void generateAndSchedule(), AUTO_REFRESH_MS);
    }

    void generateAndSchedule();

    return () => {
      mountedRef.current = false;
      clearTimeout(refreshRef.current);
      clearInterval(countdownRef.current);
    };
  }, [userId]);

  const refresh = async () => {
    if (!userId || !mountedRef.current) return;
    clearTimeout(refreshRef.current);
    try {
      const newCode = await saveCode(userId);
      if (!mountedRef.current) return;
      setCode(newCode);
      restartCountdown();
      refreshRef.current = setTimeout(() => void refresh(), AUTO_REFRESH_MS);
    } catch (err) {
      // nosemgrep: no-console-log-sensitive — logs error object, not the code itself
      console.error('Failed to refresh pairing code:', err);
      if (!mountedRef.current) return;
      // Retry after the normal interval
      refreshRef.current = setTimeout(() => void refresh(), AUTO_REFRESH_MS);
    }
  };

  const formattedCountdown = `${String(Math.floor(secondsRemaining / 60)).padStart(2, '0')}:${String(secondsRemaining % 60).padStart(2, '0')}`;

  return { code, secondsRemaining, formattedCountdown, refresh };
}
