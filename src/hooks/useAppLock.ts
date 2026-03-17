import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router';
import { verifyPin } from '@/utils/pinHash';
import type { UserSettings } from '@/types/user';

export interface UseAppLockReturn {
  isLocked: boolean;
  failedAttempts: number;
  cooldownRemaining: number;
  unlockWithPin: (pin: string) => Promise<boolean>;
}

const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const COOLDOWN_SECONDS = 30;
const MAX_ATTEMPTS = 3;

export function useAppLock({
  settings,
  userId,
}: {
  settings: UserSettings;
  userId?: string | null;
}): UseAppLockReturn {
  const location = useLocation();
  const isOnCallRoute =
    location.pathname.includes('/call/') || location.pathname.includes('/call-room/');

  const lockEnabled = settings.appLockEnabled && settings.appLockPinHash !== null;

  const [isUnlocked, setIsUnlocked] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const hiddenAt = useRef<number | null>(null);
  const cooldownActive = useRef(false);

  // React-recommended pattern: adjust state when prop-derived value changes
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevLockEnabled, setPrevLockEnabled] = useState(lockEnabled);
  if (prevLockEnabled !== lockEnabled) {
    setPrevLockEnabled(lockEnabled);
    setIsUnlocked(false);
  }

  const isLocked = lockEnabled && !isUnlocked && !isOnCallRoute;

  // Inactivity timer — only when unlocked and lock is enabled
  useEffect(() => {
    if (!lockEnabled || isLocked || isOnCallRoute) return;

    const resetTimer = () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      inactivityTimer.current = setTimeout(() => {
        setIsUnlocked(false);
      }, INACTIVITY_TIMEOUT);
    };

    resetTimer();

    const events = ['pointerdown', 'keydown'] as const;
    for (const event of events) {
      document.addEventListener(event, resetTimer);
    }

    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      for (const event of events) {
        document.removeEventListener(event, resetTimer);
      }
    };
  }, [lockEnabled, isLocked, isOnCallRoute]);

  // Visibility change — lock after 5 min hidden
  useEffect(() => {
    if (!lockEnabled || isOnCallRoute) return;

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
      } else if (document.visibilityState === 'visible' && hiddenAt.current !== null) {
        const elapsed = Date.now() - hiddenAt.current;
        hiddenAt.current = null;
        if (elapsed >= INACTIVITY_TIMEOUT) {
          setIsUnlocked(false);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [lockEnabled, isOnCallRoute]);

  // Cooldown timer
  useEffect(() => {
    cooldownActive.current = cooldownRemaining > 0;

    if (cooldownRemaining <= 0) {
      if (cooldownInterval.current) {
        clearInterval(cooldownInterval.current);
        cooldownInterval.current = null;
      }
      return;
    }

    cooldownInterval.current = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (cooldownInterval.current) {
        clearInterval(cooldownInterval.current);
        cooldownInterval.current = null;
      }
    };
  }, [cooldownRemaining]);

  const unlockWithPin = useCallback(
    async (pin: string): Promise<boolean> => {
      if (cooldownActive.current) return false;

      if (!settings.appLockPinHash) return false;

      let valid: boolean;
      try {
        valid = await verifyPin(pin, settings.appLockPinHash, userId ?? undefined);
      } catch {
        return false;
      }
      if (valid) {
        setIsUnlocked(true);
        setFailedAttempts(0);
        return true;
      }

      let triggered = false;
      setFailedAttempts((prev) => {
        const next = prev + 1;
        if (next >= MAX_ATTEMPTS) triggered = true;
        return triggered ? 0 : next;
      });
      if (triggered) {
        cooldownActive.current = true; // Set IMMEDIATELY, not via effect
      }
      setCooldownRemaining((prev) => (triggered ? COOLDOWN_SECONDS : prev));
      return false;
    },
    [settings.appLockPinHash, userId],
  );

  if (!lockEnabled) {
    return { isLocked: false, failedAttempts: 0, cooldownRemaining: 0, unlockWithPin };
  }

  return { isLocked, failedAttempts, cooldownRemaining, unlockWithPin };
}
