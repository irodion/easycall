import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, act } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';

const mockGetDoc = vi.fn();
const mockGetDocs = vi.fn();

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(),
  collection: vi.fn(),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  doc: vi.fn(() => 'doc-ref'),
  query: vi.fn(),
  where: vi.fn(),
}));

vi.mock('@/services/firebase', () => ({
  db: {},
}));

function createCaregiverSnap(linkedIds: string[]) {
  return {
    exists: () => true,
    data: () => ({ linkedElderlyUsers: linkedIds }),
  };
}

function createUsersSnapshot(users: Array<{ id: string; displayName?: string }>) {
  return {
    docs: users.map((u) => ({
      id: u.id,
      data: () => (u.displayName !== undefined ? { displayName: u.displayName } : {}),
    })),
  };
}

describe('LinkedUserPicker', () => {
  const mockOnAdd = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders available linked users', async () => {
    mockGetDoc.mockResolvedValue(createCaregiverSnap(['elderly-2', 'elderly-3']));
    mockGetDocs.mockResolvedValue(
      createUsersSnapshot([
        { id: 'caregiver-1', displayName: 'Admin User' },
        { id: 'elderly-2', displayName: 'Bob' },
        { id: 'elderly-3', displayName: 'Charlie' },
      ]),
    );

    const { LinkedUserPicker } = await import('./LinkedUserPicker');
    await act(async () => {
      renderWithProviders(
        <LinkedUserPicker
          elderlyUserId="elderly-1"
          caregiverUserId="caregiver-1"
          existingContactUserIds={[]}
          onAdd={mockOnAdd}
        />,
      );
    });

    expect(await screen.findByText('Admin User')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
  });

  it('filters out the elderly user being managed', async () => {
    mockGetDoc.mockResolvedValue(createCaregiverSnap(['elderly-1', 'elderly-2']));
    mockGetDocs.mockResolvedValue(
      createUsersSnapshot([
        { id: 'caregiver-1', displayName: 'Admin' },
        { id: 'elderly-2', displayName: 'Bob' },
      ]),
    );

    const { LinkedUserPicker } = await import('./LinkedUserPicker');
    await act(async () => {
      renderWithProviders(
        <LinkedUserPicker
          elderlyUserId="elderly-1"
          caregiverUserId="caregiver-1"
          existingContactUserIds={[]}
          onAdd={mockOnAdd}
        />,
      );
    });

    // elderly-1 should be excluded (it's the user being managed)
    expect(await screen.findByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('filters out users already in contacts', async () => {
    mockGetDoc.mockResolvedValue(createCaregiverSnap(['elderly-2', 'elderly-3']));
    mockGetDocs.mockResolvedValue(
      createUsersSnapshot([{ id: 'elderly-3', displayName: 'Charlie' }]),
    );

    const { LinkedUserPicker } = await import('./LinkedUserPicker');
    await act(async () => {
      renderWithProviders(
        <LinkedUserPicker
          elderlyUserId="elderly-1"
          caregiverUserId="caregiver-1"
          existingContactUserIds={['caregiver-1', 'elderly-2']}
          onAdd={mockOnAdd}
        />,
      );
    });

    expect(await screen.findByText('Charlie')).toBeInTheDocument();
  });

  it('calls onAdd with correct userId and name when Add is clicked', async () => {
    mockGetDoc.mockResolvedValue(createCaregiverSnap(['elderly-2']));
    mockGetDocs.mockResolvedValue(createUsersSnapshot([{ id: 'elderly-2', displayName: 'Bob' }]));

    const { LinkedUserPicker } = await import('./LinkedUserPicker');
    await act(async () => {
      renderWithProviders(
        <LinkedUserPicker
          elderlyUserId="elderly-1"
          caregiverUserId="caregiver-1"
          existingContactUserIds={['caregiver-1']}
          onAdd={mockOnAdd}
        />,
      );
    });

    const addButton = await screen.findByRole('button', { name: /add bob/i });
    await act(async () => {
      addButton.click();
    });

    expect(mockOnAdd).toHaveBeenCalledWith('elderly-2', 'Bob');
  });

  it('shows empty state when no users available', async () => {
    mockGetDoc.mockResolvedValue(createCaregiverSnap([]));

    const { LinkedUserPicker } = await import('./LinkedUserPicker');
    await act(async () => {
      renderWithProviders(
        <LinkedUserPicker
          elderlyUserId="elderly-1"
          caregiverUserId="caregiver-1"
          existingContactUserIds={['caregiver-1']}
          onAdd={mockOnAdd}
        />,
      );
    });

    expect(await screen.findByText(/all linked members are already added/i)).toBeInTheDocument();
  });

  it('shows Admin fallback for caregiver without displayName', async () => {
    mockGetDoc.mockResolvedValue(createCaregiverSnap([]));
    mockGetDocs.mockResolvedValue(createUsersSnapshot([{ id: 'caregiver-1' }]));

    const { LinkedUserPicker } = await import('./LinkedUserPicker');
    await act(async () => {
      renderWithProviders(
        <LinkedUserPicker
          elderlyUserId="elderly-1"
          caregiverUserId="caregiver-1"
          existingContactUserIds={[]}
          onAdd={mockOnAdd}
        />,
      );
    });

    expect(await screen.findByText('Admin')).toBeInTheDocument();
  });

  it('passes vitest-axe', async () => {
    mockGetDoc.mockResolvedValue(createCaregiverSnap(['elderly-2']));
    mockGetDocs.mockResolvedValue(createUsersSnapshot([{ id: 'elderly-2', displayName: 'Bob' }]));

    const { LinkedUserPicker } = await import('./LinkedUserPicker');
    let container: HTMLElement;
    await act(async () => {
      const result = renderWithProviders(
        <LinkedUserPicker
          elderlyUserId="elderly-1"
          caregiverUserId="caregiver-1"
          existingContactUserIds={['caregiver-1']}
          onAdd={mockOnAdd}
        />,
      );
      container = result.container;
    });

    expect(await axe(container!)).toHaveNoViolations();
  });
});
