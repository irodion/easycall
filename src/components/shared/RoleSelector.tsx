import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { doc, setDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, db, ensureAuthenticated } from '@/services/firebase';
import { useRegistrationLock } from '@/hooks/useRegistrationLock';
import { useCaregiverPin } from '@/hooks/useCaregiverPin';
import { CaregiverPinPrompt } from './CaregiverPinPrompt';
import { EasyCallButton } from './EasyCallButton';
import { EasyCallText } from './EasyCallText';

const NETWORK_ERROR_PATTERNS = [
  'auth/network-request-failed',
  'network-request-failed',
  'failed to fetch',
  'networkerror',
  'err_network',
  'err_internet_disconnected',
];

const APP_CHECK_ERROR_PATTERNS = ['appcheck/', 'app-check', 'recaptcha', 'missing-app-check-token'];

function getErrorMessage(err: unknown, t: TFunction): string {
  const code = (err as { code?: string }).code ?? '';
  const message = (err as { message?: string }).message ?? '';
  const combined = `${code} ${message}`.toLowerCase();

  if (combined.includes('permission-denied')) {
    // assignCaregiverRole throws permission-denied for both closed registration
    // and incorrect PIN — distinguish by checking the server's error message.
    if (combined.includes('pin')) {
      return t('roleSelector.incorrectPin');
    }
    return t('registrationLock.closed');
  }

  if (combined.includes('too-many-requests') || combined.includes('resource-exhausted')) {
    return t('roleSelector.firestoreUnavailable');
  }

  if (APP_CHECK_ERROR_PATTERNS.some((p) => combined.includes(p))) {
    return t('roleSelector.appCheckError');
  }

  if (NETWORK_ERROR_PATTERNS.some((p) => combined.includes(p))) {
    return t('roleSelector.networkError');
  }

  if (combined.includes('unavailable') || combined.includes('deadline-exceeded')) {
    return t('roleSelector.firestoreUnavailable');
  }

  // Fallback with error code hint for remote debugging
  if (code) {
    return `${t('common.somethingWentWrong')} ${t('roleSelector.errorCode', { code })}`;
  }
  return t('common.somethingWentWrong');
}

export function RoleSelector() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isOpen: registrationOpen, loading: registrationLoading } = useRegistrationLock();
  const caregiverPin = useCaregiverPin();
  const [showPinPrompt, setShowPinPrompt] = useState(false);

  const handleSelectRole = async (role: 'elderly' | 'caregiver', pin?: string) => {
    if (role === 'caregiver' && !registrationOpen) {
      setError(t('registrationLock.closed'));
      return;
    }

    // If selecting admin role and PIN is required but not verified, show prompt
    if (role === 'caregiver' && caregiverPin.pinRequired && !caregiverPin.verified) {
      setShowPinPrompt(true);
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const user = await ensureAuthenticated();
      if (role === 'caregiver') {
        const functions = getFunctions(app);
        const assignRole = httpsCallable(functions, 'assignCaregiverRole');
        await assignRole(pin ? { pin } : {});
      } else {
        // nosemgrep: no-unvalidated-firestore-input — role is from a typed union, not user input
        await setDoc(
          doc(db, 'users', user.uid),
          { role, onboardingComplete: false },
          { merge: true },
        );
      }
      void navigate(role === 'elderly' ? '/elderly' : '/caregiver');
    } catch (err) {
      // nosemgrep: no-console-log-sensitive — logs error object, not credentials
      console.error('Role selection failed:', err);
      setError(getErrorMessage(err, t));
    } finally {
      setIsSaving(false);
    }
  };

  const handlePinVerified = (pin: string) => {
    setShowPinPrompt(false);
    void handleSelectRole('caregiver', pin);
  };

  if (showPinPrompt) {
    return <CaregiverPinPrompt caregiverPin={caregiverPin} onVerified={handlePinVerified} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-base-200/50 to-base-100 flex flex-col items-center justify-center gap-8 p-8">
      <EasyCallText as="h1" variant="heading" className="text-center">
        {t('roleSelector.whoAreYou')}
      </EasyCallText>
      {error && (
        <div role="alert" className="alert alert-error w-full max-w-sm">
          <EasyCallText as="span" variant="body">
            {error}
          </EasyCallText>
        </div>
      )}
      {!registrationLoading && !registrationOpen && (
        <div role="alert" className="alert alert-warning w-full max-w-sm">
          <EasyCallText as="span" variant="body">
            {t('registrationLock.closedMessage')}
          </EasyCallText>
        </div>
      )}
      <div className="flex flex-col gap-4 w-full max-w-sm">
        <EasyCallButton
          size="default"
          variant="primary"
          onClick={() => {
            void handleSelectRole('elderly');
          }}
          disabled={isSaving}
          aria-label={t('roleSelector.elderlyUser')}
        >
          {t('roleSelector.elderlyUser')}
        </EasyCallButton>
        <EasyCallButton
          size="default"
          variant="secondary"
          onClick={() => {
            void handleSelectRole('caregiver');
          }}
          disabled={isSaving || registrationLoading || !registrationOpen || caregiverPin.loading}
          aria-label={t('roleSelector.caregiver')}
        >
          {t('roleSelector.caregiver')}
        </EasyCallButton>
      </div>
      <Link to="/login" className="link link-primary text-[length:var(--text-body)]">
        {t('roleSelector.alreadyHaveAccount')}
      </Link>
    </div>
  );
}
