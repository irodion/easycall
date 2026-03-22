import { test, expect } from '@playwright/test';

/**
 * E2E tests for the full elderly name-setting flow:
 *
 * 1. Fresh user goes through OnboardingFlow → SetNameScreen (the race condition fix)
 * 2. Elderly user can change their name from Settings
 *
 * PREREQUISITES:
 * - Firebase emulators running: `firebase emulators:start --only auth,firestore`
 * - App served with emulator config: `VITE_USE_EMULATORS=true pnpm dev`
 *
 * Run: `pnpm test:e2e:emulators e2e/elderly-name-flow.spec.ts`
 */

const FIRESTORE_EMULATOR = 'http://127.0.0.1:8080';
const AUTH_EMULATOR = 'http://127.0.0.1:9099';
const PROJECT_ID = 'easycall-dev';

const EMULATOR_AUTH_HEADER = { Authorization: 'Bearer owner' };

// ---------------------------------------------------------------------------
// Emulator helpers
// ---------------------------------------------------------------------------

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

/** Seed elderly user with onboardingComplete=false (fresh user, pre-onboarding) */
async function seedFreshElderly(uid: string): Promise<void> {
  const res = await fetch(
    `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...EMULATOR_AUTH_HEADER },
      body: JSON.stringify({
        fields: {
          role: { stringValue: 'elderly' },
          onboardingComplete: { booleanValue: false },
          settings: {
            mapValue: {
              fields: {
                fontSize: { stringValue: 'large' },
                highContrast: { booleanValue: false },
                ringtoneVolume: { integerValue: '80' },
                autoAnswer: { booleanValue: false },
                appLockEnabled: { booleanValue: false },
                appLockPinHash: { nullValue: null },
                language: { stringValue: 'en' },
              },
            },
          },
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Failed to seed fresh elderly: ${res.status} ${await res.text()}`);
}

/** Seed elderly user with onboardingComplete=true and a displayName */
async function seedElderlyWithName(uid: string, displayName: string): Promise<void> {
  const res = await fetch(
    `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...EMULATOR_AUTH_HEADER },
      body: JSON.stringify({
        fields: {
          role: { stringValue: 'elderly' },
          onboardingComplete: { booleanValue: true },
          displayName: { stringValue: displayName },
          settings: {
            mapValue: {
              fields: {
                fontSize: { stringValue: 'large' },
                highContrast: { booleanValue: false },
                ringtoneVolume: { integerValue: '80' },
                autoAnswer: { booleanValue: false },
                appLockEnabled: { booleanValue: false },
                appLockPinHash: { nullValue: null },
                language: { stringValue: 'en' },
              },
            },
          },
        },
      }),
    },
  );
  if (!res.ok)
    throw new Error(`Failed to seed elderly with name: ${res.status} ${await res.text()}`);
}

function interceptAuth(page: import('@playwright/test').Page, user: EmulatorUser) {
  return page.route('**/accounts:signUp**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(user),
    }),
  );
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

async function getFirestoreUser(uid: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(
    `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`,
    { headers: { ...EMULATOR_AUTH_HEADER } },
  );
  if (!res.ok) return null;
  return res.json() as Promise<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Suite 1: Onboarding → SetNameScreen (race condition regression test)
// ---------------------------------------------------------------------------

test.describe('Onboarding to Set Name flow (emulators)', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(checkEmulators);

  test('fresh elderly user sees onboarding, then SetNameScreen after completing it', async ({
    page,
  }) => {
    await clearEmulators();

    const user = await createEmulatorUser();
    await seedFreshElderly(user.localId);
    await interceptAuth(page, user);

    await page.goto('/elderly');

    // Should see OnboardingFlow (welcome step)
    await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible({
      timeout: 15_000,
    });

    // Click through onboarding steps until we reach step 4 (Pair with Admin).
    // Note: step 2 (Camera & Microphone) may auto-advance via PermissionCheck
    // when the browser already has camera/mic permission (Chromium test config).
    await page.getByRole('button', { name: /skip/i }).click();

    // Wait for either step 3 or step 4 (step 2 may auto-skip)
    await expect(
      page
        .getByRole('heading', { name: /notification permission/i })
        .or(page.getByRole('heading', { name: /pair/i })),
    ).toBeVisible({ timeout: 5_000 });

    // If on notifications step, skip it
    if (await page.getByRole('heading', { name: /notification permission/i }).isVisible()) {
      await page.getByRole('button', { name: /skip/i }).click();
    }

    // Now on step 4 — finish onboarding
    await expect(page.getByRole('button', { name: /done/i })).toBeVisible({ timeout: 5_000 });
    await page
      .getByRole('button', { name: /done|skip/i })
      .first()
      .click();

    // KEY ASSERTION: After onboarding, the SetNameScreen should appear
    // (not the home screen). This is the race condition that was previously broken.
    await expect(page.getByRole('heading', { name: /what's your name/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('textbox')).toBeVisible();

    // Should NOT show home screen yet
    await expect(page.getByRole('heading', { name: /contacts/i })).not.toBeVisible();
  });

  test('fresh elderly user completes onboarding + sets name → lands on home screen', async ({
    page,
  }) => {
    await clearEmulators();

    const user = await createEmulatorUser();
    await seedFreshElderly(user.localId);
    await interceptAuth(page, user);

    await page.goto('/elderly');

    // Skip through onboarding (step 2 may auto-advance if permissions already granted)
    await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: /skip/i }).click();

    await expect(
      page
        .getByRole('heading', { name: /notification permission/i })
        .or(page.getByRole('heading', { name: /pair/i })),
    ).toBeVisible({ timeout: 5_000 });
    if (await page.getByRole('heading', { name: /notification permission/i }).isVisible()) {
      await page.getByRole('button', { name: /skip/i }).click();
    }

    await expect(page.getByRole('button', { name: /done/i })).toBeVisible({ timeout: 5_000 });
    await page
      .getByRole('button', { name: /done|skip/i })
      .first()
      .click();

    // SetNameScreen should appear
    await expect(page.getByRole('heading', { name: /what's your name/i })).toBeVisible({
      timeout: 15_000,
    });

    // Enter name and submit
    await page.getByRole('textbox').fill('Grandma Rose');
    await page.getByRole('button', { name: /continue/i }).click();

    // Should land on home screen
    await expect(page.getByRole('heading', { name: /contacts/i })).toBeVisible({
      timeout: 15_000,
    });

    // Verify the name was persisted in Firestore
    await expect
      .poll(
        async () => {
          const doc = await getFirestoreUser(user.localId);
          const fields = doc?.['fields'] as Record<string, { stringValue?: string }> | undefined;
          return fields?.['displayName']?.stringValue;
        },
        { timeout: 10_000 },
      )
      .toBe('Grandma Rose');
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Change name from Settings
// ---------------------------------------------------------------------------

test.describe('Elderly change name in Settings (emulators)', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(checkEmulators);

  test('settings screen shows current name and allows editing', async ({ page }) => {
    await clearEmulators();

    const user = await createEmulatorUser();
    await seedElderlyWithName(user.localId, 'Grandma Rose');
    await interceptAuth(page, user);

    await page.goto('/elderly');

    // Wait for home screen
    await expect(page.getByRole('heading', { name: /contacts/i })).toBeVisible({
      timeout: 15_000,
    });

    // Navigate to settings
    await page.getByRole('button', { name: /settings/i }).click();

    // Should see current name displayed
    await expect(page.getByText('Grandma Rose')).toBeVisible({ timeout: 5_000 });

    // Click on the name to edit it
    await page.getByRole('button', { name: /change your name/i }).click();

    // Name editing UI should appear
    await expect(page.locator('#edit-name-input')).toBeVisible();

    // Clear and type new name
    await page.locator('#edit-name-input').fill('Rose');
    await page.getByRole('button', { name: /continue/i }).click();

    // Should return to non-editing state showing new name
    await expect(page.getByText('Rose')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#edit-name-input')).not.toBeVisible();

    // Verify persisted in Firestore
    await expect
      .poll(
        async () => {
          const doc = await getFirestoreUser(user.localId);
          const fields = doc?.['fields'] as Record<string, { stringValue?: string }> | undefined;
          return fields?.['displayName']?.stringValue;
        },
        { timeout: 10_000 },
      )
      .toBe('Rose');
  });

  test('cancel name editing reverts to original name', async ({ page }) => {
    await clearEmulators();

    const user = await createEmulatorUser();
    await seedElderlyWithName(user.localId, 'Grandma Rose');
    await interceptAuth(page, user);

    await page.goto('/elderly/settings');

    // Wait for settings to load
    await expect(page.getByText('Grandma Rose')).toBeVisible({ timeout: 15_000 });

    // Open name editor
    await page.getByRole('button', { name: /change your name/i }).click();
    await expect(page.locator('#edit-name-input')).toBeVisible();

    // Type something different
    await page.locator('#edit-name-input').fill('Someone Else');

    // Cancel
    await page.getByRole('button', { name: /cancel/i }).click();

    // Should revert to original name
    await expect(page.getByText('Grandma Rose')).toBeVisible();
    await expect(page.locator('#edit-name-input')).not.toBeVisible();
  });
});
