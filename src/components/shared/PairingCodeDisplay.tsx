import { useTranslation } from 'react-i18next';
import { usePairingCode } from '@/hooks/usePairingCode';
import { EasyCallButton } from '@/components/shared/EasyCallButton';

interface PairingCodeDisplayProps {
  userId: string;
}

export function PairingCodeDisplay({ userId }: PairingCodeDisplayProps) {
  const { t } = useTranslation();
  const { code, error, formattedCountdown, refresh } = usePairingCode(userId);

  return (
    <div className="flex flex-col items-center gap-[var(--space-md)]">
      <p className="text-[length:var(--text-body)]">{t('pairingCode.yourCode')}</p>
      {error && !code ? (
        <div className="flex flex-col items-center gap-[var(--space-sm)]">
          <p role="alert" className="text-error text-[length:var(--text-body)]">
            {t('pairingCode.generateError')}
          </p>
          <EasyCallButton variant="primary" onClick={() => void refresh()}>
            {t('common.retry')}
          </EasyCallButton>
        </div>
      ) : code ? (
        <p
          className="text-[length:var(--text-display)] font-bold tracking-[0.25em]"
          aria-label={t('pairingCode.pairingCodeLabel', { code: code.split('').join(' ') })}
          aria-live="polite"
        >
          {code}
        </p>
      ) : (
        <span
          className="loading loading-spinner loading-lg"
          role="status"
          aria-label={t('pairingCode.generatingCode')}
        />
      )}
      {code && (
        <>
          <p className="text-[length:var(--text-body)] text-[color:var(--color-text-secondary)]">
            {t('pairingCode.expiresIn', { time: formattedCountdown })}
          </p>
          <EasyCallButton variant="secondary" onClick={() => void refresh()}>
            {t('pairingCode.getNewCode')}
          </EasyCallButton>
        </>
      )}
    </div>
  );
}
