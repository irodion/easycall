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

async function seedActiveCall(
  uid: string,
  data: { contactId: string; contactName: string; jitsiRoomId: string; startedAt: string },
): Promise<void> {
  const res = await fetch(
    `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}/activeCall/current`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...EMULATOR_AUTH_HEADER },
      body: JSON.stringify({
        fields: {
          contactId: { stringValue: data.contactId },
          contactName: { stringValue: data.contactName },
          jitsiRoomId: { stringValue: data.jitsiRoomId },
          status: { stringValue: 'active' },
          startedAt: { timestampValue: data.startedAt },
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Failed to seed activeCall: ${res.status} ${await res.text()}`);
}

async function seedContact(
  uid: string,
  contactId: string,
  name: string,
  jitsiRoomId = 'easycall-contact1-abc123',
): Promise<void> {
  const res = await fetch(
    `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}/contacts/${contactId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...EMULATOR_AUTH_HEADER },
      body: JSON.stringify({
        fields: {
          name: { stringValue: name },
          photoURL: { nullValue: null },
          jitsiRoomId: { stringValue: jitsiRoomId },
          contactUserId: { stringValue: 'user-other-1' },
          displayOrder: { integerValue: '1' },
          createdAt: { timestampValue: new Date().toISOString() },
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Failed to seed contact: ${res.status} ${await res.text()}`);
}

// Jitsi mock that exposes instance on window for event emission from Playwright
const MOCK_JITSI_SCRIPT = `
window.JitsiMeetExternalAPI = class MockJitsiAPI {
  constructor(domain, options) {
    this._listeners = new Map();
    this.domain = domain;
    this.options = options;
    window.__jitsiMockInstance = this;
    setTimeout(() => {
      const fns = this._listeners.get('videoConferenceJoined') || [];
      fns.forEach(fn => fn({ roomName: options && options.roomName }));
    }, 200);
  }
  addListener(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(fn);
  }
  removeListener(event, fn) {
    const fns = this._listeners.get(event) || [];
    this._listeners.set(event, fns.filter(f => f !== fn));
  }
  executeCommand(cmd) {
    if (cmd === 'hangup') {
      setTimeout(() => {
        const fns = this._listeners.get('readyToClose') || [];
        fns.forEach(fn => fn());
      }, 100);
    }
  }
  dispose() { this._listeners.clear(); }
  isAudioMuted() { return Promise.resolve(false); }
  isVideoMuted() { return Promise.resolve(false); }
};
`;

async function emitJitsiEvent(
  page: import('@playwright/test').Page,
  event: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  await page.evaluate(
    ({ event, data }) => {
      const instance = (window as unknown as Record<string, unknown>).__jitsiMockInstance as
        | { _listeners: Map<string, Array<(data: unknown) => void>> }
        | undefined;
      if (!instance) throw new Error('Jitsi mock instance not found on window');
      const fns = instance._listeners.get(event) || [];
      fns.forEach((fn) => fn(data));
    },
    { event, data },
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

test.describe('Auto-Rejoin on Disconnect (emulators)', () => {
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

    (page as unknown as { _testUid: string })._testUid = user.localId;
  });

  test('rejoin prompt appears when active call exists on HomeScreen load', async ({ page }) => {
    const uid = (page as unknown as { _testUid: string })._testUid;

    await seedActiveCall(uid, {
      contactId: 'contact-1',
      contactName: 'Alice',
      jitsiRoomId: 'room-1',
      startedAt: new Date().toISOString(),
    });

    await page.goto('/elderly');

    await expect(page.getByText(/Return to call with Alice\?/)).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /Return to call with Alice/ })).toBeVisible();
  });

  test('clicking rejoin navigates to call screen', async ({ page }) => {
    const uid = (page as unknown as { _testUid: string })._testUid;

    // Seed contact + activeCall
    await fetch(
      `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}/contacts/contact-1`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...EMULATOR_AUTH_HEADER },
        body: JSON.stringify({
          fields: {
            name: { stringValue: 'Alice' },
            photoURL: { nullValue: null },
            jitsiRoomId: { stringValue: 'easycall-alice-abc' },
            contactUserId: { stringValue: 'u2' },
            displayOrder: { integerValue: '1' },
            createdAt: { timestampValue: new Date().toISOString() },
          },
        }),
      },
    );

    await seedActiveCall(uid, {
      contactId: 'contact-1',
      contactName: 'Alice',
      jitsiRoomId: 'easycall-alice-abc',
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

    await page.goto('/elderly');
    await expect(page.getByText(/Return to call with Alice\?/)).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /Return to call with Alice/ }).click();

    await expect(page.getByRole('button', { name: /end call/i })).toBeVisible({ timeout: 15000 });
  });

  test('dismiss button clears the prompt', async ({ page }) => {
    const uid = (page as unknown as { _testUid: string })._testUid;

    await seedActiveCall(uid, {
      contactId: 'contact-1',
      contactName: 'Alice',
      jitsiRoomId: 'room-1',
      startedAt: new Date().toISOString(),
    });

    await page.goto('/elderly');
    await expect(page.getByText(/Return to call with Alice\?/)).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: /dismiss/i }).click();

    await expect(page.getByText(/Return to call with Alice\?/)).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: 'Contacts' })).toBeVisible();
  });

  test('no rejoin prompt when active call is older than 5 minutes', async ({ page }) => {
    const uid = (page as unknown as { _testUid: string })._testUid;

    const sixMinAgo = new Date(Date.now() - 6 * 60 * 1000);
    await seedActiveCall(uid, {
      contactId: 'contact-1',
      contactName: 'Alice',
      jitsiRoomId: 'room-1',
      startedAt: sixMinAgo.toISOString(),
    });

    await page.goto('/elderly');
    await expect(page.getByRole('heading', { name: 'Contacts' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Return to call with/)).not.toBeVisible({ timeout: 3000 });
  });

  test('no rejoin prompt when no activeCall document exists', async ({ page }) => {
    await page.goto('/elderly');
    await expect(page.getByRole('heading', { name: 'Contacts' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Return to call with/)).not.toBeVisible({ timeout: 3000 });
  });

  test('no rejoin prompt after other participant leaves the call', async ({ page }) => {
    const uid = (page as unknown as { _testUid: string })._testUid;
    await seedContact(uid, 'contact-1', 'Alice');

    // Mock Jitsi (with __jitsiMockInstance) + JWT
    await page.route(/external_api\.js/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: MOCK_JITSI_SCRIPT,
      }),
    );
    await page.route('**/generateJitsiJwt**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { token: 'test-jwt' } }),
      }),
    );

    // Navigate to call screen
    await page.goto('/call/contact-1');
    await expect(page.getByRole('button', { name: /end call/i })).toBeVisible({ timeout: 15000 });

    // Simulate: other participant joins, then leaves (caller hung up)
    await emitJitsiEvent(page, 'participantJoined', {});
    await emitJitsiEvent(page, 'participantLeft', {});

    // Should show "call ended" then auto-navigate to home after 3s
    await expect(page.getByText(/call ended/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: 'Contacts' })).toBeVisible({ timeout: 10000 });

    // The rejoin prompt must NOT appear — the other person left, nobody to rejoin with
    await expect(page.getByText(/Return to call with/)).not.toBeVisible({ timeout: 3000 });
  });
});
