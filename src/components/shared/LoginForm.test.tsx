import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';
import { LoginForm } from './LoginForm';

const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router');
  return { ...actual, useNavigate: () => mockNavigate };
});


const mockSignIn = vi.fn();
vi.mock('@/services/caregiverAuth', () => ({
  signInCaregiverEmail: (...args: unknown[]) => mockSignIn(...args),
}));

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignIn.mockResolvedValue({ uid: 'caregiver-1' });
  });

  it('renders email and password inputs with labels', () => {
    renderWithProviders(<LoginForm />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('renders sign in button', () => {
    renderWithProviders(<LoginForm />);
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('renders forgot password link pointing to /forgot-password', () => {
    renderWithProviders(<LoginForm />);
    const link = screen.getByRole('link', { name: /forgot password/i });
    expect(link).toHaveAttribute('href', '/forgot-password');
  });

  it('renders continue as new user link pointing to /', () => {
    renderWithProviders(<LoginForm />);
    const link = screen.getByRole('link', { name: /continue as new user/i });
    expect(link).toHaveAttribute('href', '/');
  });

  it('calls signInCaregiverEmail and navigates on success', async () => {
    renderWithProviders(<LoginForm />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('test@example.com', 'password123');
      expect(mockNavigate).toHaveBeenCalledWith('/caregiver');
    });
  });

  it('shows error for wrong password', async () => {
    const error = new Error('auth/wrong-password');
    (error as unknown as Record<string, unknown>).code = 'auth/wrong-password';
    mockSignIn.mockRejectedValueOnce(error);

    renderWithProviders(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'wrong' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/incorrect password/i);
    });
  });

  it('shows error for user not found', async () => {
    const error = new Error('auth/user-not-found');
    (error as unknown as Record<string, unknown>).code = 'auth/user-not-found';
    mockSignIn.mockRejectedValueOnce(error);

    renderWithProviders(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'noone@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'pw' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/no account found/i);
    });
  });

  it('shows generic error for unknown errors', async () => {
    mockSignIn.mockRejectedValueOnce(new Error('network'));

    renderWithProviders(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'pw' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/sign in failed/i);
    });
  });

  it('disables button while loading', async () => {
    let resolveSignIn: (v: { uid: string }) => void;
    mockSignIn.mockReturnValue(
      new Promise<{ uid: string }>((r) => {
        resolveSignIn = r;
      }),
    );

    renderWithProviders(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'pw' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
    });

    resolveSignIn!({ uid: 'caregiver-1' });
  });

  it('passes vitest-axe', async () => {
    const { container } = renderWithProviders(<LoginForm />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
