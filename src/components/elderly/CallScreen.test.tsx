import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, act, render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { MemoryRouter, Routes, Route } from 'react-router';
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

vi.mock('@/services/jitsi', () => ({
  loadJitsiApi: vi.fn().mockResolvedValue(undefined),
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
}));

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn().mockReturnValue({}),
  httpsCallable: vi.fn(() => vi.fn().mockResolvedValue({ data: { token: 'mock-jwt' } })),
}));

vi.mock('@/services/firebase', () => ({
  app: {},
  auth: { currentUser: { uid: 'user-1', displayName: 'Elderly User' } },
  db: {},
}));

const mockContact = createMockContact({
  id: 'contact-1',
  name: 'Alice',
  jitsiRoomId: 'easycall-alice-abc123',
});

vi.mock('@/stores/contactStore', () => ({
  useContactStore: vi.fn((selector) =>
    selector({
      contacts: [mockContact],
      loading: false,
      error: null,
      subscribeToContacts: vi.fn().mockReturnValue(() => {}),
      addContact: vi.fn(),
      removeContact: vi.fn(),
      fetchContacts: vi.fn(),
    }),
  ),
}));

describe('CallScreen', () => {
  let lastApiInstance: MockJitsiMeetExternalAPI | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    lastApiInstance = null;

    // Capture the MockJitsiMeetExternalAPI instance when CallScreen creates it.
    // Override dispose() to preserve commands so tests can inspect them after hangup/unmount.
    const OriginalMock = MockJitsiMeetExternalAPI;
    window.JitsiMeetExternalAPI = class extends OriginalMock {
      constructor(domain: string, options: never) {
        super(domain, options);
        lastApiInstance = this as unknown as MockJitsiMeetExternalAPI;
      }
      dispose(): void {
        // Don't clear — keep listeners/commands so tests can inspect post-dispose
      }
    } as unknown as typeof window.JitsiMeetExternalAPI;
  });

  async function renderLoaded() {
    const { CallScreen } = await import('./CallScreen');
    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(
        <MemoryRouter initialEntries={['/call/contact-1']}>
          <Routes>
            <Route path="/call/:contactId" element={<CallScreen />} />
          </Routes>
        </MemoryRouter>,
      );
      // Wait for async operations to settle
      await new Promise((r) => setTimeout(r, 50));
    });
    return result!;
  }

  it('creates JitsiMeetExternalAPI with domain 8x8.vc', async () => {
    await renderLoaded();
    expect(lastApiInstance).not.toBeNull();
    expect(lastApiInstance?.domain).toBe('8x8.vc');
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

  it('does not write call history entry twice', async () => {
    await renderLoaded();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /end call/i }));
      await new Promise((r) => setTimeout(r, 50));
    });
    // The hangup writes history; cleanup should not write again
    expect(mockWriteCallHistoryEntry).toHaveBeenCalledTimes(1);
  });
});
