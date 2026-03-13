import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, act } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';

// Hoist mocks - must be at top level
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
  signInAnonymously: vi.fn().mockResolvedValue(undefined),
  getAuth: vi.fn().mockReturnValue({}),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn().mockReturnValue('doc-ref'),
  getDoc: vi.fn(),
  setDoc: vi.fn().mockResolvedValue(undefined),
  getFirestore: vi.fn(),
}));

vi.mock('@/services/firebase', () => ({
  auth: {},
  db: {},
  app: {},
}));

describe('AuthGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading spinner while auth initializes', async () => {
    const { onAuthStateChanged } = await import('firebase/auth');
    // Never call the callback - simulates pending auth state
    vi.mocked(onAuthStateChanged).mockImplementation(() => () => {});

    const { AuthGuard } = await import('./AuthGuard');
    renderWithProviders(
      <AuthGuard requiredRole="elderly">
        <div>Protected Content</div>
      </AuthGuard>
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('calls signInAnonymously when user is null', async () => {
    const { onAuthStateChanged, signInAnonymously } = await import('firebase/auth');
    vi.mocked(onAuthStateChanged).mockImplementation((_auth, cb) => {
      (cb as (user: null) => void)(null);
      return () => {};
    });

    const { getDoc } = await import('firebase/firestore');
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false, data: () => undefined } as never);

    const { AuthGuard } = await import('./AuthGuard');
    await act(async () => {
      renderWithProviders(
        <AuthGuard requiredRole="elderly">
          <div>Content</div>
        </AuthGuard>
      );
    });
    expect(signInAnonymously).toHaveBeenCalled();
  });

  it('renders RoleSelector when user has no role', async () => {
    const { onAuthStateChanged } = await import('firebase/auth');
    vi.mocked(onAuthStateChanged).mockImplementation((_auth, cb) => {
      (cb as (user: { uid: string }) => void)({ uid: 'user-1' });
      return () => {};
    });

    const { getDoc } = await import('firebase/firestore');
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ role: undefined }),
    } as never);

    const { AuthGuard } = await import('./AuthGuard');
    await act(async () => {
      renderWithProviders(
        <AuthGuard requiredRole="elderly">
          <div>Protected</div>
        </AuthGuard>
      );
    });
    // Should show RoleSelector (which has "Who are you?" heading)
    expect(screen.getByText(/who are you/i)).toBeInTheDocument();
    expect(screen.queryByText('Protected')).not.toBeInTheDocument();
  });

  it('renders children (Outlet) when user has correct role', async () => {
    const { onAuthStateChanged } = await import('firebase/auth');
    vi.mocked(onAuthStateChanged).mockImplementation((_auth, cb) => {
      (cb as (user: { uid: string }) => void)({ uid: 'user-1' });
      return () => {};
    });

    const { getDoc } = await import('firebase/firestore');
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ role: 'elderly', onboardingComplete: true }),
    } as never);

    const { AuthGuard } = await import('./AuthGuard');
    await act(async () => {
      renderWithProviders(
        <AuthGuard requiredRole="elderly">
          <div>Protected Content</div>
        </AuthGuard>
      );
    });
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('passes vitest-axe while loading', async () => {
    const { onAuthStateChanged } = await import('firebase/auth');
    vi.mocked(onAuthStateChanged).mockImplementation(() => () => {});

    const { AuthGuard } = await import('./AuthGuard');
    const { container } = renderWithProviders(
      <AuthGuard requiredRole="elderly">
        <div>Content</div>
      </AuthGuard>
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
