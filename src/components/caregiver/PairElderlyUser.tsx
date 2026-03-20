import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { validatePairingCode } from '@/services/callSignaling';
import { BackToDashboard } from '@/components/shared/BackToDashboard';
import { EasyCallButton } from '@/components/shared/EasyCallButton';

interface PairElderlyUserProps {
  onSuccess: (elderlyUserId: string) => void;
}

export function PairElderlyUser({ onSuccess }: PairElderlyUserProps) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || status === 'loading') return;
    setStatus('loading');
    try {
      const result = await validatePairingCode(code);
      setStatus('idle');
      onSuccess(result.elderlyUserId);
    } catch (err) {
      const errCode = (err as { code?: string })?.code ?? '';
      let message: string;
      if (errCode.includes('resource-exhausted')) {
        message = t('pairElderly.tooManyAttempts');
      } else if (errCode.includes('not-found') || errCode.includes('internal')) {
        message = t('pairElderly.invalidCode');
      } else if (errCode.includes('deadline-exceeded')) {
        message = t('pairElderly.codeExpired');
      } else if (errCode.includes('already-exists')) {
        message = t('pairElderly.codeAlreadyUsed');
      } else {
        message = t('common.somethingWentWrong');
      }
      setErrorMessage(message);
      setStatus('error');
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-[var(--space-md)]">
      <BackToDashboard />
      <label htmlFor="pairing-code" className="text-[length:var(--text-body)] font-bold">
        {t('pairElderly.enterCode')}
      </label>
      <input
        id="pairing-code"
        type="text"
        inputMode="numeric"
        pattern="[0-9]{6}"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        className="input input-bordered text-center text-[length:var(--text-display)] tracking-widest touch-target-primary"
        aria-describedby={status === 'error' ? 'pairing-error' : undefined}
      />
      {status === 'error' && (
        <p id="pairing-error" role="alert" className="text-error text-[length:var(--text-body)]">
          {errorMessage}
        </p>
      )}
      <EasyCallButton type="submit" disabled={code.length !== 6 || status === 'loading'}>
        {status === 'loading' ? t('pairElderly.linking') : t('pairElderly.linkAccount')}
      </EasyCallButton>
    </form>
  );
}
