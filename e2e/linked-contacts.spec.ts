import { test, expect } from '@playwright/test';

/**
 * E2E tests for the linked contacts feature:
 *
 * Core scenario: Admin links two elderly users, then adds each as a contact
 * for the other — enabling them to call each other. Also validates the
 * "Set Your Name" screen for elderly users without a displayName.
 *
 * PREREQUISITES:
 * - Firebase emulators running: `firebase emulators:start --only auth,firestore`
 * - App served with emulator config: `VITE_USE_EMULATORS=true pnpm dev`
 *
 * Run: `pnpm test:e2e:emulators e2e/linked-contacts.spec.ts`
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

async function seedUserAsCaregiver(uid: string, linkedElderlyUids: string[]): Promise<void> {
  const linkedValues = linkedElderlyUids.map((id) => ({ stringValue: id }));
  const res = await fetch(
    `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...EMULATOR_AUTH_HEADER },
      body: JSON.stringify({
        fields: {
          role: { stringValue: 'caregiver' },
          onboardingComplete: { booleanValue: true },
          displayName: { stringValue: 'Admin User' },
          lastSeen: { timestampValue: new Date().toISOString() },
          linkedElderlyUsers: {
            arrayValue: { values: linkedValues.length > 0 ? linkedValues : [] },
          },
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Failed to seed caregiver: ${res.status} ${await res.text()}`);
}

async function seedUserAsElderly(uid: string, displayName: string | null): Promise<void> {
  const fields: Record<string, unknown> = {
    role: { stringValue: 'elderly' },
    onboardingComplete: { booleanValue: true },
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
          language: { stringValue: 'en' },
        },
      },
    },
  };

  if (displayName !== null) {
    fields['displayName'] = { stringValue: displayName };
  }

  const res = await fetch(
    `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...EMULATOR_AUTH_HEADER },
      body: JSON.stringify({ fields }),
    },
  );
  if (!res.ok) throw new Error(`Failed to seed elderly: ${res.status} ${await res.text()}`);
}

async function seedCaregiverLink(elderlyUid: string, caregiverUid: string): Promise<void> {
  const caregiverDocRes = await fetch(
    `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${elderlyUid}/caregivers/${caregiverUid}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...EMULATOR_AUTH_HEADER },
      body: JSON.stringify({
        fields: {
          linkedAt: { timestampValue: new Date().toISOString() },
          permissions: {
            arrayValue: {
              values: [
                { stringValue: 'manage_contacts' },
                { stringValue: 'manage_settings' },
                { stringValue: 'view_history' },
              ],
            },
          },
        },
      }),
    },
  );
  if (!caregiverDocRes.ok)
    throw new Error(`Failed to seed caregiver link: ${caregiverDocRes.status}`);
}

async function getContactsForUser(uid: string): Promise<unknown[]> {
  const res = await fetch(
    `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}/contacts`,
    { headers: { ...EMULATOR_AUTH_HEADER } },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { documents?: unknown[] };
  return data.documents ?? [];
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

// ---------------------------------------------------------------------------
// Suite 1: Elderly user "Set Your Name" screen
// ---------------------------------------------------------------------------

test.describe('Elderly Set Name flow (emulators)', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(checkEmulators);

  test('elderly user without displayName sees Set Name screen', async ({ page }) => {
    await clearEmulators();

    const user = await createEmulatorUser();
    await seedUserAsElderly(user.localId, null);
    await interceptAuth(page, user);

    await page.goto('/elderly');

    // Should show the Set Name screen, not the home screen
    await expect(page.getByRole('heading', { name: /what's your name/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('textbox')).toBeVisible();
    // Should NOT show the contacts/home screen
    await expect(page.getByText(/contacts/i)).not.toBeVisible();
  });

  test('elderly user can set name and proceed to home screen', async ({ page }) => {
    await clearEmulators();

    const user = await createEmulatorUser();
    await seedUserAsElderly(user.localId, null);
    await interceptAuth(page, user);

    await page.goto('/elderly');

    // Wait for Set Name screen
    await expect(page.getByRole('heading', { name: /what's your name/i })).toBeVisible({
      timeout: 15_000,
    });

    // Type a name
    await page.getByRole('textbox').fill('Grandma Rose');

    // Click continue
    await page.getByRole('button', { name: /continue/i }).click();

    // Should transition to home screen (which shows "Contacts" heading)
    await expect(page.getByRole('heading', { name: /contacts/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('elderly user with displayName skips Set Name and sees home screen', async ({ page }) => {
    await clearEmulators();

    const user = await createEmulatorUser();
    await seedUserAsElderly(user.localId, 'Grandma Rose');
    await interceptAuth(page, user);

    await page.goto('/elderly');

    // Should go straight to home screen
    await expect(page.getByRole('heading', { name: /contacts/i })).toBeVisible({
      timeout: 15_000,
    });
    // Should NOT show Set Name
    await expect(page.getByRole('heading', { name: /what's your name/i })).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Admin adds contacts from linked users
// ---------------------------------------------------------------------------

test.describe('Admin linked contacts flow (emulators)', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(checkEmulators);

  let adminUser: EmulatorUser;
  let elderlyA: EmulatorUser;
  let elderlyB: EmulatorUser;

  test.beforeEach(async ({ page }) => {
    await clearEmulators();

    // Create 3 users: 1 admin + 2 elderly
    [adminUser, elderlyA, elderlyB] = await Promise.all([
      createEmulatorUser(),
      createEmulatorUser(),
      createEmulatorUser(),
    ]);

    // Seed elderly users with names
    await Promise.all([
      seedUserAsElderly(elderlyA.localId, 'Alice'),
      seedUserAsElderly(elderlyB.localId, 'Bob'),
    ]);

    // Seed admin with both elderly users linked
    await seedUserAsCaregiver(adminUser.localId, [elderlyA.localId, elderlyB.localId]);

    // Seed caregiver links on both elderly users
    await Promise.all([
      seedCaregiverLink(elderlyA.localId, adminUser.localId),
      seedCaregiverLink(elderlyB.localId, adminUser.localId),
    ]);

    // Intercept auth for admin
    await interceptAuth(page, adminUser);
  });

  test('admin dashboard shows both linked members', async ({ page }) => {
    await page.goto('/caregiver');

    await expect(page.getByText('Alice')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Bob')).toBeVisible();
  });

  test('admin sees "Add from Members" button on manage contacts page', async ({ page }) => {
    await page.goto(`/caregiver/manage/${elderlyA.localId}`);

    await expect(page.getByRole('button', { name: /add from members/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('admin can add linked user Bob as contact for Alice', async ({ page }) => {
    await page.goto(`/caregiver/manage/${elderlyA.localId}`);

    // Wait for page to load
    await expect(page.getByRole('heading', { name: /contacts for alice/i })).toBeVisible({
      timeout: 15_000,
    });

    // Click "Add from Members"
    await page.getByRole('button', { name: /add from members/i }).click();

    // Should see Bob and Admin User in the picker (not Alice — she's the managed user)
    await expect(page.getByText('Bob')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Admin User')).toBeVisible();

    // Add Bob
    await page.getByRole('button', { name: /add bob/i }).click();

    // Bob should disappear from picker and appear in contacts list
    await expect(page.getByRole('button', { name: /add bob/i })).not.toBeVisible({
      timeout: 10_000,
    });

    // Verify contact was created in Firestore
    await expect
      .poll(
        async () => {
          const contacts = await getContactsForUser(elderlyA.localId);
          return contacts.length;
        },
        { timeout: 10_000 },
      )
      .toBeGreaterThanOrEqual(1);
  });

  test('admin can add both Bob and Admin as contacts for Alice, then Alice sees them', async ({
    page,
    browser,
  }) => {
    await page.goto(`/caregiver/manage/${elderlyA.localId}`);

    await expect(page.getByRole('heading', { name: /contacts for alice/i })).toBeVisible({
      timeout: 15_000,
    });

    // Open linked user picker
    await page.getByRole('button', { name: /add from members/i }).click();

    // Add Bob
    await expect(page.getByRole('button', { name: /add bob/i })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /add bob/i }).click();

    // Wait for Bob to be removed from picker
    await expect(page.getByRole('button', { name: /add bob/i })).not.toBeVisible({
      timeout: 10_000,
    });

    // Add Admin User
    await page.getByRole('button', { name: /add admin user/i }).click();
    await expect(page.getByRole('button', { name: /add admin user/i })).not.toBeVisible({
      timeout: 10_000,
    });

    // Now verify Alice can see these contacts on her home screen
    const aliceCtx = await browser.newContext({
      permissions: ['camera', 'microphone'],
    });
    const alicePage = await aliceCtx.newPage();

    await alicePage.route('**/accounts:signUp**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(elderlyA),
      }),
    );

    await alicePage.goto('/elderly');

    // Alice should see both Bob and Admin User as contacts
    await expect(alicePage.getByText('Bob')).toBeVisible({ timeout: 15_000 });
    await expect(alicePage.getByText('Admin User')).toBeVisible();

    await aliceCtx.close();
  });

  test('admin can configure mutual contacts: Alice sees Bob, Bob sees Alice', async ({
    page,
    browser,
  }) => {
    // Step 1: Add Bob as contact for Alice
    await page.goto(`/caregiver/manage/${elderlyA.localId}`);
    await expect(page.getByRole('heading', { name: /contacts for alice/i })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: /add from members/i }).click();
    await expect(page.getByRole('button', { name: /add bob/i })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /add bob/i }).click();
    await expect(page.getByRole('button', { name: /add bob/i })).not.toBeVisible({
      timeout: 10_000,
    });

    // Step 2: Add Alice as contact for Bob
    await page.goto(`/caregiver/manage/${elderlyB.localId}`);
    await expect(page.getByRole('heading', { name: /contacts for bob/i })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: /add from members/i }).click();
    await expect(page.getByRole('button', { name: /add alice/i })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole('button', { name: /add alice/i }).click();
    await expect(page.getByRole('button', { name: /add alice/i })).not.toBeVisible({
      timeout: 10_000,
    });

    // Step 3: Verify Alice sees Bob
    const aliceCtx = await browser.newContext({
      permissions: ['camera', 'microphone'],
    });
    const alicePage = await aliceCtx.newPage();
    await alicePage.route('**/accounts:signUp**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(elderlyA),
      }),
    );
    await alicePage.goto('/elderly');
    await expect(alicePage.getByText('Bob')).toBeVisible({ timeout: 15_000 });
    await aliceCtx.close();

    // Step 4: Verify Bob sees Alice
    const bobCtx = await browser.newContext({
      permissions: ['camera', 'microphone'],
    });
    const bobPage = await bobCtx.newPage();
    await bobPage.route('**/accounts:signUp**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(elderlyB),
      }),
    );
    await bobPage.goto('/elderly');
    await expect(bobPage.getByText('Alice')).toBeVisible({ timeout: 15_000 });
    await bobCtx.close();
  });

  test('picker shows "all linked members already added" when all are contacts', async ({
    page,
  }) => {
    await page.goto(`/caregiver/manage/${elderlyA.localId}`);

    await expect(page.getByRole('heading', { name: /contacts for alice/i })).toBeVisible({
      timeout: 15_000,
    });

    // Open picker and add all available users
    await page.getByRole('button', { name: /add from members/i }).click();

    // Add Bob
    await expect(page.getByRole('button', { name: /add bob/i })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /add bob/i }).click();
    await expect(page.getByRole('button', { name: /add bob/i })).not.toBeVisible({
      timeout: 10_000,
    });

    // Add Admin
    await page.getByRole('button', { name: /add admin user/i }).click();
    await expect(page.getByRole('button', { name: /add admin user/i })).not.toBeVisible({
      timeout: 10_000,
    });

    // Now the empty state message should appear
    await expect(page.getByText(/all linked members are already added/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});
