import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { signInCaregiverEmail } from '@/services/caregiverAuth';
import { EasyCallButton } from './EasyCallButton';
import { EasyCallText } from './EasyCallText';

type FormState = 'idle' | 'loading' | 'error';

interface FirebaseError {
  code?: string;
}

function getErrorMessage(error: unknown, t: (key: string) => string): string {
  const code = (error as FirebaseError).code;
  switch (code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return t('login.wrongPassword');
    case 'auth/user-not-found':
      return t('login.userNotFound');
    case 'auth/invalid-email':
      return t('login.invalidEmail');
    default:
      return t('login.genericError');
  }
}

export function LoginForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<FormState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('loading');
    setErrorMessage('');

    try {
      await signInCaregiverEmail(email, password);
      // Navigate to caregiver dashboard — AuthGuard will enforce PIN if required
      void navigate('/caregiver');
    } catch (err) {
      setState('error');
      setErrorMessage(getErrorMessage(err, t));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-base-100 flex flex-col items-center justify-center gap-8 p-8">
      <EasyCallText as="h1" variant="heading" className="text-center">
        {t('login.title')}
      </EasyCallText>

      {state === 'error' && errorMessage && (
        <div role="alert" className="alert alert-error w-full max-w-sm">
          <EasyCallText as="span" variant="body">
            {errorMessage}
          </EasyCallText>
        </div>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4 w-full max-w-sm">
        <div className="form-control">
          <label htmlFor="login-email" className="label">
            <EasyCallText as="span" variant="body" className="font-semibold">
              {t('login.email')}
            </EasyCallText>
          </label>
          <input
            id="login-email"
            type="email"
            className="input input-bordered w-full min-h-14"
            placeholder={t('login.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <div className="form-control">
          <label htmlFor="login-password" className="label">
            <EasyCallText as="span" variant="body" className="font-semibold">
              {t('login.password')}
            </EasyCallText>
          </label>
          <input
            id="login-password"
            type="password"
            className="input input-bordered w-full min-h-14"
            placeholder={t('login.passwordPlaceholder')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>

        <EasyCallButton
          type="submit"
          size="default"
          variant="primary"
          disabled={state === 'loading'}
        >
          {state === 'loading' ? t('login.signingIn') : t('login.signIn')}
        </EasyCallButton>

        <div className="flex flex-col items-center gap-2">
          <Link to="/forgot-password" className="link link-primary text-[length:var(--text-body)]">
            {t('login.forgotPassword')}
          </Link>
          <Link to="/" className="link link-secondary text-[length:var(--text-body)]">
            {t('login.continueAsNew')}
          </Link>
        </div>
      </form>
    </div>
  );
}
