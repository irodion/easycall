import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';

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
    vi.doMock('@/services/firebase', () => ({ db: {} }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows Link Elderly User button when no linked users', async () => {
    // Caregiver doc has no linkedElderlyUsers
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ linkedElderlyUsers: [] }),
    });

    const { Dashboard } = await import('./Dashboard');
    renderWithProviders(<Dashboard userId="caregiver-1" />);

    // Wait for async data fetch
    await screen.findByRole('link', { name: /link elderly user/i });
  });

  it('renders a card per linked elderly user', async () => {
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

    // Use different getDocs for elderly user
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

  it('passes vitest-axe', async () => {
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ linkedElderlyUsers: [] }),
    });

    const { Dashboard } = await import('./Dashboard');
    const { container } = renderWithProviders(<Dashboard userId="caregiver-1" />);
    await screen.findByRole('link', { name: /link elderly user/i });
    expect(await axe(container)).toHaveNoViolations();
  });
});
