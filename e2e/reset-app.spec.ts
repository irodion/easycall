import { test, expect } from '@playwright/test';

/**
 * E2E test for the Reset App / Uninstall Guide feature.
 *
 * PREREQUISITES:
 * - Firebase emulators running: `firebase emulators:start --only auth,firestore`
 * - App served with emulator config: `VITE_USE_EMULATORS=true pnpm dev`
 *
 * Run: `pnpm test:e2e:emulators e2e/reset-app.spec.ts`
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

async function seedUserAsElderly(uid: string): Promise<void> {
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
          settings: {
            mapValue: {
              fields: {
                fontSize: { stringValue: 'large' },
                highContrast: { booleanValue: false },
                ringtoneVolume: { integerValue: '80' },
                autoAnswer: { booleanValue: false },
                appLockEnabled: { booleanValue: false },
                appLockPinHash: { nullValue: null },
              },
            },
          },
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Failed to seed elderly user: ${res.status}`);
}

async function seedUserAsCaregiver(uid: string): Promise<void> {
  const res = await fetch(
    `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...EMULATOR_AUTH_HEADER },
      body: JSON.stringify({
        fields: {
          role: { stringValue: 'caregiver' },
          onboardingComplete: { booleanValue: true },
          displayName: { stringValue: 'Test Caregiver' },
          lastSeen: { timestampValue: new Date().toISOString() },
          linkedElderlyUsers: {
            arrayValue: { values: [] },
          },
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Failed to seed caregiver: ${res.status}`);
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
// Suite 1: Elderly Settings — Reset App
// ---------------------------------------------------------------------------

test.describe('Reset App — elderly settings (emulators)', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(checkEmulators);

  test('Reset App button is visible on elderly settings page', async ({ browser }) => {
    await clearEmulators();

    const user = await createEmulatorUser();
    await seedUserAsElderly(user.localId);

    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const page = await ctx.newPage();

    await page.route('**/accounts:signUp**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user),
      }),
    );

    await page.goto('/elderly/settings');
    await expect(page.getByRole('button', { name: /reset app/i })).toBeVisible({
      timeout: 15_000,
    });

    await ctx.close();
  });

  test('Cancel in confirm dialog does not navigate away', async ({ browser }) => {
    await clearEmulators();

    const user = await createEmulatorUser();
    await seedUserAsElderly(user.localId);

    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const page = await ctx.newPage();

    await page.route('**/accounts:signUp**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user),
      }),
    );

    await page.goto('/elderly/settings');
    await expect(page.getByRole('button', { name: /reset app/i })).toBeVisible({
      timeout: 15_000,
    });

    // Click Reset App → confirm dialog appears
    await page.getByRole('button', { name: /reset app/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/sign you out and remove all app data/i)).toBeVisible();

    // Cancel → dialog closes, still on settings
    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page).toHaveURL(/\/elderly\/settings/);

    await ctx.close();
  });

  test('Confirm reset navigates to root', async ({ browser }) => {
    await clearEmulators();

    const user = await createEmulatorUser();
    await seedUserAsElderly(user.localId);

    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const page = await ctx.newPage();

    await page.route('**/accounts:signUp**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user),
      }),
    );

    await page.goto('/elderly/settings');
    await expect(page.getByRole('button', { name: /reset app/i })).toBeVisible({
      timeout: 15_000,
    });

    // Click Reset App → Confirm
    await page.getByRole('button', { name: /reset app/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: /confirm/i }).click();

    // App should reload to root (role selector)
    await expect(page).toHaveURL('/', { timeout: 15_000 });

    await ctx.close();
  });

  test('Uninstall Guide expands with platform instructions', async ({ browser }) => {
    await clearEmulators();

    const user = await createEmulatorUser();
    await seedUserAsElderly(user.localId);

    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const page = await ctx.newPage();

    await page.route('**/accounts:signUp**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user),
      }),
    );

    await page.goto('/elderly/settings');
    const toggleBtn = page.getByRole('button', { name: /how to remove/i });
    await expect(toggleBtn).toBeVisible({ timeout: 15_000 });

    // Initially collapsed
    await expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');

    // Expand
    await toggleBtn.click();
    await expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
    // Should show some platform instructions (at least one step is visible)
    await expect(page.locator('ol')).toBeVisible();

    // Collapse
    await toggleBtn.click();
    await expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');

    await ctx.close();
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Caregiver Account — Reset App
// ---------------------------------------------------------------------------

test.describe('Reset App — caregiver account (emulators)', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(checkEmulators);

  test('Reset App button is visible on caregiver account page', async ({ browser }) => {
    await clearEmulators();

    const user = await createEmulatorUser();
    await seedUserAsCaregiver(user.localId);

    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.route('**/accounts:signUp**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user),
      }),
    );

    await page.goto('/caregiver/account');
    await expect(page.getByRole('button', { name: /reset app/i })).toBeVisible({
      timeout: 15_000,
    });

    await ctx.close();
  });

  test('Confirm reset on caregiver account navigates to root', async ({ browser }) => {
    await clearEmulators();

    const user = await createEmulatorUser();
    await seedUserAsCaregiver(user.localId);

    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.route('**/accounts:signUp**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user),
      }),
    );

    await page.goto('/caregiver/account');
    await expect(page.getByRole('button', { name: /reset app/i })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: /reset app/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: /confirm/i }).click();

    // App should reload to root
    await expect(page).toHaveURL('/', { timeout: 15_000 });

    await ctx.close();
  });

  test('Uninstall Guide visible on caregiver account page', async ({ browser }) => {
    await clearEmulators();

    const user = await createEmulatorUser();
    await seedUserAsCaregiver(user.localId);

    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.route('**/accounts:signUp**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user),
      }),
    );

    await page.goto('/caregiver/account');
    await expect(page.getByRole('button', { name: /how to remove/i })).toBeVisible({
      timeout: 15_000,
    });

    await ctx.close();
  });
});
