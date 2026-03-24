import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';
import { useCallStore } from '@/stores/callStore';

const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockDeclineCall = vi.fn().mockResolvedValue(undefined);
const mockClearIncomingCallDoc = vi.fn().mockResolvedValue(undefined);
vi.mock('@/services/callSignaling', () => ({
  declineCall: (...args: unknown[]) => mockDeclineCall(...args),
  clearIncomingCallDoc: (...args: unknown[]) => mockClearIncomingCallDoc(...args),
}));

// Mock ringtone utility
const mockRingtonePlay = vi.fn();
const mockRingtonePause = vi.fn();
const mockRingtoneSetVolume = vi.fn();
const mockCreateRingtone = vi.fn();
vi.mock('@/utils/ringtone', () => ({
  createRingtone: (...args: unknown[]) => {
    mockCreateRingtone(...args);
    return {
      play: mockRingtonePlay,
      pause: mockRingtonePause,
      setVolume: mockRingtoneSetVolume,
    };
  },
}));

import { IncomingCallScreen } from './IncomingCallScreen';

describe('IncomingCallScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCallStore.setState({ isRinging: false, incomingCall: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when isRinging=false', () => {
    const { container } = renderWithProviders(<IncomingCallScreen ringtoneVolume={80} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders caller photo and name when isRinging=true', () => {
    useCallStore.setState({
      isRinging: true,
      incomingCall: {
        callerName: 'Alex',
        callerPhotoURL: 'https://example.com/alex.jpg',
        roomId: 'room-1',
        elderlyUserId: 'user-1',
      },
    });

    renderWithProviders(<IncomingCallScreen />);

    expect(screen.getByAltText('Alex')).toBeInTheDocument();
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText(/is calling/i)).toBeInTheDocument();
  });

  it('caller photo has min 120px dimensions', () => {
    useCallStore.setState({
      isRinging: true,
      incomingCall: {
        callerName: 'Alex',
        callerPhotoURL: 'https://example.com/alex.jpg',
        roomId: 'room-1',
        elderlyUserId: 'user-1',
      },
    });

    renderWithProviders(<IncomingCallScreen />);
    const img = screen.getByAltText('Alex');
    expect(img.className).toMatch(/min-w-\[120px\]/);
    expect(img.className).toMatch(/min-h-\[120px\]/);
  });

  it('Answer button navigates to /call-room/:roomId and clears store', async () => {
    const user = userEvent.setup();
    useCallStore.setState({
      isRinging: true,
      incomingCall: {
        callerName: 'Alex',
        callerPhotoURL: '',
        roomId: 'room-1',
        elderlyUserId: 'user-1',
      },
    });

    renderWithProviders(<IncomingCallScreen />);
    await user.click(screen.getByRole('button', { name: /answer/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/call-room/room-1');
    expect(mockClearIncomingCallDoc).toHaveBeenCalledWith('user-1');
    expect(useCallStore.getState().isRinging).toBe(false);
  });

  it('Decline button calls declineCall, cleans up signaling doc, and clears store', async () => {
    const user = userEvent.setup();
    useCallStore.setState({
      isRinging: true,
      incomingCall: {
        callerName: 'Alex',
        callerPhotoURL: '',
        roomId: 'room-1',
        elderlyUserId: 'user-1',
      },
    });

    renderWithProviders(<IncomingCallScreen />);
    await user.click(screen.getByRole('button', { name: /decline/i }));

    expect(mockDeclineCall).toHaveBeenCalledWith('user-1');
    expect(mockClearIncomingCallDoc).toHaveBeenCalledWith('user-1');
    expect(useCallStore.getState().isRinging).toBe(false);
  });

  it('auto-dismisses after 60 seconds', () => {
    vi.useFakeTimers();
    useCallStore.setState({
      isRinging: true,
      incomingCall: {
        callerName: 'Alex',
        callerPhotoURL: '',
        roomId: 'room-1',
        elderlyUserId: 'user-1',
      },
    });

    renderWithProviders(<IncomingCallScreen />);

    vi.advanceTimersByTime(60_000);

    expect(useCallStore.getState().isRinging).toBe(false);
  });

  it('Answer button has touch-target-call class', () => {
    useCallStore.setState({
      isRinging: true,
      incomingCall: {
        callerName: 'Alex',
        callerPhotoURL: '',
        roomId: 'room-1',
        elderlyUserId: 'user-1',
      },
    });

    renderWithProviders(<IncomingCallScreen />);
    const answerBtn = screen.getByRole('button', { name: /answer/i });
    expect(answerBtn).toHaveClass('touch-target-call');
  });

  it('Decline button has touch-target-primary class', () => {
    useCallStore.setState({
      isRinging: true,
      incomingCall: {
        callerName: 'Alex',
        callerPhotoURL: '',
        roomId: 'room-1',
        elderlyUserId: 'user-1',
      },
    });

    renderWithProviders(<IncomingCallScreen />);
    const declineBtn = screen.getByRole('button', { name: /decline/i });
    expect(declineBtn).toHaveClass('touch-target-primary');
  });

  it('Answer clears store without navigating when roomId is empty', async () => {
    const user = userEvent.setup();
    useCallStore.setState({
      isRinging: true,
      incomingCall: {
        callerName: 'Alex',
        callerPhotoURL: '',
        roomId: '',
        elderlyUserId: 'user-1',
      },
    });

    renderWithProviders(<IncomingCallScreen />);
    await user.click(screen.getByRole('button', { name: /answer/i }));

    expect(useCallStore.getState().isRinging).toBe(false);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('Decline clears store even when declineCall throws', async () => {
    const user = userEvent.setup();
    mockDeclineCall.mockRejectedValueOnce(new Error('Network error'));
    useCallStore.setState({
      isRinging: true,
      incomingCall: {
        callerName: 'Alex',
        callerPhotoURL: '',
        roomId: 'room-1',
        elderlyUserId: 'user-1',
      },
    });

    renderWithProviders(<IncomingCallScreen />);
    await user.click(screen.getByRole('button', { name: /decline/i }));

    expect(mockDeclineCall).toHaveBeenCalledWith('user-1');
    expect(useCallStore.getState().isRinging).toBe(false);
  });

  it('creates ringtone with the provided volume and plays it', () => {
    useCallStore.setState({
      isRinging: true,
      incomingCall: {
        callerName: 'Alex',
        callerPhotoURL: '',
        roomId: 'room-1',
        elderlyUserId: 'user-1',
      },
    });

    renderWithProviders(<IncomingCallScreen ringtoneVolume={60} />);

    expect(mockCreateRingtone).toHaveBeenCalledWith(60);
    expect(mockRingtonePlay).toHaveBeenCalled();
  });

  it('pauses ringtone on unmount', () => {
    useCallStore.setState({
      isRinging: true,
      incomingCall: {
        callerName: 'Alex',
        callerPhotoURL: '',
        roomId: 'room-1',
        elderlyUserId: 'user-1',
      },
    });

    const { unmount } = renderWithProviders(<IncomingCallScreen ringtoneVolume={80} />);
    unmount();

    expect(mockRingtonePause).toHaveBeenCalled();
  });

  it('uses default volume of 80 when no prop provided', () => {
    useCallStore.setState({
      isRinging: true,
      incomingCall: {
        callerName: 'Alex',
        callerPhotoURL: '',
        roomId: 'room-1',
        elderlyUserId: 'user-1',
      },
    });

    renderWithProviders(<IncomingCallScreen />);

    expect(mockCreateRingtone).toHaveBeenCalledWith(80);
  });

  it('shows P2P connection mode label when restrictedNetworkMode is false', () => {
    useCallStore.setState({
      isRinging: true,
      incomingCall: {
        callerName: 'Alex',
        callerPhotoURL: '',
        roomId: 'room-1',
        elderlyUserId: 'user-1',
      },
    });

    renderWithProviders(<IncomingCallScreen restrictedNetworkMode={false} />);
    expect(screen.getByText('Direct (P2P)')).toBeInTheDocument();
  });

  it('shows Relay connection mode label when restrictedNetworkMode is true', () => {
    useCallStore.setState({
      isRinging: true,
      incomingCall: {
        callerName: 'Alex',
        callerPhotoURL: '',
        roomId: 'room-1',
        elderlyUserId: 'user-1',
      },
    });

    renderWithProviders(<IncomingCallScreen restrictedNetworkMode={true} />);
    expect(screen.getByText('Relay')).toBeInTheDocument();
  });

  it('passes vitest-axe accessibility audit', async () => {
    useCallStore.setState({
      isRinging: true,
      incomingCall: {
        callerName: 'Alex',
        callerPhotoURL: 'https://example.com/alex.jpg',
        roomId: 'room-1',
        elderlyUserId: 'user-1',
      },
    });

    const { container } = renderWithProviders(<IncomingCallScreen />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('passes vitest-axe accessibility audit in relay mode', async () => {
    useCallStore.setState({
      isRinging: true,
      incomingCall: {
        callerName: 'Alex',
        callerPhotoURL: 'https://example.com/alex.jpg',
        roomId: 'room-1',
        elderlyUserId: 'user-1',
      },
    });

    const { container } = renderWithProviders(<IncomingCallScreen restrictedNetworkMode={true} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
