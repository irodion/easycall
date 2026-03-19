import { useState, useCallback, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { Icon } from '@/components/shared/Icon';

const DIGIT_BTN_CLASS =
  'btn bg-base-200 hover:bg-base-300 min-h-14 min-w-14 text-[length:var(--text-display)] font-bold';
const UTILITY_BTN_CLASS =
  'btn bg-base-200/60 hover:bg-base-300 min-h-14 min-w-14 text-[length:var(--text-body)]';

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
  const { t } = useTranslation();
  const [digits, setDigits] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, isLocked);

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
          .then(() => {
            setDigits([]);
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
      ref={dialogRef}
      className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-[var(--space-lg)] bg-base-100 p-[var(--space-md)]"
      role="dialog"
      aria-label={t('appLock.title')}
    >
      <h1 className="text-[length:var(--text-heading)] font-bold text-center">
        {t('appLock.enterPin')}
      </h1>

      {/* PIN dots */}
      <div
        className="flex gap-[var(--space-md)]"
        role="group"
        aria-label={t('appLock.digitsEntered', { count: digits.length })}
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
            {t('appLock.tooManyAttempts', { seconds: cooldownRemaining })}
          </p>
        )}
        {!isCoolingDown && failedAttempts > 0 && (
          <p className="text-[length:var(--text-body)] text-error">{t('appLock.wrongPin')}</p>
        )}
      </div>

      {/* Numeric keypad */}
      <div className="grid grid-cols-3 gap-[var(--space-sm)] w-full max-w-xs">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            type="button"
            className={DIGIT_BTN_CLASS}
            onClick={() => handleDigit(d)}
            disabled={isCoolingDown || submitting}
            aria-label={d}
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          className={UTILITY_BTN_CLASS}
          onClick={handleClear}
          disabled={isCoolingDown || submitting}
          aria-label={t('appLock.clear')}
        >
          {t('appLock.clear')}
        </button>
        <button
          type="button"
          className={DIGIT_BTN_CLASS}
          onClick={() => handleDigit('0')}
          disabled={isCoolingDown || submitting}
          aria-label="0"
        >
          0
        </button>
        <button
          type="button"
          className={UTILITY_BTN_CLASS}
          onClick={handleBackspace}
          disabled={isCoolingDown || submitting}
          aria-label={t('appLock.backspace')}
        >
          <Icon name="backspace" size={22} />
        </button>
      </div>
    </div>
  );
}
