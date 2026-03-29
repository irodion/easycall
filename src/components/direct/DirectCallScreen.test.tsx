import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';
import { MockJitsiMeetExternalAPI } from '@/test/mocks/jitsi';

// Must mock jitsi before importing component
vi.mock('@/services/jitsi', () => ({
  loadJitsiApi: vi.fn().mockResolvedValue(undefined),
  getJaasAppId: vi.fn().mockReturnValue('vpaas-magic-cookie-test'),
}));

// Mock fetch for reachability check
const originalFetch = globalThis.fetch;

describe('DirectCallScreen', () => {
  let lastCreatedApi: MockJitsiMeetExternalAPI | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    lastCreatedApi = null;
    // jitsi mock (imported at top) already sets window.JitsiMeetExternalAPI
    // to MockJitsiMeetExternalAPI. We just need to capture instances.
    const RealMock = MockJitsiMeetExternalAPI;
    function CapturingMock(domain: string, options: ConstructorParameters<typeof RealMock>[1]) {
      const instance = new RealMock(domain, options);
      lastCreatedApi = instance;
      return instance;
    }
    // Preserve prototype chain for instanceof checks
    CapturingMock.prototype = RealMock.prototype;
    window.JitsiMeetExternalAPI = CapturingMock as unknown as typeof window.JitsiMeetExternalAPI;
    globalThis.fetch = vi.fn().mockResolvedValue(new Response());
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.location.hash = '';
  });

  it('shows invalid link message when fragment is empty', async () => {
    window.location.hash = '';
    const { DirectCallScreen } = await import('./DirectCallScreen');
    renderWithProviders(<DirectCallScreen />);
    expect(screen.getByText(/invalid/i)).toBeInTheDocument();
  });

  it('shows invalid link when token is missing', async () => {
    window.location.hash = '#room=test-room&name=Alice';
    const { DirectCallScreen } = await import('./DirectCallScreen');
    renderWithProviders(<DirectCallScreen />);
    expect(screen.getByText(/invalid/i)).toBeInTheDocument();
  });

  it('shows invalid link when room is missing', async () => {
    window.location.hash = '#token=abc123&name=Alice';
    const { DirectCallScreen } = await import('./DirectCallScreen');
    renderWithProviders(<DirectCallScreen />);
    expect(screen.getByText(/invalid/i)).toBeInTheDocument();
  });

  it('shows loading state with contact name when fragment is valid', async () => {
    window.location.hash = '#token=abc123&room=easycall-direct-xyz&name=Alice';
    const { DirectCallScreen } = await import('./DirectCallScreen');
    renderWithProviders(<DirectCallScreen />);
    expect(screen.getByText(/connecting.*alice/i)).toBeInTheDocument();
  });

  it('shows loading state without name when name is not provided', async () => {
    window.location.hash = '#token=abc123&room=easycall-direct-xyz';
    const { DirectCallScreen } = await import('./DirectCallScreen');
    renderWithProviders(<DirectCallScreen />);
    expect(screen.getByText(/connecting to call\.\.\./i)).toBeInTheDocument();
  });

  it('creates JitsiMeetExternalAPI with correct config', async () => {
    window.location.hash = '#token=test-jwt-token&room=easycall-direct-xyz&name=Alice';
    const { DirectCallScreen } = await import('./DirectCallScreen');
    renderWithProviders(<DirectCallScreen />);

    await vi.waitFor(() => {
      expect(lastCreatedApi).not.toBeNull();
    });

    expect(lastCreatedApi!.domain).toBe('8x8.vc');
    expect(lastCreatedApi!.options.roomName).toBe('vpaas-magic-cookie-test/easycall-direct-xyz');
    expect(lastCreatedApi!.options.jwt).toBe('test-jwt-token');
  });

  it('forces relay mode in config overwrite', async () => {
    window.location.hash = '#token=abc123&room=easycall-direct-xyz&name=Alice';
    const { DirectCallScreen } = await import('./DirectCallScreen');
    renderWithProviders(<DirectCallScreen />);

    await vi.waitFor(() => {
      expect(lastCreatedApi).not.toBeNull();
    });

    const config = lastCreatedApi!.options.configOverwrite as Record<string, unknown>;
    expect(config['p2p']).toEqual({ enabled: false });
    expect(config['webrtcIceTransportPolicy']).toBe('relay');
    expect(config['openBridgeChannel']).toBe('websocket');
  });

  it('shows call controls after conference joins', async () => {
    window.location.hash = '#token=abc123&room=easycall-direct-xyz&name=Alice';
    const { DirectCallScreen } = await import('./DirectCallScreen');
    renderWithProviders(<DirectCallScreen />);

    await vi.waitFor(() => {
      expect(lastCreatedApi).not.toBeNull();
    });

    // Simulate conference joined
    lastCreatedApi!._emit('videoConferenceJoined', {});

    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: /end call/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /mute microphone/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /turn off camera/i })).toBeInTheDocument();
    });
  });

  it('listens for endpointTextMessageReceived for JWT relay', async () => {
    window.location.hash = '#token=abc123&room=easycall-direct-xyz&name=Alice';
    const { DirectCallScreen } = await import('./DirectCallScreen');
    renderWithProviders(<DirectCallScreen />);

    await vi.waitFor(() => {
      expect(lastCreatedApi).not.toBeNull();
    });

    expect(lastCreatedApi!.listeners.has('endpointTextMessageReceived')).toBe(true);
  });

  it('passes vitest-axe on invalid link state', async () => {
    window.location.hash = '';
    const { DirectCallScreen } = await import('./DirectCallScreen');
    const { container } = renderWithProviders(<DirectCallScreen />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('passes vitest-axe on loading state', async () => {
    window.location.hash = '#token=abc123&room=easycall-direct-xyz&name=Alice';
    const { DirectCallScreen } = await import('./DirectCallScreen');
    const { container } = renderWithProviders(<DirectCallScreen />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
