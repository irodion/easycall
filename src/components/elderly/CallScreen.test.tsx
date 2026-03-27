import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, act, render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { MemoryRouter, Routes, Route } from 'react-router';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { createMockContact } from '@/test/helpers/factories';
import { MockJitsiMeetExternalAPI } from '@/test/mocks/jitsi';

const mockSetActiveCall = vi.fn().mockResolvedValue(undefined);
const mockClearActiveCall = vi.fn().mockResolvedValue(undefined);
const mockWriteCallHistoryEntry = vi.fn().mockResolvedValue('call-id');

vi.mock('@/services/callHistory', () => ({
  setActiveCall: (...args: unknown[]) => mockSetActiveCall(...args),
  clearActiveCall: (...args: unknown[]) => mockClearActiveCall(...args),
  writeCallHistoryEntry: (...args: unknown[]) => mockWriteCallHistoryEntry(...args),
}));

const mockClearIncomingCallDoc = vi.fn().mockResolvedValue(undefined);
const mockInitiateCall = vi.fn().mockResolvedValue(undefined);

vi.mock('@/services/callSignaling', () => ({
  initiateCall: (...args: unknown[]) => mockInitiateCall(...args),
  clearIncomingCallDoc: (...args: unknown[]) => mockClearIncomingCallDoc(...args),
}));

const mockLoadJitsiApi = vi.fn().mockResolvedValue(undefined);

vi.mock('@/services/jitsi', () => ({
  loadJitsiApi: (...args: unknown[]) => mockLoadJitsiApi(...args),
  getJaasAppId: vi.fn().mockReturnValue('vpaas-magic-cookie-test123'),
}));

vi.mock('firebase/firestore', () => ({
  Timestamp: {
    now: () => ({ seconds: 1000, nanoseconds: 0, toDate: () => new Date() }),
    fromMillis: (ms: number) => ({
      seconds: Math.floor(ms / 1000),
      nanoseconds: 0,
      toDate: () => new Date(ms),
    }),
  },
  doc: vi.fn().mockReturnValue('doc-ref'),
  setDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
}));

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn().mockReturnValue({}),
  httpsCallable: vi.fn(() => vi.fn().mockResolvedValue({ data: { token: 'mock-jwt' } })),
}));

vi.mock('@/services/firebase', () => ({
  app: {},
  auth: { currentUser: { uid: 'user-1', displayName: 'Elderly User' } },
  db: {},
  ensureAuthenticated: vi.fn().mockResolvedValue({ uid: 'user-1', displayName: 'Elderly User' }),
}));

const mockContact = createMockContact({
  id: 'contact-1',
  name: 'Alice',
  jitsiRoomId: 'easycall-alice-abc123',
});

const mockSubscribeToContacts = vi.fn().mockReturnValue(() => {});

vi.mock('@/stores/contactStore', () => ({
  useContactStore: vi.fn((selector) =>
    selector({
      contacts: [mockContact],
      loading: false,
      error: null,
      subscribeToContacts: mockSubscribeToContacts,
      addContact: vi.fn(),
      removeContact: vi.fn(),
      fetchContacts: vi.fn(),
    }),
  ),
}));

describe('CallScreen', () => {
  let lastApiInstance: MockJitsiMeetExternalAPI | null = null;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    lastApiInstance = null;

    // Mock fetch for the network pre-check (all tests need this)
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());

    // Capture the MockJitsiMeetExternalAPI instance when CallScreen creates it.
    // Override dispose() to preserve commands so tests can inspect them after hangup/unmount.
    // Auto-emit videoConferenceJoined after 10ms so loading completes — mocked async ops
    // (ensureAuthenticated, loadJitsiApi, generateJwt) resolve as microtasks, so listeners
    // are registered before the 10ms timer fires.
    const OriginalMock = MockJitsiMeetExternalAPI;
    window.JitsiMeetExternalAPI = class extends OriginalMock {
      constructor(domain: string, options: never) {
        super(domain, options);
        lastApiInstance = this as unknown as MockJitsiMeetExternalAPI;
        setTimeout(() => {
          (this as unknown as MockJitsiMeetExternalAPI)._emit('videoConferenceJoined', {});
        }, 10);
      }
      dispose(): void {
        // Don't clear — keep listeners/commands so tests can inspect post-dispose
      }
    } as unknown as typeof window.JitsiMeetExternalAPI;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const mockSetInCall = vi.fn();

  async function renderLoaded(
    path = '/call/contact-1',
    options?: { setInCall?: (inCall: boolean) => void; restrictedNetworkMode?: boolean },
  ) {
    const { CallScreen } = await import('./CallScreen');
    const setInCall = options?.setInCall;
    const restrictedNetworkMode = options?.restrictedNetworkMode;
    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(
        <I18nextProvider i18n={i18n}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route
                path="/call/:contactId"
                element={
                  <CallScreen setInCall={setInCall} restrictedNetworkMode={restrictedNetworkMode} />
                }
              />
              <Route
                path="/call-room/:roomId"
                element={
                  <CallScreen setInCall={setInCall} restrictedNetworkMode={restrictedNetworkMode} />
                }
              />
            </Routes>
          </MemoryRouter>
        </I18nextProvider>,
      );
      // Wait for async operations (auth, fetch, JWT, API creation) to settle
      await new Promise((r) => setTimeout(r, 50));
    });
    // Flush any pending state updates from the auto-emitted videoConferenceJoined event
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    return result!;
  }

  it('creates JitsiMeetExternalAPI with domain 8x8.vc', async () => {
    await renderLoaded();
    expect(lastApiInstance).not.toBeNull();
    expect(lastApiInstance?.domain).toBe('8x8.vc');
  });

  it('prefixes roomName with JaaS AppID', async () => {
    await renderLoaded();
    expect(lastApiInstance?.options?.roomName).toBe(
      'vpaas-magic-cookie-test123/easycall-alice-abc123',
    );
  });

  it('passes jwt token to Jitsi', async () => {
    await renderLoaded();
    expect(lastApiInstance?.options?.jwt).toBe('mock-jwt');
  });

  it('config has empty toolbarButtons and prejoin disabled', async () => {
    await renderLoaded();
    const config = lastApiInstance?.options?.configOverwrite;
    expect((config?.['toolbarButtons'] as unknown[])?.length).toBe(0);
    expect((config?.['prejoinConfig'] as Record<string, unknown>)?.['enabled']).toBe(false);
  });

  it('does not apply restricted network config by default', async () => {
    await renderLoaded();
    const config = lastApiInstance?.options?.configOverwrite;
    expect(config?.['p2p']).toBeUndefined();
    expect(config?.['webrtcIceTransportPolicy']).toBeUndefined();
    expect(config?.['openBridgeChannel']).toBeUndefined();
  });

  it('applies restricted network config when restrictedNetworkMode is true', async () => {
    await renderLoaded('/call/contact-1', { restrictedNetworkMode: true });
    const config = lastApiInstance?.options?.configOverwrite;
    expect((config?.['p2p'] as Record<string, unknown>)?.['enabled']).toBe(false);
    expect(config?.['webrtcIceTransportPolicy']).toBe('relay');
    expect(config?.['openBridgeChannel']).toBe('websocket');
  });

  it('renders end call button', async () => {
    await renderLoaded();
    expect(screen.getByRole('button', { name: /end call/i })).toBeInTheDocument();
  });

  it('end call button has danger variant (btn-error class)', async () => {
    await renderLoaded();
    const btn = screen.getByRole('button', { name: /end call/i });
    expect(btn.className).toContain('btn-error');
  });

  it('renders mic button with accessible aria-label', async () => {
    await renderLoaded();
    expect(screen.getByRole('button', { name: /microphone|mute audio/i })).toBeInTheDocument();
  });

  it('renders camera button with accessible aria-label', async () => {
    await renderLoaded();
    expect(screen.getByRole('button', { name: /camera|video/i })).toBeInTheDocument();
  });

  it('clicking mic button calls executeCommand toggleAudio', async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: /microphone|mute audio/i }));
    const cmds = lastApiInstance?.getExecutedCommands() ?? [];
    expect(cmds.some((c) => c.command === 'toggleAudio')).toBe(true);
  });

  it('clicking camera button calls executeCommand toggleVideo', async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: /camera|video/i }));
    const cmds = lastApiInstance?.getExecutedCommands() ?? [];
    expect(cmds.some((c) => c.command === 'toggleVideo')).toBe(true);
  });

  it('clicking end call calls hangup command', async () => {
    await renderLoaded();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /end call/i }));
      await new Promise((r) => setTimeout(r, 50));
    });
    const cmds = lastApiInstance?.getExecutedCommands() ?? [];
    expect(cmds.some((c) => c.command === 'hangup')).toBe(true);
  });

  it('passes vitest-axe accessibility check', async () => {
    const { container } = await renderLoaded();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('calls setActiveCall after Jitsi API creation', async () => {
    await renderLoaded();
    expect(mockSetActiveCall).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        contactId: 'contact-1',
        contactName: 'Alice',
        jitsiRoomId: 'easycall-alice-abc123',
      }),
    );
  });

  it('does not clear activeCall on unmount (preserves for rejoin)', async () => {
    const { unmount } = await renderLoaded();
    mockClearActiveCall.mockClear();
    await act(async () => {
      unmount();
    });
    expect(mockClearActiveCall).not.toHaveBeenCalled();
  });

  it('calls clearActiveCall on explicit hangup', async () => {
    await renderLoaded();
    mockClearActiveCall.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /end call/i }));
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(mockClearActiveCall).toHaveBeenCalledWith('user-1');
  });

  it('adds beforeunload handler during active call', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    await renderLoaded();
    const calls = addSpy.mock.calls as unknown as [string, unknown][];
    expect(calls.some(([event]) => event === 'beforeunload')).toBe(true);
    addSpy.mockRestore();
  });

  it('removes beforeunload handler on cleanup', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = await renderLoaded();
    await act(async () => {
      unmount();
    });
    const calls = removeSpy.mock.calls as unknown as [string, unknown][];
    expect(calls.some(([event]) => event === 'beforeunload')).toBe(true);
    removeSpy.mockRestore();
  });

  it('writes call history entry on hangup', async () => {
    await renderLoaded();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /end call/i }));
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(mockWriteCallHistoryEntry).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        contactId: 'contact-1',
        contactName: 'Alice',
        direction: 'outgoing',
        outcome: 'completed',
      }),
    );
  });

  it('finds contact by roomId when accessed via /call-room/:roomId', async () => {
    await renderLoaded('/call-room/easycall-alice-abc123');
    // Should find the contact and create the Jitsi API (not show "contact not found")
    expect(lastApiInstance).not.toBeNull();
    expect(lastApiInstance?.options?.roomName).toBe(
      'vpaas-magic-cookie-test123/easycall-alice-abc123',
    );
  });

  it('subscribes to contacts on mount', async () => {
    mockSubscribeToContacts.mockClear();
    await renderLoaded();
    expect(mockSubscribeToContacts).toHaveBeenCalledWith('user-1');
  });

  it('does not write call history entry twice', async () => {
    await renderLoaded();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /end call/i }));
      await new Promise((r) => setTimeout(r, 50));
    });
    // The hangup writes history; cleanup should not write again
    expect(mockWriteCallHistoryEntry).toHaveBeenCalledTimes(1);
  });

  it('calls setInCall(true) on mount', async () => {
    mockSetInCall.mockClear();
    await renderLoaded('/call/contact-1', { setInCall: mockSetInCall });
    expect(mockSetInCall).toHaveBeenCalledWith(true);
  });

  it('calls setInCall(false) on unmount', async () => {
    mockSetInCall.mockClear();
    const { unmount } = await renderLoaded('/call/contact-1', { setInCall: mockSetInCall });
    mockSetInCall.mockClear();
    await act(async () => {
      unmount();
    });
    expect(mockSetInCall).toHaveBeenCalledWith(false);
  });

  it('works without setInCall prop (optional — no crash)', async () => {
    // Should not throw when setInCall is undefined
    await expect(renderLoaded('/call/contact-1')).resolves.toBeTruthy();
  });

  it('clears activeCall after 3s grace period when last participant leaves', async () => {
    await renderLoaded();
    mockClearActiveCall.mockClear();

    // Simulate: participant joins, then leaves — the other party hung up
    await act(async () => {
      lastApiInstance?._emit('participantJoined', {});
    });

    vi.useFakeTimers();
    try {
      await act(async () => {
        lastApiInstance?._emit('participantLeft', {});
      });

      // Not cleared immediately — grace period for transient disconnects
      expect(mockClearActiveCall).not.toHaveBeenCalled();

      // After the 3-second timer, activeCall is cleared
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      // Flush the Promise.all microtask
      await act(async () => {
        await Promise.resolve();
      });
      expect(mockClearActiveCall).toHaveBeenCalledWith('user-1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not clear activeCall if participant rejoins within grace period', async () => {
    await renderLoaded();
    mockClearActiveCall.mockClear();

    await act(async () => {
      lastApiInstance?._emit('participantJoined', {});
    });

    vi.useFakeTimers();
    try {
      await act(async () => {
        lastApiInstance?._emit('participantLeft', {});
      });

      // Participant reconnects before 3s
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      await act(async () => {
        lastApiInstance?._emit('participantJoined', {});
      });

      // Advance past original timer — should have been cancelled
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(mockClearActiveCall).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears activeCall and signaling doc on readyToClose event', async () => {
    await renderLoaded();
    mockClearActiveCall.mockClear();
    mockClearIncomingCallDoc.mockClear();

    await act(async () => {
      lastApiInstance?._emit('readyToClose', {});
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(mockClearActiveCall).toHaveBeenCalledWith('user-1');
    expect(mockClearIncomingCallDoc).toHaveBeenCalledWith(mockContact.contactUserId);
  });

  describe('connection quality indicator', () => {
    it('registers connectionQuality event listener', async () => {
      await renderLoaded();
      expect(lastApiInstance?.listeners.has('connectionQuality')).toBe(true);
    });

    it('shows good connection indicator on high quality', async () => {
      await renderLoaded();
      await act(async () => {
        lastApiInstance?._emit('connectionQuality', { local: true, quality: 85 });
      });
      expect(screen.getByRole('status', { name: /good connection/i })).toBeInTheDocument();
    });

    it('shows fair connection indicator', async () => {
      await renderLoaded();
      await act(async () => {
        lastApiInstance?._emit('connectionQuality', { local: true, quality: 50 });
      });
      expect(screen.getByRole('status', { name: /fair connection/i })).toBeInTheDocument();
    });

    it('shows poor connection indicator', async () => {
      await renderLoaded();
      await act(async () => {
        lastApiInstance?._emit('connectionQuality', { local: true, quality: 15 });
      });
      expect(screen.getByRole('status', { name: /poor connection/i })).toBeInTheDocument();
    });

    it('ignores remote quality events', async () => {
      await renderLoaded();
      await act(async () => {
        lastApiInstance?._emit('connectionQuality', { local: false, quality: 10 });
      });
      expect(screen.queryByRole('status', { name: /connection/i })).not.toBeInTheDocument();
    });

    it('shows weak signal banner when quality is poor', async () => {
      await renderLoaded();
      await act(async () => {
        lastApiInstance?._emit('connectionQuality', { local: true, quality: 15 });
      });
      expect(screen.getByRole('alert')).toHaveTextContent(/video quality reduced/i);
    });

    it('auto-dismisses weak signal banner after 5s', async () => {
      await renderLoaded();
      vi.useFakeTimers();
      try {
        await act(async () => {
          lastApiInstance?._emit('connectionQuality', { local: true, quality: 15 });
        });
        expect(screen.getByRole('alert')).toBeInTheDocument();
        await act(async () => {
          vi.advanceTimersByTime(5000);
        });
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it('clears weak signal banner when quality improves', async () => {
      await renderLoaded();
      await act(async () => {
        lastApiInstance?._emit('connectionQuality', { local: true, quality: 15 });
      });
      expect(screen.getByRole('alert')).toBeInTheDocument();
      await act(async () => {
        lastApiInstance?._emit('connectionQuality', { local: true, quality: 50 });
      });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('passes axe with connection indicator visible', async () => {
      const { container } = await renderLoaded();
      await act(async () => {
        lastApiInstance?._emit('connectionQuality', { local: true, quality: 50 });
      });
      expect(await axe(container)).toHaveNoViolations();
    }, 10000);
  });

  describe('error handling', () => {
    it('shows error message when loadJitsiApi rejects', async () => {
      mockLoadJitsiApi.mockRejectedValueOnce(new Error('timed out'));
      await renderLoaded();
      expect(screen.getByText(/could not connect/i)).toBeInTheDocument();
      expect(screen.queryByText(/connecting to call/i)).not.toBeInTheDocument();
    });

    it('shows retry button on failure', async () => {
      mockLoadJitsiApi.mockRejectedValueOnce(new Error('timed out'));
      await renderLoaded();
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    it('retry clears error and re-triggers call', async () => {
      mockLoadJitsiApi.mockRejectedValueOnce(new Error('timed out'));
      await renderLoaded();
      expect(screen.getByText(/could not connect/i)).toBeInTheDocument();

      // Second call will succeed (default mock resolves)
      mockLoadJitsiApi.mockResolvedValueOnce(undefined);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /retry/i }));
        await new Promise((r) => setTimeout(r, 50));
      });
      expect(screen.queryByText(/could not connect/i)).not.toBeInTheDocument();
      expect(lastApiInstance).not.toBeNull();
    });

    it('shows error when JWT generation fails', async () => {
      const { httpsCallable } = await import('firebase/functions');
      vi.mocked(httpsCallable).mockReturnValueOnce(
        vi.fn().mockRejectedValue(new Error('JWT error')) as never,
      );
      await renderLoaded();
      expect(screen.getByText(/could not connect/i)).toBeInTheDocument();
    });

    it('does not show call controls when error is displayed', async () => {
      mockLoadJitsiApi.mockRejectedValueOnce(new Error('timed out'));
      await renderLoaded();
      expect(screen.queryByRole('button', { name: /end call/i })).not.toBeInTheDocument();
    });

    it('error overlay passes axe check', async () => {
      mockLoadJitsiApi.mockRejectedValueOnce(new Error('timed out'));
      const { container } = await renderLoaded();
      expect(await axe(container)).toHaveNoViolations();
    }, 10000);
  });

  describe('conference join lifecycle', () => {
    /** Install a mock that does NOT auto-emit videoConferenceJoined */
    function installNoAutoEmitMock() {
      const OriginalMock = MockJitsiMeetExternalAPI;
      window.JitsiMeetExternalAPI = class extends OriginalMock {
        constructor(domain: string, options: never) {
          super(domain, options);
          lastApiInstance = this as unknown as MockJitsiMeetExternalAPI;
        }
        dispose(): void {}
      } as unknown as typeof window.JitsiMeetExternalAPI;
    }

    it('shows loading until videoConferenceJoined fires', async () => {
      installNoAutoEmitMock();
      await renderLoaded();
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText(/connecting/i)).toBeInTheDocument();
    });

    it('hides loading when videoConferenceJoined fires', async () => {
      installNoAutoEmitMock();
      await renderLoaded();
      expect(screen.getByRole('status')).toBeInTheDocument();
      await act(async () => {
        lastApiInstance?._emit('videoConferenceJoined', {});
      });
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('shows error after conference join timeout', async () => {
      installNoAutoEmitMock();
      vi.useFakeTimers();
      try {
        const { CallScreen, CONFERENCE_JOIN_TIMEOUT_MS } = await import('./CallScreen');
        await act(async () => {
          render(
            <I18nextProvider i18n={i18n}>
              <MemoryRouter initialEntries={['/call/contact-1']}>
                <Routes>
                  <Route path="/call/:contactId" element={<CallScreen />} />
                </Routes>
              </MemoryRouter>
            </I18nextProvider>,
          );
          await vi.advanceTimersByTimeAsync(50);
        });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(CONFERENCE_JOIN_TIMEOUT_MS);
        });
        expect(screen.getByText(/could not connect/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it('clears error overlay when conference joins after timeout', async () => {
      installNoAutoEmitMock();
      vi.useFakeTimers();
      try {
        const { CallScreen, CONFERENCE_JOIN_TIMEOUT_MS } = await import('./CallScreen');
        await act(async () => {
          render(
            <I18nextProvider i18n={i18n}>
              <MemoryRouter initialEntries={['/call/contact-1']}>
                <Routes>
                  <Route path="/call/:contactId" element={<CallScreen />} />
                </Routes>
              </MemoryRouter>
            </I18nextProvider>,
          );
          await vi.advanceTimersByTimeAsync(50);
        });
        // Trigger timeout
        await act(async () => {
          await vi.advanceTimersByTimeAsync(CONFERENCE_JOIN_TIMEOUT_MS);
        });
        expect(screen.getByText(/could not connect/i)).toBeInTheDocument();

        // Late join clears the error
        await act(async () => {
          lastApiInstance?._emit('videoConferenceJoined', {});
        });
        expect(screen.queryByText(/could not connect/i)).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('auto-disable video on poor connection', () => {
    it('auto-mutes video when quality is poor and video is on', async () => {
      await renderLoaded();
      await act(async () => {
        lastApiInstance?._emit('connectionQuality', { local: true, quality: 15 });
        await new Promise((r) => setTimeout(r, 10));
      });
      const cmds = lastApiInstance?.getExecutedCommands() ?? [];
      expect(cmds.some((c) => c.command === 'toggleVideo')).toBe(true);
    });

    it('does not auto-mute if video already muted', async () => {
      await renderLoaded();
      lastApiInstance!.isVideoMuted = () => Promise.resolve(true);
      await act(async () => {
        lastApiInstance?._emit('connectionQuality', { local: true, quality: 15 });
        await new Promise((r) => setTimeout(r, 10));
      });
      const cmds = lastApiInstance?.getExecutedCommands() ?? [];
      expect(cmds.some((c) => c.command === 'toggleVideo')).toBe(false);
    });

    it('does not auto-mute on fair quality', async () => {
      await renderLoaded();
      await act(async () => {
        lastApiInstance?._emit('connectionQuality', { local: true, quality: 50 });
        await new Promise((r) => setTimeout(r, 10));
      });
      const cmds = lastApiInstance?.getExecutedCommands() ?? [];
      expect(cmds.some((c) => c.command === 'toggleVideo')).toBe(false);
    });
  });

  describe('network pre-check', () => {
    it('proceeds when 8x8.vc is reachable', async () => {
      await renderLoaded();
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://8x8.vc/favicon.ico',
        expect.objectContaining({ mode: 'no-cors' }),
      );
      expect(lastApiInstance).not.toBeNull();
    });

    it('shows error when 8x8.vc is unreachable', async () => {
      fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await renderLoaded();
      expect(screen.getByText(/could not connect/i)).toBeInTheDocument();
      expect(lastApiInstance).toBeNull();
    });
  });
});
