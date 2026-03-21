import { useState, useEffect, useRef, useCallback } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { CAREGIVER_PIN_REF, verifyCaregiverPin } from '@/services/caregiverPinService';
import { useSnapshotRetry } from '@/hooks/useSnapshotRetry';

const MAX_ATTEMPTS = 5;
const COOLDOWN_SECONDS = 300;

export interface UseCaregiverPinReturn {
  /** Whether a caregiver PIN is configured for this instance */
  pinRequired: boolean;
  /** Whether the PIN has been verified in this session */
  verified: boolean;
  /** Number of failed attempts before cooldown */
  failedAttempts: number;
  /** Seconds remaining in cooldown */
  cooldownRemaining: number;
  /** Whether the hook is still loading initial state */
  loading: boolean;
  /** Verify a PIN attempt. Returns true if correct. */
  submitPin: (pin: string) => Promise<boolean>;
}

export function useCaregiverPin(): UseCaregiverPinReturn {
  const [pinRequired, setPinRequired] = useState(false);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const cooldownActive = useRef(false);
  // Tracks whether the user explicitly verified via submitPin (not auto-verified)
  const userVerified = useRef(false);

  // Listen to config/caregiverPinStatus doc (never contains hash — safe to read)
  const { retryTick, scheduleRetry, resetRetry } = useSnapshotRetry();

  useEffect(() => {
    const unsub = onSnapshot(
      CAREGIVER_PIN_REF,
      (snap) => {
        resetRetry();
        const hasPinSet = snap.exists() && snap.data()['pinSet'] === true;
        setPinRequired(hasPinSet);
        if (!hasPinSet) {
          setVerified(true); // No PIN = auto-verified
          userVerified.current = false;
        } else if (!userVerified.current) {
          setVerified(false); // PIN required, not yet verified
        }
        // If userVerified.current is true, keep verified=true (user already entered PIN)
        setLoading(false);
      },
      () => scheduleRetry(),
    );
    return unsub;
  }, [retryTick, scheduleRetry, resetRetry]);

  // Cooldown timer
  useEffect(() => {
    if (cooldownRemaining <= 0) {
      cooldownActive.current = false;
      return;
    }
    cooldownActive.current = true;
    const timer = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownRemaining]);

  const submitPin = useCallback(async (pin: string): Promise<boolean> => {
    if (cooldownActive.current) return false;

    let correct: boolean;
    try {
      correct = await verifyCaregiverPin(pin);
    } catch {
      // Network error, rate limit, App Check failure — treat as failed attempt
      correct = false;
    }

    if (correct) {
      userVerified.current = true;
      setVerified(true);
      setFailedAttempts(0);
      return true;
    }

    setFailedAttempts((prev) => {
      const next = prev + 1;
      if (next >= MAX_ATTEMPTS) {
        setCooldownRemaining(COOLDOWN_SECONDS);
        return 0;
      }
      return next;
    });
    return false;
  }, []);

  return { pinRequired, verified, failedAttempts, cooldownRemaining, loading, submitPin };
}
