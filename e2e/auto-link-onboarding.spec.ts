import { test, expect } from '@playwright/test';

/**
 * E2E test for auto-linking during onboarding:
 *
 * When an elderly user is on the pairing code screen (step 4 of onboarding)
 * and a caregiver enters their PIN code (creating a caregivers subcollection doc),
 * the elderly user should auto-complete onboarding without pressing "Done".
 *
 * PREREQUISITES:
 * - Firebase emulators running: `firebase emulators:start --only auth,firestore`
 * - App served with emulator config: `VITE_USE_EMULATORS=true pnpm dev`
 *
 * Run: `pnpm test:e2e:emulators e2e/auto-link-onboarding.spec.ts`
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

async function seedElderlyOnboarding(uid: string): Promise<void> {
  const res = await fetch(
    `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...EMULATOR_AUTH_HEADER },
      body: JSON.stringify({
        fields: {
          role: { stringValue: 'elderly' },
          onboardingComplete: { booleanValue: false },
          lastSeen: { timestampValue: new Date().toISOString() },
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

async function checkEmulators(): Promise<void> {
  for (const [name, url] of [
    ['Firestore emulator', FIRESTORE_EMULATOR],
    ['Auth emulator', AUTH_EMULATOR],
  ] as const) {
    try {
      await fetch(url);
    } catch (err) {
      throw new Error(
        `${name} not reachable at ${url}: ${err instanceof Error ? err.message : err}\nRun: firebase emulators:start --only auth,firestore`,
      );
    }
  }
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

test.describe('Auto-link during onboarding (emulators)', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(checkEmulators);

  test('elderly user auto-completes onboarding when caregiver links them on pairing screen', async ({
    page,
  }) => {
    await clearEmulators();

    // 1. Create elderly user (onboardingComplete: false → shows onboarding)
    const elderlyUser = await createEmulatorUser();
    await seedElderlyOnboarding(elderlyUser.localId);
    await interceptAuth(page, elderlyUser);

    // 2. Navigate to /elderly → AuthGuard detects onboarding incomplete → shows OnboardingFlow
    await page.goto('/elderly');

    // Step 1: Welcome screen
    await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /skip/i }).click();

    // Step 2: Camera/Microphone — may auto-advance if permissions already granted
    // Step 3: Notifications — skip if visible
    // Since Playwright grants permissions upfront, PermissionCheck.onReady may fire immediately,
    // auto-advancing past step 2. Just wait until we reach the pairing step.
    const notificationHeading = page.getByRole('heading', { name: /notification/i });
    const pairingHeading = page.getByRole('heading', { name: /pair with admin/i });

    // Wait for either notification step or pairing step
    await expect(notificationHeading.or(pairingHeading)).toBeVisible({ timeout: 10_000 });

    // If we're on notifications, skip it
    if (await notificationHeading.isVisible()) {
      await page.getByRole('button', { name: /skip/i }).click();
    }

    // Step 4: Pairing code screen — elderly user is waiting here
    await expect(page.getByRole('heading', { name: /pair with admin/i })).toBeVisible({
      timeout: 5_000,
    });
    // Verify pairing code is displayed (6-digit number)
    await expect(page.getByText(/\d{6}/)).toBeVisible({ timeout: 5_000 });

    // 3. Simulate caregiver linking by writing to caregivers subcollection
    const fakeCaregiverUid = 'caregiver-e2e-test';
    await seedCaregiverLink(elderlyUser.localId, fakeCaregiverUid);

    // 4. The elderly user should auto-transition past onboarding.
    //    Since there's no displayName, AuthGuard will show the SetNameScreen.
    await expect(page.getByRole('heading', { name: /what's your name/i })).toBeVisible({
      timeout: 10_000,
    });

    // The onboarding pairing screen should no longer be visible
    await expect(page.getByRole('heading', { name: /pair with admin/i })).not.toBeVisible();
  });
});
