import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
  getFirestore: vi.fn(),
}));

vi.mock('@/services/firebase', () => ({
  db: {},
  app: {},
  auth: { currentUser: { uid: 'caregiver-1' } },
}));

vi.mock('@/services/directLinks', () => ({
  generateDirectLink: vi.fn(),
  revokeDirectLink: vi.fn(),
  subscribeToDirectLinks: vi.fn(() => vi.fn()),
}));

vi.mock('@/stores/contactStore', () => ({
  useContactStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({
      contacts: [
        { id: 'c1', name: 'Alice', jitsiRoomId: 'room-1', contactUserId: 'u1' },
        { id: 'c2', name: 'Bob', jitsiRoomId: 'room-2', contactUserId: 'u2' },
      ],
      subscribeToContacts: vi.fn(() => vi.fn()),
    }),
  ),
}));

describe('DirectLinkManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title and description', async () => {
    const { DirectLinkManager } = await import('./DirectLinkManager');
    renderWithProviders(<DirectLinkManager elderlyUserId="elderly-1" />);

    expect(screen.getByRole('heading', { name: /direct call links/i })).toBeInTheDocument();
    expect(screen.getByText(/restricted networks/i)).toBeInTheDocument();
  });

  it('renders create link button', async () => {
    const { DirectLinkManager } = await import('./DirectLinkManager');
    renderWithProviders(<DirectLinkManager elderlyUserId="elderly-1" />);

    expect(screen.getByRole('button', { name: /create link/i })).toBeInTheDocument();
  });

  it('shows no links message when empty', async () => {
    const { DirectLinkManager } = await import('./DirectLinkManager');
    renderWithProviders(<DirectLinkManager elderlyUserId="elderly-1" />);

    expect(screen.getByText(/no direct call links yet/i)).toBeInTheDocument();
  });

  it('subscribes to direct links on mount', async () => {
    const { subscribeToDirectLinks } = await import('@/services/directLinks');
    const { DirectLinkManager } = await import('./DirectLinkManager');
    renderWithProviders(<DirectLinkManager elderlyUserId="elderly-1" />);

    expect(subscribeToDirectLinks).toHaveBeenCalledWith(
      'elderly-1',
      'caregiver-1',
      expect.any(Function),
    );
  });

  it('passes vitest-axe', async () => {
    const { DirectLinkManager } = await import('./DirectLinkManager');
    const { container } = renderWithProviders(<DirectLinkManager elderlyUserId="elderly-1" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
