import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Timestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, auth } from '@/services/firebase';
import { loadJitsiApi } from '@/services/jitsi';
import { setActiveCall, clearActiveCall, writeCallHistoryEntry } from '@/services/callHistory';
import { useContactStore } from '@/stores/contactStore';
import { EasyCallButton } from '@/components/shared/EasyCallButton';
import { EasyCallText } from '@/components/shared/EasyCallText';
import type { JitsiMeetExternalAPI } from '@/types/jitsi';

export function CallScreen() {
  const { contactId } = useParams<{ contactId: string }>();
  const navigate = useNavigate();
  const apiRef = useRef<JitsiMeetExternalAPI | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoNavigateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(true);
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const [callEnded, setCallEnded] = useState(false);

  const callStartTimeRef = useRef<number | null>(null);
  const historyWrittenRef = useRef(false);
  const beforeUnloadRef = useRef<((e: BeforeUnloadEvent) => void) | null>(null);
  const contactNameRef = useRef<string>('');

  const contacts = useContactStore((s) => s.contacts);
  // Derive contact for rendering; effect uses stable contactId to avoid re-running on snapshots
  const contact = contacts.find((c) => c.id === contactId);

  // Shared helper to write a single call history entry (guarded by ref to prevent double-writes)
  function writeHistory() {
    if (historyWrittenRef.current) return;
    historyWrittenRef.current = true;
    const uid = auth.currentUser?.uid;
    if (!uid || !callStartTimeRef.current) return;
    const startMs = callStartTimeRef.current;
    const endMs = Date.now();
    const durationSec = Math.floor((endMs - startMs) / 1000);
    void writeCallHistoryEntry(uid, {
      contactId: contactId ?? '',
      contactName: contactNameRef.current,
      direction: 'outgoing',
      outcome: 'completed',
      duration: durationSec,
      startedAt: Timestamp.fromMillis(startMs),
      endedAt: Timestamp.fromMillis(endMs),
    });
  }

  useEffect(() => {
    // Reference contact by id (stable string) rather than the contact object,
    // so snapshot refreshes (which create new contact objects) don't re-run this effect.
    const currentContact = contacts.find((c) => c.id === contactId);
    if (!currentContact) return;
    const { jitsiRoomId, name: contactName } = currentContact;

    let mounted = true;

    async function startCall() {
      try {
        await loadJitsiApi();

        const functions = getFunctions(app);
        const generateJwt = httpsCallable<
          { roomName: string; displayName: string },
          { token: string }
        >(functions, 'generateJitsiJwt');

        const displayName = auth.currentUser?.displayName ?? 'User';
        const { data } = await generateJwt({
          roomName: jitsiRoomId,
          displayName,
        });

        if (!mounted || !containerRef.current) return;

        const api = new window.JitsiMeetExternalAPI('8x8.vc', {
          roomName: jitsiRoomId,
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

        // Write activeCall doc so HomeScreen can offer rejoin on disconnect
        const userId = auth.currentUser?.uid;
        if (userId) {
          void setActiveCall(userId, {
            contactId: contactId!,
            contactName: contactName,
            jitsiRoomId,
            startedAt: Timestamp.now(),
          });
        }

        // Warn user before closing tab during active call
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
          writeHistory();
          if (mounted) void navigate('/elderly');
        });

        let participantCount = 0;
        api.addListener('participantJoined', () => {
          participantCount += 1;
          // Cancel any pending auto-navigate in case the participant rejoined
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
              writeHistory();
              if (mounted) void navigate('/elderly');
            }, 3000);
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
      if (beforeUnloadRef.current) {
        window.removeEventListener('beforeunload', beforeUnloadRef.current);
      }
      if (autoNavigateTimerRef.current) {
        clearTimeout(autoNavigateTimerRef.current);
        autoNavigateTimerRef.current = null;
      }
      if (apiRef.current) {
        apiRef.current.dispose();
        apiRef.current = null;
      }
    };
  }, [contactId, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleHangup = () => {
    writeHistory();
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
        <EasyCallText variant="body">Contact not found</EasyCallText>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col relative">
      {loading && (
        <div className="absolute inset-0 bg-base-100 flex items-center justify-center z-10">
          <div role="status" aria-label="Connecting to call">
            <span className="loading loading-spinner loading-lg text-primary" aria-hidden="true" />
            <span className="sr-only">Connecting to call with {contact.name}...</span>
          </div>
        </div>
      )}

      {callEnded && (
        <div className="absolute inset-0 bg-base-100 flex items-center justify-center z-10">
          <EasyCallText as="h2" variant="heading">
            Call Ended
          </EasyCallText>
        </div>
      )}

      {/* Jitsi iframe container */}
      <div ref={containerRef} className="flex-1" role="region" aria-label="Video call area" />

      {/* Overlay call controls */}
      <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent flex justify-center gap-6">
        <EasyCallButton
          variant="secondary"
          size="large"
          onClick={handleToggleAudio}
          aria-label={audioMuted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {audioMuted ? '🎤✕' : '🎤'}
        </EasyCallButton>

        <EasyCallButton variant="danger" size="call" onClick={handleHangup} aria-label="End call">
          ✕
        </EasyCallButton>

        <EasyCallButton
          variant="secondary"
          size="large"
          onClick={handleToggleVideo}
          aria-label={videoMuted ? 'Turn on camera' : 'Turn off camera'}
        >
          {videoMuted ? '📷✕' : '📷'}
        </EasyCallButton>
      </div>
    </div>
  );
}
