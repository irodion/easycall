import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';

const mockLinkEmail = vi.fn();
const mockSendReset = vi.fn();

vi.mock('@/services/caregiverAuth', () => ({
  linkCaregiverEmail: (...args: unknown[]) => mockLinkEmail(...args),
  sendCaregiverPasswordReset: (...args: unknown[]) => mockSendReset(...args),
}));

const mockAuth = {
  currentUser: {
    uid: 'caregiver-1',
    providerData: [] as Array<{ providerId: string; email: string | null }>,
  },
};

vi.mock('firebase/firestore', () => ({
  doc: vi.fn().mockReturnValue('doc-ref'),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false }),
  onSnapshot: vi.fn(() => vi.fn()),
}));

vi.mock('@/services/firebase', () => ({
  auth: mockAuth,
  db: {},
  app: {},
}));

vi.mock('@/hooks/useRegistrationLock', () => ({
  useRegistrationLock: vi.fn(() => ({ isOpen: true, loading: false })),
}));

vi.mock('@/services/registrationLock', () => ({
  REGISTRATION_CONFIG_REF: 'config-ref',
  setRegistrationLock: vi.fn().mockResolvedValue(undefined),
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

vi.mock('@/services/caregiverPinService', () => ({
  CAREGIVER_PIN_REF: 'pin-ref',
  setCaregiverPin: vi.fn().mockResolvedValue(undefined),
  removeCaregiverPin: vi.fn().mockResolvedValue(undefined),
  verifyCaregiverPin: vi.fn().mockResolvedValue(true),
}));

describe('CaregiverAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLinkEmail.mockResolvedValue(undefined);
    mockSendReset.mockResolvedValue(undefined);
    mockAuth.currentUser.providerData = [];
  });

  describe('anonymous (not linked)', () => {
    it('renders link form with email, password, confirm password', async () => {
      const { CaregiverAccount } = await import('./CaregiverAccount');
      renderWithProviders(<CaregiverAccount />);

      expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    });

    it('renders link button', async () => {
      const { CaregiverAccount } = await import('./CaregiverAccount');
      renderWithProviders(<CaregiverAccount />);
      expect(screen.getByRole('button', { name: /link email/i })).toBeInTheDocument();
    });

    it('shows validation error when password too short', async () => {
      const { CaregiverAccount } = await import('./CaregiverAccount');
      renderWithProviders(<CaregiverAccount />);

      fireEvent.change(screen.getByLabelText(/^email$/i), {
        target: { value: 'test@example.com' },
      });
      fireEvent.change(screen.getByLabelText(/^password$/i), {
        target: { value: '12345' },
      });
      fireEvent.change(screen.getByLabelText(/confirm password/i), {
        target: { value: '12345' },
      });
      fireEvent.click(screen.getByRole('button', { name: /link email/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/at least 6 characters/i);
      });
      expect(mockLinkEmail).not.toHaveBeenCalled();
    });

    it('shows validation error when passwords do not match', async () => {
      const { CaregiverAccount } = await import('./CaregiverAccount');
      renderWithProviders(<CaregiverAccount />);

      fireEvent.change(screen.getByLabelText(/^email$/i), {
        target: { value: 'test@example.com' },
      });
      fireEvent.change(screen.getByLabelText(/^password$/i), {
        target: { value: 'password123' },
      });
      fireEvent.change(screen.getByLabelText(/confirm password/i), {
        target: { value: 'different' },
      });
      fireEvent.click(screen.getByRole('button', { name: /link email/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/do not match/i);
      });
      expect(mockLinkEmail).not.toHaveBeenCalled();
    });

    it('calls linkCaregiverEmail on valid submit and shows success', async () => {
      const { CaregiverAccount } = await import('./CaregiverAccount');
      renderWithProviders(<CaregiverAccount />);

      fireEvent.change(screen.getByLabelText(/^email$/i), {
        target: { value: 'test@example.com' },
      });
      fireEvent.change(screen.getByLabelText(/^password$/i), {
        target: { value: 'password123' },
      });
      fireEvent.change(screen.getByLabelText(/confirm password/i), {
        target: { value: 'password123' },
      });
      fireEvent.click(screen.getByRole('button', { name: /link email/i }));

      await waitFor(() => {
        expect(mockLinkEmail).toHaveBeenCalledWith('test@example.com', 'password123');
        expect(screen.getByRole('status')).toHaveTextContent(/linked successfully/i);
      });
    });

    it('shows error for email already in use', async () => {
      const error = new Error('auth/email-already-in-use');
      (error as unknown as Record<string, unknown>).code = 'auth/email-already-in-use';
      mockLinkEmail.mockRejectedValueOnce(error);

      const { CaregiverAccount } = await import('./CaregiverAccount');
      renderWithProviders(<CaregiverAccount />);

      fireEvent.change(screen.getByLabelText(/^email$/i), {
        target: { value: 'taken@example.com' },
      });
      fireEvent.change(screen.getByLabelText(/^password$/i), {
        target: { value: 'password123' },
      });
      fireEvent.change(screen.getByLabelText(/confirm password/i), {
        target: { value: 'password123' },
      });
      fireEvent.click(screen.getByRole('button', { name: /link email/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/already in use/i);
      });
    });

    it('has back to dashboard link', async () => {
      const { CaregiverAccount } = await import('./CaregiverAccount');
      renderWithProviders(<CaregiverAccount />);
      const link = screen.getByRole('link', { name: /back to dashboard/i });
      expect(link).toHaveAttribute('href', '/caregiver');
    });

    it('passes vitest-axe', async () => {
      const { CaregiverAccount } = await import('./CaregiverAccount');
      const { container } = renderWithProviders(<CaregiverAccount />);
      expect(await axe(container)).toHaveNoViolations();
    });
  });

  describe('already linked', () => {
    beforeEach(() => {
      mockAuth.currentUser.providerData = [{ providerId: 'password', email: 'linked@example.com' }];
    });

    it('shows linked email', async () => {
      const { CaregiverAccount } = await import('./CaregiverAccount');
      renderWithProviders(<CaregiverAccount />);
      expect(screen.getByText(/linked@example\.com/i)).toBeInTheDocument();
    });

    it('shows reset password button', async () => {
      const { CaregiverAccount } = await import('./CaregiverAccount');
      renderWithProviders(<CaregiverAccount />);
      expect(screen.getByRole('button', { name: /reset password/i })).toBeInTheDocument();
    });

    it('calls sendCaregiverPasswordReset when reset clicked', async () => {
      const { CaregiverAccount } = await import('./CaregiverAccount');
      renderWithProviders(<CaregiverAccount />);

      fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

      await waitFor(() => {
        expect(mockSendReset).toHaveBeenCalledWith('linked@example.com');
        expect(screen.getByRole('status')).toHaveTextContent(/reset email sent/i);
      });
    });

    it('shows error when password reset fails', async () => {
      mockSendReset.mockRejectedValueOnce(new Error('network'));

      const { CaregiverAccount } = await import('./CaregiverAccount');
      renderWithProviders(<CaregiverAccount />);

      fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/failed/i);
      });
    });

    it('has back to dashboard link', async () => {
      const { CaregiverAccount } = await import('./CaregiverAccount');
      renderWithProviders(<CaregiverAccount />);
      const link = screen.getByRole('link', { name: /back to dashboard/i });
      expect(link).toHaveAttribute('href', '/caregiver');
    });

    it('passes vitest-axe', async () => {
      const { CaregiverAccount } = await import('./CaregiverAccount');
      const { container } = renderWithProviders(<CaregiverAccount />);
      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
