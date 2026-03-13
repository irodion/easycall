import { usePairingCode } from '@/hooks/usePairingCode';
import { EasyCallButton } from '@/components/shared/EasyCallButton';

interface PairingCodeDisplayProps {
  userId: string;
}

export function PairingCodeDisplay({ userId }: PairingCodeDisplayProps) {
  const { code, formattedCountdown, refresh } = usePairingCode(userId);

  return (
    <div className="flex flex-col items-center gap-[var(--space-md)]">
      <p className="text-[length:var(--text-body)]">Your pairing code:</p>
      {code ? (
        <p
          className="text-[length:var(--text-display)] font-bold tracking-[0.25em]"
          aria-label={`Pairing code: ${code.split('').join(' ')}`}
          aria-live="polite"
        >
          {code}
        </p>
      ) : (
        <span
          className="loading loading-spinner loading-lg"
          aria-label="Generating code"
        />
      )}
      <p className="text-[length:var(--text-body)] text-[color:var(--color-text-secondary)]">
        Expires in {formattedCountdown}
      </p>
      <EasyCallButton variant="secondary" onClick={() => void refresh()}>
        Get new code
      </EasyCallButton>
    </div>
  );
}
