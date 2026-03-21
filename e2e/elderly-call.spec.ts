import { test, expect } from '@playwright/test';

const FIRESTORE_EMULATOR = 'http://127.0.0.1:8080';
const AUTH_EMULATOR = 'http://127.0.0.1:9099';
const PROJECT_ID = 'easycall-dev';

// ---------------------------------------------------------------------------
// Emulator helpers (run from Node.js test process)
// ---------------------------------------------------------------------------

async function clearEmulators(): Promise<void> {
  const [firestoreRes, authRes] = await Promise.all([
    fetch(
      `${FIRESTORE_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
      { method: 'DELETE' },
    ),
    fetch(`${AUTH_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: 'DELETE' }),
  ]);
  if (!firestoreRes.ok) {
    throw new Error(
      `clearEmulators: Firestore DELETE failed (${firestoreRes.status}): ${await firestoreRes.text()}`,
    );
  }
  if (!authRes.ok) {
    throw new Error(
      `clearEmulators: Auth DELETE failed (${authRes.status}): ${await authRes.text()}`,
    );
  }
}

interface EmulatorUser {
  localId: string;
  idToken: string;
  refreshToken: string;
  expiresIn: string;
}

/** Signs in anonymously via the auth emulator and returns the real token. */
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
    throw new Error(`Auth emulator signUp failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<EmulatorUser>;
}

/** Firestore emulators accept `Authorization: Bearer owner` to bypass security rules. */
const EMULATOR_AUTH_HEADER = { Authorization: 'Bearer owner' };

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
    throw new Error(`Failed to seed user: ${res.status} ${await res.text()}`);
  }
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
          jitsiRoomId: { stringValue: 'easycall-contact1-abc123' },
          contactUserId: { stringValue: 'user-caregiver-1' },
          displayOrder: { integerValue: '1' },
          createdAt: { timestampValue: new Date().toISOString() },
        },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Failed to seed contact: ${res.status} ${await res.text()}`);
  }
}

// ---------------------------------------------------------------------------
// Shared Jitsi mock
// ---------------------------------------------------------------------------

const MOCK_JITSI_SCRIPT = `
window.JitsiMeetExternalAPI = class MockJitsiAPI {
  constructor(domain, options) {
    this._listeners = new Map();
    this.domain = domain;
    this.options = options;
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

// ---------------------------------------------------------------------------
// Emulator health check helper
// ---------------------------------------------------------------------------

async function checkEmulators(): Promise<void> {
  for (const [name, url] of [
    ['Firestore emulator', FIRESTORE_EMULATOR],
    ['Auth emulator', AUTH_EMULATOR],
  ] as const) {
    try {
      await fetch(url);
    } catch {
      throw new Error(
        `${name} not reachable at ${url}.\n` +
          `Run: firebase emulators:start --only auth,firestore`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Suite 1: Pre-seeded member (contacts visible on HomeScreen)
// ---------------------------------------------------------------------------

test.describe('Elderly user call flow (emulators)', () => {
  // Serial mode prevents parallel workers from calling clearEmulators() concurrently
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(checkEmulators);

  test.beforeEach(async ({ page }) => {
    await clearEmulators();

    // 1. Create a real user in the auth emulator (from Node.js) → real token
    const user = await createEmulatorUser();

    // 2. Seed Firestore for that UID before the browser makes any requests
    await seedUserAsElderly(user.localId);
    await seedContact(user.localId, 'contact-1', 'Contact 1');

    // 3. Intercept the browser's signInAnonymously and return the pre-created
    //    user's real token — this ensures the browser uses the same UID we seeded.
    await page.route('**/accounts:signUp**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user),
      }),
    );

    // 4. Mock Jitsi CDN script
    await page.route(/external_api\.js/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: MOCK_JITSI_SCRIPT,
      }),
    );

    // 5. Mock JaaS JWT Cloud Function
    await page.route('**/generateJitsiJwt**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { token: 'test-jwt-token' } }),
      }),
    );
  });

  test('member sees contacts on home screen after auth', async ({ page }) => {
    // Navigate to /elderly — AuthGuard triggers signInAnonymously, finds seeded role
    await page.goto('/elderly');

    await expect(page.getByText('Contact 1')).toBeVisible({ timeout: 15000 });
    expect(page.url()).toContain('/elderly');
  });

  test('member can tap a contact and reach the call screen', async ({ page }) => {
    await page.goto('/elderly');

    await expect(page.getByText('Contact 1')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /call contact 1/i }).click();

    await expect(page.getByRole('button', { name: /end call/i })).toBeVisible({ timeout: 15000 });
  });

  test('member can end a call and return to home screen', async ({ page }) => {
    await page.goto('/elderly');

    await expect(page.getByText('Contact 1')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /call contact 1/i }).click();

    const endCallButton = page.getByRole('button', { name: /end call/i });
    await expect(endCallButton).toBeVisible({ timeout: 15000 });
    await endCallButton.click();

    await expect(page.getByText('Contact 1')).toBeVisible({ timeout: 10000 });
    expect(page.url()).toContain('/elderly');
  });

  test('app loads without JavaScript errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/elderly');
    await expect(page.getByText('Contact 1')).toBeVisible({ timeout: 15000 });

    const critical = errors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('Non-Error') && !e.includes('cancelled'),
    );
    expect(critical).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Role selection flow — no pre-seeding, full emulator flow
// ---------------------------------------------------------------------------

test.describe('Role selection flow (emulators)', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(checkEmulators);

  test.beforeEach(async () => {
    // Clear everything — no pre-seeding, no auth mock
    // The browser signs in anonymously via the real auth emulator.
    // AuthGuard reads user doc → not found → shows RoleSelector.
    await clearEmulators();
  });

  test('shows role selector when user has no role, then redirects after selection', async ({
    page,
  }) => {
    // Navigate to /elderly — AuthGuard signs in (no user doc) → shows RoleSelector
    await page.goto('/elderly');

    await expect(page.getByRole('button', { name: /make calls/i })).toBeVisible({
      timeout: 10000,
    });

    await page.getByRole('button', { name: /make calls/i }).click();

    // setDoc writes role to Firestore. AuthGuard doesn't re-run on same-route navigate,
    // so we reload — on reload, auth state is restored from IndexedDB, AuthGuard reads
    // the written role doc, and renders HomeScreen instead of RoleSelector.
    // Wait for the Firestore write to complete before reloading.
    await page.waitForResponse(
      (resp) => resp.url().includes('firestore') && resp.status() === 200,
      { timeout: 5000 },
    );
    await page.reload();

    await expect(page).toHaveURL(/\/elderly/, { timeout: 15000 });
    await expect(page.getByRole('button', { name: /make calls/i })).not.toBeVisible({
      timeout: 10000,
    });
  });
});
