import { test, expect } from '@playwright/test';

/**
 * E2E tests for i18n (language switching, RTL) and accessibility (skip-to-content,
 * landmarks, focus traps).
 *
 * PREREQUISITES:
 * - Firebase emulators running: `firebase emulators:start --only auth,firestore`
 * - App served with emulator config: `VITE_USE_EMULATORS=true pnpm dev`
 *
 * Run: `pnpm test:e2e:emulators e2e/i18n-a11y.spec.ts`
 */

const FIRESTORE_EMULATOR = 'http://127.0.0.1:8080';
const AUTH_EMULATOR = 'http://127.0.0.1:9099';
const PROJECT_ID = 'easycall-dev';

const EMULATOR_AUTH_HEADER = { Authorization: 'Bearer owner' };

interface EmulatorUser {
  localId: string;
  idToken: string;
  refreshToken: string;
  expiresIn: string;
}

async function clearEmulators(): Promise<void> {
  const [firestoreRes, authRes] = await Promise.all([
    fetch(
      `${FIRESTORE_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
      { method: 'DELETE' },
    ),
    fetch(`${AUTH_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: 'DELETE' }),
  ]);
  if (!firestoreRes.ok) throw new Error(`Firestore clear failed: ${firestoreRes.status}`);
  if (!authRes.ok) throw new Error(`Auth clear failed: ${authRes.status}`);
}

async function createEmulatorUser(): Promise<EmulatorUser> {
  const res = await fetch(
    `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnSecureToken: true }),
    },
  );
  if (!res.ok) throw new Error(`Auth emulator signUp failed: ${res.status}`);
  return res.json() as Promise<EmulatorUser>;
}

async function seedUserAsElderly(uid: string, settings?: Record<string, unknown>): Promise<void> {
  const settingsFields: Record<string, unknown> = {
    fontSize: { stringValue: 'large' },
    highContrast: { booleanValue: false },
    ringtoneVolume: { integerValue: '80' },
    autoAnswer: { booleanValue: false },
    appLockEnabled: { booleanValue: false },
    appLockPinHash: { nullValue: null },
    language: { stringValue: 'en' },
    ...settings,
  };

  const res = await fetch(
    `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...EMULATOR_AUTH_HEADER },
      body: JSON.stringify({
        fields: {
          role: { stringValue: 'elderly' },
          onboardingComplete: { booleanValue: true },
          displayName: { stringValue: 'Test Elderly User' },
          lastSeen: { timestampValue: new Date().toISOString() },
          settings: { mapValue: { fields: settingsFields } },
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Failed to seed user: ${res.status}`);
}

async function seedContact(uid: string, contactId: string, name: string): Promise<void> {
  const res = await fetch(
    `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}/contacts/${contactId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...EMULATOR_AUTH_HEADER },
      body: JSON.stringify({
        fields: {
          name: { stringValue: name },
          photoURL: { nullValue: null },
          jitsiRoomId: { stringValue: `easycall-${contactId}-abc123` },
          contactUserId: { stringValue: 'user-caregiver-1' },
          displayOrder: { integerValue: '1' },
          createdAt: { timestampValue: new Date().toISOString() },
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Failed to seed contact: ${res.status}`);
}

async function updateUserSettings(uid: string, settings: Record<string, unknown>): Promise<void> {
  // Read current doc, merge settings, write back
  const settingsFields: Record<string, unknown> = {
    fontSize: { stringValue: 'large' },
    highContrast: { booleanValue: false },
    ringtoneVolume: { integerValue: '80' },
    autoAnswer: { booleanValue: false },
    appLockEnabled: { booleanValue: false },
    appLockPinHash: { nullValue: null },
    language: { stringValue: 'en' },
    ...settings,
  };

  const res = await fetch(
    `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}?updateMask.fieldPaths=settings`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...EMULATOR_AUTH_HEADER },
      body: JSON.stringify({
        fields: {
          settings: { mapValue: { fields: settingsFields } },
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Failed to update settings: ${res.status}`);
}

async function checkEmulators(): Promise<void> {
  for (const [name, url] of [
    ['Firestore emulator', FIRESTORE_EMULATOR],
    ['Auth emulator', AUTH_EMULATOR],
  ] as const) {
    try {
      await fetch(url);
    } catch {
      throw new Error(
        `${name} not reachable at ${url}.\nRun: firebase emulators:start --only auth,firestore`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// i18n Tests
// ---------------------------------------------------------------------------

test.describe('i18n — Language switching (emulators)', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(checkEmulators);

  let user: EmulatorUser;

  test.beforeEach(async ({ page }) => {
    await clearEmulators();
    user = await createEmulatorUser();
    await seedUserAsElderly(user.localId);
    await seedContact(user.localId, 'contact-1', 'Alice');

    await page.route('**/accounts:signUp**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user),
      }),
    );
  });

  test('app renders in English by default', async ({ page }) => {
    await page.goto('/elderly');
    await expect(page.getByText('Your Contacts')).toBeVisible({ timeout: 15000 });
    // html lang attribute should be 'en'
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBe('en');
  });

  test('changing language to Spanish updates UI strings', async ({ page }) => {
    await page.goto('/elderly');
    await expect(page.getByText('Your Contacts')).toBeVisible({ timeout: 15000 });

    // Navigate to settings
    await page.getByRole('button', { name: /settings/i }).click();
    await expect(page.getByText('Settings')).toBeVisible({ timeout: 5000 });

    // Click Spanish radio
    await page.getByLabel('Español').click();

    // Verify UI updated to Spanish
    await expect(page.getByText('Ajustes')).toBeVisible({ timeout: 5000 });
  });

  test('Hebrew sets RTL direction on html element', async ({ page }) => {
    // Seed user with Hebrew language
    await updateUserSettings(user.localId, {
      language: { stringValue: 'he' },
    });

    await page.goto('/elderly');
    await expect(page.getByText('אנשי הקשר שלך')).toBeVisible({ timeout: 15000 });

    const dir = await page.locator('html').getAttribute('dir');
    expect(dir).toBe('rtl');

    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBe('he');
  });

  test('language preference persists across page reloads', async ({ page }) => {
    // Seed user with Spanish language directly in Firestore
    await updateUserSettings(user.localId, {
      language: { stringValue: 'es' },
    });

    await page.goto('/elderly');
    // Spanish bundle loads lazily — the title should eventually appear in Spanish
    await expect(page.getByText('Sus Contactos')).toBeVisible({ timeout: 15000 });

    // Reload — language should persist from Firestore
    await page.reload();
    await expect(page.getByText('Sus Contactos')).toBeVisible({ timeout: 15000 });
  });

  test('Russian language renders correctly', async ({ page }) => {
    await updateUserSettings(user.localId, {
      language: { stringValue: 'ru' },
    });

    await page.goto('/elderly');
    await expect(page.getByText('Ваши контакты')).toBeVisible({ timeout: 15000 });

    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBe('ru');

    // dir should remain ltr for Russian
    const dir = await page.locator('html').getAttribute('dir');
    expect(dir).toBe('ltr');
  });
});

// ---------------------------------------------------------------------------
// Accessibility Tests
// ---------------------------------------------------------------------------

test.describe('Accessibility — landmarks and skip-to-content (emulators)', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(checkEmulators);

  test.beforeEach(async ({ page }) => {
    await clearEmulators();
    const user = await createEmulatorUser();
    await seedUserAsElderly(user.localId);
    await seedContact(user.localId, 'contact-1', 'Alice');

    await page.route('**/accounts:signUp**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user),
      }),
    );
  });

  test('page has a main landmark with id main-content', async ({ page }) => {
    await page.goto('/elderly');
    await expect(page.getByText('Alice')).toBeVisible({ timeout: 15000 });

    const main = page.locator('main#main-content');
    await expect(main).toBeVisible();
  });

  test('skip-to-content link exists and targets main-content', async ({ page }) => {
    await page.goto('/elderly');
    await expect(page.getByText('Alice')).toBeVisible({ timeout: 15000 });

    const skipLink = page.getByText('Skip to content');
    await expect(skipLink).toBeAttached();

    const href = await skipLink.getAttribute('href');
    expect(href).toBe('#main-content');
  });

  test('skip-to-content link becomes visible on focus', async ({ page }) => {
    await page.goto('/elderly');
    await expect(page.getByText('Alice')).toBeVisible({ timeout: 15000 });

    // Tab to focus the skip link (first focusable element)
    await page.keyboard.press('Tab');

    const skipLink = page.getByText('Skip to content');
    await expect(skipLink).toBeVisible();
  });
});
