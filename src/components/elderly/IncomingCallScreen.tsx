import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useCallStore } from '@/stores/callStore';
import { clearIncomingCallDoc, declineCall } from '@/services/callSignaling';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { createRingtone, type Ringtone } from '@/utils/ringtone';

interface IncomingCallScreenProps {
  ringtoneVolume?: number;
  restrictedNetworkMode?: boolean;
}

export function IncomingCallScreen({
  ringtoneVolume = 80,
  restrictedNetworkMode = false,
}: IncomingCallScreenProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isRinging = useCallStore((s) => s.isRinging);
  const incomingCall = useCallStore((s) => s.incomingCall);
  const clearIncomingCall = useCallStore((s) => s.clearIncomingCall);
  const ringtoneRef = useRef<Ringtone | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, isRinging && !!incomingCall);

  useEffect(() => {
    if (!isRinging) return;

    const ringtone = createRingtone(ringtoneVolume);
    ringtone.play();
    ringtoneRef.current = ringtone;

    timeoutRef.current = setTimeout(() => {
      clearIncomingCall();
    }, 60_000);

    return () => {
      ringtoneRef.current?.pause();
      ringtoneRef.current = null;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isRinging, clearIncomingCall, ringtoneVolume]);

  if (!isRinging || !incomingCall) return null;

  const handleAnswer = () => {
    if (!incomingCall.roomId) {
      clearIncomingCall();
      return;
    }
    const roomId = incomingCall.roomId; // capture before clearing
    const elderlyUserId = incomingCall.elderlyUserId;
    clearIncomingCall();
    // Delete the signaling doc so subsequent calls can create a fresh one
    void clearIncomingCallDoc(elderlyUserId);
    void navigate(`/call-room/${roomId}`);
  };

  const handleDecline = async () => {
    if (!incomingCall) return;
    try {
      await declineCall(incomingCall.elderlyUserId);
    } catch {
      // Log but still clear — user intent is to dismiss
      // nosemgrep: no-console-log-sensitive — logs static error message, no user data
      console.error('Failed to decline call');
    }
    // Delete the doc so subsequent calls can create a fresh one (fire-and-forget)
    void clearIncomingCallDoc(incomingCall.elderlyUserId);
    clearIncomingCall();
  };

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex flex-col items-center bg-neutral text-neutral-content"
      style={{
        paddingTop: 'max(var(--space-xl), var(--safe-top, 0px))',
        paddingBottom: 'max(var(--space-xl), var(--safe-bottom, 0px))',
        paddingLeft: 'var(--space-md)',
        paddingRight: 'var(--space-md)',
      }}
      role="alertdialog"
      aria-modal="true"
      aria-label={t('incomingCall.isCalling', { name: incomingCall.callerName })}
    >
      {/* Caller info — centered in upper portion */}
      <div className="flex-1 flex flex-col items-center justify-center gap-[var(--space-lg)]">
        <div className="relative">
          {/* Outer ripple */}
          <div
            className="absolute -inset-5 rounded-full bg-success/15 animate-pulse-ring"
            aria-hidden="true"
          />
          {/* Inner ripple (staggered) */}
          <div
            className="absolute -inset-3 rounded-full bg-success/20 animate-pulse-ring"
            style={{ animationDelay: '0.75s' }}
            aria-hidden="true"
          />
          {/* Gradient border ring */}
          <div
            className="absolute -inset-1 rounded-full bg-gradient-to-b from-success/40 to-success/20"
            aria-hidden="true"
          />
          {incomingCall.callerPhotoURL ? (
            <img
              src={incomingCall.callerPhotoURL}
              alt={incomingCall.callerName}
              className="relative min-w-[120px] min-h-[120px] w-[120px] h-[120px] rounded-full object-cover"
            />
          ) : (
            <div
              className="relative min-w-[120px] min-h-[120px] w-[120px] h-[120px] rounded-full bg-primary flex items-center justify-center text-primary-content text-[length:var(--text-display)]"
              aria-hidden="true"
            >
              {incomingCall.callerName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        <div className="text-center">
          <p className="text-[length:var(--text-heading)] font-bold">{incomingCall.callerName}</p>
          <p className="text-[length:var(--text-body)] opacity-70 animate-pulse">
            {t('incomingCall.calling')}
          </p>
          <p className="text-[length:var(--text-small)] opacity-50 mt-1">
            {restrictedNetworkMode
              ? t('settings.connectionModeRelay')
              : t('settings.connectionModeP2P')}
          </p>
        </div>
      </div>

      {/* Action buttons — pinned to bottom */}
      <div className="flex flex-col items-center gap-[var(--space-md)] w-full max-w-xs">
        <button
          type="button"
          onClick={handleAnswer}
          className="btn btn-success touch-target-call w-full font-bold text-[length:var(--text-button)] shadow-lg shadow-success/30"
          aria-label={t('incomingCall.answerCall')}
        >
          {t('incomingCall.answer')}
        </button>
        <button
          type="button"
          onClick={() => void handleDecline()}
          className="btn btn-error touch-target-primary w-full font-bold text-[length:var(--text-button)]"
          aria-label={t('incomingCall.declineCall')}
        >
          {t('incomingCall.decline')}
        </button>
      </div>
    </div>
  );
}
