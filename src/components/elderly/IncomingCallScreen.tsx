import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useCallStore } from '@/stores/callStore';
import { declineCall } from '@/services/callSignaling';
import { useFocusTrap } from '@/hooks/useFocusTrap';

export function IncomingCallScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isRinging = useCallStore((s) => s.isRinging);
  const incomingCall = useCallStore((s) => s.incomingCall);
  const clearIncomingCall = useCallStore((s) => s.clearIncomingCall);
  const audioRef = useRef<{ play: () => void; pause: () => void } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, isRinging && !!incomingCall);

  useEffect(() => {
    if (!isRinging) return;

    const audio = new Audio('/ringtone.mp3');
    audio.loop = true;
    void audio.play();
    audioRef.current = audio;

    timeoutRef.current = setTimeout(() => {
      clearIncomingCall();
    }, 60_000);

    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isRinging, clearIncomingCall]);

  if (!isRinging || !incomingCall) return null;

  const handleAnswer = () => {
    if (!incomingCall.roomId) {
      clearIncomingCall();
      return;
    }
    clearIncomingCall();
    void navigate(`/call-room/${incomingCall.roomId}`);
  };

  const handleDecline = () => {
    void declineCall(incomingCall.elderlyUserId);
    clearIncomingCall();
  };

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-[var(--space-lg)] bg-base-100 p-[var(--space-md)]"
      role="alertdialog"
      aria-modal="true"
      aria-label={t('incomingCall.isCalling', { name: incomingCall.callerName })}
    >
      {incomingCall.callerPhotoURL ? (
        <img
          src={incomingCall.callerPhotoURL}
          alt={incomingCall.callerName}
          className="min-w-[120px] min-h-[120px] w-[120px] h-[120px] rounded-full object-cover"
        />
      ) : (
        <div
          className="min-w-[120px] min-h-[120px] w-[120px] h-[120px] rounded-full bg-primary flex items-center justify-center text-primary-content text-[length:var(--text-display)]"
          aria-hidden="true"
        >
          {incomingCall.callerName.charAt(0).toUpperCase()}
        </div>
      )}

      <div className="text-center">
        <p className="text-[length:var(--text-heading)] font-bold">{incomingCall.callerName}</p>
        <p className="text-[length:var(--text-body)] text-[color:var(--color-text-secondary)] animate-pulse">
          {t('incomingCall.calling')}
        </p>
      </div>

      <div className="flex flex-col items-center gap-[var(--space-md)] w-full max-w-xs">
        <button
          type="button"
          onClick={handleAnswer}
          className="btn btn-success touch-target-call w-full font-bold text-[length:var(--text-button)]"
          aria-label={t('incomingCall.answerCall')}
        >
          {t('incomingCall.answer')}
        </button>
        <button
          type="button"
          onClick={handleDecline}
          className="btn btn-error touch-target-primary w-full font-bold text-[length:var(--text-button)]"
          aria-label={t('incomingCall.declineCall')}
        >
          {t('incomingCall.decline')}
        </button>
      </div>
    </div>
  );
}
