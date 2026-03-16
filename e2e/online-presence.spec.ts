import { test, expect } from '@playwright/test';

/**
 * E2E test for online status & presence indicators.
 *
 * PREREQUISITES:
 * - Firebase emulators running: `firebase emulators:start --only auth,firestore,database`
 * - App served with emulator config: `VITE_USE_EMULATORS=true pnpm dev`
 *
 * Run: `pnpm test:e2e:emulators e2e/online-presence.spec.ts`
 *
 * NOTE: The RTDB emulator does NOT propagate writes across separate WebSocket
 * connections. This means real-time presence updates (one user goes online →
 * another user sees it live) cannot be tested E2E with the emulator. These
 * tests verify initial-state rendering (pre-seeded via REST before page load)
 * and own-presence registration (the user's own SDK write to RTDB).
 * Real-time cross-user updates are covered by unit tests.
 */

const FIRESTORE_EMULATOR = 'http://127.0.0.1:8080';
const AUTH_EMULATOR = 'http://127.0.0.1:9099';
const RTDB_EMULATOR = 'http://127.0.0.1:9000';
const PROJECT_ID = 'easycall-dev';

const EMULATOR_AUTH_HEADER = { Authorization: 'Bearer owner' };

interface EmulatorUser {
  localId: string;
  idToken: string;
  refreshToken: string;
  expiresIn: string;
}

async function clearEmulators(): Promise<void> {
  const [firestoreRes, authRes, rtdbRes] = await Promise.all([
    fetch(
      `${FIRESTORE_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
      { method: 'DELETE' },
    ),
    fetch(`${AUTH_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: 'DELETE' }),
    fetch(`${RTDB_EMULATOR}/.json?ns=${PROJECT_ID}-default-rtdb`, {
      method: 'DELETE',
      headers: EMULATOR_AUTH_HEADER,
    }),
  ]);
  if (!firestoreRes.ok) {
    throw new Error(`clearEmulators: Firestore DELETE failed (${firestoreRes.status})`);
  }
  if (!authRes.ok) {
    throw new Error(`clearEmulators: Auth DELETE failed (${authRes.status})`);
  }
  if (!rtdbRes.ok) {
    throw new Error(`clearEmulators: RTDB DELETE failed (${rtdbRes.status})`);
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

async function seedUserAsElderly(
  uid: string,
  displayName: string,
  contacts: Array<{ id: string; name: string; contactUserId: string }> = [],
): Promise<void> {
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
          lastSeen: { timestampValue: new Date().toISOString() },
          presenceState: { stringValue: 'offline' },
        },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Failed to seed user ${uid}: ${res.status}`);
  }

  for (const contact of contacts) {
    const contactRes = await fetch(
      `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}/contacts/${contact.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...EMULATOR_AUTH_HEADER },
        body: JSON.stringify({
          fields: {
            name: { stringValue: contact.name },
            contactUserId: { stringValue: contact.contactUserId },
            jitsiRoomId: { stringValue: `room-${contact.id}` },
            displayOrder: { integerValue: '1' },
            createdAt: { timestampValue: new Date().toISOString() },
          },
        }),
      },
    );
    if (!contactRes.ok) {
      throw new Error(`Failed to seed contact ${contact.id}: ${contactRes.status}`);
    }
  }
}

/** Pre-seed RTDB presence via REST (before page load — initial onValue read picks it up). */
async function setRtdbPresence(
  uid: string,
  state: 'online' | 'in-call' | 'offline',
): Promise<void> {
  const res = await fetch(`${RTDB_EMULATOR}/status/${uid}.json?ns=${PROJECT_ID}-default-rtdb`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...EMULATOR_AUTH_HEADER },
    body: JSON.stringify({ state, lastChanged: Date.now() }),
  });
  if (!res.ok) {
    throw new Error(`Failed to set RTDB presence for ${uid}: ${res.status}`);
  }
}

async function checkEmulators(): Promise<void> {
  for (const [name, url] of [
    ['Firestore emulator', FIRESTORE_EMULATOR],
    ['Auth emulator', AUTH_EMULATOR],
    ['RTDB emulator', RTDB_EMULATOR],
  ] as const) {
    try {
      await fetch(url);
    } catch {
      throw new Error(
        `${name} not reachable at ${url}.\nRun: firebase emulators:start --only auth,firestore,database`,
      );
    }
  }
}

test.describe('Online Presence Indicators', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(checkEmulators);

  test('shows green status dot for online contacts', async ({ browser }) => {
    await clearEmulators();

    const viewer = await createEmulatorUser();
    const contactUid = 'contact-user-1';

    await seedUserAsElderly(viewer.localId, 'Viewer', [
      { id: 'contact-1', name: 'Grandma', contactUserId: contactUid },
    ]);

    // Pre-seed contact as online before page loads
    await setRtdbPresence(contactUid, 'online');

    const ctx = await browser.newContext({
      permissions: ['camera', 'microphone'],
    });
    const page = await ctx.newPage();

    await page.route('**/accounts:signUp**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(viewer),
      }),
    );

    await page.goto('/elderly');
    await expect(page.getByText('Grandma')).toBeVisible({ timeout: 10_000 });

    // onValue initial read picks up the pre-seeded state
    await expect(page.getByRole('status', { name: 'Online' })).toBeVisible({ timeout: 5_000 });

    await ctx.close();
  });

  test('shows amber status dot for contacts in a call', async ({ browser }) => {
    await clearEmulators();

    const viewer = await createEmulatorUser();
    const contactUid = 'contact-user-2';

    await seedUserAsElderly(viewer.localId, 'Viewer', [
      { id: 'contact-1', name: 'Grandma', contactUserId: contactUid },
    ]);

    // Pre-seed contact as in-call
    await setRtdbPresence(contactUid, 'in-call');

    const ctx = await browser.newContext({
      permissions: ['camera', 'microphone'],
    });
    const page = await ctx.newPage();

    await page.route('**/accounts:signUp**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(viewer),
      }),
    );

    await page.goto('/elderly');
    await expect(page.getByText('Grandma')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('status', { name: 'In a call' })).toBeVisible({ timeout: 5_000 });

    await ctx.close();
  });

  test('shows gray status dot for offline contacts', async ({ browser }) => {
    await clearEmulators();

    const viewer = await createEmulatorUser();
    const contactUid = 'contact-user-3';

    await seedUserAsElderly(viewer.localId, 'Viewer', [
      { id: 'contact-1', name: 'Grandma', contactUserId: contactUid },
    ]);

    // Pre-seed contact as offline
    await setRtdbPresence(contactUid, 'offline');

    const ctx = await browser.newContext({
      permissions: ['camera', 'microphone'],
    });
    const page = await ctx.newPage();

    await page.route('**/accounts:signUp**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(viewer),
      }),
    );

    await page.goto('/elderly');
    await expect(page.getByText('Grandma')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('status', { name: 'Offline' })).toBeVisible({ timeout: 5_000 });

    await ctx.close();
  });

  test('user registers own presence as online in RTDB on page load', async ({ browser }) => {
    await clearEmulators();

    const user = await createEmulatorUser();
    await seedUserAsElderly(user.localId, 'Test User');

    const ctx = await browser.newContext({
      permissions: ['camera', 'microphone'],
    });
    const page = await ctx.newPage();

    await page.route('**/accounts:signUp**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user),
      }),
    );

    await page.goto('/elderly');
    await expect(page.getByText('Your Contacts')).toBeVisible({ timeout: 10_000 });

    // Wait for usePresence hook to write to RTDB
    await page.waitForTimeout(3_000);

    // Verify RTDB has the user's presence as online
    const rtdbRes = await fetch(
      `${RTDB_EMULATOR}/status/${user.localId}.json?ns=${PROJECT_ID}-default-rtdb`,
      { headers: EMULATOR_AUTH_HEADER },
    );
    const rtdbData = (await rtdbRes.json()) as { state?: string } | null;
    expect(rtdbData?.state).toBe('online');

    await ctx.close();
  });
});
