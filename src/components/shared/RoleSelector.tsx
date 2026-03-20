import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { doc, setDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, db, ensureAuthenticated } from '@/services/firebase';
import { useRegistrationLock } from '@/hooks/useRegistrationLock';
import { useCaregiverPin } from '@/hooks/useCaregiverPin';
import { CaregiverPinPrompt } from './CaregiverPinPrompt';
import { EasyCallButton } from './EasyCallButton';
import { EasyCallText } from './EasyCallText';

export function RoleSelector() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isOpen: registrationOpen, loading: registrationLoading } = useRegistrationLock();
  const caregiverPin = useCaregiverPin();
  const [showPinPrompt, setShowPinPrompt] = useState(false);

  const handleSelectRole = async (role: 'elderly' | 'caregiver', pin?: string) => {
    if (!registrationOpen) {
      setError(t('registrationLock.closed'));
      return;
    }

    // If selecting caregiver and PIN is required but not verified, show prompt
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
        await setDoc(
          doc(db, 'users', user.uid),
          { role, onboardingComplete: false },
          { merge: true },
        );
      }
      void navigate(role === 'elderly' ? '/elderly' : '/caregiver');
    } catch (err) {
      console.error('Role selection failed:', err);
      const code = (err as { code?: string }).code ?? '';
      if (code.includes('permission-denied')) {
        setError(t('registrationLock.closed'));
      } else {
        setError(t('common.somethingWentWrong'));
      }
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
          disabled={isSaving || registrationLoading || !registrationOpen}
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
