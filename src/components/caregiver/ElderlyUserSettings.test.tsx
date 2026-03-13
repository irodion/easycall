import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, act, fireEvent } from '@testing-library/react';
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

import { ElderlyUserSettings } from './ElderlyUserSettings';

describe('ElderlyUserSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedCallback = null;
  });

  function renderAndEmit(settings = { fontSize: 'large', ringtoneVolume: 80 }) {
    const result = renderWithProviders(
      <ElderlyUserSettings elderlyUserId="elderly-1" />,
    );
    act(() => {
      capturedCallback!({
        exists: () => true,
        data: () => ({ settings }),
      });
    });
    return result;
  }

  it('renders current fontSize value from Firestore', () => {
    renderAndEmit({ fontSize: 'large', ringtoneVolume: 80 });
    expect(screen.getByRole('button', { name: 'Large' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'X-Large' })).toBeInTheDocument();
  });

  it('clicking a fontSize button calls updateDoc with new value', async () => {
    const user = userEvent.setup();
    renderAndEmit({ fontSize: 'large', ringtoneVolume: 80 });

    await user.click(screen.getByRole('button', { name: /x-large/i }));

    expect(mockUpdateDoc).toHaveBeenCalledWith(
      'doc-ref',
      expect.objectContaining({
        settings: expect.objectContaining({ fontSize: 'x-large' }),
      }),
    );
  });

  it('ringtone volume slider renders with current value', () => {
    renderAndEmit({ fontSize: 'large', ringtoneVolume: 80 });
    const slider = screen.getByRole('slider', { name: /ringtone volume/i });
    expect(slider).toHaveValue('80');
  });

  it('ringtone volume slider updates on change', () => {
    renderAndEmit({ fontSize: 'large', ringtoneVolume: 80 });
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
    const { container } = renderAndEmit({ fontSize: 'large', ringtoneVolume: 80 });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
