import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';

const mockUpdateDoc = vi.fn().mockResolvedValue(undefined);

const MOCK_SERVER_TS = { _type: 'serverTimestamp' };

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(),
  doc: vi.fn(() => 'doc-ref'),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  serverTimestamp: () => MOCK_SERVER_TS,
}));

const mockUpdateProfile = vi.fn().mockResolvedValue(undefined);

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
  updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
}));

vi.mock('@/services/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'user-1' } },
}));

describe('SetNameScreen', () => {
  const mockOnComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders heading, input, and button', async () => {
    const { SetNameScreen } = await import('./SetNameScreen');
    renderWithProviders(<SetNameScreen userId="user-1" onComplete={mockOnComplete} />);

    expect(screen.getByRole('heading', { name: /what's your name/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });

  it('button is disabled when input is empty', async () => {
    const { SetNameScreen } = await import('./SetNameScreen');
    renderWithProviders(<SetNameScreen userId="user-1" onComplete={mockOnComplete} />);

    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
  });

  it('button is enabled when name is entered', async () => {
    const { SetNameScreen } = await import('./SetNameScreen');
    renderWithProviders(<SetNameScreen userId="user-1" onComplete={mockOnComplete} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Grandma Rose' } });
    expect(screen.getByRole('button', { name: /continue/i })).not.toBeDisabled();
  });

  it('button is disabled when input is whitespace-only', async () => {
    const { SetNameScreen } = await import('./SetNameScreen');
    renderWithProviders(<SetNameScreen userId="user-1" onComplete={mockOnComplete} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
  });

  it('submits name to Firestore and calls onComplete', async () => {
    const { SetNameScreen } = await import('./SetNameScreen');
    renderWithProviders(<SetNameScreen userId="user-1" onComplete={mockOnComplete} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Grandma Rose' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    });

    expect(mockUpdateDoc).toHaveBeenCalledWith('doc-ref', {
      displayName: 'Grandma Rose',
      lastDisplayNameChange: MOCK_SERVER_TS,
    });
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      { uid: 'user-1' },
      { displayName: 'Grandma Rose' },
    );
    expect(mockOnComplete).toHaveBeenCalled();
  });

  it('trims whitespace from name before saving', async () => {
    const { SetNameScreen } = await import('./SetNameScreen');
    renderWithProviders(<SetNameScreen userId="user-1" onComplete={mockOnComplete} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Grandma Rose  ' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    });

    expect(mockUpdateDoc).toHaveBeenCalledWith('doc-ref', {
      displayName: 'Grandma Rose',
      lastDisplayNameChange: MOCK_SERVER_TS,
    });
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      { uid: 'user-1' },
      { displayName: 'Grandma Rose' },
    );
  });

  it('shows error on submission failure', async () => {
    mockUpdateDoc.mockRejectedValueOnce(new Error('Firestore error'));
    const { SetNameScreen } = await import('./SetNameScreen');
    renderWithProviders(<SetNameScreen userId="user-1" onComplete={mockOnComplete} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Grandma Rose' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(mockOnComplete).not.toHaveBeenCalled();
  });

  it('input has proper label', async () => {
    const { SetNameScreen } = await import('./SetNameScreen');
    renderWithProviders(<SetNameScreen userId="user-1" onComplete={mockOnComplete} />);

    const input = screen.getByRole('textbox');
    expect(input).toHaveAccessibleName();
  });

  it('passes vitest-axe', async () => {
    const { SetNameScreen } = await import('./SetNameScreen');
    const { container } = renderWithProviders(
      <SetNameScreen userId="user-1" onComplete={mockOnComplete} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
