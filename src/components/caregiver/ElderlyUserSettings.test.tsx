import { describe, it, expect, vi, beforeEach } from 'vitest';
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
};

describe('ElderlyUserSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedCallback = null;
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

  it('renders current fontSize value from Firestore', () => {
    renderAndEmit();
    expect(screen.getByRole('button', { name: 'Large' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'X-Large' })).toBeInTheDocument();
  });

  it('clicking a fontSize button calls updateDoc with new value', async () => {
    const user = userEvent.setup();
    renderAndEmit();

    await user.click(screen.getByRole('button', { name: /x-large/i }));

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

  it('ringtone volume slider updates on change', () => {
    renderAndEmit();
    const slider = screen.getByRole('slider', { name: /ringtone volume/i });

    fireEvent.change(slider, { target: { value: '50' } });

    expect(mockUpdateDoc).toHaveBeenCalledWith(
      'doc-ref',
      expect.objectContaining({
        settings: expect.objectContaining({ ringtoneVolume: 50 }),
      }),
    );
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
    const user = userEvent.setup();
    renderAndEmit();

    await user.click(screen.getByRole('checkbox', { name: /enable app lock/i }));

    expect(screen.getByLabelText(/^PIN$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm pin/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save pin/i })).toBeInTheDocument();
    // Should NOT write appLockEnabled until PIN is saved
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it('toggling lock off calls updateDoc with appLockEnabled: false and null hash', async () => {
    const user = userEvent.setup();
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
    const user = userEvent.setup();
    renderAndEmit();

    // Toggle on (local only), enter PIN, save
    await user.click(screen.getByRole('checkbox', { name: /enable app lock/i }));
    await user.type(screen.getByLabelText(/^PIN$/i), '1234');
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
    const user = userEvent.setup();
    renderAndEmit({ ...defaultSettings, appLockEnabled: true });

    await user.type(screen.getByLabelText(/^PIN$/i), '1234');
    await user.type(screen.getByLabelText(/confirm pin/i), '5678');
    await user.click(screen.getByRole('button', { name: /save pin/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/do not match/i);
  });

  it('PIN validation: non-4-digit input shows error', async () => {
    const user = userEvent.setup();
    renderAndEmit({ ...defaultSettings, appLockEnabled: true });

    await user.type(screen.getByLabelText(/^PIN$/i), '12');
    await user.type(screen.getByLabelText(/confirm pin/i), '12');
    await user.click(screen.getByRole('button', { name: /save pin/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/exactly 4 digits/i);
  });
});
