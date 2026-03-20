import { useRef, useState, useCallback, useEffect } from 'react';

const MAX_RETRY_DELAY = 10_000;

export function useSnapshotRetry() {
  const retryCount = useRef(0);
  const [retryTick, setRetryTick] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      clearTimeout(timeoutRef.current);
    };
  }, []);

  const scheduleRetry = useCallback(() => {
    clearTimeout(timeoutRef.current);
    retryCount.current++;
    const delay = Math.min(1000 * retryCount.current, MAX_RETRY_DELAY);
    timeoutRef.current = setTimeout(() => setRetryTick((t) => t + 1), delay);
  }, []);

  const resetRetry = useCallback(() => {
    retryCount.current = 0;
  }, []);

  return { retryTick, scheduleRetry, resetRetry };
}
