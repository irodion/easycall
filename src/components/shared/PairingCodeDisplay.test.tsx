import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';

const mockRefresh = vi.fn();
vi.mock('@/hooks/usePairingCode', () => ({
  usePairingCode: vi.fn(() => ({
    code: '123456',
    error: false,
    secondsRemaining: 540,
    formattedCountdown: '09:00',
    refresh: mockRefresh,
  })),
}));

import { usePairingCode } from '@/hooks/usePairingCode';
import { PairingCodeDisplay } from './PairingCodeDisplay';

const mockUsePairingCode = vi.mocked(usePairingCode);

describe('PairingCodeDisplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows error and retry when generation fails', () => {
    mockUsePairingCode.mockReturnValue({
      code: null,
      error: true,
      linked: false,
      secondsRemaining: 600,
      formattedCountdown: '10:00',
      refresh: mockRefresh,
    });

    renderWithProviders(<PairingCodeDisplay userId="user-1" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('retry button calls refresh on error', async () => {
    mockUsePairingCode.mockReturnValue({
      code: null,
      error: true,
      linked: false,
      secondsRemaining: 600,
      formattedCountdown: '10:00',
      refresh: mockRefresh,
    });

    const user = userEvent.setup();
    renderWithProviders(<PairingCodeDisplay userId="user-1" />);
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('shows loading spinner when code is null', () => {
    mockUsePairingCode.mockReturnValue({
      code: null,
      error: false,
      linked: false,
      secondsRemaining: 600,
      formattedCountdown: '10:00',
      refresh: mockRefresh,
    });

    renderWithProviders(<PairingCodeDisplay userId="user-1" />);
    expect(screen.getByLabelText('Generating code')).toBeInTheDocument();
  });

  it('renders code in large text when code is provided', () => {
    mockUsePairingCode.mockReturnValue({
      code: '123456',
      error: false,
      linked: false,
      secondsRemaining: 540,
      formattedCountdown: '09:00',
      refresh: mockRefresh,
    });

    renderWithProviders(<PairingCodeDisplay userId="user-1" />);
    expect(screen.getByText('123456')).toBeInTheDocument();
  });

  it('renders formatted countdown', () => {
    mockUsePairingCode.mockReturnValue({
      code: '123456',
      error: false,
      linked: false,
      secondsRemaining: 540,
      formattedCountdown: '09:00',
      refresh: mockRefresh,
    });

    renderWithProviders(<PairingCodeDisplay userId="user-1" />);
    expect(screen.getByText(/09:00/)).toBeInTheDocument();
  });

  it('Get new code button calls refresh', async () => {
    mockUsePairingCode.mockReturnValue({
      code: '123456',
      error: false,
      linked: false,
      secondsRemaining: 540,
      formattedCountdown: '09:00',
      refresh: mockRefresh,
    });

    const user = userEvent.setup();
    renderWithProviders(<PairingCodeDisplay userId="user-1" />);
    await user.click(screen.getByRole('button', { name: /new code/i }));
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('has aria-label with spaced digits for screen readers', () => {
    mockUsePairingCode.mockReturnValue({
      code: '123456',
      error: false,
      linked: false,
      secondsRemaining: 540,
      formattedCountdown: '09:00',
      refresh: mockRefresh,
    });

    renderWithProviders(<PairingCodeDisplay userId="user-1" />);
    const codeElement = screen.getByLabelText('Pairing code: 1 2 3 4 5 6');
    expect(codeElement).toBeInTheDocument();
  });

  it('passes onLinked callback to usePairingCode', () => {
    const onLinked = vi.fn();
    renderWithProviders(<PairingCodeDisplay userId="user-1" onLinked={onLinked} />);
    expect(mockUsePairingCode).toHaveBeenCalledWith('user-1', { onLinked });
  });

  it('passes vitest-axe', async () => {
    mockUsePairingCode.mockReturnValue({
      code: '123456',
      error: false,
      linked: false,
      secondsRemaining: 540,
      formattedCountdown: '09:00',
      refresh: mockRefresh,
    });

    const { container } = renderWithProviders(<PairingCodeDisplay userId="user-1" />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
