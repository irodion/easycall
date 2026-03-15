import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';
import { createMockContact } from '@/test/helpers/factories';

const mockContact1 = createMockContact({ id: 'contact-1', name: 'Alice', displayOrder: 1 });
const mockContact2 = createMockContact({ id: 'contact-2', name: 'Bob', displayOrder: 2 });

const mockRemoveContact = vi.fn().mockResolvedValue(undefined);
const mockAddContact = vi.fn().mockResolvedValue(undefined);
const mockContacts = [mockContact1, mockContact2];

vi.mock('@/stores/contactStore', () => ({
  useContactStore: vi.fn((selector) =>
    selector({
      contacts: mockContacts,
      loading: false,
      error: null,
      subscribeToContacts: vi.fn().mockReturnValue(() => {}),
      addContact: mockAddContact,
      removeContact: mockRemoveContact,
      fetchContacts: vi.fn(),
    }),
  ),
}));

vi.mock('@/utils/compressImage', () => ({
  compressImage: vi.fn().mockResolvedValue(new Blob(['img'], { type: 'image/jpeg' })),
}));

describe('ManageContacts', () => {
  beforeEach(() => {
    mockRemoveContact.mockClear();
    mockAddContact.mockClear();
  });

  it('renders list of contacts', async () => {
    const { ManageContacts } = await import('./ManageContacts');
    renderWithProviders(<ManageContacts elderlyUserId="elderly-1" />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('shows Add Contact button', async () => {
    const { ManageContacts } = await import('./ManageContacts');
    renderWithProviders(<ManageContacts elderlyUserId="elderly-1" />);
    expect(screen.getByRole('button', { name: /add contact/i })).toBeInTheDocument();
  });

  it('clicking Add Contact reveals name input', async () => {
    const { ManageContacts } = await import('./ManageContacts');
    renderWithProviders(<ManageContacts elderlyUserId="elderly-1" />);
    fireEvent.click(screen.getByRole('button', { name: /add contact/i }));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('shows remove button for each contact', async () => {
    const { ManageContacts } = await import('./ManageContacts');
    renderWithProviders(<ManageContacts elderlyUserId="elderly-1" />);
    const removeButtons = screen.getAllByRole('button', { name: /remove/i });
    expect(removeButtons).toHaveLength(2);
  });

  it('clicking remove shows ConfirmDialog', async () => {
    const { ManageContacts } = await import('./ManageContacts');
    renderWithProviders(<ManageContacts elderlyUserId="elderly-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /remove/i })[0]!);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('cancelling ConfirmDialog does NOT call removeContact', async () => {
    const { ManageContacts } = await import('./ManageContacts');
    renderWithProviders(<ManageContacts elderlyUserId="elderly-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /remove/i })[0]!);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(mockRemoveContact).not.toHaveBeenCalled();
  });

  it('confirming ConfirmDialog calls removeContact', async () => {
    const { ManageContacts } = await import('./ManageContacts');
    renderWithProviders(<ManageContacts elderlyUserId="elderly-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /remove/i })[0]!);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    });
    expect(mockRemoveContact).toHaveBeenCalledWith('elderly-1', 'contact-1');
  });

  it('shows error when addContact throws', async () => {
    mockAddContact.mockRejectedValueOnce(new Error('Firestore error'));
    const { ManageContacts } = await import('./ManageContacts');
    renderWithProviders(<ManageContacts elderlyUserId="elderly-1" />);

    fireEvent.click(screen.getByRole('button', { name: /add contact/i }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Charlie' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
    });

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('save button is disabled when name is whitespace-only', async () => {
    const { ManageContacts } = await import('./ManageContacts');
    renderWithProviders(<ManageContacts elderlyUserId="elderly-1" />);

    fireEvent.click(screen.getByRole('button', { name: /add contact/i }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } });

    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('shows error when removeContact throws', async () => {
    mockRemoveContact.mockRejectedValueOnce(new Error('Delete failed'));
    const { ManageContacts } = await import('./ManageContacts');
    renderWithProviders(<ManageContacts elderlyUserId="elderly-1" />);

    fireEvent.click(screen.getAllByRole('button', { name: /remove/i })[0]!);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    });

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('passes vitest-axe', async () => {
    const { ManageContacts } = await import('./ManageContacts');
    const { container } = renderWithProviders(<ManageContacts elderlyUserId="elderly-1" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
