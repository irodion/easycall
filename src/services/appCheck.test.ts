import { describe, it, expect, vi, afterEach } from 'vitest';

const mockAppCheck = { type: 'app-check' };
const mockApp = { name: '[DEFAULT]' };

describe('App Check initialization', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  function mockDependencies(options?: { siteKey?: string }) {
    vi.stubEnv('VITE_RECAPTCHA_V3_SITE_KEY', options?.siteKey ?? 'test-site-key');
    vi.doMock('firebase/app-check', () => ({
      initializeAppCheck: vi.fn(() => mockAppCheck),
      ReCaptchaV3Provider: vi.fn(),
    }));
    vi.doMock('./firebase', () => ({ app: mockApp }));
  }

  it('returns null in test mode', async () => {
    mockDependencies({ siteKey: 'key' });
    // import.meta.env.MODE is 'test' in vitest
    const { initAppCheck } = await import('./appCheck');
    expect(initAppCheck()).toBeNull();
  });

  it('returns null when site key is missing', async () => {
    mockDependencies({ siteKey: '' });
    const { initAppCheck } = await import('./appCheck');
    expect(initAppCheck()).toBeNull();
  });

  it('initializes with ReCaptchaV3Provider when site key is present and mode is not test', async () => {
    vi.stubEnv('MODE', 'production');
    mockDependencies({ siteKey: 'my-site-key' });
    const { initAppCheck } = await import('./appCheck');
    const result = initAppCheck();
    const { initializeAppCheck, ReCaptchaV3Provider } = await import('firebase/app-check');
    expect(ReCaptchaV3Provider).toHaveBeenCalledWith('my-site-key');
    expect(initializeAppCheck).toHaveBeenCalledWith(mockApp, {
      provider: expect.anything(),
      isTokenAutoRefreshEnabled: true,
    });
    expect(result).toBe(mockAppCheck);
  });

  it('returns cached instance on subsequent calls', async () => {
    vi.stubEnv('MODE', 'production');
    mockDependencies({ siteKey: 'my-site-key' });
    const { initAppCheck } = await import('./appCheck');
    const first = initAppCheck();
    const second = initAppCheck();
    expect(first).toBe(second);
    const { initializeAppCheck } = await import('firebase/app-check');
    expect(initializeAppCheck).toHaveBeenCalledTimes(1);
  });
});
