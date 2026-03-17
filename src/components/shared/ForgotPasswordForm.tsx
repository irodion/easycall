import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { sendCaregiverPasswordReset } from '@/services/caregiverAuth';
import { EasyCallButton } from './EasyCallButton';
import { EasyCallText } from './EasyCallText';

type FormState = 'idle' | 'loading' | 'success' | 'error';

interface FirebaseError {
  code?: string;
}

function getErrorMessage(error: unknown, t: (key: string) => string): string {
  const code = (error as FirebaseError).code;
  switch (code) {
    case 'auth/invalid-email':
      return t('forgotPassword.invalidEmail');
    case 'auth/user-not-found':
      return t('forgotPassword.userNotFound');
    default:
      return t('forgotPassword.genericError');
  }
}

export function ForgotPasswordForm() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<FormState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('loading');
    setErrorMessage('');

    try {
      await sendCaregiverPasswordReset(email);
      setState('success');
    } catch (err) {
      setState('error');
      setErrorMessage(getErrorMessage(err, t));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-base-100 flex flex-col items-center justify-center gap-8 p-8">
      <EasyCallText as="h1" variant="heading" className="text-center">
        {t('forgotPassword.title')}
      </EasyCallText>

      {state === 'error' && errorMessage && (
        <div role="alert" className="alert alert-error w-full max-w-sm">
          <EasyCallText as="span" variant="body">
            {errorMessage}
          </EasyCallText>
        </div>
      )}

      {state === 'success' ? (
        <div className="flex flex-col items-center gap-4 w-full max-w-sm">
          <div role="status" className="alert alert-success w-full">
            <EasyCallText as="span" variant="body">
              {t('forgotPassword.success')}
            </EasyCallText>
          </div>
          <Link to="/login" className="link link-primary text-[length:var(--text-body)]">
            {t('forgotPassword.backToLogin')}
          </Link>
        </div>
      ) : (
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="flex flex-col gap-4 w-full max-w-sm"
        >
          <div className="form-control">
            <label htmlFor="reset-email" className="label">
              <EasyCallText as="span" variant="body" className="font-[number:var(--font-weight-medium)]">
                {t('forgotPassword.email')}
              </EasyCallText>
            </label>
            <input
              id="reset-email"
              type="email"
              className="input input-bordered w-full min-h-14"
              placeholder={t('forgotPassword.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <EasyCallButton
            type="submit"
            size="default"
            variant="primary"
            disabled={state === 'loading'}
          >
            {state === 'loading' ? t('forgotPassword.sending') : t('forgotPassword.sendReset')}
          </EasyCallButton>

          <div className="flex justify-center">
            <Link to="/login" className="link link-primary text-[length:var(--text-body)]">
              {t('forgotPassword.backToLogin')}
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
