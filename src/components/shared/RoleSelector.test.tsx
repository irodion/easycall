import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';

const mockCallable = vi.fn().mockResolvedValue({ data: { success: true } });

vi.mock('firebase/firestore', () => ({
  doc: vi.fn().mockReturnValue('doc-ref'),
  setDoc: vi.fn().mockResolvedValue(undefined),
  getFirestore: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
}));

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => 'mock-functions'),
  httpsCallable: vi.fn(() => mockCallable),
}));

vi.mock('@/services/firebase', () => ({
  db: {},
  app: {},
  ensureAuthenticated: vi.fn().mockResolvedValue({ uid: 'user-1' }),
}));

vi.mock('@/hooks/useRegistrationLock', () => ({
  useRegistrationLock: vi.fn(() => ({ isOpen: true, loading: false })),
}));

vi.mock('@/hooks/useCaregiverPin', () => ({
  useCaregiverPin: vi.fn(() => ({
    pinRequired: false,
    verified: true,
    failedAttempts: 0,
    cooldownRemaining: 0,
    loading: false,
    submitPin: vi.fn().mockResolvedValue(true),
  })),
}));

vi.mock('@/services/registrationLock', () => ({
  REGISTRATION_CONFIG_REF: 'config-ref',
}));

vi.mock('@/services/caregiverPinService', () => ({
  CAREGIVER_PIN_REF: 'pin-ref',
  verifyCaregiverPin: vi.fn().mockResolvedValue(true),
}));

describe('RoleSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders two role buttons', async () => {
    const { RoleSelector } = await import('./RoleSelector');
    renderWithProviders(<RoleSelector />);
    expect(screen.getByRole('button', { name: /I want to make calls/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /I want to manage calls/i })).toBeInTheDocument();
  });

  it('buttons are at least 56px (touch-target-min class)', async () => {
    const { RoleSelector } = await import('./RoleSelector');
    renderWithProviders(<RoleSelector />);
    const elderlyBtn = screen.getByRole('button', { name: /I want to make calls/i });
    const caregiverBtn = screen.getByRole('button', { name: /I want to manage calls/i });
    expect(elderlyBtn.className).toContain('touch-target-min');
    expect(caregiverBtn.className).toContain('touch-target-min');
  });

  it('clicking elderly role calls setDoc with role: elderly', async () => {
    const { setDoc } = await import('firebase/firestore');
    const { RoleSelector } = await import('./RoleSelector');
    renderWithProviders(<RoleSelector />);
    fireEvent.click(screen.getByRole('button', { name: /I want to make calls/i }));
    await vi.waitFor(() => {
      expect(setDoc).toHaveBeenCalledWith(
        'doc-ref',
        expect.objectContaining({ role: 'elderly', onboardingComplete: false }),
        expect.objectContaining({ merge: true }),
      );
    });
  });

  it('clicking caregiver role calls assignCaregiverRole Cloud Function', async () => {
    const { httpsCallable } = await import('firebase/functions');
    const { RoleSelector } = await import('./RoleSelector');
    renderWithProviders(<RoleSelector />);
    fireEvent.click(screen.getByRole('button', { name: /I want to manage calls/i }));
    await vi.waitFor(() => {
      expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'assignCaregiverRole');
      expect(mockCallable).toHaveBeenCalled();
    });
  });

  it('calls ensureAuthenticated before saving role', async () => {
    const { ensureAuthenticated } = await import('@/services/firebase');
    const { setDoc } = await import('firebase/firestore');
    const { RoleSelector } = await import('./RoleSelector');
    renderWithProviders(<RoleSelector />);
    fireEvent.click(screen.getByRole('button', { name: /I want to make calls/i }));
    await vi.waitFor(() => {
      expect(ensureAuthenticated).toHaveBeenCalled();
      expect(setDoc).toHaveBeenCalled();
    });
  });

  it('shows friendly error when ensureAuthenticated fails and does not write to Firestore', async () => {
    const { ensureAuthenticated } = await import('@/services/firebase');
    const { setDoc } = await import('firebase/firestore');
    vi.mocked(ensureAuthenticated).mockRejectedValueOnce(new Error('auth/network-error'));

    const { RoleSelector } = await import('./RoleSelector');
    renderWithProviders(<RoleSelector />);
    fireEvent.click(screen.getByRole('button', { name: /I want to make calls/i }));

    await vi.waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      // Should NOT expose raw Firebase error message
      expect(alert.textContent).not.toContain('auth/network-error');
    });
    // Auth failure should short-circuit before any database write
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('shows error when setDoc rejects', async () => {
    const { setDoc } = await import('firebase/firestore');
    vi.mocked(setDoc).mockRejectedValueOnce(new Error('Firestore write failed'));

    const { RoleSelector } = await import('./RoleSelector');
    renderWithProviders(<RoleSelector />);
    fireEvent.click(screen.getByRole('button', { name: /I want to make calls/i }));

    await vi.waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('disables only admin button when registration is closed', async () => {
    const { useRegistrationLock } = await import('@/hooks/useRegistrationLock');
    vi.mocked(useRegistrationLock).mockReturnValue({ isOpen: false, loading: false });

    const { RoleSelector } = await import('./RoleSelector');
    renderWithProviders(<RoleSelector />);

    expect(screen.getByRole('button', { name: /I want to make calls/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /I want to manage calls/i })).toBeDisabled();
    expect(screen.getByText(/not accepting new users/i)).toBeInTheDocument();
  });

  it('disables admin button when PIN status is loading', async () => {
    const { useCaregiverPin } = await import('@/hooks/useCaregiverPin');
    vi.mocked(useCaregiverPin).mockReturnValue({
      pinRequired: false,
      verified: false,
      failedAttempts: 0,
      cooldownRemaining: 0,
      loading: true,
      submitPin: vi.fn().mockResolvedValue(true),
    });

    const { RoleSelector } = await import('./RoleSelector');
    renderWithProviders(<RoleSelector />);

    // Admin button disabled due to PIN loading
    expect(screen.getByRole('button', { name: /I want to manage calls/i })).toBeDisabled();
    // Member button also disabled via registration loading check — but that's from the
    // top-level mock. The key assertion is the admin button is disabled.
  });

  it('passes vitest-axe', async () => {
    const { RoleSelector } = await import('./RoleSelector');
    const { container } = renderWithProviders(<RoleSelector />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
