import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';

const mockAuth = {
  currentUser: {
    uid: 'caregiver-1',
    providerData: [] as Array<{ providerId: string; email: string | null }>,
  },
};

vi.mock('@/services/firebase', () => ({
  auth: mockAuth,
  db: {},
  app: {},
}));

describe('AccountBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.currentUser.providerData = [];
    localStorage.clear();
  });

  it('renders banner when not linked and not dismissed', async () => {
    const { AccountBanner } = await import('./AccountBanner');
    renderWithProviders(<AccountBanner />);
    expect(screen.getByText(/secure your account/i)).toBeInTheDocument();
  });

  it('renders Set Up Email link pointing to /caregiver/account', async () => {
    const { AccountBanner } = await import('./AccountBanner');
    renderWithProviders(<AccountBanner />);
    const link = screen.getByRole('link', { name: /set up email/i });
    expect(link).toHaveAttribute('href', '/caregiver/account');
  });

  it('renders dismiss button', async () => {
    const { AccountBanner } = await import('./AccountBanner');
    renderWithProviders(<AccountBanner />);
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
  });

  it('hides banner after dismiss and writes localStorage', async () => {
    const { AccountBanner } = await import('./AccountBanner');
    renderWithProviders(<AccountBanner />);

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(screen.queryByText(/secure your account/i)).not.toBeInTheDocument();
    expect(localStorage.getItem('easycall_account_banner_dismissed')).toBe('true');
  });

  it('does not render when already dismissed in localStorage', async () => {
    localStorage.setItem('easycall_account_banner_dismissed', 'true');

    const { AccountBanner } = await import('./AccountBanner');
    renderWithProviders(<AccountBanner />);
    expect(screen.queryByText(/secure your account/i)).not.toBeInTheDocument();
  });

  it('does not render when already linked', async () => {
    mockAuth.currentUser.providerData = [
      { providerId: 'password', email: 'linked@example.com' },
    ];

    const { AccountBanner } = await import('./AccountBanner');
    renderWithProviders(<AccountBanner />);
    expect(screen.queryByText(/secure your account/i)).not.toBeInTheDocument();
  });

  it('passes vitest-axe', async () => {
    const { AccountBanner } = await import('./AccountBanner');
    const { container } = renderWithProviders(<AccountBanner />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
