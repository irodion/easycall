import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';
import { createMockUser } from '@/test/helpers/factories';

vi.mock('@/components/elderly/PermissionCheck', () => ({
  PermissionCheck: ({ onReady }: { onReady: () => void }) => (
    <div data-testid="permission-check">
      <button onClick={onReady}>Grant Permissions</button>
    </div>
  ),
}));

vi.mock('@/components/shared/PairingCodeDisplay', () => ({
  PairingCodeDisplay: ({ userId }: { userId: string }) => (
    <div data-testid="pairing-code-display">Pairing code for {userId}</div>
  ),
}));

vi.mock('@/components/caregiver/PairElderlyUser', () => ({
  PairElderlyUser: ({ onSuccess }: { onSuccess: (id: string) => void }) => (
    <div data-testid="pair-elderly-user">
      <button onClick={() => onSuccess('elderly-1')}>Pair</button>
    </div>
  ),
}));

const mockUpdateDoc = vi.fn().mockResolvedValue(undefined);
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => 'doc-ref'),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
}));

vi.mock('@/services/firebase', () => ({
  db: {},
}));

const mockRequestPermission = vi.fn().mockResolvedValue('fcm-token');
vi.mock('@/hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({
    requestPermission: mockRequestPermission,
    removeToken: vi.fn(),
    subscribeForeground: vi.fn(),
  }),
}));

import { OnboardingFlow } from './OnboardingFlow';

describe('OnboardingFlow', () => {
  const onComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders step 1 (welcome) initially', () => {
    const user = createMockUser({ role: 'elderly' });
    renderWithProviders(<OnboardingFlow user={user} onComplete={onComplete} />);
    expect(screen.getByText(/welcome/i)).toBeInTheDocument();
  });

  it('Next advances to next step', async () => {
    const u = userEvent.setup();
    const user = createMockUser({ role: 'elderly' });
    renderWithProviders(<OnboardingFlow user={user} onComplete={onComplete} />);

    await u.click(screen.getByRole('button', { name: /next/i }));
    // Step 2: camera/mic permissions
    expect(screen.getByTestId('permission-check')).toBeInTheDocument();
  });

  it('Skip also advances to next step', async () => {
    const u = userEvent.setup();
    const user = createMockUser({ role: 'elderly' });
    renderWithProviders(<OnboardingFlow user={user} onComplete={onComplete} />);

    await u.click(screen.getByRole('button', { name: /skip/i }));
    expect(screen.getByTestId('permission-check')).toBeInTheDocument();
  });

  it('step 3 (notifications) shows notification request', async () => {
    const u = userEvent.setup();
    const user = createMockUser({ role: 'elderly' });
    renderWithProviders(<OnboardingFlow user={user} onComplete={onComplete} />);

    // Step 1 → Step 2
    await u.click(screen.getByRole('button', { name: /next/i }));
    // Step 2 → Step 3 (grant permissions)
    await u.click(screen.getByRole('button', { name: /grant permissions/i }));
    // Step 3: notification permission
    expect(screen.getByText('Notification Permission')).toBeInTheDocument();
  });

  it('step 4 (pairing) shows PairingCodeDisplay for elderly role', async () => {
    const u = userEvent.setup();
    const user = createMockUser({ role: 'elderly' });
    renderWithProviders(<OnboardingFlow user={user} onComplete={onComplete} />);

    // Navigate through steps 1-3
    await u.click(screen.getByRole('button', { name: /next/i }));
    await u.click(screen.getByRole('button', { name: /grant permissions/i }));
    await u.click(screen.getByRole('button', { name: /next/i }));
    // Step 4: pairing
    expect(screen.getByTestId('pairing-code-display')).toBeInTheDocument();
  });

  it('step 4 shows PairElderlyUser for caregiver role', async () => {
    const u = userEvent.setup();
    const user = createMockUser({ role: 'caregiver' });
    renderWithProviders(<OnboardingFlow user={user} onComplete={onComplete} />);

    await u.click(screen.getByRole('button', { name: /next/i }));
    await u.click(screen.getByRole('button', { name: /grant permissions/i }));
    await u.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByTestId('pair-elderly-user')).toBeInTheDocument();
  });

  it('completing final step writes onboardingComplete=true and calls onComplete', async () => {
    const u = userEvent.setup();
    const user = createMockUser({ role: 'elderly' });
    renderWithProviders(<OnboardingFlow user={user} onComplete={onComplete} />);

    // Navigate through all steps
    await u.click(screen.getByRole('button', { name: /next/i }));
    await u.click(screen.getByRole('button', { name: /grant permissions/i }));
    await u.click(screen.getByRole('button', { name: /next/i }));
    // Final step — click Done
    await u.click(screen.getByRole('button', { name: /done/i }));

    expect(mockUpdateDoc).toHaveBeenCalledWith('doc-ref', { onboardingComplete: true });
    expect(onComplete).toHaveBeenCalled();
  });

  it('buttons have touch-target-primary class', () => {
    const user = createMockUser({ role: 'elderly' });
    renderWithProviders(<OnboardingFlow user={user} onComplete={onComplete} />);
    const nextBtn = screen.getByRole('button', { name: /next/i });
    expect(nextBtn).toHaveClass('touch-target-primary');
  });

  it('shows error and does not call onComplete when updateDoc fails', async () => {
    mockUpdateDoc.mockRejectedValueOnce(new Error('fail'));
    const u = userEvent.setup();
    const user = createMockUser({ role: 'elderly' });
    renderWithProviders(<OnboardingFlow user={user} onComplete={onComplete} />);

    // Navigate through all steps
    await u.click(screen.getByRole('button', { name: /next/i }));
    await u.click(screen.getByRole('button', { name: /grant permissions/i }));
    await u.click(screen.getByRole('button', { name: /next/i }));
    // Final step — click Done
    await u.click(screen.getByRole('button', { name: /done/i }));

    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/failed to complete setup/i);
  });

  it('passes vitest-axe on step 1', async () => {
    const user = createMockUser({ role: 'elderly' });
    const { container } = renderWithProviders(
      <OnboardingFlow user={user} onComplete={onComplete} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
