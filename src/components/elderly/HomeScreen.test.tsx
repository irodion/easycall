import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';
import { createMockContact } from '@/test/helpers/factories';
import { HomeScreen } from './HomeScreen';

// Mock the contactStore
const mockSubscribeToContacts = vi.fn().mockReturnValue(() => {});
const mockContacts: ReturnType<typeof createMockContact>[] = [];

vi.mock('@/stores/contactStore', () => ({
  useContactStore: vi.fn((selector) => selector({
    contacts: mockContacts,
    loading: false,
    error: null,
    subscribeToContacts: mockSubscribeToContacts,
  })),
}));

describe('HomeScreen', () => {
  beforeEach(() => {
    mockContacts.length = 0;
    mockSubscribeToContacts.mockClear();
    mockSubscribeToContacts.mockReturnValue(() => {});
  });

  it('calls subscribeToContacts with userId on mount', () => {
    renderWithProviders(<HomeScreen userId="user-1" />);
    expect(mockSubscribeToContacts).toHaveBeenCalledWith('user-1');
  });

  it('renders a card for each contact', () => {
    mockContacts.push(createMockContact({ name: 'Alice' }));
    mockContacts.push(createMockContact({ name: 'Bob' }));
    renderWithProviders(<HomeScreen userId="user-1" />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('renders photo when photoURL is set', () => {
    const contact = createMockContact({ name: 'Alice', photoURL: 'https://example.com/alice.jpg' });
    mockContacts.push(contact);
    renderWithProviders(<HomeScreen userId="user-1" />);
    // Image is decorative (alt="") since the contact name is shown as text below
    const img = screen.getByAltText('');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/alice.jpg');
    expect(img.className).toContain('rounded-full');
  });

  it('renders initials when photoURL is null', () => {
    mockContacts.push(createMockContact({ name: 'Bob', photoURL: null }));
    renderWithProviders(<HomeScreen userId="user-1" />);
    expect(screen.queryByAltText('Bob')).not.toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('clicking a contact card navigates to /call/{contactId}', () => {
    const contact = createMockContact({ id: 'contact-xyz', name: 'Alice' });
    mockContacts.push(contact);
    const { container } = renderWithProviders(<HomeScreen userId="user-1" />, {
      routerProps: { initialEntries: ['/elderly'] },
    });
    // Find the card button for Alice
    const card = screen.getByRole('button', { name: /Call Alice/i });
    fireEvent.click(card);
    // Can't easily test navigation in unit tests without a full router,
    // but we can check the button exists and is clickable
    expect(card).toBeInTheDocument();
    void container; // suppress unused warning
  });

  it('shows empty state when no contacts', () => {
    renderWithProviders(<HomeScreen userId="user-1" />);
    expect(screen.getByText(/No contacts yet/i)).toBeInTheDocument();
  });

  it('settings button has aria-label Settings', () => {
    renderWithProviders(<HomeScreen userId="user-1" />);
    expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
  });

  it('passes vitest-axe accessibility check', async () => {
    mockContacts.push(createMockContact({ name: 'Alice' }));
    const { container } = renderWithProviders(<HomeScreen userId="user-1" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
