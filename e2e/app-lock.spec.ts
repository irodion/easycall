import { test, expect } from '@playwright/test';

/**
 * E2E test for the App Lock (PIN lock) feature.
 *
 * PREREQUISITES:
 * - Firebase emulators running: `firebase emulators:start --only auth,firestore`
 * - App served with emulator config: `VITE_USE_EMULATORS=true pnpm dev`
 *
 * Run: `pnpm test:e2e:emulators e2e/app-lock.spec.ts`
 */

const FIRESTORE_EMULATOR = 'http://127.0.0.1:8080';
const AUTH_EMULATOR = 'http://127.0.0.1:9099';
const PROJECT_ID = 'easycall-dev';

const EMULATOR_AUTH_HEADER = { Authorization: 'Bearer owner' };

// Pre-computed SHA-256 of "easycall-pin-v1" + "1234"
const PIN_HASH_1234 = '3a198364fe8c22ae8fe57c7fb6a0ba33fab82c0ac03184b0467759a66e652b98';

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

test.describe('App Lock (emulators)', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(checkEmulators);

  test('lock screen appears when app lock is enabled with PIN', async ({ browser }) => {
    await clearEmulators();

    const user = await createEmulatorUser();
    await seedUserAsElderly(user.localId, {
      appLockEnabled: { booleanValue: true },
      appLockPinHash: { stringValue: PIN_HASH_1234 },
    });

    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const page = await ctx.newPage();

    await page.route('**/accounts:signUp**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user),
      }),
    );

    await page.goto('/elderly');

    // Lock screen should appear
    await expect(page.getByRole('dialog', { name: /app lock screen/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('Enter PIN to unlock')).toBeVisible();

    await ctx.close();
  });

  test('correct PIN unlocks the app', async ({ browser }) => {
    await clearEmulators();

    const user = await createEmulatorUser();
    await seedUserAsElderly(user.localId, {
      appLockEnabled: { booleanValue: true },
      appLockPinHash: { stringValue: PIN_HASH_1234 },
    });

    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const page = await ctx.newPage();

    await page.route('**/accounts:signUp**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user),
      }),
    );

    await page.goto('/elderly');

    await expect(page.getByRole('dialog', { name: /app lock screen/i })).toBeVisible({
      timeout: 15_000,
    });

    // Enter PIN: 1-2-3-4
    await page.getByRole('button', { name: '1' }).click();
    await page.getByRole('button', { name: '2' }).click();
    await page.getByRole('button', { name: '3' }).click();
    await page.getByRole('button', { name: '4' }).click();

    // Lock screen should disappear and HomeScreen should be visible
    await expect(page.getByRole('dialog', { name: /app lock screen/i })).not.toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('heading', { name: 'Contacts' })).toBeVisible({ timeout: 10_000 });

    await ctx.close();
  });

  test('wrong PIN shows error and 3 failures trigger cooldown', async ({ browser }) => {
    await clearEmulators();

    const user = await createEmulatorUser();
    await seedUserAsElderly(user.localId, {
      appLockEnabled: { booleanValue: true },
      appLockPinHash: { stringValue: PIN_HASH_1234 },
    });

    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const page = await ctx.newPage();

    await page.route('**/accounts:signUp**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user),
      }),
    );

    await page.goto('/elderly');

    await expect(page.getByRole('dialog', { name: /app lock screen/i })).toBeVisible({
      timeout: 15_000,
    });

    // Enter wrong PIN 3 times: 0-0-0-0
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.getByRole('button', { name: '0' }).click();
      await page.getByRole('button', { name: '0' }).click();
      await page.getByRole('button', { name: '0' }).click();
      await page.getByRole('button', { name: '0' }).click();

      if (attempt < 2) {
        // First two failures show "Wrong PIN"
        await expect(page.getByText('Wrong PIN')).toBeVisible({ timeout: 5_000 });
      }
    }

    // After 3rd failure, cooldown message should appear
    await expect(page.getByText(/too many attempts/i)).toBeVisible({ timeout: 5_000 });

    // Keypad buttons should be disabled during cooldown
    await expect(page.getByRole('button', { name: '1' })).toBeDisabled();

    await ctx.close();
  });

  test('incoming call bypasses the lock screen', async ({ browser }) => {
    await clearEmulators();

    const user = await createEmulatorUser();
    const uid = user.localId;
    await seedUserAsElderly(uid, {
      appLockEnabled: { booleanValue: true },
      appLockPinHash: { stringValue: PIN_HASH_1234 },
    });

    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const page = await ctx.newPage();

    await page.route('**/accounts:signUp**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user),
      }),
    );

    await page.goto('/elderly');

    // Lock screen should be visible
    await expect(page.getByRole('dialog', { name: /app lock screen/i })).toBeVisible({
      timeout: 15_000,
    });

    // Write incoming call document via Firestore emulator REST API
    const firestoreUrl = `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}/incomingCall/current`;

    const response = await page.request.patch(firestoreUrl, {
      headers: {
        ...EMULATOR_AUTH_HEADER,
        'Content-Type': 'application/json',
      },
      data: {
        fields: {
          callerId: { stringValue: 'caller-test-1' },
          callerName: { stringValue: 'Test Caller' },
          callerPhotoURL: { stringValue: '' },
          jitsiRoomId: { stringValue: 'test-room-lock-e2e' },
          status: { stringValue: 'ringing' },
          timestamp: { timestampValue: new Date().toISOString() },
        },
      },
    });

    expect(response.ok()).toBe(true);

    // Incoming call screen should appear ABOVE the lock screen
    await expect(page.getByRole('button', { name: /answer/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText('Test Caller')).toBeVisible();

    // Decline the call — lock screen should still be present
    await page.getByRole('button', { name: /decline/i }).click();

    await expect(page.getByRole('button', { name: /answer/i })).not.toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByRole('dialog', { name: /app lock screen/i })).toBeVisible();

    await ctx.close();
  });

  test('no lock screen when app lock is disabled', async ({ browser }) => {
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

    await page.goto('/elderly');

    // Should go straight to HomeScreen with no lock
    await expect(page.getByRole('heading', { name: 'Contacts' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('dialog', { name: /app lock screen/i })).not.toBeVisible();

    await ctx.close();
  });
});
