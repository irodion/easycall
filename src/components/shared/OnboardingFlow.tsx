import { useState } from 'react';
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
      setError('Failed to complete setup. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-[var(--space-md)] gap-[var(--space-lg)]">
      {step === 1 && (
        <div className="flex flex-col items-center gap-[var(--space-md)] text-center max-w-md">
          <h1 className="text-[length:var(--text-heading)] font-bold">Welcome to EasyCall</h1>
          <p className="text-[length:var(--text-body)]">
            {user.role === 'elderly'
              ? 'Simple video calling with your family. Just tap a photo to call!'
              : 'Manage video calling for your family members remotely.'}
          </p>
          <div className="flex gap-[var(--space-sm)] w-full max-w-xs">
            <EasyCallButton size="large" onClick={nextStep}>
              Next
            </EasyCallButton>
            <EasyCallButton variant="secondary" size="large" onClick={nextStep}>
              Skip
            </EasyCallButton>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col items-center gap-[var(--space-md)] max-w-md">
          <h2 className="text-[length:var(--text-heading)] font-bold">Camera & Microphone</h2>
          <p className="text-[length:var(--text-body)] text-center">
            EasyCall needs access to your camera and microphone for video calls.
          </p>
          <PermissionCheck onReady={nextStep} />
          <EasyCallButton variant="secondary" size="large" onClick={nextStep}>
            Skip
          </EasyCallButton>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col items-center gap-[var(--space-md)] max-w-md">
          <h2 className="text-[length:var(--text-heading)] font-bold">Notification Permission</h2>
          <p className="text-[length:var(--text-body)] text-center">
            Allow notifications so you know when someone is calling you.
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
            Next
          </EasyCallButton>
          <EasyCallButton variant="secondary" size="large" onClick={nextStep}>
            Skip
          </EasyCallButton>
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col items-center gap-[var(--space-md)] max-w-md">
          <h2 className="text-[length:var(--text-heading)] font-bold">
            {user.role === 'elderly' ? 'Pair with Caregiver' : 'Link to Elderly User'}
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
            {isSubmitting ? 'Saving...' : 'Done'}
          </EasyCallButton>
          <EasyCallButton
            variant="secondary"
            size="large"
            disabled={isSubmitting}
            onClick={() => void handleFinish()}
          >
            Skip
          </EasyCallButton>
        </div>
      )}

      <nav
        aria-label={`Step ${String(step)} of ${String(TOTAL_STEPS)}`}
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
