import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';

import type { PresenceInfo } from '@/hooks/useContactsPresence';

const mockPresenceMap = new Map<string, PresenceInfo>();

vi.mock('@/hooks/useContactsPresence', () => ({
  useContactsPresence: () => mockPresenceMap,
}));

vi.mock('@/hooks/useBillingAlert', () => ({
  useBillingAlert: () => ({ alert: null, dismissed: false, dismiss: vi.fn() }),
}));

const mockUnlinkElderlyUser = vi.fn();

describe('Dashboard', () => {
  let getDocs: ReturnType<typeof vi.fn>;
  let getDoc: ReturnType<typeof vi.fn>;
  let collection: ReturnType<typeof vi.fn>;
  let doc: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getDocs = vi.fn();
    getDoc = vi.fn();
    collection = vi.fn().mockReturnValue('collection-ref');
    doc = vi.fn().mockReturnValue('doc-ref');
    mockPresenceMap.clear();
    mockUnlinkElderlyUser.mockReset();

    vi.resetModules();
    vi.doMock('firebase/firestore', () => ({
      getFirestore: vi.fn(),
      collection,
      getDocs,
      getDoc,
      doc,
      query: vi.fn().mockReturnValue('query-ref'),
      where: vi.fn().mockReturnValue('where-ref'),
    }));
    vi.doMock('@/services/firebase', () => ({
      db: {},
      auth: { currentUser: { uid: 'caregiver-1', providerData: [] } },
    }));
    vi.doMock('@/services/callSignaling', () => ({
      unlinkElderlyUser: mockUnlinkElderlyUser,
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows Link Elderly User button when no linked users', async () => {
    // Admin doc has no linkedElderlyUsers
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ linkedElderlyUsers: [] }),
    });

    const { Dashboard } = await import('./Dashboard');
    renderWithProviders(<Dashboard userId="caregiver-1" />);

    // Wait for async data fetch
    await screen.findByRole('link', { name: /link member/i });
  });

  it('shows empty state message when no linked users', async () => {
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ linkedElderlyUsers: [] }),
    });

    const { Dashboard } = await import('./Dashboard');
    renderWithProviders(<Dashboard userId="caregiver-1" />);

    await screen.findByText(/no linked members yet/i);
    expect(screen.getByText(/tap.*link member/i)).toBeInTheDocument();
  });

  it('renders a card per linked member', async () => {
    getDoc.mockImplementation((_db: unknown, path: unknown, ...args: unknown[]) => {
      // Return different docs based on what's being fetched
      const docPath = String(path) + args.join('/');
      void docPath; // suppress unused
      return Promise.resolve({
        exists: () => true,
        data: () => ({
          linkedElderlyUsers: ['elderly-1'],
          displayName: 'caregiver',
          lastSeen: {
            seconds: Date.now() / 1000 - 300,
            nanoseconds: 0,
            toDate: () => new Date(Date.now() - 300_000),
          },
        }),
      });
    });

    // Use different getDocs for member user
    getDocs.mockResolvedValue({
      docs: [
        {
          id: 'elderly-1',
          data: () => ({
            displayName: 'Grandma',
            lastSeen: {
              seconds: Date.now() / 1000 - 300,
              nanoseconds: 0,
              toDate: () => new Date(Date.now() - 300_000),
            },
          }),
        },
      ],
    });

    const { Dashboard } = await import('./Dashboard');
    renderWithProviders(<Dashboard userId="caregiver-1" />);

    await screen.findByText('Grandma');
  });

  it('each user card has a Manage Contacts link', async () => {
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ linkedElderlyUsers: ['elderly-1'] }),
    });
    getDocs.mockResolvedValue({
      docs: [
        {
          id: 'elderly-1',
          data: () => ({
            displayName: 'Grandma',
            lastSeen: {
              seconds: Date.now() / 1000 - 300,
              nanoseconds: 0,
              toDate: () => new Date(Date.now() - 300_000),
            },
          }),
        },
      ],
    });

    const { Dashboard } = await import('./Dashboard');
    renderWithProviders(<Dashboard userId="caregiver-1" />);

    const manageLink = await screen.findByRole('link', { name: /manage contacts/i });
    expect(manageLink).toBeInTheDocument();
    expect(manageLink.getAttribute('href')).toBe('/caregiver/manage/elderly-1');
  });

  it('handles non-existent admin doc gracefully', async () => {
    getDoc.mockResolvedValue({
      exists: () => false,
    });

    const { Dashboard } = await import('./Dashboard');
    renderWithProviders(<Dashboard userId="caregiver-1" />);

    // Should stop loading and show the link button (no linked users)
    await screen.findByRole('link', { name: /link member/i });
    // No spinner should remain
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('handles fetch error gracefully', async () => {
    getDoc.mockRejectedValue(new Error('Network error'));

    const { Dashboard } = await import('./Dashboard');
    renderWithProviders(<Dashboard userId="caregiver-1" />);

    // Should stop loading despite error — spinner should disappear
    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  it('passes vitest-axe', async () => {
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ linkedElderlyUsers: [] }),
    });

    const { Dashboard } = await import('./Dashboard');
    const { container } = renderWithProviders(<Dashboard userId="caregiver-1" />);
    await screen.findByRole('link', { name: /link member/i });
    expect(await axe(container)).toHaveNoViolations();
  });

  function setupLinkedUserMocks() {
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ linkedElderlyUsers: ['elderly-1'] }),
    });
    getDocs.mockResolvedValue({
      docs: [
        {
          id: 'elderly-1',
          data: () => ({
            displayName: 'Grandma',
            lastSeen: {
              seconds: Date.now() / 1000 - 300,
              nanoseconds: 0,
              toDate: () => new Date(Date.now() - 300_000),
            },
          }),
        },
      ],
    });
  }

  it('shows "Online" status indicator for online users', async () => {
    setupLinkedUserMocks();
    mockPresenceMap.set('elderly-1', { state: 'online', lastChanged: Date.now() });

    const { Dashboard } = await import('./Dashboard');
    renderWithProviders(<Dashboard userId="caregiver-1" />);

    await screen.findByText('Grandma');
    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('shows "In a call" status indicator for in-call users', async () => {
    setupLinkedUserMocks();
    mockPresenceMap.set('elderly-1', { state: 'in-call', lastChanged: Date.now() });

    const { Dashboard } = await import('./Dashboard');
    renderWithProviders(<Dashboard userId="caregiver-1" />);

    await screen.findByText('Grandma');
    expect(screen.getByText('In a call')).toBeInTheDocument();
  });

  it('shows "Last seen" for offline users', async () => {
    setupLinkedUserMocks();
    // No presence data → shows lastSeen

    const { Dashboard } = await import('./Dashboard');
    renderWithProviders(<Dashboard userId="caregiver-1" />);

    await screen.findByText('Grandma');
    expect(screen.getByText(/Last seen/)).toBeInTheDocument();
  });

  describe('unlink flow', () => {
    it('each user card has an Unlink button', async () => {
      setupLinkedUserMocks();

      const { Dashboard } = await import('./Dashboard');
      renderWithProviders(<Dashboard userId="caregiver-1" />);

      const unlinkBtn = await screen.findByRole('button', { name: /unlink grandma/i });
      expect(unlinkBtn).toBeInTheDocument();
    });

    it('clicking Unlink opens confirmation dialog', async () => {
      setupLinkedUserMocks();

      const { Dashboard } = await import('./Dashboard');
      renderWithProviders(<Dashboard userId="caregiver-1" />);

      const unlinkBtn = await screen.findByRole('button', { name: /unlink grandma/i });
      fireEvent.click(unlinkBtn);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(screen.getByText(/unlink grandma and reset/i)).toBeInTheDocument();
    });

    it('cancelling closes the dialog without side effects', async () => {
      setupLinkedUserMocks();

      const { Dashboard } = await import('./Dashboard');
      renderWithProviders(<Dashboard userId="caregiver-1" />);

      const unlinkBtn = await screen.findByRole('button', { name: /unlink grandma/i });
      fireEvent.click(unlinkBtn);

      expect(screen.getByRole('dialog')).toBeInTheDocument();

      const cancelBtn = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelBtn);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(mockUnlinkElderlyUser).not.toHaveBeenCalled();
    });

    it('confirming calls unlinkElderlyUser and removes user from list', async () => {
      setupLinkedUserMocks();
      mockUnlinkElderlyUser.mockResolvedValue(undefined);

      const { Dashboard } = await import('./Dashboard');
      renderWithProviders(<Dashboard userId="caregiver-1" />);

      const unlinkBtn = await screen.findByRole('button', { name: /unlink grandma/i });
      fireEvent.click(unlinkBtn);

      const confirmBtn = screen.getByRole('button', { name: /confirm/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockUnlinkElderlyUser).toHaveBeenCalledWith('elderly-1');
      });

      // User should be removed from the list
      await waitFor(() => {
        expect(screen.queryByText('Grandma')).not.toBeInTheDocument();
      });
    });

    it('shows error alert when unlink fails', async () => {
      setupLinkedUserMocks();
      mockUnlinkElderlyUser.mockRejectedValue(new Error('Network error'));

      const { Dashboard } = await import('./Dashboard');
      renderWithProviders(<Dashboard userId="caregiver-1" />);

      const unlinkBtn = await screen.findByRole('button', { name: /unlink grandma/i });
      fireEvent.click(unlinkBtn);

      const confirmBtn = screen.getByRole('button', { name: /confirm/i });
      fireEvent.click(confirmBtn);

      const alert = await screen.findByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert.textContent).toMatch(/failed to unlink/i);
    });

    it('passes vitest-axe with linked users', async () => {
      setupLinkedUserMocks();

      const { Dashboard } = await import('./Dashboard');
      const { container } = renderWithProviders(<Dashboard userId="caregiver-1" />);

      await screen.findByText('Grandma');
      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
