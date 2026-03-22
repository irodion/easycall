import { test, expect } from '@playwright/test';

/**
 * E2E tests for the unlink elderly user feature:
 *
 * Core scenario: Admin unlinks a member from their dashboard, which removes
 * the caregiver link and resets the member's data. The member then behaves
 * as a first-time user.
 *
 * NOTE: These tests intercept the unlinkElderlyUser Cloud Function call and
 * simulate its effects directly in Firestore, because the Functions emulator
 * is not required for E2E tests (only auth + firestore emulators).
 *
 * PREREQUISITES:
 * - Firebase emulators running: `firebase emulators:start --only auth,firestore`
 * - App served with emulator config: `VITE_USE_EMULATORS=true pnpm dev`
 *
 * Run: `pnpm test:e2e:emulators e2e/unlink-elderly.spec.ts`
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
                language: { stringValue: 'en' },
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
  const res = await fetch(
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
  if (!res.ok) throw new Error(`Failed to seed caregiver link: ${res.status}`);
}

async function seedContact(elderlyUid: string, name: string): Promise<void> {
  const res = await fetch(
    `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${elderlyUid}/contacts/contact-1`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...EMULATOR_AUTH_HEADER },
      body: JSON.stringify({
        fields: {
          name: { stringValue: name },
          photoURL: { nullValue: null },
          jitsiRoomId: { stringValue: 'room-test-123' },
          contactUserId: { stringValue: '' },
          displayOrder: { integerValue: '0' },
          createdAt: { timestampValue: new Date().toISOString() },
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Failed to seed contact: ${res.status}`);
}

interface FirestoreDoc {
  fields?: Record<string, { stringValue?: string; booleanValue?: boolean }>;
}

async function getUserDoc(uid: string): Promise<FirestoreDoc | null> {
  const res = await fetch(
    `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`,
    { headers: { ...EMULATOR_AUTH_HEADER } },
  );
  if (!res.ok) return null;
  return res.json() as Promise<FirestoreDoc>;
}

async function getSubcollectionDocs(uid: string, subcollection: string): Promise<FirestoreDoc[]> {
  const res = await fetch(
    `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}/${subcollection}`,
    { headers: { ...EMULATOR_AUTH_HEADER } },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { documents?: FirestoreDoc[] };
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

/**
 * Intercept the unlinkElderlyUser Cloud Function call and simulate its effects
 * directly in Firestore. This avoids needing the Functions emulator.
 */
function interceptUnlinkFunction(page: import('@playwright/test').Page, caregiverUid: string) {
  return page.route('**/unlinkElderlyUser**', async (route) => {
    // Parse the request to get the elderlyUserId
    const body = route.request().postDataJSON() as { data?: { elderlyUserId?: string } };
    const elderlyUserId = body?.data?.elderlyUserId;

    if (!elderlyUserId) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { message: 'elderlyUserId required', status: 'INVALID_ARGUMENT' },
        }),
      });
      return;
    }

    // Simulate the Cloud Function's effects:

    // 1. Delete caregiver link
    await fetch(
      `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${elderlyUserId}/caregivers/${caregiverUid}`,
      { method: 'DELETE', headers: { ...EMULATOR_AUTH_HEADER } },
    );

    // 2. Delete contacts
    const contactsRes = await fetch(
      `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${elderlyUserId}/contacts`,
      { headers: { ...EMULATOR_AUTH_HEADER } },
    );
    if (contactsRes.ok) {
      const contactsData = (await contactsRes.json()) as { documents?: { name: string }[] };
      if (contactsData.documents) {
        await Promise.all(
          contactsData.documents.map((doc) =>
            fetch(`${FIRESTORE_EMULATOR}/v1/${doc.name}`, {
              method: 'DELETE',
              headers: { ...EMULATOR_AUTH_HEADER },
            }),
          ),
        );
      }
    }

    // 3. Remove elderlyUserId from caregiver's linkedElderlyUsers
    // Read current caregiver doc, filter out the elderlyUserId, write back
    const cgDocRes = await fetch(
      `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${caregiverUid}`,
      { headers: { ...EMULATOR_AUTH_HEADER } },
    );
    if (cgDocRes.ok) {
      const cgDoc = (await cgDocRes.json()) as {
        fields?: { linkedElderlyUsers?: { arrayValue?: { values?: { stringValue: string }[] } } };
      };
      const currentLinked = cgDoc.fields?.linkedElderlyUsers?.arrayValue?.values ?? [];
      const filtered = currentLinked.filter((v) => v.stringValue !== elderlyUserId);
      await fetch(
        `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${caregiverUid}?updateMask.fieldPaths=linkedElderlyUsers`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...EMULATOR_AUTH_HEADER },
          body: JSON.stringify({
            fields: {
              linkedElderlyUsers: {
                arrayValue: { values: filtered.length > 0 ? filtered : [] },
              },
            },
          }),
        },
      );
    }

    // 4. Reset elderly user doc
    await fetch(
      `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${elderlyUserId}?updateMask.fieldPaths=displayName&updateMask.fieldPaths=onboardingComplete&updateMask.fieldPaths=pushTokens&updateMask.fieldPaths=settings`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...EMULATOR_AUTH_HEADER },
        body: JSON.stringify({
          fields: {
            displayName: { stringValue: '' },
            onboardingComplete: { booleanValue: false },
            pushTokens: { arrayValue: { values: [] } },
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
          },
        }),
      },
    );

    // Return success response matching Cloud Functions callable format
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ result: { success: true } }),
    });
  });
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
// Tests
// ---------------------------------------------------------------------------

test.describe('Unlink elderly user (emulators)', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(checkEmulators);

  let adminUser: EmulatorUser;
  let elderlyUser: EmulatorUser;

  test.beforeEach(async ({ page }) => {
    await clearEmulators();

    // Create admin + elderly user
    [adminUser, elderlyUser] = await Promise.all([createEmulatorUser(), createEmulatorUser()]);

    // Seed elderly user with name and a contact
    await seedUserAsElderly(elderlyUser.localId, 'Grandma');
    await seedContact(elderlyUser.localId, 'Some Friend');

    // Seed admin with elderly user linked
    await seedUserAsCaregiver(adminUser.localId, [elderlyUser.localId]);

    // Seed the caregiver link subcollection
    await seedCaregiverLink(elderlyUser.localId, adminUser.localId);

    // Intercept auth for admin
    await interceptAuth(page, adminUser);
    // Intercept the Cloud Function call (no functions emulator)
    await interceptUnlinkFunction(page, adminUser.localId);
  });

  test('dashboard shows linked member with Unlink button', async ({ page }) => {
    await page.goto('/caregiver');

    await expect(page.getByText('Grandma')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /unlink grandma/i })).toBeVisible();
  });

  test('clicking Unlink opens confirmation dialog', async ({ page }) => {
    await page.goto('/caregiver');

    await expect(page.getByText('Grandma')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /unlink grandma/i }).click();

    // Confirm dialog should be visible with warning message
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/unlink grandma and reset/i)).toBeVisible();
  });

  test('cancelling the dialog does not unlink', async ({ page }) => {
    await page.goto('/caregiver');

    await expect(page.getByText('Grandma')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /unlink grandma/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Cancel
    await page.getByRole('button', { name: /cancel/i }).click();

    // Dialog should close, member still visible
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByText('Grandma')).toBeVisible();

    // Verify Firestore: caregiver link still exists
    const caregiverDocs = await getSubcollectionDocs(elderlyUser.localId, 'caregivers');
    expect(caregiverDocs.length).toBe(1);
  });

  test('confirming unlink removes member from dashboard and resets their data', async ({
    page,
  }) => {
    await page.goto('/caregiver');

    await expect(page.getByText('Grandma')).toBeVisible({ timeout: 15_000 });

    // Click Unlink → Confirm
    await page.getByRole('button', { name: /unlink grandma/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: /confirm/i }).click();

    // Dialog should close
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 15_000 });

    // Member heading should disappear from dashboard
    await expect(page.getByRole('heading', { name: 'Grandma' })).not.toBeVisible({
      timeout: 15_000,
    });

    // Should show the empty state
    await expect(page.getByText(/no linked members yet/i)).toBeVisible({ timeout: 10_000 });

    // Verify Firestore: caregiver link removed
    await expect
      .poll(
        async () => {
          const caregiverDocs = await getSubcollectionDocs(elderlyUser.localId, 'caregivers');
          return caregiverDocs.length;
        },
        { timeout: 10_000 },
      )
      .toBe(0);

    // Verify Firestore: contacts deleted
    const contacts = await getSubcollectionDocs(elderlyUser.localId, 'contacts');
    expect(contacts.length).toBe(0);

    // Verify Firestore: elderly user doc reset
    const userDoc = await getUserDoc(elderlyUser.localId);
    expect(userDoc?.fields?.['displayName']?.stringValue).toBe('');
    expect(userDoc?.fields?.['onboardingComplete']?.booleanValue).toBe(false);
  });

  test('after unlink, elderly user sees onboarding (fresh state)', async ({ page, browser }) => {
    await page.goto('/caregiver');

    await expect(page.getByText('Grandma')).toBeVisible({ timeout: 15_000 });

    // Unlink
    await page.getByRole('button', { name: /unlink grandma/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: /confirm/i }).click();
    await expect(page.getByText(/no linked members yet/i)).toBeVisible({ timeout: 15_000 });

    // Wait for Firestore reset to complete
    await expect
      .poll(
        async () => {
          const userDoc = await getUserDoc(elderlyUser.localId);
          return userDoc?.fields?.['onboardingComplete']?.booleanValue;
        },
        { timeout: 10_000 },
      )
      .toBe(false);

    // Now log in as the elderly user in a fresh browser context
    const elderlyCtx = await browser.newContext({
      permissions: ['camera', 'microphone'],
    });
    const elderlyPage = await elderlyCtx.newPage();

    await elderlyPage.route('**/accounts:signUp**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(elderlyUser),
      }),
    );

    await elderlyPage.goto('/elderly');

    // Elderly user should see the onboarding flow (Welcome screen),
    // because onboardingComplete was reset to false
    await expect(elderlyPage.getByRole('heading', { name: /welcome to easycall/i })).toBeVisible({
      timeout: 15_000,
    });

    // Should NOT see the home screen contacts
    await expect(elderlyPage.getByText('Some Friend')).not.toBeVisible();

    await elderlyCtx.close();
  });
});
