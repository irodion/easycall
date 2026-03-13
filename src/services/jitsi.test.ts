import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadJitsiApi, _resetLoadPromise } from './jitsi';

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
    (window as unknown as Record<string, unknown>)['JitsiMeetExternalAPI'] = class {};
    await expect(loadJitsiApi()).resolves.toBeUndefined();
    // Should NOT append a script
    expect(document.head.querySelector('script[src*="8x8.vc"]')).toBeNull();
  });
});
