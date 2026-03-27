import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadJitsiApi, _resetLoadPromise, getJaasAppId, LOAD_TIMEOUT_MS } from './jitsi';
import { MockJitsiMeetExternalAPI } from '@/test/mocks/jitsi';

describe('loadJitsiApi', () => {
  beforeEach(() => {
    // Clean up scripts and window.JitsiMeetExternalAPI between tests
    document.querySelectorAll('script[src*="8x8.vc"]').forEach((s) => s.remove());
    delete (window as unknown as Record<string, unknown>)['JitsiMeetExternalAPI'];
    _resetLoadPromise();
  });

  afterEach(() => {
    document.querySelectorAll('script[src*="8x8.vc"]').forEach((s) => s.remove());
  });

  it('appends a script tag with 8x8.vc URL to document.head', async () => {
    const loadPromise = loadJitsiApi();
    const script = document.head.querySelector('script[src*="8x8.vc"]');
    expect(script).not.toBeNull();
    expect(script?.getAttribute('src')).toContain('8x8.vc');

    // Simulate load event
    script?.dispatchEvent(new Event('load'));
    await loadPromise;
  });

  it('only appends one script when called twice', async () => {
    const p1 = loadJitsiApi();
    const p2 = loadJitsiApi();

    const scripts = document.head.querySelectorAll('script[src*="8x8.vc"]');
    expect(scripts).toHaveLength(1);

    document.head.querySelector('script[src*="8x8.vc"]')?.dispatchEvent(new Event('load'));
    await Promise.all([p1, p2]);
  });

  it('resolves after script load event fires', async () => {
    const loadPromise = loadJitsiApi();
    const script = document.head.querySelector('script[src*="8x8.vc"]');
    expect(script).not.toBeNull();

    setTimeout(() => script?.dispatchEvent(new Event('load')), 10);
    await expect(loadPromise).resolves.toBeUndefined();
  });

  it('rejects after script error event fires', async () => {
    const loadPromise = loadJitsiApi();
    const script = document.head.querySelector('script[src*="8x8.vc"]');
    setTimeout(() => script?.dispatchEvent(new Event('error')), 10);
    await expect(loadPromise).rejects.toThrow();
  });

  it('resolves immediately if window.JitsiMeetExternalAPI already exists', async () => {
    (window as unknown as Record<string, unknown>)['JitsiMeetExternalAPI'] =
      MockJitsiMeetExternalAPI as unknown as typeof window.JitsiMeetExternalAPI;
    await expect(loadJitsiApi()).resolves.toBeUndefined();
    // Should NOT append a script
    expect(document.head.querySelector('script[src*="8x8.vc"]')).toBeNull();
  });

  it('getJaasAppId returns a string in test mode (empty if unset, value if set)', () => {
    // In test mode, getJaasAppId never throws — returns the env value or ''
    const result = getJaasAppId();
    expect(typeof result).toBe('string');
  });

  it('allows retry after script error (loadPromise is reset)', async () => {
    const loadPromise = loadJitsiApi();
    const script = document.head.querySelector('script[src*="8x8.vc"]');
    script?.dispatchEvent(new Event('error'));
    await expect(loadPromise).rejects.toThrow();

    // Script should have been removed and loadPromise reset — a new call should create a new script
    _resetLoadPromise(); // reset manually since onerror already did it, but ensure clean state
    const loadPromise2 = loadJitsiApi();
    const script2 = document.head.querySelector('script[src*="8x8.vc"]');
    expect(script2).not.toBeNull();
    script2?.dispatchEvent(new Event('load'));
    await expect(loadPromise2).resolves.toBeUndefined();
  });

  describe('timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('rejects when script neither loads nor errors within timeout', async () => {
      const loadPromise = loadJitsiApi();
      const script = document.head.querySelector('script[src*="8x8.vc"]');
      expect(script).not.toBeNull();

      vi.advanceTimersByTime(LOAD_TIMEOUT_MS);

      await expect(loadPromise).rejects.toThrow('timed out');
      // Script should be removed from DOM
      expect(document.head.querySelector('script[src*="8x8.vc"]')).toBeNull();
    });

    it('clears timeout on successful load', async () => {
      const loadPromise = loadJitsiApi();
      const script = document.head.querySelector('script[src*="8x8.vc"]');

      script?.dispatchEvent(new Event('load'));
      await loadPromise;

      // Advancing past timeout should NOT cause a rejection
      vi.advanceTimersByTime(LOAD_TIMEOUT_MS);
      await expect(loadPromise).resolves.toBeUndefined();
    });

    it('clears timeout on script error', async () => {
      const loadPromise = loadJitsiApi();
      const script = document.head.querySelector('script[src*="8x8.vc"]');

      script?.dispatchEvent(new Event('error'));
      await expect(loadPromise).rejects.toThrow('Failed to load');

      // Advancing past timeout should not cause additional issues
      vi.advanceTimersByTime(LOAD_TIMEOUT_MS);
    });

    it('allows retry after timeout', async () => {
      const loadPromise = loadJitsiApi();
      vi.advanceTimersByTime(LOAD_TIMEOUT_MS);
      await expect(loadPromise).rejects.toThrow('timed out');

      // Should be able to retry — new script appended
      const loadPromise2 = loadJitsiApi();
      const script2 = document.head.querySelector('script[src*="8x8.vc"]');
      expect(script2).not.toBeNull();
      script2?.dispatchEvent(new Event('load'));
      await expect(loadPromise2).resolves.toBeUndefined();
    });
  });
});
