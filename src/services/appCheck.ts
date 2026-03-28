import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import type { AppCheck } from 'firebase/app-check';
import { app } from '@/services/firebase';

declare global {
  var FIREBASE_APPCHECK_DEBUG_TOKEN: boolean | string | undefined;
}

let appCheck: AppCheck | null = null;

export function initAppCheck(): AppCheck | null {
  if (appCheck) return appCheck;

  // Skip in test mode — jsdom has no reCAPTCHA support
  if (import.meta.env.MODE === 'test') return null;

  const siteKey = import.meta.env.VITE_RECAPTCHA_V3_SITE_KEY;
  if (!siteKey) {
    if (import.meta.env.DEV) {
      // nosemgrep: no-console-log-sensitive — logs static config guidance, no secrets
      console.warn(
        'VITE_RECAPTCHA_V3_SITE_KEY not set — App Check disabled. Set it in .env.local for development.',
      );
      return null;
    }
    throw new Error(
      'VITE_RECAPTCHA_V3_SITE_KEY is not set. App Check is required in production. ' +
        'Set it in your environment variables.',
    );
  }

  // Enable debug token in development (prints token to console on first run;
  // register it in Firebase Console → App Check → Manage Debug Tokens)
  if (import.meta.env.DEV || import.meta.env.VITE_USE_EMULATORS === 'true') {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APP_CHECK_DEBUG_TOKEN || true;
  }

  try {
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    // App Check init can fail if reCAPTCHA scripts are blocked (e.g. restricted
    // networks, privacy-focused browsers). Log but don't crash — Firebase calls
    // will still fail with app-check errors, which RoleSelector surfaces as a
    // user-friendly message.
    // nosemgrep: no-console-log-sensitive — logs error object, not credentials
    console.warn('App Check initialization failed:', err);
    return null;
  }

  return appCheck;
}

// Auto-initialize on import
initAppCheck();
