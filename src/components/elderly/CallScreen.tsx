import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Timestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, auth, ensureAuthenticated } from '@/services/firebase';
import { loadJitsiApi, getJaasAppId } from '@/services/jitsi';
import { setActiveCall, clearActiveCall, writeCallHistoryEntry } from '@/services/callHistory';
import { useContactStore } from '@/stores/contactStore';
import { EasyCallButton } from '@/components/shared/EasyCallButton';
import { EasyCallText } from '@/components/shared/EasyCallText';
import { Icon } from '@/components/shared/Icon';
import { ConnectionQualityIndicator } from '@/components/shared/ConnectionQualityIndicator';
import { mapConnectionQuality } from '@/components/shared/connectionQualityStyles';
import type { ConnectionQuality } from '@/components/shared/connectionQualityStyles';
import type { JitsiMeetExternalAPI } from '@/types/jitsi';

const WEAK_SIGNAL_BANNER_DURATION_MS = 5000;

interface CallScreenProps {
  setInCall?: (inCall: boolean) => void;
}

export function CallScreen({ setInCall }: CallScreenProps) {
  const { t } = useTranslation();
  const { contactId, roomId } = useParams<{ contactId?: string; roomId?: string }>();
  const navigate = useNavigate();
  const apiRef = useRef<JitsiMeetExternalAPI | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoNavigateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(true);
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality | null>(null);
  const [showWeakSignalBanner, setShowWeakSignalBanner] = useState(false);
  const weakSignalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const callStartTimeRef = useRef<number | null>(null);
  const historyWrittenRef = useRef(false);
  const beforeUnloadRef = useRef<((e: BeforeUnloadEvent) => void) | null>(null);
  const contactNameRef = useRef<string>('');
  const contactIdRef = useRef<string>('');

  const contacts = useContactStore((s) => s.contacts);
  const subscribeToContacts = useContactStore((s) => s.subscribeToContacts);
  const contact = useMemo(
    () =>
      contacts.find(
        (c) => (contactId && c.id === contactId) || (roomId && c.jitsiRoomId === roomId),
      ),
    [contacts, contactId, roomId],
  );

  // Ensure contacts are loaded (handles direct URL navigation / incoming call)
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    return subscribeToContacts(uid);
  }, [subscribeToContacts]);

  const writeHistory = useCallback(async () => {
    if (historyWrittenRef.current) return;
    historyWrittenRef.current = true; // Set FIRST, synchronously — prevents concurrent calls
    const uid = auth.currentUser?.uid;
    if (!uid || !callStartTimeRef.current) {
      historyWrittenRef.current = false; // Reset — prerequisites not met
      return;
    }
    const startMs = callStartTimeRef.current;
    const endMs = Date.now();
    const durationSec = Math.floor((endMs - startMs) / 1000);
    try {
      await writeCallHistoryEntry(uid, {
        contactId: contactIdRef.current,
        contactName: contactNameRef.current,
        direction: 'outgoing',
        outcome: 'completed',
        duration: durationSec,
        startedAt: Timestamp.fromMillis(startMs),
        endedAt: Timestamp.fromMillis(endMs),
      });
    } catch {
      historyWrittenRef.current = false; // Reset on failure so retry is possible
    }
  }, []);

  useEffect(() => {
    if (!contact) return;
    const { jitsiRoomId, name: contactName } = contact;

    let mounted = true;

    async function startCall() {
      try {
        const user = await ensureAuthenticated();
        await loadJitsiApi();

        const functions = getFunctions(app);
        const generateJwt = httpsCallable<
          { roomName: string; displayName: string },
          { token: string }
        >(functions, 'generateJitsiJwt');

        const displayName = user.displayName ?? 'User';
        const { data } = await generateJwt({
          roomName: jitsiRoomId,
          displayName,
        });

        if (!mounted || !containerRef.current) return;

        const appId = getJaasAppId();
        const api = new window.JitsiMeetExternalAPI('8x8.vc', {
          roomName: `${appId}/${jitsiRoomId}`,
          parentNode: containerRef.current,
          jwt: data.token,
          configOverwrite: {
            toolbarButtons: [],
            prejoinConfig: { enabled: false },
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
          },
        });

        apiRef.current = api;
        callStartTimeRef.current = Date.now();
        contactNameRef.current = contactName;
        contactIdRef.current = contact!.id;
        setInCall?.(true);

        if (user.uid) {
          void setActiveCall(user.uid, {
            contactId: contact!.id,
            contactName: contactName,
            jitsiRoomId,
            startedAt: Timestamp.now(),
          });
        }

        beforeUnloadRef.current = (e: BeforeUnloadEvent) => {
          e.preventDefault();
          e.returnValue = '';
        };
        window.addEventListener('beforeunload', beforeUnloadRef.current);

        api.addListener('audioMuteStatusChanged', (eventData: unknown) => {
          const d = eventData as { muted: boolean };
          setAudioMuted(d.muted);
        });

        api.addListener('videoMuteStatusChanged', (eventData: unknown) => {
          const d = eventData as { muted: boolean };
          setVideoMuted(d.muted);
        });

        api.addListener('readyToClose', () => {
          void writeHistory();
          if (mounted) void navigate('/elderly');
        });

        let participantCount = 0;
        api.addListener('participantJoined', () => {
          participantCount += 1;
          if (autoNavigateTimerRef.current) {
            clearTimeout(autoNavigateTimerRef.current);
            autoNavigateTimerRef.current = null;
          }
          setCallEnded(false);
        });

        api.addListener('participantLeft', () => {
          participantCount = Math.max(0, participantCount - 1);
          if (participantCount === 0) {
            setCallEnded(true);
            autoNavigateTimerRef.current = setTimeout(() => {
              void writeHistory();
              if (mounted) void navigate('/elderly');
            }, 3000);
          }
        });

        let prevQuality: ConnectionQuality | null = null;
        api.addListener('connectionQuality', (eventData: unknown) => {
          const d = eventData as { local: boolean; quality: number };
          if (d.local) {
            const quality = mapConnectionQuality(d.quality);
            if (quality === prevQuality) return;
            prevQuality = quality;
            setConnectionQuality(quality);
            if (quality === 'poor') {
              setShowWeakSignalBanner(true);
              if (!weakSignalTimerRef.current) {
                weakSignalTimerRef.current = setTimeout(() => {
                  setShowWeakSignalBanner(false);
                  weakSignalTimerRef.current = null;
                }, WEAK_SIGNAL_BANNER_DURATION_MS);
              }
            } else {
              setShowWeakSignalBanner(false);
              if (weakSignalTimerRef.current) {
                clearTimeout(weakSignalTimerRef.current);
                weakSignalTimerRef.current = null;
              }
            }
          }
        });

        if (mounted) setLoading(false);
      } catch {
        if (mounted) setLoading(false);
      }
    }

    void startCall();

    return () => {
      mounted = false;
      setInCall?.(false);
      if (beforeUnloadRef.current) {
        window.removeEventListener('beforeunload', beforeUnloadRef.current);
      }
      if (autoNavigateTimerRef.current) {
        clearTimeout(autoNavigateTimerRef.current);
        autoNavigateTimerRef.current = null;
      }
      if (weakSignalTimerRef.current) {
        clearTimeout(weakSignalTimerRef.current);
        weakSignalTimerRef.current = null;
      }
      if (apiRef.current) {
        apiRef.current.dispose();
        apiRef.current = null;
      }
    };
  }, [contact, navigate, setInCall, writeHistory]);

  const handleHangup = () => {
    void writeHistory();
    const uid = auth.currentUser?.uid;
    if (uid) void clearActiveCall(uid);
    apiRef.current?.executeCommand('hangup');
    void navigate('/elderly');
  };

  const handleToggleAudio = () => {
    apiRef.current?.executeCommand('toggleAudio');
  };

  const handleToggleVideo = () => {
    apiRef.current?.executeCommand('toggleVideo');
  };

  if (!contact) {
    return (
      <div className="min-h-screen bg-base-100 flex items-center justify-center">
        <EasyCallText variant="body">{t('call.contactNotFound')}</EasyCallText>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col relative">
      {loading && (
        <div className="absolute inset-0 bg-base-100 flex items-center justify-center z-10">
          <div role="status" aria-label={t('call.connecting')}>
            <span className="loading loading-spinner loading-lg text-primary" aria-hidden="true" />
            <span className="sr-only">{t('call.connectingWith', { name: contact.name })}</span>
          </div>
        </div>
      )}

      {callEnded && (
        <div className="absolute inset-0 bg-base-100 flex items-center justify-center z-10">
          <EasyCallText as="h2" variant="heading">
            {t('call.ended')}
          </EasyCallText>
        </div>
      )}

      {!loading && !callEnded && (
        <ConnectionQualityIndicator quality={connectionQuality} className="absolute top-4 start-4 z-10" />
      )}

      {showWeakSignalBanner && !callEnded && !loading && (
        <div
          role="alert"
          className="absolute top-4 start-14 end-4 z-10 bg-error/90 text-error-content rounded-lg px-4 py-2 text-center"
        >
          <EasyCallText variant="body">{t('connection.weakSignal')}</EasyCallText>
        </div>
      )}

      {/* Jitsi iframe container */}
      <div
        ref={containerRef}
        className="flex-1"
        role="region"
        aria-label={t('call.videoCallArea')}
      />

      {/* Overlay call controls */}
      <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent flex justify-center gap-6">
        <EasyCallButton
          variant="secondary"
          size="large"
          onClick={handleToggleAudio}
          aria-label={audioMuted ? t('call.unmuteMic') : t('call.muteMic')}
        >
          <Icon name={audioMuted ? 'mic-off' : 'mic'} size={28} />
        </EasyCallButton>

        <EasyCallButton
          variant="danger"
          size="call"
          onClick={handleHangup}
          aria-label={t('call.endCall')}
        >
          <Icon name="phone-end" size={32} />
        </EasyCallButton>

        <EasyCallButton
          variant="secondary"
          size="large"
          onClick={handleToggleVideo}
          aria-label={videoMuted ? t('call.cameraOn') : t('call.cameraOff')}
        >
          <Icon name={videoMuted ? 'camera-off' : 'camera'} size={28} />
        </EasyCallButton>
      </div>
    </div>
  );
}
