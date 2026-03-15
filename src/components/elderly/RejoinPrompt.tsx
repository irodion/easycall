import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { EasyCallButton } from '@/components/shared/EasyCallButton';
import { EasyCallText } from '@/components/shared/EasyCallText';
import { clearActiveCall } from '@/services/callHistory';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import type { ActiveCallData } from '@/types/user';

interface RejoinPromptProps {
  activeCall: ActiveCallData;
  userId: string;
  onDismiss: () => void;
}

export function RejoinPrompt({ activeCall, userId, onDismiss }: RejoinPromptProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      void clearActiveCall(userId);
      onDismiss();
    }, 30_000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [userId, onDismiss]);

  const handleRejoin = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    void navigate(`/call/${activeCall.contactId}`);
  };

  const handleDismiss = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    void clearActiveCall(userId);
    onDismiss();
  };

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('rejoinPrompt.rejoinCall')}
    >
      <div className="bg-base-100 rounded-2xl p-6 max-w-sm w-full flex flex-col items-center gap-4">
        <EasyCallText as="h2" variant="heading" className="text-center">
          {t('rejoinPrompt.returnToCall', { name: activeCall.contactName })}
        </EasyCallText>
        <EasyCallButton
          variant="primary"
          className="min-h-[72px] min-w-[72px] w-full"
          onClick={handleRejoin}
          aria-label={t('rejoinPrompt.returnToCallWith', { name: activeCall.contactName })}
        >
          {t('rejoinPrompt.returnButton')}
        </EasyCallButton>
        <EasyCallButton variant="secondary" onClick={handleDismiss}>
          {t('rejoinPrompt.dismiss')}
        </EasyCallButton>
      </div>
    </div>
  );
}
