import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { EasyCallButton } from '@/components/shared/EasyCallButton';
import { PermissionCheck } from '@/components/elderly/PermissionCheck';
import { PairingCodeDisplay } from '@/components/shared/PairingCodeDisplay';
import { PairElderlyUser } from '@/components/caregiver/PairElderlyUser';
import type { EasyCallUser } from '@/types/user';

interface OnboardingFlowProps {
  user: EasyCallUser;
  onComplete: () => void;
}

const TOTAL_STEPS = 4;

export function OnboardingFlow({ user, onComplete }: OnboardingFlowProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { requestPermission } = usePushNotifications(user.uid);

  const nextStep = () => {
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
    }
  };

  const handleFinish = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const ref = doc(db, 'users', user.uid);
      await updateDoc(ref, { onboardingComplete: true });
      onComplete();
    } catch {
      setError(t('onboarding.failedSetup'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-base-200/30 to-base-100 flex flex-col items-center justify-center p-[var(--space-md)] gap-[var(--space-lg)]">
      {step === 1 && (
        <div className="flex flex-col items-center gap-[var(--space-md)] text-center max-w-md">
          <h1 className="text-[length:var(--text-heading)] font-bold">{t('onboarding.welcome')}</h1>
          <p className="text-[length:var(--text-body)]">
            {user.role === 'elderly'
              ? t('onboarding.elderlyDescription')
              : t('onboarding.caregiverDescription')}
          </p>
          <div className="flex gap-[var(--space-sm)] w-full max-w-xs">
            <EasyCallButton size="large" onClick={nextStep}>
              {t('common.next')}
            </EasyCallButton>
            <EasyCallButton variant="secondary" size="large" onClick={nextStep}>
              {t('common.skip')}
            </EasyCallButton>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col items-center gap-[var(--space-md)] max-w-md">
          <h2 className="text-[length:var(--text-heading)] font-bold">
            {t('onboarding.cameraMic')}
          </h2>
          <p className="text-[length:var(--text-body)] text-center">
            {t('onboarding.cameraMicHint')}
          </p>
          <PermissionCheck onReady={nextStep} />
          <EasyCallButton variant="secondary" size="large" onClick={nextStep}>
            {t('common.skip')}
          </EasyCallButton>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col items-center gap-[var(--space-md)] max-w-md">
          <h2 className="text-[length:var(--text-heading)] font-bold">
            {t('onboarding.notifications')}
          </h2>
          <p className="text-[length:var(--text-body)] text-center">
            {t('onboarding.notificationsHint')}
          </p>
          <EasyCallButton
            size="large"
            onClick={async () => {
              try {
                await requestPermission();
              } catch {
                // Permission denied or unavailable — continue onboarding
              }
              nextStep();
            }}
          >
            {t('common.next')}
          </EasyCallButton>
          <EasyCallButton variant="secondary" size="large" onClick={nextStep}>
            {t('common.skip')}
          </EasyCallButton>
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col items-center gap-[var(--space-md)] max-w-md">
          <h2 className="text-[length:var(--text-heading)] font-bold">
            {user.role === 'elderly'
              ? t('onboarding.pairWithCaregiver')
              : t('onboarding.linkToElderly')}
          </h2>
          {user.role === 'elderly' ? (
            <PairingCodeDisplay userId={user.uid} />
          ) : (
            <PairElderlyUser onSuccess={() => void handleFinish()} />
          )}
          {error && (
            <p role="alert" className="text-error text-[length:var(--text-body)]">
              {error}
            </p>
          )}
          <EasyCallButton size="large" disabled={isSubmitting} onClick={() => void handleFinish()}>
            {isSubmitting ? t('common.saving') : t('onboarding.done')}
          </EasyCallButton>
          <EasyCallButton
            variant="secondary"
            size="large"
            disabled={isSubmitting}
            onClick={() => void handleFinish()}
          >
            {t('common.skip')}
          </EasyCallButton>
        </div>
      )}

      <nav
        aria-label={t('onboarding.stepOf', { step: String(step), total: String(TOTAL_STEPS) })}
        className="flex gap-[var(--space-xs)]"
      >
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <div
            key={i}
            className={`w-3 h-3 rounded-full ${i + 1 === step ? 'bg-primary' : 'bg-base-300'}`}
            aria-hidden="true"
          />
        ))}
      </nav>
    </div>
  );
}
