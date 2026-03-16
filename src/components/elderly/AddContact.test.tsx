import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
    }),
  ),
}));

describe('AddContact', () => {
  beforeEach(() => {
    mockAddContact.mockClear();
    mockAddContact.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
        jitsiRoomId: expect.stringMatching(/^easycall-alice-[a-z0-9]{12}$/),
      }),
    );
  });

  it('selecting a photo shows preview on Step 3', () => {
    const revokeObjectURL = vi.fn();
    const createObjectURL = vi.fn().mockReturnValue('blob:photo-url');
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

    renderWithProviders(<AddContact userId="user-1" />);
    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), {
      target: { value: 'Alice' },
    });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    // Select a photo on Step 2
    const fileInput = document.querySelector('input[type="file"]')!;
    const file = new File(['img'], 'photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Go to Step 3
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    // Photo preview should be shown as img
    const img = screen.getByAltText('Alice');
    expect(img).toHaveAttribute('src', 'blob:photo-url');
  });

  it('revokes previous blob URL when selecting a new photo', () => {
    const revokeObjectURL = vi.fn();
    const createObjectURL = vi.fn()
      .mockReturnValueOnce('blob:first')
      .mockReturnValueOnce('blob:second');
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

    renderWithProviders(<AddContact userId="user-1" />);
    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), {
      target: { value: 'Alice' },
    });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    const fileInput = document.querySelector('input[type="file"]')!;
    const file1 = new File(['img1'], 'photo1.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [file1] } });

    const file2 = new File(['img2'], 'photo2.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [file2] } });

    // First blob URL should have been revoked
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:first');
  });

  it('shows fallback avatar circle when no photo is selected on Step 3', () => {
    renderWithProviders(<AddContact userId="user-1" />);
    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), {
      target: { value: 'Alice' },
    });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    // Step 3 without photo shows a div with the initial, not an img
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    // The initial avatar circle should contain the first letter
    const avatarCircle = document.querySelector('.rounded-full.bg-primary');
    expect(avatarCircle).not.toBeNull();
  });

  it('double-click Save does not call addContact twice', async () => {
    let resolveAdd!: () => void;
    mockAddContact.mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveAdd = resolve; }),
    );

    renderWithProviders(<AddContact userId="user-1" />);
    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), {
      target: { value: 'Alice' },
    });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    // First save
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
    });
    // Second click while first is pending
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
    });

    expect(mockAddContact).toHaveBeenCalledTimes(1);

    // Resolve the pending promise to avoid act warnings
    await act(async () => { resolveAdd(); });
  });

  it('passes vitest-axe on Step 1', async () => {
    const { container } = renderWithProviders(<AddContact userId="user-1" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
