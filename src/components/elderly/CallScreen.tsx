import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Timestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, auth, ensureAuthenticated } from '@/services/firebase';
import { loadJitsiApi, getJaasAppId } from '@/services/jitsi';
import { setActiveCall, clearActiveCall, writeCallHistoryEntry } from '@/services/callHistory';
import { initiateCall, clearIncomingCallDoc } from '@/services/callSignaling';
import { useContactStore } from '@/stores/contactStore';
import { EasyCallButton } from '@/components/shared/EasyCallButton';
import { EasyCallText } from '@/components/shared/EasyCallText';
import { Icon } from '@/components/shared/Icon';
import { ConnectionQualityIndicator } from '@/components/shared/ConnectionQualityIndicator';
import { mapConnectionQuality } from '@/components/shared/connectionQualityStyles';
import type { ConnectionQuality } from '@/components/shared/connectionQualityStyles';
import type { JitsiMeetExternalAPI } from '@/types/jitsi';

const WEAK_SIGNAL_BANNER_DURATION_MS = 5000;
export const CONFERENCE_JOIN_TIMEOUT_MS = 30_000;
export const REACHABILITY_TIMEOUT_MS = 5_000;
const CONTROLS_SAFE_AREA_STYLE = { paddingBottom: 'max(1.5rem, var(--safe-bottom, 0px))' };

interface CallScreenProps {
  setInCall?: (inCall: boolean) => void;
  restrictedNetworkMode?: boolean;
}

export function CallScreen({ setInCall, restrictedNetworkMode }: CallScreenProps) {
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
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const weakSignalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const callStartTimeRef = useRef<number | null>(null);
  const historyWrittenRef = useRef(false);
  const beforeUnloadRef = useRef<((e: BeforeUnloadEvent) => void) | null>(null);
  const contactNameRef = useRef<string>('');
  const contactIdRef = useRef<string>('');
  const contactUserIdRef = useRef<string>('');
  const restrictedNetworkRef = useRef(restrictedNetworkMode);
  useEffect(() => {
    restrictedNetworkRef.current = restrictedNetworkMode;
  }, [restrictedNetworkMode]);

  const contacts = useContactStore((s) => s.contacts);
  const subscribeToContacts = useContactStore((s) => s.subscribeToContacts);
  const contact = useMemo(
    () =>
      contacts.find(
        (c) => (contactId && c.id === contactId) || (roomId && c.jitsiRoomId === roomId),
      ),
    [contacts, contactId, roomId],
  );

  // Keep a ref to the contact so callbacks inside the startCall effect can read
  // up-to-date values without the effect itself re-running on every snapshot.
  const contactRef = useRef(contact);
  useEffect(() => {
    contactRef.current = contact;
  }, [contact]);

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

  // Snapshot the contact fields at mount time. The effect depends on the
  // contact's id (a stable string), NOT the contact object reference. This
  // prevents Firestore onSnapshot updates from destroying and re-creating the
  // Jitsi conference on every contacts-collection change.
  const contactIdStable = contact?.id;
  const jitsiRoomIdStable = contact?.jitsiRoomId;

  useEffect(() => {
    if (!contactIdStable || !jitsiRoomIdStable) return;

    // Read remaining contact values from the ref — they are only needed for
    // one-time operations (signaling, history) and must not trigger re-runs.
    const c = contactRef.current!;
    const contactName = c.name;
    const contactDocId = c.id;
    const contactUserId = c.contactUserId;
    const jitsiRoomId = jitsiRoomIdStable;

    let mounted = true;
    let conferenceJoinTimer: ReturnType<typeof setTimeout> | undefined;

    async function startCall() {
      try {
        const user = await ensureAuthenticated();

        // Quick reachability check — fails fast if 8x8.vc is blocked
        const reachController = new AbortController();
        const reachTimer = setTimeout(() => reachController.abort(), REACHABILITY_TIMEOUT_MS);
        try {
          await fetch('https://8x8.vc/favicon.ico', {
            mode: 'no-cors',
            signal: reachController.signal,
          });
        } catch {
          clearTimeout(reachTimer);
          throw new Error('8x8.vc is not reachable');
        } finally {
          clearTimeout(reachTimer);
        }

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
        const configOverwrite: Record<string, unknown> = {
          toolbarButtons: [],
          prejoinConfig: { enabled: false },
        };
        if (restrictedNetworkRef.current) {
          configOverwrite['p2p'] = { enabled: false };
          configOverwrite['webrtcIceTransportPolicy'] = 'relay';
          configOverwrite['openBridgeChannel'] = 'websocket';
        }
        const api = new window.JitsiMeetExternalAPI('8x8.vc', {
          roomName: `${appId}/${jitsiRoomId}`,
          parentNode: containerRef.current,
          jwt: data.token,
          configOverwrite,
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
          },
        });

        apiRef.current = api;
        callStartTimeRef.current = Date.now();
        contactNameRef.current = contactName;
        contactIdRef.current = contactDocId;
        contactUserIdRef.current = contactUserId;
        setInCall?.(true);

        if (user.uid) {
          void setActiveCall(user.uid, {
            contactId: contactDocId,
            contactName: contactName,
            jitsiRoomId,
            startedAt: Timestamp.now(),
          });

          // Signal the contact that they have an incoming call (outgoing calls only).
          // When answering via /call-room/:roomId, contactId is absent — skip signaling
          // to avoid ringing the original caller back.
          if (contactId && contactUserId) {
            void initiateCall({
              elderlyUserId: contactUserId,
              callerId: user.uid,
              callerName: displayName,
              callerPhotoURL: user.photoURL ?? undefined,
              jitsiRoomId,
            });
          }
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
          const cleanup: Promise<unknown>[] = [writeHistory(), clearActiveCall(user.uid)];
          if (contactId && contactUserId) cleanup.push(clearIncomingCallDoc(contactUserId));
          void Promise.all(cleanup).then(() => {
            if (mounted) void navigate('/elderly');
          });
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
              // Clear activeCall only after the 3-second grace period — if the
              // participant reconnects during this window, the timer is cancelled
              // by participantJoined and the activeCall doc stays intact.
              void Promise.all([writeHistory(), clearActiveCall(user.uid)]).then(() => {
                if (mounted) void navigate('/elderly');
              });
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
              // Auto-mute video to preserve audio bandwidth
              void api.isVideoMuted().then((muted) => {
                if (!muted) api.executeCommand('toggleVideo');
              });
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

        // Wait for the conference to actually join before hiding the spinner
        api.addListener('videoConferenceJoined', () => {
          clearTimeout(conferenceJoinTimer);
          if (mounted) {
            setLoading(false);
            setError(null);
          }
        });

        conferenceJoinTimer = setTimeout(() => {
          if (mounted) {
            setLoading(false);
            setError(t('call.connectionFailed'));
          }
        }, CONFERENCE_JOIN_TIMEOUT_MS);
      } catch {
        if (mounted) {
          setLoading(false);
          setError(t('call.connectionFailed'));
        }
      }
    }

    void startCall();

    return () => {
      mounted = false;
      clearTimeout(conferenceJoinTimer);
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
    // restrictedNetworkMode is read via ref — changing it mid-call must not remount the conference
    // contact fields (name, contactUserId) are read via contactRef — snapshot updates must not
    // destroy the active Jitsi conference
  }, [
    contactIdStable,
    jitsiRoomIdStable,
    contactId,
    navigate,
    setInCall,
    writeHistory,
    retryCount,
  ]);

  const handleHangup = () => {
    void writeHistory();
    const uid = auth.currentUser?.uid;
    if (uid) void clearActiveCall(uid);
    // Clean up incoming call signaling for the contact (outgoing calls only)
    if (contactId && contactUserIdRef.current) void clearIncomingCallDoc(contactUserIdRef.current);
    apiRef.current?.executeCommand('hangup');
    void navigate('/elderly');
  };

  const handleToggleAudio = () => {
    apiRef.current?.executeCommand('toggleAudio');
  };

  const handleToggleVideo = () => {
    apiRef.current?.executeCommand('toggleVideo');
  };

  const handleRetry = useCallback(() => {
    setError(null);
    setLoading(true);
    setRetryCount((c) => c + 1);
  }, []);

  if (!contact) {
    return (
      <div className="min-h-screen bg-base-100 flex items-center justify-center">
        <EasyCallText variant="body">{t('call.contactNotFound')}</EasyCallText>
      </div>
    );
  }

  return (
    <div className="h-screen bg-black flex flex-col relative">
      {loading && (
        <div className="absolute inset-0 bg-base-100 flex items-center justify-center z-10">
          <div role="status" className="flex flex-col items-center gap-4">
            <span className="loading loading-spinner loading-lg text-primary" aria-hidden="true" />
            <EasyCallText as="p" variant="body" className="text-base-content">
              {t('call.connectingWith', { name: contact.name })}
            </EasyCallText>
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

      {error && !loading && (
        <div className="absolute inset-0 bg-base-100 flex items-center justify-center z-10">
          <div className="flex flex-col items-center gap-6 p-8 text-center">
            <Icon name="phone-end" size={48} className="text-error" aria-hidden />
            <EasyCallText as="p" variant="body" className="text-base-content">
              {error}
            </EasyCallText>
            <EasyCallButton variant="primary" size="large" onClick={handleRetry}>
              {t('common.retry')}
            </EasyCallButton>
          </div>
        </div>
      )}

      {!loading && !callEnded && !error && (
        <ConnectionQualityIndicator
          quality={connectionQuality}
          className="absolute top-4 start-4 z-10"
        />
      )}

      {showWeakSignalBanner && !callEnded && !loading && !error && (
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
        className="flex-1 [&>iframe]:w-full [&>iframe]:h-full"
        role="region"
        aria-label={t('call.videoCallArea')}
      />

      {/* Overlay call controls */}
      {!error && (
        <div
          className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent flex justify-center gap-6"
          style={CONTROLS_SAFE_AREA_STYLE}
        >
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
      )}
    </div>
  );
}
