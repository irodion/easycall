import { test, expect } from '@playwright/test';

const FIRESTORE_EMULATOR = 'http://127.0.0.1:8080';
const AUTH_EMULATOR = 'http://127.0.0.1:9099';
const PROJECT_ID = 'easycall-dev';

// ---------------------------------------------------------------------------
// Emulator helpers
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
// Jitsi mock that exposes instance on window for event emission
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Emulator health check
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
// Helper: emit a connectionQuality event on the Jitsi mock from Playwright
// ---------------------------------------------------------------------------

async function emitConnectionQuality(
  page: import('@playwright/test').Page,
  quality: number,
  local = true,
): Promise<void> {
  await page.evaluate(
    ({ quality, local }) => {
      const instance = (window as unknown as Record<string, unknown>).__jitsiMockInstance as
        | {
            _listeners: Map<string, Array<(data: unknown) => void>>;
          }
        | undefined;
      if (!instance) throw new Error('Jitsi mock instance not found on window');
      const fns = instance._listeners.get('connectionQuality') || [];
      fns.forEach((fn) => fn({ local, quality }));
    },
    { quality, local },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Connection quality indicator (emulators)', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(checkEmulators);

  test.beforeEach(async ({ page }) => {
    await clearEmulators();

    const user = await createEmulatorUser();
    await seedUserAsElderly(user.localId);
    await seedContact(user.localId, 'contact-1', 'Contact 1');

    await page.route('**/accounts:signUp**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user),
      }),
    );

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
        body: JSON.stringify({ data: { token: 'test-jwt-token' } }),
      }),
    );
  });

  /** Navigate to home, tap contact, wait for call screen */
  async function enterCall(page: import('@playwright/test').Page): Promise<void> {
    await page.goto('/elderly');
    await expect(page.getByText('Contact 1')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /call contact 1/i }).click();
    await expect(page.getByRole('button', { name: /end call/i })).toBeVisible({ timeout: 15000 });
  }

  test('shows good connection indicator when quality is high', async ({ page }) => {
    await enterCall(page);

    await emitConnectionQuality(page, 85);

    const indicator = page.getByRole('status', { name: /good connection/i });
    await expect(indicator).toBeVisible({ timeout: 5000 });
  });

  test('shows fair connection indicator when quality is moderate', async ({ page }) => {
    await enterCall(page);

    await emitConnectionQuality(page, 50);

    const indicator = page.getByRole('status', { name: /fair connection/i });
    await expect(indicator).toBeVisible({ timeout: 5000 });
  });

  test('shows poor connection indicator and weak signal banner', async ({ page }) => {
    await enterCall(page);

    await emitConnectionQuality(page, 15);

    const indicator = page.getByRole('status', { name: /poor connection/i });
    await expect(indicator).toBeVisible({ timeout: 5000 });

    const banner = page.getByRole('alert');
    await expect(banner).toBeVisible({ timeout: 5000 });
    await expect(banner).toContainText(/video quality reduced/i);
  });

  test('weak signal banner auto-dismisses after 5 seconds', async ({ page }) => {
    await enterCall(page);

    await emitConnectionQuality(page, 15);

    const banner = page.getByRole('alert');
    await expect(banner).toBeVisible({ timeout: 5000 });

    // Wait for auto-dismiss (5s + buffer)
    await expect(banner).not.toBeVisible({ timeout: 8000 });
  });

  test('updates indicator when quality changes', async ({ page }) => {
    await enterCall(page);

    await emitConnectionQuality(page, 85);
    await expect(page.getByRole('status', { name: /good connection/i })).toBeVisible({
      timeout: 5000,
    });

    await emitConnectionQuality(page, 15);
    await expect(page.getByRole('status', { name: /poor connection/i })).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByRole('status', { name: /good connection/i })).not.toBeVisible();
  });

  test('ignores remote quality events', async ({ page }) => {
    await enterCall(page);

    await emitConnectionQuality(page, 10, false);

    // Short wait to ensure no indicator appears
    await page.waitForTimeout(500);
    await expect(page.getByRole('status', { name: /connection/i })).not.toBeVisible();
  });

  test('clears weak signal banner when quality improves', async ({ page }) => {
    await enterCall(page);

    await emitConnectionQuality(page, 15);
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 5000 });

    await emitConnectionQuality(page, 70);
    await expect(page.getByRole('alert')).not.toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('status', { name: /good connection/i })).toBeVisible();
  });
});
