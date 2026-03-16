import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn().mockReturnValue('doc-ref'),
  setDoc: vi.fn().mockResolvedValue(undefined),
  getFirestore: vi.fn(),
}));

vi.mock('@/services/firebase', () => ({
  db: {},
  app: {},
  ensureAuthenticated: vi.fn().mockResolvedValue({ uid: 'user-1' }),
}));

describe('RoleSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders two role buttons', async () => {
    const { RoleSelector } = await import('./RoleSelector');
    renderWithProviders(<RoleSelector />);
    expect(screen.getByRole('button', { name: /elderly user/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /family caregiver/i })).toBeInTheDocument();
  });

  it('buttons are at least 56px (touch-target-min class)', async () => {
    const { RoleSelector } = await import('./RoleSelector');
    renderWithProviders(<RoleSelector />);
    const elderlyBtn = screen.getByRole('button', { name: /elderly user/i });
    const caregiverBtn = screen.getByRole('button', { name: /family caregiver/i });
    expect(elderlyBtn.className).toContain('touch-target-min');
    expect(caregiverBtn.className).toContain('touch-target-min');
  });

  it('clicking elderly role calls setDoc with role: elderly', async () => {
    const { setDoc } = await import('firebase/firestore');
    const { RoleSelector } = await import('./RoleSelector');
    renderWithProviders(<RoleSelector />);
    fireEvent.click(screen.getByRole('button', { name: /elderly user/i }));
    await vi.waitFor(() => {
      expect(setDoc).toHaveBeenCalledWith(
        'doc-ref',
        expect.objectContaining({ role: 'elderly', onboardingComplete: false }),
        expect.objectContaining({ merge: true }),
      );
    });
  });

  it('clicking caregiver role calls setDoc with role: caregiver', async () => {
    const { setDoc } = await import('firebase/firestore');
    const { RoleSelector } = await import('./RoleSelector');
    renderWithProviders(<RoleSelector />);
    fireEvent.click(screen.getByRole('button', { name: /family caregiver/i }));
    await vi.waitFor(() => {
      expect(setDoc).toHaveBeenCalledWith(
        'doc-ref',
        expect.objectContaining({ role: 'caregiver', onboardingComplete: false }),
        expect.objectContaining({ merge: true }),
      );
    });
  });

  it('calls ensureAuthenticated before saving role', async () => {
    const { ensureAuthenticated } = await import('@/services/firebase');
    const { setDoc } = await import('firebase/firestore');
    const { RoleSelector } = await import('./RoleSelector');
    renderWithProviders(<RoleSelector />);
    fireEvent.click(screen.getByRole('button', { name: /elderly user/i }));
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
    fireEvent.click(screen.getByRole('button', { name: /elderly user/i }));

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
    fireEvent.click(screen.getByRole('button', { name: /elderly user/i }));

    await vi.waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('passes vitest-axe', async () => {
    const { RoleSelector } = await import('./RoleSelector');
    const { container } = renderWithProviders(<RoleSelector />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
