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

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    async function generateAndSchedule() {
      clearTimeout(refreshRef.current);
      const newCode = await saveCode(userId!);
      if (cancelled) return;
      setCode(newCode);
      setSecondsRemaining(600);
      refreshRef.current = setTimeout(() => void generateAndSchedule(), AUTO_REFRESH_MS);
    }

    void generateAndSchedule();

    countdownRef.current = setInterval(() => {
      setSecondsRemaining((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);

    return () => {
      cancelled = true;
      clearTimeout(refreshRef.current);
      clearInterval(countdownRef.current);
    };
  }, [userId]);

  const refresh = async () => {
    if (!userId) return;
    clearTimeout(refreshRef.current);
    saveCode(userId).then((newCode) => {
      setCode(newCode);
      setSecondsRemaining(600);
      refreshRef.current = setTimeout(() => void refresh(), AUTO_REFRESH_MS);
    });
  };

  const formattedCountdown = `${String(Math.floor(secondsRemaining / 60)).padStart(2, '0')}:${String(secondsRemaining % 60).padStart(2, '0')}`;

  return { code, secondsRemaining, formattedCountdown, refresh };
}
