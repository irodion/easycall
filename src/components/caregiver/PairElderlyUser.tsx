import { useState } from 'react';
import { validatePairingCode } from '@/services/callSignaling';
import { EasyCallButton } from '@/components/shared/EasyCallButton';

interface PairElderlyUserProps {
  onSuccess: (elderlyUserId: string) => void;
}

export function PairElderlyUser({ onSuccess }: PairElderlyUserProps) {
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
      const message =
        err instanceof Error ? err.message : 'Something went wrong';
      setErrorMessage(message);
      setStatus('error');
    }
  };

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="flex flex-col gap-[var(--space-md)]"
    >
      <label
        htmlFor="pairing-code"
        className="text-[length:var(--text-body)] font-bold"
      >
        Enter the 6-digit code shown on the elderly user's screen:
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
        <p
          id="pairing-error"
          role="alert"
          className="text-error text-[length:var(--text-body)]"
        >
          {errorMessage}
        </p>
      )}
      <EasyCallButton
        type="submit"
        disabled={code.length !== 6 || status === 'loading'}
      >
        {status === 'loading' ? 'Linking...' : 'Link Account'}
      </EasyCallButton>
    </form>
  );
}
