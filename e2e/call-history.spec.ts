import { test, expect } from '@playwright/test';

const FIRESTORE_EMULATOR = 'http://127.0.0.1:8080';
const AUTH_EMULATOR = 'http://127.0.0.1:9099';
const PROJECT_ID = 'easycall-dev';

const EMULATOR_AUTH_HEADER = { Authorization: 'Bearer owner' };

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

interface EmulatorUser {
  localId: string;
  idToken: string;
  refreshToken: string;
  expiresIn: string;
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
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Failed to seed user: ${res.status}`);
}

async function seedCallHistoryEntry(
  uid: string,
  callId: string,
  data: {
    contactId: string;
    contactName: string;
    direction: string;
    outcome: string;
    duration: number;
    startedAt: string;
  },
): Promise<void> {
  const res = await fetch(
    `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}/callHistory/${callId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...EMULATOR_AUTH_HEADER },
      body: JSON.stringify({
        fields: {
          contactId: { stringValue: data.contactId },
          contactName: { stringValue: data.contactName },
          direction: { stringValue: data.direction },
          outcome: { stringValue: data.outcome },
          duration: { integerValue: String(data.duration) },
          startedAt: { timestampValue: data.startedAt },
          endedAt: { timestampValue: data.startedAt },
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Failed to seed callHistory: ${res.status} ${await res.text()}`);
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

test.describe('Call History (emulators)', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(checkEmulators);

  test.beforeEach(async ({ page }) => {
    await clearEmulators();

    const user = await createEmulatorUser();
    await seedUserAsElderly(user.localId);

    await page.route('**/accounts:signUp**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user),
      }),
    );

    // Store uid for use in tests
    (page as unknown as { _testUid: string })._testUid = user.localId;
  });

  test('shows "No calls yet" when call history is empty', async ({ page }) => {
    await page.goto('/elderly/history');
    await expect(page.getByText('No calls yet')).toBeVisible({ timeout: 15000 });
  });

  test('renders call history entries with correct outcome badges', async ({ page }) => {
    const uid = (page as unknown as { _testUid: string })._testUid;
    const now = new Date();

    await seedCallHistoryEntry(uid, 'call-1', {
      contactId: 'c1',
      contactName: 'Alice',
      direction: 'outgoing',
      outcome: 'completed',
      duration: 120,
      startedAt: now.toISOString(),
    });
    await seedCallHistoryEntry(uid, 'call-2', {
      contactId: 'c2',
      contactName: 'Bob',
      direction: 'incoming',
      outcome: 'missed',
      duration: 0,
      startedAt: new Date(now.getTime() - 3600_000).toISOString(),
    });
    await seedCallHistoryEntry(uid, 'call-3', {
      contactId: 'c3',
      contactName: 'Carol',
      direction: 'incoming',
      outcome: 'declined',
      duration: 0,
      startedAt: new Date(now.getTime() - 7200_000).toISOString(),
    });

    await page.goto('/elderly/history');

    await expect(page.getByText('Alice')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Bob')).toBeVisible();
    await expect(page.getByText('Carol')).toBeVisible();
    await expect(page.getByText('Completed')).toBeVisible();
    await expect(page.getByText('Missed')).toBeVisible();
    await expect(page.getByText('Declined')).toBeVisible();
  });

  test('tapping a call history entry navigates to call screen', async ({ page }) => {
    const uid = (page as unknown as { _testUid: string })._testUid;

    // Seed a matching contact + history entry
    await fetch(
      `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}/contacts/contact-1`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...EMULATOR_AUTH_HEADER },
        body: JSON.stringify({
          fields: {
            name: { stringValue: 'Alice' },
            photoURL: { nullValue: null },
            jitsiRoomId: { stringValue: 'easycall-alice-abc123' },
            contactUserId: { stringValue: 'user-2' },
            displayOrder: { integerValue: '1' },
            createdAt: { timestampValue: new Date().toISOString() },
          },
        }),
      },
    );

    await seedCallHistoryEntry(uid, 'call-1', {
      contactId: 'contact-1',
      contactName: 'Alice',
      direction: 'outgoing',
      outcome: 'completed',
      duration: 60,
      startedAt: new Date().toISOString(),
    });

    // Mock Jitsi + JWT
    await page.route(/external_api\.js/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `window.JitsiMeetExternalAPI = class { constructor() { this._l = new Map(); } addListener(e,f) { if(!this._l.has(e))this._l.set(e,[]); this._l.get(e).push(f); } removeListener(){} executeCommand(){} dispose(){} isAudioMuted(){return Promise.resolve(false)} isVideoMuted(){return Promise.resolve(false)} };`,
      }),
    );
    await page.route('**/generateJitsiJwt**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { token: 'test-jwt' } }),
      }),
    );

    // Navigate via HomeScreen first to trigger contact subscription
    await page.goto('/elderly');
    await expect(page.getByText('Alice')).toBeVisible({ timeout: 15000 });

    // Then navigate to call history
    await page.getByRole('button', { name: /call history/i }).click();
    await expect(page.getByText('Call History')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Call Alice/ }).click();

    await expect(page.getByRole('button', { name: /end call/i })).toBeVisible({ timeout: 15000 });
  });

  test('navigating from HomeScreen to call history and back works', async ({ page }) => {
    await page.goto('/elderly');

    await expect(page.getByText('Your Contacts')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /call history/i }).click();

    await expect(page).toHaveURL(/\/elderly\/history/, { timeout: 10000 });
    await expect(page.getByText('Call History')).toBeVisible();

    await page.getByRole('button', { name: /back to contacts/i }).click();

    await expect(page).toHaveURL(/\/elderly$/, { timeout: 10000 });
    await expect(page.getByText('Your Contacts')).toBeVisible();
  });
});
