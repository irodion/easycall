import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { DEFAULT_USER_SETTINGS } from '@/types/user';
import type { UserSettings } from '@/types/user';

vi.mock('@/utils/pinHash', () => ({
  verifyPin: vi.fn(),
}));

import { useAppLock } from './useAppLock';
import { verifyPin } from '@/utils/pinHash';

const mockedVerifyPin = vi.mocked(verifyPin);

function wrapper(initialEntries = ['/']): ({ children }: { children: ReactNode }) => ReactNode {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
  );
}

const lockedSettings: UserSettings = {
  ...DEFAULT_USER_SETTINGS,
  appLockEnabled: true,
  appLockPinHash: 'abc123hash',
};

describe('useAppLock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns isLocked: false when appLockEnabled is false', () => {
    const { result } = renderHook(() => useAppLock({ settings: DEFAULT_USER_SETTINGS }), {
      wrapper: wrapper(),
    });
    expect(result.current.isLocked).toBe(false);
  });

  it('returns isLocked: false when appLockPinHash is null', () => {
    const settings: UserSettings = {
      ...DEFAULT_USER_SETTINGS,
      appLockEnabled: true,
      appLockPinHash: null,
    };
    const { result } = renderHook(() => useAppLock({ settings }), {
      wrapper: wrapper(),
    });
    expect(result.current.isLocked).toBe(false);
  });

  it('returns isLocked: true on mount when lock is enabled with PIN hash', () => {
    const { result } = renderHook(() => useAppLock({ settings: lockedSettings }), {
      wrapper: wrapper(),
    });
    expect(result.current.isLocked).toBe(true);
  });

  it('unlockWithPin with correct PIN sets isLocked: false', async () => {
    mockedVerifyPin.mockResolvedValue(true);
    const { result } = renderHook(() => useAppLock({ settings: lockedSettings }), {
      wrapper: wrapper(),
    });

    let success = false;
    await act(async () => {
      success = await result.current.unlockWithPin('1234');
    });
    expect(success).toBe(true);
    expect(result.current.isLocked).toBe(false);
    expect(result.current.failedAttempts).toBe(0);
  });

  it('unlockWithPin with wrong PIN increments failedAttempts', async () => {
    mockedVerifyPin.mockResolvedValue(false);
    const { result } = renderHook(() => useAppLock({ settings: lockedSettings }), {
      wrapper: wrapper(),
    });

    await act(async () => {
      await result.current.unlockWithPin('0000');
    });
    expect(result.current.isLocked).toBe(true);
    expect(result.current.failedAttempts).toBe(1);
  });

  it('3 failed attempts triggers 30-second cooldown', async () => {
    mockedVerifyPin.mockResolvedValue(false);
    const { result } = renderHook(() => useAppLock({ settings: lockedSettings }), {
      wrapper: wrapper(),
    });

    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await result.current.unlockWithPin('0000');
      });
    }
    expect(result.current.failedAttempts).toBe(0);
    expect(result.current.cooldownRemaining).toBe(30);
  });

  it('during cooldown, unlockWithPin returns false without verifying', async () => {
    mockedVerifyPin.mockResolvedValue(false);
    const { result } = renderHook(() => useAppLock({ settings: lockedSettings }), {
      wrapper: wrapper(),
    });

    // Trigger cooldown
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await result.current.unlockWithPin('0000');
      });
    }
    mockedVerifyPin.mockClear();

    await act(async () => {
      const res = await result.current.unlockWithPin('1234');
      expect(res).toBe(false);
    });
    expect(mockedVerifyPin).not.toHaveBeenCalled();
  });

  it('cooldown decrements each second', async () => {
    vi.useFakeTimers();
    mockedVerifyPin.mockResolvedValue(false);
    const { result } = renderHook(() => useAppLock({ settings: lockedSettings }), {
      wrapper: wrapper(),
    });

    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await result.current.unlockWithPin('0000');
      });
    }
    expect(result.current.cooldownRemaining).toBe(30);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.cooldownRemaining).toBe(29);

    act(() => {
      vi.advanceTimersByTime(29_000);
    });
    expect(result.current.cooldownRemaining).toBe(0);
  });

  it('inactivity timer re-locks after 5 minutes', async () => {
    vi.useFakeTimers();
    mockedVerifyPin.mockResolvedValue(true);
    const { result } = renderHook(() => useAppLock({ settings: lockedSettings }), {
      wrapper: wrapper(),
    });

    // Unlock first
    await act(async () => {
      await result.current.unlockWithPin('1234');
    });
    expect(result.current.isLocked).toBe(false);

    // Advance 5 minutes
    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1000);
    });
    expect(result.current.isLocked).toBe(true);
  });

  it('does not lock when on a /call/ route', async () => {
    vi.useFakeTimers();
    mockedVerifyPin.mockResolvedValue(true);
    const { result } = renderHook(() => useAppLock({ settings: lockedSettings }), {
      wrapper: wrapper(['/call/room-1']),
    });

    // Starts locked, but unlock
    await act(async () => {
      await result.current.unlockWithPin('1234');
    });
    expect(result.current.isLocked).toBe(false);

    // Advance 5 minutes — should NOT re-lock during call
    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1000);
    });
    expect(result.current.isLocked).toBe(false);
  });

  it('unlocks when appLockEnabled changes to false', () => {
    const { result, rerender } = renderHook(
      ({ settings }: { settings: UserSettings }) => useAppLock({ settings }),
      { wrapper: wrapper(), initialProps: { settings: lockedSettings } },
    );
    expect(result.current.isLocked).toBe(true);

    rerender({ settings: DEFAULT_USER_SETTINGS });
    expect(result.current.isLocked).toBe(false);
  });
});
