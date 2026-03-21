import { test, expect } from '@playwright/test';

/**
 * E2E tests for UX fixes:
 * - P1: CaregiverPinPrompt shows distinct title
 * - P2: Dashboard empty state
 * - P2: PairingCodeDisplay error/retry
 * - P3: Identity headers on caregiver sub-pages
 * - Back-to-dashboard navigation
 *
 * PREREQUISITES:
 * - Firebase emulators running: `firebase emulators:start --only auth,firestore`
 * - App served with emulator config: `VITE_USE_EMULATORS=true pnpm dev`
 *
 * Run: `pnpm test:e2e:emulators e2e/ux-fixes.spec.ts`
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

async function seedUserAsCaregiver(
  uid: string,
  overrides?: Record<string, unknown>,
): Promise<void> {
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
          linkedElderlyUsers: { arrayValue: { values: [] } },
          ...overrides,
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Failed to seed caregiver: ${res.status} ${await res.text()}`);
}

async function seedUserAsElderly(uid: string, displayName: string): Promise<void> {
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
  if (!res.ok) throw new Error(`Failed to seed elderly: ${res.status} ${await res.text()}`);
}

async function seedCaregiverLink(elderlyUid: string, caregiverUid: string): Promise<void> {
  // Write caregivers subcollection on the elderly user
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

  // Update caregiver's linkedElderlyUsers array
  const caregiverUserRes = await fetch(
    `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${caregiverUid}?updateMask.fieldPaths=linkedElderlyUsers`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...EMULATOR_AUTH_HEADER },
      body: JSON.stringify({
        fields: {
          linkedElderlyUsers: {
            arrayValue: { values: [{ stringValue: elderlyUid }] },
          },
        },
      }),
    },
  );
  if (!caregiverUserRes.ok)
    throw new Error(`Failed to update caregiver linkedElderlyUsers: ${caregiverUserRes.status}`);
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
// Suite 1: Dashboard empty state
// ---------------------------------------------------------------------------

test.describe('Dashboard empty state (emulators)', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(checkEmulators);

  test('shows empty state message when caregiver has no linked users', async ({ page }) => {
    await clearEmulators();

    const user = await createEmulatorUser();
    await seedUserAsCaregiver(user.localId);

    await page.route('**/accounts:signUp**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user),
      }),
    );

    await page.goto('/caregiver');

    await expect(page.getByText(/no linked users yet/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/tap.*link elderly user/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /link elderly user/i })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Back-to-dashboard navigation on caregiver sub-pages
// ---------------------------------------------------------------------------

test.describe('Caregiver back navigation (emulators)', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(checkEmulators);

  let caregiverUser: EmulatorUser;
  let elderlyUid: string;

  test.beforeEach(async ({ page }) => {
    await clearEmulators();

    caregiverUser = await createEmulatorUser();
    const elderlyUser = await createEmulatorUser();
    elderlyUid = elderlyUser.localId;

    await seedUserAsCaregiver(caregiverUser.localId, {
      linkedElderlyUsers: {
        arrayValue: { values: [{ stringValue: elderlyUid }] },
      },
    });
    await seedUserAsElderly(elderlyUid, 'Grandma Rose');
    await seedCaregiverLink(elderlyUid, caregiverUser.localId);

    await page.route('**/accounts:signUp**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(caregiverUser),
      }),
    );
  });

  test('manage contacts page has back-to-dashboard link', async ({ page }) => {
    await page.goto(`/caregiver/manage/${elderlyUid}`);

    const backLink = page.getByRole('link', { name: /back to dashboard/i });
    await expect(backLink).toBeVisible({ timeout: 15_000 });
    await expect(backLink).toHaveAttribute('href', '/caregiver');
  });

  test('settings page has back-to-dashboard link', async ({ page }) => {
    await page.goto(`/caregiver/settings/${elderlyUid}`);

    const backLink = page.getByRole('link', { name: /back to dashboard/i });
    await expect(backLink).toBeVisible({ timeout: 15_000 });
    await expect(backLink).toHaveAttribute('href', '/caregiver');
  });

  test('pair page has back-to-dashboard link', async ({ page }) => {
    await page.goto('/caregiver/pair');

    const backLink = page.getByRole('link', { name: /back to dashboard/i });
    await expect(backLink).toBeVisible({ timeout: 15_000 });
    await expect(backLink).toHaveAttribute('href', '/caregiver');
  });

  test('back link on manage contacts navigates to dashboard', async ({ page }) => {
    await page.goto(`/caregiver/manage/${elderlyUid}`);

    await page.getByRole('link', { name: /back to dashboard/i }).click({ timeout: 15_000 });
    await expect(page).toHaveURL('/caregiver', { timeout: 10_000 });
    await expect(page.getByText(/caregiver dashboard/i)).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Identity headers on caregiver sub-pages
// ---------------------------------------------------------------------------

test.describe('Caregiver identity headers (emulators)', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(checkEmulators);

  let caregiverUser: EmulatorUser;
  let elderlyUid: string;

  test.beforeEach(async ({ page }) => {
    await clearEmulators();

    caregiverUser = await createEmulatorUser();
    const elderlyUser = await createEmulatorUser();
    elderlyUid = elderlyUser.localId;

    await seedUserAsCaregiver(caregiverUser.localId, {
      linkedElderlyUsers: {
        arrayValue: { values: [{ stringValue: elderlyUid }] },
      },
    });
    await seedUserAsElderly(elderlyUid, 'Grandma Rose');
    await seedCaregiverLink(elderlyUid, caregiverUser.localId);

    await page.route('**/accounts:signUp**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(caregiverUser),
      }),
    );
  });

  test('manage contacts shows elderly user name in heading', async ({ page }) => {
    await page.goto(`/caregiver/manage/${elderlyUid}`);

    // Caregiver can read the elderly user doc (via isCaregiverOf rule),
    // so the heading should include the seeded display name
    await expect(page.getByRole('heading', { name: /contacts for grandma rose/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('settings page shows elderly user name in heading', async ({ page }) => {
    await page.goto(`/caregiver/settings/${elderlyUid}`);

    // Wait for onSnapshot to deliver settings + displayName
    await expect(page.getByRole('heading', { name: /settings for grandma rose/i })).toBeVisible({
      timeout: 15_000,
    });
    // Back link should also be visible
    await expect(page.getByRole('link', { name: /back to dashboard/i })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Suite 4: Caregiver PIN prompt shows distinct title
// ---------------------------------------------------------------------------

test.describe('Caregiver PIN prompt title (emulators)', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(checkEmulators);

  test('PIN prompt shows "Enter Caregiver PIN" not "Enter PIN to unlock"', async ({ page }) => {
    await clearEmulators();

    const user = await createEmulatorUser();

    // Seed config docs for PIN and open registration
    const configSeeds = await Promise.all([
      fetch(
        `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/config/caregiverPinStatus`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...EMULATOR_AUTH_HEADER },
          body: JSON.stringify({
            fields: { pinSet: { booleanValue: true } },
          }),
        },
      ),
      fetch(
        `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/config/caregiverPinHash`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...EMULATOR_AUTH_HEADER },
          body: JSON.stringify({
            fields: {
              pinHash: { stringValue: 'some-hash' },
              setBy: { stringValue: 'test' },
            },
          }),
        },
      ),
      fetch(
        `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/config/registration`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...EMULATOR_AUTH_HEADER },
          body: JSON.stringify({
            fields: { open: { booleanValue: true } },
          }),
        },
      ),
    ]);
    for (const res of configSeeds) {
      if (!res.ok) throw new Error(`Config seed failed: ${res.url} ${res.status}`);
    }

    // Intercept auth so the user is pre-authenticated
    await page.route('**/accounts:signUp**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user),
      }),
    );

    // Navigate to /elderly first to trigger anonymous auth (AuthGuard calls
    // signInAnonymously). Without this, the RoleSelector page can't read
    // config docs because Firestore rules require request.auth != null.
    // Register the response waiter BEFORE navigation to avoid missing the response
    const authResponse = page.waitForResponse((res) => res.url().includes('accounts:signUp'), {
      timeout: 15_000,
    });
    await page.goto('/elderly');
    await authResponse;

    // Now navigate to role selector — auth state is present, config reads work
    await page.goto('/');

    // Wait for role selector buttons to be enabled
    const caregiverBtn = page.getByRole('button', { name: /caregiver/i });
    await expect(caregiverBtn).toBeEnabled({ timeout: 15_000 });

    // Click caregiver — should show PIN prompt
    await caregiverBtn.click();

    // The PIN prompt should show with caregiver-specific title
    await expect(page.getByText(/enter caregiver pin/i)).toBeVisible({ timeout: 15_000 });
    // Should NOT show the generic app lock text
    await expect(page.getByText(/enter pin to unlock/i)).toHaveCount(0);
  });
});
