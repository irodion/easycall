import { useRef, useState } from 'react';

const MAX_RETRY_DELAY = 10_000;

export function useSnapshotRetry() {
  const retryCount = useRef(0);
  const [retryTick, setRetryTick] = useState(0);

  const scheduleRetry = () => {
    retryCount.current++;
    const delay = Math.min(1000 * retryCount.current, MAX_RETRY_DELAY);
    setTimeout(() => setRetryTick((t) => t + 1), delay);
  };

  const resetRetry = () => {
    retryCount.current = 0;
  };

  return { retryTick, scheduleRetry, resetRetry };
}
