import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';
import { AddContact } from './AddContact';

const mockAddContact = vi.fn().mockResolvedValue(undefined);

vi.mock('@/stores/contactStore', () => ({
  useContactStore: vi.fn((selector) =>
    selector({
      contacts: [],
      loading: false,
      error: null,
      addContact: mockAddContact,
      removeContact: vi.fn(),
      fetchContacts: vi.fn(),
      subscribeToContacts: vi.fn().mockReturnValue(() => {}),
    })
  ),
}));

describe('AddContact', () => {
  beforeEach(() => {
    mockAddContact.mockClear();
    mockAddContact.mockResolvedValue(undefined);
  });

  it('Step 1: renders name input', () => {
    renderWithProviders(<AddContact userId="user-1" />);
    expect(screen.getByRole('textbox', { name: /name/i })).toBeInTheDocument();
  });

  it('Step 1: Next button is disabled when name is empty', () => {
    renderWithProviders(<AddContact userId="user-1" />);
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  it('Step 1: Next button enabled after typing name', () => {
    renderWithProviders(<AddContact userId="user-1" />);
    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), {
      target: { value: 'Alice' },
    });
    expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();
  });

  it('Step 1 → Step 2: clicking Next shows file input', () => {
    renderWithProviders(<AddContact userId="user-1" />);
    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), {
      target: { value: 'Alice' },
    });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    // Step 2: should have a file input
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();
    expect(fileInput?.getAttribute('accept')).toBe('image/*');
  });

  it('Step 2 → Step 1: Back button returns to name input', () => {
    renderWithProviders(<AddContact userId="user-1" />);
    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), {
      target: { value: 'Alice' },
    });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByRole('textbox', { name: /name/i })).toBeInTheDocument();
  });

  it('Step 2 → Step 3: clicking Next shows name and Save button', () => {
    renderWithProviders(<AddContact userId="user-1" />);
    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), {
      target: { value: 'Alice' },
    });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    // Skip photo, click next to confirm step
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
  });

  it('clicking Save calls addContact with correct jitsiRoomId pattern', async () => {
    renderWithProviders(<AddContact userId="user-1" />);
    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), {
      target: { value: 'Alice' },
    });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
    });
    expect(mockAddContact).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        name: 'Alice',
        photoURL: null,
        jitsiRoomId: expect.stringMatching(/^easycall-alice-[a-z0-9]{6}$/),
      })
    );
  });

  it('passes vitest-axe on Step 1', async () => {
    const { container } = renderWithProviders(<AddContact userId="user-1" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
