import { test, expect } from '@playwright/test';

/**
 * E2E test for the incoming call flow.
 *
 * PREREQUISITES:
 * - Firebase emulators running: `firebase emulators:start --only auth,firestore`
 * - App served with emulator config: `VITE_USE_EMULATORS=true pnpm dev`
 *
 * Run: `pnpm test:e2e:emulators e2e/incoming-call.spec.ts`
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
    fetch(
      `${AUTH_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/accounts`,
      { method: 'DELETE' },
    ),
  ]);
  if (!firestoreRes.ok) {
    throw new Error(`clearEmulators: Firestore DELETE failed (${firestoreRes.status})`);
  }
  if (!authRes.ok) {
    throw new Error(`clearEmulators: Auth DELETE failed (${authRes.status})`);
  }
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
  if (!res.ok) {
    throw new Error(`Auth emulator signUp failed: ${res.status}`);
  }
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
        },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Failed to seed user: ${res.status}`);
  }
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

test.describe('Incoming Call Flow', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(checkEmulators);

  test('elderly user sees ringing screen when a call is initiated via Firestore', async ({
    browser,
  }) => {
    await clearEmulators();

    // 1. Pre-create user in auth emulator
    const user = await createEmulatorUser();
    const elderlyUid = user.localId;

    // 2. Seed Firestore with elderly role
    await seedUserAsElderly(elderlyUid);

    // 3. Set up browser context with permissions
    const elderlyCtx = await browser.newContext({
      permissions: ['camera', 'microphone'],
    });
    const elderlyPage = await elderlyCtx.newPage();

    // 4. Intercept auth signUp to return pre-created user (same UID)
    await elderlyPage.route('**/accounts:signUp**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user),
      }),
    );

    // 5. Navigate to elderly home (triggers AuthGuard → signInAnonymously)
    await elderlyPage.goto('/elderly');
    await elderlyPage.waitForURL('**/elderly', { timeout: 10_000 });

    // Wait for HomeScreen to fully render (auth complete, userId set, onSnapshot active)
    await expect(elderlyPage.getByText('Your Contacts')).toBeVisible({ timeout: 10_000 });

    // 6. Write incoming call document via Firestore emulator REST API
    const firestoreUrl = `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${elderlyUid}/incomingCall/current`;

    const response = await elderlyPage.request.patch(firestoreUrl, {
      headers: {
        ...EMULATOR_AUTH_HEADER,
        'Content-Type': 'application/json',
      },
      data: {
        fields: {
          callerId: { stringValue: 'caller-test-1' },
          callerName: { stringValue: 'Test Caller' },
          callerPhotoURL: { stringValue: '' },
          jitsiRoomId: { stringValue: 'test-room-e2e' },
          status: { stringValue: 'ringing' },
          timestamp: { timestampValue: new Date().toISOString() },
        },
      },
    });

    expect(response.ok()).toBe(true);

    // 7. Verify the IncomingCallScreen appears
    await expect(
      elderlyPage.getByRole('button', { name: /answer/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Verify caller name is displayed
    await expect(elderlyPage.getByText('Test Caller')).toBeVisible();

    // 8. Decline the call
    await elderlyPage.getByRole('button', { name: /decline/i }).click();

    // Verify the ringing screen is dismissed
    await expect(
      elderlyPage.getByRole('button', { name: /answer/i }),
    ).not.toBeVisible({ timeout: 5_000 });

    await elderlyCtx.close();
  });
});
