import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useCallStore } from '@/stores/callStore';

// --- Mock virtual:pwa-register/react ---
type RegisterSWOptions = {
  onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
};

let capturedOptions: RegisterSWOptions | undefined;

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (opts?: RegisterSWOptions) => {
    capturedOptions = opts;
    return {
      needRefresh: [false, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker: vi.fn(),
    };
  },
}));

// Must import AFTER vi.mock so the mock is in place
import { useServiceWorkerUpdate } from './useServiceWorkerUpdate';

describe('useServiceWorkerUpdate', () => {
  let reloadSpy: ReturnType<typeof vi.fn>;
  let addEventSpy: ReturnType<typeof vi.fn>;
  let removeEventSpy: ReturnType<typeof vi.fn>;
  let controllerChangeHandler: (() => void) | null;
  let visibilityChangeHandler: (() => void) | null;
  const originalServiceWorker = navigator.serviceWorker;

  beforeEach(() => {
    vi.useFakeTimers();
    capturedOptions = undefined;
    controllerChangeHandler = null;
    visibilityChangeHandler = null;

    reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadSpy, pathname: '/elderly' },
      writable: true,
      configurable: true,
    });

    addEventSpy = vi.fn((event: string, handler: () => void) => {
      if (event === 'controllerchange') controllerChangeHandler = handler;
    });
    removeEventSpy = vi.fn();

    // Default: simulate an existing controller (upgrade scenario).
    // Tests for first-install override this to have controller: null.
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        controller: {} as ServiceWorker,
        addEventListener: addEventSpy,
        removeEventListener: removeEventSpy,
      },
      writable: true,
      configurable: true,
    });

    // Mock document.visibilityState and addEventListener for visibilitychange
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    });
    const originalAddEventListener = document.addEventListener.bind(document);
    vi.spyOn(document, 'addEventListener').mockImplementation((event: string, handler: unknown) => {
      if (event === 'visibilitychange') {
        visibilityChangeHandler = handler as () => void;
      }
      return originalAddEventListener(event, handler as EventListenerOrEventListenerObject);
    });

    useCallStore.setState({ isRinging: false, incomingCall: null });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();

    // Restore original serviceWorker
    Object.defineProperty(navigator, 'serviceWorker', {
      value: originalServiceWorker,
      writable: true,
      configurable: true,
    });
  });

  it('calls useRegisterSW on mount', () => {
    renderHook(() => useServiceWorkerUpdate());
    expect(capturedOptions).toBeDefined();
    expect(capturedOptions?.onRegisteredSW).toBeInstanceOf(Function);
  });

  it('checks for updates on visibilitychange (visible) with min interval', () => {
    renderHook(() => useServiceWorkerUpdate());

    const mockRegistration = {
      installing: null,
      update: vi.fn().mockResolvedValue(undefined),
    } as unknown as ServiceWorkerRegistration;

    // Trigger onRegisteredSW
    capturedOptions?.onRegisteredSW?.('sw.js', mockRegistration);

    // Simulate app coming to foreground
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    visibilityChangeHandler?.();

    // Should NOT call update immediately — min interval hasn't passed
    expect(mockRegistration.update).not.toHaveBeenCalled();

    // Advance past the minimum interval (1 hour)
    vi.advanceTimersByTime(60 * 60 * 1000 + 1);

    // Now simulate another foreground event
    visibilityChangeHandler?.();
    expect(mockRegistration.update).toHaveBeenCalledTimes(1);
  });

  it('skips update check when offline', () => {
    renderHook(() => useServiceWorkerUpdate());

    const mockRegistration = {
      installing: null,
      update: vi.fn().mockResolvedValue(undefined),
    } as unknown as ServiceWorkerRegistration;

    capturedOptions?.onRegisteredSW?.('sw.js', mockRegistration);

    // Advance past min interval
    vi.advanceTimersByTime(60 * 60 * 1000 + 1);

    // Go offline
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    visibilityChangeHandler?.();

    expect(mockRegistration.update).not.toHaveBeenCalled();
  });

  it('skips update check when SW is installing', () => {
    renderHook(() => useServiceWorkerUpdate());

    const mockRegistration = {
      installing: {} as ServiceWorker,
      update: vi.fn().mockResolvedValue(undefined),
    } as unknown as ServiceWorkerRegistration;

    capturedOptions?.onRegisteredSW?.('sw.js', mockRegistration);

    vi.advanceTimersByTime(60 * 60 * 1000 + 1);

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    visibilityChangeHandler?.();

    expect(mockRegistration.update).not.toHaveBeenCalled();
  });

  it('reloads page on controllerchange when not in a call', () => {
    renderHook(() => useServiceWorkerUpdate());

    expect(addEventSpy).toHaveBeenCalledWith('controllerchange', expect.any(Function));

    controllerChangeHandler!();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('defers reload when callStore.isRinging is true', () => {
    useCallStore.setState({ isRinging: true, incomingCall: null });

    renderHook(() => useServiceWorkerUpdate());
    controllerChangeHandler!();

    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('defers reload when pathname starts with /call', () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadSpy, pathname: '/call/contact-1' },
      writable: true,
      configurable: true,
    });

    renderHook(() => useServiceWorkerUpdate());
    controllerChangeHandler!();

    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('triggers deferred reload when isRinging becomes false', () => {
    useCallStore.setState({ isRinging: true, incomingCall: null });

    renderHook(() => useServiceWorkerUpdate());

    // SW update arrives during ringing
    controllerChangeHandler!();
    expect(reloadSpy).not.toHaveBeenCalled();

    // Call ends
    act(() => {
      useCallStore.setState({ isRinging: false, incomingCall: null });
    });

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('triggers deferred reload when pathname changes away from /call', () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadSpy, pathname: '/call-room/room-1' },
      writable: true,
      configurable: true,
    });

    const { rerender } = renderHook(() => useServiceWorkerUpdate());

    // SW update arrives during active call
    controllerChangeHandler!();
    expect(reloadSpy).not.toHaveBeenCalled();

    // User navigates away from call
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadSpy, pathname: '/elderly' },
      writable: true,
      configurable: true,
    });

    rerender();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('removes controllerchange listener on unmount', () => {
    const { unmount } = renderHook(() => useServiceWorkerUpdate());
    unmount();

    expect(removeEventSpy).toHaveBeenCalledWith('controllerchange', expect.any(Function));
  });

  it('is a no-op when navigator.serviceWorker is undefined', () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    // Should not throw
    const { unmount } = renderHook(() => useServiceWorkerUpdate());
    unmount();

    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('ignores first controllerchange on initial SW install (no prior controller)', () => {
    // First-time visitor: no controller exists yet
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        controller: null,
        addEventListener: addEventSpy,
        removeEventListener: removeEventSpy,
      },
      writable: true,
      configurable: true,
    });

    renderHook(() => useServiceWorkerUpdate());

    // First controllerchange = initial install, should be ignored
    controllerChangeHandler!();
    expect(reloadSpy).not.toHaveBeenCalled();

    // Second controllerchange = real update, should reload
    controllerChangeHandler!();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('does not double-reload on multiple controllerchange events during call', () => {
    useCallStore.setState({ isRinging: true, incomingCall: null });

    renderHook(() => useServiceWorkerUpdate());

    // Multiple SW updates while in call
    controllerChangeHandler!();
    controllerChangeHandler!();
    controllerChangeHandler!();

    expect(reloadSpy).not.toHaveBeenCalled();

    // Call ends — only one reload
    act(() => {
      useCallStore.setState({ isRinging: false, incomingCall: null });
    });

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
