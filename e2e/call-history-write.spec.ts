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
  if (!res.ok) throw new Error(`Failed to seed contact: ${res.status}`);
}

async function getCallHistoryEntries(uid: string): Promise<unknown[]> {
  const res = await fetch(
    `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}/callHistory`,
    { headers: { ...EMULATOR_AUTH_HEADER } },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { documents?: unknown[] };
  return data.documents ?? [];
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

test.describe('Call history writing (emulators)', () => {
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

    (page as unknown as { _testUid: string })._testUid = user.localId;
  });

  test('completing a call writes a callHistory entry to Firestore', async ({ page }) => {
    const uid = (page as unknown as { _testUid: string })._testUid;

    await page.goto('/elderly');
    await expect(page.getByText('Contact 1')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /call contact 1/i }).click();

    const endCallButton = page.getByRole('button', { name: /end call/i });
    await expect(endCallButton).toBeVisible({ timeout: 15000 });
    await endCallButton.click();

    await expect(page.getByText('Contact 1')).toBeVisible({ timeout: 10000 });

    // Poll for callHistory entries (may take a moment for the write to complete)
    await expect
      .poll(
        async () => {
          const entries = await getCallHistoryEntries(uid);
          return entries.length;
        },
        { timeout: 10000 },
      )
      .toBeGreaterThanOrEqual(1);

    const entries = await getCallHistoryEntries(uid);
    expect(entries.length).toBeGreaterThanOrEqual(1);

    const entry = entries[0] as {
      fields: Record<string, { stringValue?: string; integerValue?: string }>;
    };
    expect(entry.fields['direction']?.stringValue).toBe('outgoing');
    expect(entry.fields['outcome']?.stringValue).toBe('completed');
    expect(entry.fields['contactName']?.stringValue).toBe('Contact 1');
  });
});
