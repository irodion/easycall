import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, act, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/helpers';

type SnapshotCallback = (snap: {
  exists: () => boolean;
  data: () => Record<string, unknown> | undefined;
}) => void;

let capturedCallback: SnapshotCallback | null = null;
const mockUpdateDoc = vi.fn().mockResolvedValue(undefined);

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => 'doc-ref'),
  onSnapshot: vi.fn((_ref: unknown, cb: SnapshotCallback) => {
    capturedCallback = cb;
    return vi.fn();
  }),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
}));

vi.mock('@/services/firebase', () => ({
  db: {},
}));

vi.mock('@/utils/pinHash', () => ({
  hashPin: vi.fn().mockResolvedValue('mocked-hash-value'),
}));

import { ElderlyUserSettings } from './ElderlyUserSettings';

const defaultSettings = {
  fontSize: 'large',
  ringtoneVolume: 80,
  highContrast: false,
  autoAnswer: false,
  appLockEnabled: false,
  appLockPinHash: null,
  restrictedNetworkMode: false,
};

describe('ElderlyUserSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    capturedCallback = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderAndEmit(settings: Record<string, unknown> = defaultSettings) {
    const result = renderWithProviders(<ElderlyUserSettings elderlyUserId="elderly-1" />);
    act(() => {
      capturedCallback!({
        exists: () => true,
        data: () => ({ settings }),
      });
    });
    return result;
  }

  it('renders back to dashboard link', () => {
    renderAndEmit();
    const backLink = screen.getByRole('link', { name: /back to dashboard/i });
    expect(backLink).toBeInTheDocument();
    expect(backLink.getAttribute('href')).toBe('/caregiver');
  });

  it('shows identity header with display name', () => {
    renderWithProviders(<ElderlyUserSettings elderlyUserId="elderly-1" />);
    act(() => {
      capturedCallback!({
        exists: () => true,
        data: () => ({ displayName: 'Grandma Rose', settings: defaultSettings }),
      });
    });
    expect(screen.getByText(/settings for grandma rose/i)).toBeInTheDocument();
  });

  it('shows fallback heading when display name is absent', () => {
    renderAndEmit();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/settings/i);
  });

  it('renders font size as radio group with current value', () => {
    renderAndEmit();
    expect(screen.getByRole('radiogroup', { name: /font size/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Large' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'X-Large' })).not.toBeChecked();
  });

  it('selecting a font size radio calls updateDoc with new value', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderAndEmit();

    await user.click(screen.getByRole('radio', { name: /x-large/i }));

    expect(mockUpdateDoc).toHaveBeenCalledWith(
      'doc-ref',
      expect.objectContaining({
        settings: expect.objectContaining({ fontSize: 'x-large' }),
      }),
    );
  });

  it('ringtone volume slider renders with current value', () => {
    renderAndEmit();
    const slider = screen.getByRole('slider', { name: /ringtone volume/i });
    expect(slider).toHaveValue('80');
  });

  it('ringtone volume slider debounces Firestore writes', () => {
    renderAndEmit();
    const slider = screen.getByRole('slider', { name: /ringtone volume/i });

    fireEvent.change(slider, { target: { value: '50' } });
    // Not written immediately
    expect(mockUpdateDoc).not.toHaveBeenCalled();
    // UI shows local value immediately
    expect(slider).toHaveValue('50');

    // After debounce, write commits
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      'doc-ref',
      expect.objectContaining({
        settings: expect.objectContaining({ ringtoneVolume: 50 }),
      }),
    );
  });

  it('cancels pending volume commit when elderlyUserId changes', () => {
    const { rerender } = renderAndEmit();
    const slider = screen.getByRole('slider', { name: /ringtone volume/i });

    // Start a volume change (debounce pending)
    fireEvent.change(slider, { target: { value: '50' } });
    expect(mockUpdateDoc).not.toHaveBeenCalled();

    // Switch to a different elderly user before debounce fires
    rerender(<ElderlyUserSettings elderlyUserId="elderly-2" />);
    act(() => {
      capturedCallback!({
        exists: () => true,
        data: () => ({ settings: defaultSettings }),
      });
    });

    // Advance past the debounce window — the old commit should NOT fire
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it('clears app-lock draft state when elderlyUserId changes', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { rerender } = renderAndEmit();

    // Start a PIN setup flow for elderly-1
    await user.click(screen.getByRole('checkbox', { name: /enable app lock/i }));
    await user.type(screen.getByLabelText(/set pin/i), '12');

    // PIN fields should be visible
    expect(screen.getByLabelText(/set pin/i)).toHaveValue('12');

    // Switch to a different elderly user
    rerender(<ElderlyUserSettings elderlyUserId="elderly-2" />);
    act(() => {
      capturedCallback!({
        exists: () => true,
        data: () => ({ settings: defaultSettings }),
      });
    });

    // PIN fields should be gone (pendingLockEnabled cleared, lock defaults to off)
    expect(screen.queryByLabelText(/set pin/i)).not.toBeInTheDocument();
    // Toggle should be unchecked (new user has appLockEnabled: false)
    expect(screen.getByRole('checkbox', { name: /enable app lock/i })).not.toBeChecked();
  });

  it('shows loading state before data arrives', () => {
    renderWithProviders(<ElderlyUserSettings elderlyUserId="elderly-1" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('passes vitest-axe', async () => {
    const { container } = renderAndEmit();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  // App Lock tests
  it('lock toggle renders and defaults to off', () => {
    renderAndEmit();
    const toggle = screen.getByRole('checkbox', { name: /enable app lock/i });
    expect(toggle).toBeInTheDocument();
    expect(toggle).not.toBeChecked();
  });

  it('toggling lock on shows PIN setup fields without writing to Firestore', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderAndEmit();

    await user.click(screen.getByRole('checkbox', { name: /enable app lock/i }));

    expect(screen.getByLabelText(/set pin/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm pin/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save pin/i })).toBeInTheDocument();
    // Should NOT write appLockEnabled until PIN is saved
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it('toggling lock off calls updateDoc with appLockEnabled: false and null hash', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderAndEmit({ ...defaultSettings, appLockEnabled: true, appLockPinHash: 'some-hash' });

    await user.click(screen.getByRole('checkbox', { name: /enable app lock/i }));

    expect(mockUpdateDoc).toHaveBeenCalledWith(
      'doc-ref',
      expect.objectContaining({
        settings: expect.objectContaining({
          appLockEnabled: false,
          appLockPinHash: null,
        }),
      }),
    );
  });

  it('saving PIN atomically enables lock and persists hash', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderAndEmit();

    // Toggle on (local only), enter PIN, save
    await user.click(screen.getByRole('checkbox', { name: /enable app lock/i }));
    await user.type(screen.getByLabelText(/set pin/i), '1234');
    await user.type(screen.getByLabelText(/confirm pin/i), '1234');
    await user.click(screen.getByRole('button', { name: /save pin/i }));

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        'doc-ref',
        expect.objectContaining({
          settings: expect.objectContaining({
            appLockEnabled: true,
            appLockPinHash: 'mocked-hash-value',
          }),
        }),
      );
    });
  });

  it('PIN validation: mismatched PINs show error', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderAndEmit({ ...defaultSettings, appLockEnabled: true });

    await user.type(screen.getByLabelText(/set pin/i), '1234');
    await user.type(screen.getByLabelText(/confirm pin/i), '5678');
    await user.click(screen.getByRole('button', { name: /save pin/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/do not match/i);
  });

  it('PIN validation: non-4-digit input shows error', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderAndEmit({ ...defaultSettings, appLockEnabled: true });

    await user.type(screen.getByLabelText(/set pin/i), '12');
    await user.type(screen.getByLabelText(/confirm pin/i), '12');
    await user.click(screen.getByRole('button', { name: /save pin/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/exactly 4 digits/i);
  });

  it('renders restricted network mode toggle', () => {
    renderAndEmit();
    expect(screen.getByRole('checkbox', { name: /restricted network/i })).toBeInTheDocument();
  });

  it('restricted network toggle is off by default', () => {
    renderAndEmit();
    const toggle = screen.getByRole('checkbox', { name: /restricted network/i });
    expect(toggle).not.toBeChecked();
  });

  it('toggling restricted network mode writes to Firestore', async () => {
    renderAndEmit();
    const toggle = screen.getByRole('checkbox', { name: /restricted network/i });
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(mockUpdateDoc).toHaveBeenCalledWith('doc-ref', {
      settings: expect.objectContaining({ restrictedNetworkMode: true }),
    });
  });

  it('restricted network toggle shows enabled when on', () => {
    renderAndEmit({ ...defaultSettings, restrictedNetworkMode: true });
    const toggle = screen.getByRole('checkbox', { name: /restricted network/i });
    expect(toggle).toBeChecked();
  });
});
