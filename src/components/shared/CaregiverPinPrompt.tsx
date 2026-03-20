import { AppLock } from './AppLock';
import type { UseCaregiverPinReturn } from '@/hooks/useCaregiverPin';

interface CaregiverPinPromptProps {
  caregiverPin: UseCaregiverPinReturn;
  onVerified: () => void;
}

export function CaregiverPinPrompt({ caregiverPin, onVerified }: CaregiverPinPromptProps) {
  return (
    <AppLock
      isLocked={true}
      failedAttempts={caregiverPin.failedAttempts}
      cooldownRemaining={caregiverPin.cooldownRemaining}
      onPinSubmit={async (pin) => {
        const ok = await caregiverPin.submitPin(pin);
        if (ok) onVerified();
        return ok;
      }}
    >
      <div />
    </AppLock>
  );
}
