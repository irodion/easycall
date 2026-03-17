import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { auth } from '@/services/firebase';
import { linkCaregiverEmail, sendCaregiverPasswordReset } from '@/services/caregiverAuth';
import { EasyCallButton } from '@/components/shared/EasyCallButton';
import { EasyCallText } from '@/components/shared/EasyCallText';

type LinkState = 'idle' | 'loading' | 'success' | 'error';
type ResetState = 'idle' | 'loading' | 'sent' | 'error';

interface FirebaseError {
  code?: string;
}

function isLinked(): boolean {
  return auth.currentUser?.providerData.some((p) => p.providerId === 'password') ?? false;
}

function getLinkedEmail(): string | null {
  const provider = auth.currentUser?.providerData.find((p) => p.providerId === 'password');
  return provider?.email ?? null;
}

function getLinkErrorMessage(error: unknown, t: (key: string) => string): string {
  const code = (error as FirebaseError).code;
  switch (code) {
    case 'auth/email-already-in-use':
      return t('caregiverAccount.emailAlreadyInUse');
    case 'auth/invalid-email':
      return t('caregiverAccount.invalidEmail');
    default:
      return t('caregiverAccount.genericError');
  }
}

export function CaregiverAccount() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [linkState, setLinkState] = useState<LinkState>('idle');
  const [resetState, setResetState] = useState<ResetState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [validationError, setValidationError] = useState('');

  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      clearTimeout(resetTimeoutRef.current);
    };
  }, []);

  const linked = isLinked();
  const linkedEmail = getLinkedEmail();

  const handleLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');
    setErrorMessage('');

    if (password.length < 6) {
      setValidationError(t('caregiverAccount.passwordTooShort'));
      return;
    }
    if (password !== confirmPassword) {
      setValidationError(t('caregiverAccount.passwordMismatch'));
      return;
    }

    setLinkState('loading');
    try {
      await linkCaregiverEmail(email, password);
      setLinkState('success');
    } catch (err) {
      setLinkState('error');
      setErrorMessage(getLinkErrorMessage(err, t));
    }
  };

  const handleReset = async () => {
    if (!linkedEmail) return;
    setResetState('loading');
    try {
      await sendCaregiverPasswordReset(linkedEmail);
      setResetState('sent');
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = setTimeout(() => setResetState('idle'), 5000);
    } catch {
      setResetState('error');
    }
  };

  if (linked || linkState === 'success') {
    const displayEmail = linkedEmail ?? email;
    return (
      <div className="min-h-screen bg-base-100 flex flex-col items-center justify-center gap-6 p-8">
        <EasyCallText as="h1" variant="heading" className="text-center">
          {t('caregiverAccount.linkedTitle')}
        </EasyCallText>

        <EasyCallText as="p" variant="body" className="text-center">
          {t('caregiverAccount.linkedEmail', { email: displayEmail })}
        </EasyCallText>

        {linkState === 'success' && (
          <div role="status" className="alert alert-success w-full max-w-sm">
            <EasyCallText as="span" variant="body">
              {t('caregiverAccount.linkSuccess')}
            </EasyCallText>
          </div>
        )}

        {resetState === 'sent' && (
          <div role="status" className="alert alert-success w-full max-w-sm">
            <EasyCallText as="span" variant="body">
              {t('caregiverAccount.resetSent')}
            </EasyCallText>
          </div>
        )}

        {resetState === 'error' && (
          <div role="alert" className="alert alert-error w-full max-w-sm">
            <EasyCallText as="span" variant="body">
              {t('caregiverAccount.genericError')}
            </EasyCallText>
          </div>
        )}

        <div className="flex flex-col gap-3 w-full max-w-sm">
          <EasyCallButton
            size="default"
            variant="secondary"
            onClick={() => void handleReset()}
            disabled={resetState === 'loading'}
          >
            {t('caregiverAccount.resetPassword')}
          </EasyCallButton>

          <Link
            to="/caregiver"
            className="btn btn-ghost touch-target-min min-h-14 font-bold text-[length:var(--text-button)]"
          >
            {t('caregiverAccount.backToDashboard')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-100 flex flex-col items-center justify-center gap-6 p-8">
      <EasyCallText as="h1" variant="heading" className="text-center">
        {t('caregiverAccount.linkTitle')}
      </EasyCallText>

      <EasyCallText as="p" variant="body" className="text-center max-w-sm">
        {t('caregiverAccount.linkDescription')}
      </EasyCallText>

      {(linkState === 'error' || validationError) && (
        <div role="alert" className="alert alert-error w-full max-w-sm">
          <EasyCallText as="span" variant="body">
            {validationError || errorMessage}
          </EasyCallText>
        </div>
      )}

      <form onSubmit={(e) => void handleLink(e)} className="flex flex-col gap-4 w-full max-w-sm">
        <div className="form-control">
          <label htmlFor="account-email" className="label">
            <EasyCallText as="span" variant="body" className="font-semibold">
              {t('caregiverAccount.email')}
            </EasyCallText>
          </label>
          <input
            id="account-email"
            type="email"
            className="input input-bordered w-full min-h-14"
            placeholder={t('caregiverAccount.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <div className="form-control">
          <label htmlFor="account-password" className="label">
            <EasyCallText as="span" variant="body" className="font-semibold">
              {t('caregiverAccount.password')}
            </EasyCallText>
          </label>
          <input
            id="account-password"
            type="password"
            className="input input-bordered w-full min-h-14"
            placeholder={t('caregiverAccount.passwordPlaceholder')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
        </div>

        <div className="form-control">
          <label htmlFor="account-confirm-password" className="label">
            <EasyCallText as="span" variant="body" className="font-semibold">
              {t('caregiverAccount.confirmPassword')}
            </EasyCallText>
          </label>
          <input
            id="account-confirm-password"
            type="password"
            className="input input-bordered w-full min-h-14"
            placeholder={t('caregiverAccount.confirmPasswordPlaceholder')}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
        </div>

        <EasyCallButton
          type="submit"
          size="default"
          variant="primary"
          disabled={linkState === 'loading'}
        >
          {linkState === 'loading'
            ? t('caregiverAccount.linking')
            : t('caregiverAccount.linkAccount')}
        </EasyCallButton>
      </form>

      <Link
        to="/caregiver"
        className="link link-secondary text-[length:var(--text-body)] min-h-14 min-w-14 flex items-center justify-center"
      >
        {t('caregiverAccount.backToDashboard')}
      </Link>
    </div>
  );
}
