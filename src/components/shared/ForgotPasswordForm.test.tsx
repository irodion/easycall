import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';
import { ForgotPasswordForm } from './ForgotPasswordForm';

const mockSendReset = vi.fn();
vi.mock('@/services/caregiverAuth', () => ({
  sendCaregiverPasswordReset: (...args: unknown[]) => mockSendReset(...args),
}));

describe('ForgotPasswordForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendReset.mockResolvedValue(undefined);
  });

  it('renders email input with label', () => {
    renderWithProviders(<ForgotPasswordForm />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it('renders send reset button', () => {
    renderWithProviders(<ForgotPasswordForm />);
    expect(screen.getByRole('button', { name: /send reset email/i })).toBeInTheDocument();
  });

  it('renders back to sign in link', () => {
    renderWithProviders(<ForgotPasswordForm />);
    const link = screen.getByRole('link', { name: /back to sign in/i });
    expect(link).toHaveAttribute('href', '/login');
  });

  it('calls sendCaregiverPasswordReset and shows success', async () => {
    renderWithProviders(<ForgotPasswordForm />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset email/i }));

    await waitFor(() => {
      expect(mockSendReset).toHaveBeenCalledWith('test@example.com');
      expect(screen.getByRole('status')).toHaveTextContent(/check your email/i);
    });
  });

  it('shows error for user not found', async () => {
    const error = new Error('auth/user-not-found');
    (error as unknown as Record<string, unknown>).code = 'auth/user-not-found';
    mockSendReset.mockRejectedValueOnce(error);

    renderWithProviders(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'noone@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset email/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/no account found/i);
    });
  });

  it('shows generic error for unknown errors', async () => {
    mockSendReset.mockRejectedValueOnce(new Error('network'));

    renderWithProviders(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset email/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/failed to send/i);
    });
  });

  it('disables button while loading', async () => {
    let resolveReset: () => void;
    mockSendReset.mockReturnValue(
      new Promise<void>((r) => {
        resolveReset = r;
      }),
    );

    renderWithProviders(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset email/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();
    });

    resolveReset!();
  });

  it('passes vitest-axe', async () => {
    const { container } = renderWithProviders(<ForgotPasswordForm />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
