import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadJitsiApi, getJaasAppId } from '@/services/jitsi';
import { parseDirectLinkFragment } from '@/utils/parseDirectLinkFragment';
import { EasyCallButton } from '@/components/shared/EasyCallButton';
import { EasyCallText } from '@/components/shared/EasyCallText';
import { Icon } from '@/components/shared/Icon';
import { ConnectionQualityIndicator } from '@/components/shared/ConnectionQualityIndicator';
import { mapConnectionQuality } from '@/components/shared/connectionQualityStyles';
import type { ConnectionQuality } from '@/components/shared/connectionQualityStyles';
import type { JitsiMeetExternalAPI } from '@/types/jitsi';

const WEAK_SIGNAL_BANNER_DURATION_MS = 5000;
const CONFERENCE_JOIN_TIMEOUT_MS = 30_000;
const REACHABILITY_TIMEOUT_MS = 5_000;
const CONTROLS_SAFE_AREA_STYLE = { paddingBottom: 'max(1.5rem, var(--safe-bottom, 0px))' };

/**
 * Firebase-free call screen for restricted network users.
 * Reads JWT, room ID, and contact name from the URL fragment.
 * Only communicates with 8x8.vc (Jitsi) — zero Google/Firebase traffic.
 */
export function DirectCallScreen() {
  const { t } = useTranslation();
  const apiRef = useRef<JitsiMeetExternalAPI | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const weakSignalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const relayedJwtRef = useRef<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality | null>(null);
  const [showWeakSignalBanner, setShowWeakSignalBanner] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const params = parseDirectLinkFragment(window.location.hash);
  const paramToken = params?.token;
  const paramRoom = params?.room;

  const startJitsiCall = useCallback(
    async (
      token: string,
      room: string,
      container: HTMLDivElement,
    ): Promise<JitsiMeetExternalAPI> => {
      // Quick reachability check
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

      const appId = getJaasAppId();
      const api = new window.JitsiMeetExternalAPI('8x8.vc', {
        roomName: `${appId}/${room}`,
        parentNode: container,
        jwt: token,
        configOverwrite: {
          toolbarButtons: [],
          prejoinConfig: { enabled: false },
          // Force relay mode — these users are on restricted networks
          p2p: { enabled: false },
          webrtcIceTransportPolicy: 'relay',
          openBridgeChannel: 'websocket',
        },
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK: false,
        },
      });

      return api;
    },
    [],
  );

  useEffect(() => {
    if (!paramToken || !paramRoom) return;

    const token = paramToken;
    const room = paramRoom;
    let mounted = true;
    let conferenceJoinTimer: ReturnType<typeof setTimeout> | undefined;

    async function init() {
      try {
        if (!containerRef.current) return;

        const api = await startJitsiCall(token, room, containerRef.current);
        if (!mounted) {
          api.dispose();
          return;
        }

        apiRef.current = api;

        window.addEventListener('beforeunload', preventUnload);

        api.addListener('audioMuteStatusChanged', (d: unknown) => {
          setAudioMuted((d as { muted: boolean }).muted);
        });
        api.addListener('videoMuteStatusChanged', (d: unknown) => {
          setVideoMuted((d as { muted: boolean }).muted);
        });

        // JWT relay: receive fresh JWTs from the contact via data channel
        api.addListener('endpointTextMessageReceived', (d: unknown) => {
          try {
            const evt = d as { data?: { text?: string } };
            const text = evt.data?.text;
            if (!text) return;
            const parsed = JSON.parse(text) as { type?: string; token?: string };
            if (parsed.type === 'jwt-refresh' && typeof parsed.token === 'string') {
              relayedJwtRef.current = parsed.token;
            }
          } catch {
            // Ignore malformed messages
          }
        });

        api.addListener('readyToClose', () => {
          if (mounted) setCallEnded(true);
        });

        let participantCount = 0;
        api.addListener('participantJoined', () => {
          participantCount += 1;
          if (autoEndTimerRef.current) {
            clearTimeout(autoEndTimerRef.current);
            autoEndTimerRef.current = null;
          }
          setCallEnded(false);
        });

        api.addListener('participantLeft', () => {
          participantCount = Math.max(0, participantCount - 1);
          if (participantCount === 0) {
            setCallEnded(true);
            autoEndTimerRef.current = setTimeout(() => {
              if (apiRef.current) {
                apiRef.current.dispose();
                apiRef.current = null;
              }
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

        api.addListener('videoConferenceJoined', () => {
          clearTimeout(conferenceJoinTimer);
          if (mounted) {
            setLoading(false);
            setError(null);
          }
        });

        conferenceJoinTimer = setTimeout(() => {
          if (mounted) {
            if (apiRef.current) {
              apiRef.current.dispose();
              apiRef.current = null;
            }
            setLoading(false);
            setError(t('directCall.connectionFailed'));
          }
        }, CONFERENCE_JOIN_TIMEOUT_MS);
      } catch {
        if (mounted) {
          setLoading(false);
          setError(t('directCall.connectionFailed'));
        }
      }
    }

    void init();

    return () => {
      mounted = false;
      clearTimeout(conferenceJoinTimer);
      window.removeEventListener('beforeunload', preventUnload);
      if (autoEndTimerRef.current) {
        clearTimeout(autoEndTimerRef.current);
        autoEndTimerRef.current = null;
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
  }, [paramToken, paramRoom, startJitsiCall, retryCount, t]);

  const handleHangup = () => {
    apiRef.current?.executeCommand('hangup');
    setCallEnded(true);
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
    setCallEnded(false);
    setRetryCount((c) => c + 1);
  }, []);

  const handleReconnect = useCallback(() => {
    // Use relayed JWT if available, otherwise fall back to original
    if (relayedJwtRef.current && params) {
      // Update the hash so the effect re-runs with the new token
      const newHash = `#token=${relayedJwtRef.current}&room=${params.room}&name=${encodeURIComponent(params.name)}`;
      window.location.hash = newHash;
    }
    handleRetry();
  }, [handleRetry, params]);

  // Invalid or missing link params
  if (!params) {
    return (
      <div className="min-h-screen bg-base-100 flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <Icon name="phone-end" size={48} className="text-error" aria-hidden />
          <EasyCallText as="h1" variant="heading">
            {t('directCall.invalidLink')}
          </EasyCallText>
        </div>
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
              {params.name
                ? t('directCall.connectingWith', { name: params.name })
                : t('directCall.connecting')}
            </EasyCallText>
          </div>
        </div>
      )}

      {callEnded && !loading && !error && (
        <div className="absolute inset-0 bg-base-100 flex items-center justify-center z-10">
          <div className="flex flex-col items-center gap-6">
            <EasyCallText as="h2" variant="heading">
              {t('directCall.ended')}
            </EasyCallText>
            <EasyCallButton variant="primary" size="large" onClick={handleReconnect}>
              {t('directCall.startNewCall')}
            </EasyCallButton>
          </div>
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
        aria-label={t('directCall.videoCallArea')}
      />

      {/* Overlay call controls */}
      {!error && !callEnded && (
        <div
          className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent flex justify-center gap-6"
          style={CONTROLS_SAFE_AREA_STYLE}
        >
          <EasyCallButton
            variant="secondary"
            size="large"
            onClick={handleToggleAudio}
            aria-label={audioMuted ? t('directCall.unmuteMic') : t('directCall.muteMic')}
          >
            <Icon name={audioMuted ? 'mic-off' : 'mic'} size={28} />
          </EasyCallButton>

          <EasyCallButton
            variant="danger"
            size="call"
            onClick={handleHangup}
            aria-label={t('directCall.endCall')}
          >
            <Icon name="phone-end" size={32} />
          </EasyCallButton>

          <EasyCallButton
            variant="secondary"
            size="large"
            onClick={handleToggleVideo}
            aria-label={videoMuted ? t('directCall.cameraOn') : t('directCall.cameraOff')}
          >
            <Icon name={videoMuted ? 'camera-off' : 'camera'} size={28} />
          </EasyCallButton>
        </div>
      )}
    </div>
  );
}

function preventUnload(e: BeforeUnloadEvent) {
  e.preventDefault();
  e.returnValue = '';
}
