import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';
import { createMockCallHistoryEntry } from '@/test/helpers/factories';
import { CallHistory } from './CallHistory';

const mockFetchCallHistory = vi.fn();

vi.mock('@/services/callHistory', () => ({
  fetchCallHistory: (...args: unknown[]) => mockFetchCallHistory(...args),
}));

describe('CallHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading spinner initially', () => {
    mockFetchCallHistory.mockReturnValue(new Promise(() => {})); // never resolves
    renderWithProviders(<CallHistory userId="user-1" />);
    expect(screen.getByRole('status', { name: /loading call history/i })).toBeInTheDocument();
  });

  it('shows "No calls yet" when empty', async () => {
    mockFetchCallHistory.mockResolvedValue({ entries: [], lastDoc: null, hasMore: false });
    await act(async () => {
      renderWithProviders(<CallHistory userId="user-1" />);
    });
    expect(screen.getByText(/No calls yet/)).toBeInTheDocument();
  });

  it('renders entries with names and durations', async () => {
    const entries = [
      createMockCallHistoryEntry({ contactName: 'Alice', duration: 120 }),
      createMockCallHistoryEntry({ contactName: 'Bob', duration: 60 }),
    ];
    mockFetchCallHistory.mockResolvedValue({ entries, lastDoc: null, hasMore: false });

    await act(async () => {
      renderWithProviders(<CallHistory userId="user-1" />);
    });

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('missed calls have red background styling', async () => {
    const entries = [createMockCallHistoryEntry({ contactName: 'Alice', outcome: 'missed' })];
    mockFetchCallHistory.mockResolvedValue({ entries, lastDoc: null, hasMore: false });

    await act(async () => {
      renderWithProviders(<CallHistory userId="user-1" />);
    });

    const btn = screen.getByRole('button', { name: /Call Alice/ });
    expect(btn.className).toContain('bg-error/10');
  });

  it('completed calls have green badge', async () => {
    const entries = [createMockCallHistoryEntry({ contactName: 'Alice', outcome: 'completed' })];
    mockFetchCallHistory.mockResolvedValue({ entries, lastDoc: null, hasMore: false });

    await act(async () => {
      renderWithProviders(<CallHistory userId="user-1" />);
    });

    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('declined calls have ghost badge', async () => {
    const entries = [createMockCallHistoryEntry({ contactName: 'Alice', outcome: 'declined' })];
    mockFetchCallHistory.mockResolvedValue({ entries, lastDoc: null, hasMore: false });

    await act(async () => {
      renderWithProviders(<CallHistory userId="user-1" />);
    });

    expect(screen.getByText('Declined')).toBeInTheDocument();
  });

  it('entry has correct aria-label for calling', async () => {
    const entries = [createMockCallHistoryEntry({ contactName: 'Alice' })];
    mockFetchCallHistory.mockResolvedValue({ entries, lastDoc: null, hasMore: false });

    await act(async () => {
      renderWithProviders(<CallHistory userId="user-1" />);
    });

    expect(screen.getByRole('button', { name: /Call Alice/ })).toBeInTheDocument();
  });

  it('shows "Show more" when hasMore is true', async () => {
    const entries = [createMockCallHistoryEntry()];
    mockFetchCallHistory.mockResolvedValue({ entries, lastDoc: 'snap', hasMore: true });

    await act(async () => {
      renderWithProviders(<CallHistory userId="user-1" />);
    });

    expect(screen.getByRole('button', { name: /show more/i })).toBeInTheDocument();
  });

  it('does not show "Show more" when hasMore is false', async () => {
    const entries = [createMockCallHistoryEntry()];
    mockFetchCallHistory.mockResolvedValue({ entries, lastDoc: null, hasMore: false });

    await act(async () => {
      renderWithProviders(<CallHistory userId="user-1" />);
    });

    expect(screen.queryByRole('button', { name: /show more/i })).not.toBeInTheDocument();
  });

  it('clicking "Show more" loads more entries', async () => {
    const firstEntries = [createMockCallHistoryEntry({ contactName: 'Alice' })];
    const moreEntries = [createMockCallHistoryEntry({ contactName: 'Bob' })];

    mockFetchCallHistory
      .mockResolvedValueOnce({ entries: firstEntries, lastDoc: 'snap1', hasMore: true })
      .mockResolvedValueOnce({ entries: moreEntries, lastDoc: null, hasMore: false });

    await act(async () => {
      renderWithProviders(<CallHistory userId="user-1" />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /show more/i }));
    });

    expect(mockFetchCallHistory).toHaveBeenCalledTimes(2);
    expect(mockFetchCallHistory).toHaveBeenLastCalledWith('user-1', 20, 'snap1');
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('passes vitest-axe accessibility check', async () => {
    const entries = [createMockCallHistoryEntry({ contactName: 'Alice', outcome: 'completed' })];
    mockFetchCallHistory.mockResolvedValue({ entries, lastDoc: null, hasMore: false });

    let container: HTMLElement;
    await act(async () => {
      ({ container } = renderWithProviders(<CallHistory userId="user-1" />));
    });

    expect(await axe(container!)).toHaveNoViolations();
  });
});
