import { useState, useEffect, useRef, useCallback } from 'react';
import { onSnapshot } from 'firebase/firestore';
import {
  CAREGIVER_PIN_REF,
  verifyCaregiverPin,
  migrateLegacyPinIfNeeded,
} from '@/services/caregiverPinService';
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

  // Subscribe to status doc immediately AND run migration in parallel.
  // If doc is missing and migration is still pending, stay in loading state.
  // Once migration resolves, if doc is still missing → no PIN configured.
  const { retryTick, scheduleRetry, resetRetry } = useSnapshotRetry();
  const migrationDone = useRef(false);
  const lastSnap = useRef<{ exists: boolean; pinSet: boolean } | null>(null);

  useEffect(() => {
    migrationDone.current = false;

    function applySnap(exists: boolean, pinSet: boolean) {
      const hasPinSet = exists && pinSet;
      setPinRequired(hasPinSet);
      if (!hasPinSet) {
        setVerified(true);
        userVerified.current = false;
      } else if (!userVerified.current) {
        setVerified(false);
      }
      setLoading(false);
    }

    // Fire migration in parallel — when it completes, if we deferred
    // a "no doc" snapshot, finalize it now.
    void migrateLegacyPinIfNeeded().then((ok) => {
      migrationDone.current = true;
      if (ok) {
        const snap = lastSnap.current;
        if (snap && !snap.pinSet) {
          applySnap(snap.exists, snap.pinSet);
        }
      }
      // If migration failed, don't finalize — onSnapshot will handle if doc exists
    }).catch(() => {
      migrationDone.current = true;
      // Don't apply — let onSnapshot handle
    });

    const unsub = onSnapshot(
      CAREGIVER_PIN_REF,
      (snap) => {
        resetRetry();
        const exists = snap.exists();
        const pinSet = exists && snap.data()['pinSet'] === true;
        lastSnap.current = { exists, pinSet };

        if (pinSet) {
          applySnap(exists, pinSet);
        } else if (migrationDone.current) {
          applySnap(exists, pinSet);
        }
        // else: no PIN but migration pending — stay loading, defer to migration callback
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

  const submitPin = useCallback(
    async (pin: string): Promise<boolean> => {
      if (cooldownActive.current) return false;

      const correct = await verifyCaregiverPin(pin);
      if (correct) {
        userVerified.current = true;
        setVerified(true);
        setFailedAttempts(0);
        return true;
      }

      const newAttempts = failedAttempts + 1;
      if (newAttempts >= MAX_ATTEMPTS) {
        setFailedAttempts(0);
        setCooldownRemaining(COOLDOWN_SECONDS);
      } else {
        setFailedAttempts(newAttempts);
      }
      return false;
    },
    [failedAttempts],
  );

  return { pinRequired, verified, failedAttempts, cooldownRemaining, loading, submitPin };
}
