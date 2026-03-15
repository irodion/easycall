import { useState, useCallback, type ReactNode } from 'react';

interface AppLockProps {
  isLocked: boolean;
  failedAttempts: number;
  cooldownRemaining: number;
  onPinSubmit: (pin: string) => Promise<boolean>;
  children: ReactNode;
}

export function AppLock({
  isLocked,
  failedAttempts,
  cooldownRemaining,
  onPinSubmit,
  children,
}: AppLockProps) {
  const [digits, setDigits] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const isCoolingDown = cooldownRemaining > 0;

  const handleDigit = useCallback(
    (digit: string) => {
      if (isCoolingDown || submitting) return;
      const next = [...digits, digit];
      if (next.length > 4) return;
      setDigits(next);
      if (next.length === 4) {
        setSubmitting(true);
        void onPinSubmit(next.join(''))
          .then((success) => {
            if (!success) setDigits([]);
          })
          .catch(() => {
            setDigits([]);
          })
          .finally(() => {
            setSubmitting(false);
          });
      }
    },
    [isCoolingDown, submitting, digits, onPinSubmit],
  );

  const handleClear = useCallback(() => {
    setDigits([]);
  }, []);

  const handleBackspace = useCallback(() => {
    setDigits((prev) => prev.slice(0, -1));
  }, []);

  if (!isLocked) return <>{children}</>;

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-[var(--space-lg)] bg-base-100 p-[var(--space-md)]"
      role="dialog"
      aria-label="App lock screen"
    >
      <h1 className="text-[length:var(--text-heading)] font-bold text-center">
        Enter PIN to unlock
      </h1>

      {/* PIN dots */}
      <div
        className="flex gap-[var(--space-md)]"
        role="group"
        aria-label={`${digits.length} of 4 digits entered`}
      >
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className={`w-5 h-5 rounded-full border-2 border-current ${
              i < digits.length ? 'bg-current' : ''
            }`}
            aria-hidden="true"
          />
        ))}
      </div>

      {/* Error / cooldown messages */}
      <div aria-live="polite" className="min-h-[2rem] text-center">
        {isCoolingDown && (
          <p className="text-[length:var(--text-body)] text-error font-bold">
            Too many attempts. Try again in {cooldownRemaining}s
          </p>
        )}
        {!isCoolingDown && failedAttempts > 0 && (
          <p className="text-[length:var(--text-body)] text-error">Wrong PIN</p>
        )}
      </div>

      {/* Numeric keypad */}
      <div className="grid grid-cols-3 gap-[var(--space-sm)] w-full max-w-xs">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            type="button"
            className="btn btn-ghost min-h-14 min-w-14 text-[length:var(--text-display)] font-bold"
            onClick={() => handleDigit(d)}
            disabled={isCoolingDown || submitting}
            aria-label={d}
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          className="btn btn-ghost min-h-14 min-w-14 text-[length:var(--text-body)]"
          onClick={handleClear}
          disabled={isCoolingDown || submitting}
          aria-label="Clear"
        >
          Clear
        </button>
        <button
          type="button"
          className="btn btn-ghost min-h-14 min-w-14 text-[length:var(--text-display)] font-bold"
          onClick={() => handleDigit('0')}
          disabled={isCoolingDown || submitting}
          aria-label="0"
        >
          0
        </button>
        <button
          type="button"
          className="btn btn-ghost min-h-14 min-w-14 text-[length:var(--text-body)]"
          onClick={handleBackspace}
          disabled={isCoolingDown || submitting}
          aria-label="Backspace"
        >
          ←
        </button>
      </div>
    </div>
  );
}
