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

/** Creates an email/password user in the auth emulator. */
async function createEmailUser(email: string, password: string): Promise<EmulatorUser> {
  const res = await fetch(
    `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  if (!res.ok) {
    throw new Error(`Auth emulator email signUp failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<EmulatorUser>;
}

const EMULATOR_AUTH_HEADER = { Authorization: 'Bearer owner' };

async function seedUserAsCaregiver(uid: string): Promise<void> {
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
          linkedElderlyUsers: {
            arrayValue: { values: [] },
          },
        },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Failed to seed caregiver: ${res.status} ${await res.text()}`);
  }
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
        `${name} not reachable at ${url}.\n` +
          `Run: firebase emulators:start --only auth,firestore`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Suite 1: Account banner and linking flow
// ---------------------------------------------------------------------------

test.describe('Caregiver account linking (emulators)', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(checkEmulators);

  test.beforeEach(async ({ page }) => {
    await clearEmulators();

    const user = await createEmulatorUser();
    await seedUserAsCaregiver(user.localId);

    // Intercept signInAnonymously to reuse pre-created user
    await page.route('**/accounts:signUp**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user),
      }),
    );
  });

  test('caregiver dashboard shows account banner for anonymous user', async ({ page }) => {
    await page.goto('/caregiver');

    await expect(page.getByText(/secure your account/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('link', { name: /set up email/i })).toBeVisible();
  });

  test('account banner can be dismissed', async ({ page }) => {
    await page.goto('/caregiver');

    await expect(page.getByText(/secure your account/i)).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /dismiss/i }).click();

    await expect(page.getByText(/secure your account/i)).not.toBeVisible();

    // Banner stays dismissed after reload
    await page.reload();
    await expect(page.getByText(/caregiver dashboard/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/secure your account/i)).not.toBeVisible();
  });

  test('caregiver can navigate to account page and see link form', async ({ page }) => {
    await page.goto('/caregiver');

    await expect(page.getByRole('link', { name: /set up email/i })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole('link', { name: /set up email/i }).click();

    await expect(page).toHaveURL(/\/caregiver\/account/, { timeout: 10000 });
    await expect(page.getByText(/secure your account/i)).toBeVisible();
    await expect(page.getByLabel(/^email$/i)).toBeVisible();
    await expect(page.getByLabel(/^password$/i)).toBeVisible();
    await expect(page.getByLabel(/confirm password/i)).toBeVisible();
  });

  test('account link form validates password length', async ({ page }) => {
    await page.goto('/caregiver/account');

    // Wait for form to load
    await expect(page.getByLabel(/^email$/i)).toBeVisible({ timeout: 15000 });

    await page.getByLabel(/^email$/i).fill('test@example.com');
    await page.getByLabel(/^password$/i).fill('12345');
    await page.getByLabel(/confirm password/i).fill('12345');
    await page.getByRole('button', { name: /link email/i }).click();

    await expect(page.getByText(/at least 6 characters/i)).toBeVisible();
  });

  test('account link form validates password match', async ({ page }) => {
    await page.goto('/caregiver/account');

    await expect(page.getByLabel(/^email$/i)).toBeVisible({ timeout: 15000 });

    await page.getByLabel(/^email$/i).fill('test@example.com');
    await page.getByLabel(/^password$/i).fill('password123');
    await page.getByLabel(/confirm password/i).fill('different');
    await page.getByRole('button', { name: /link email/i }).click();

    await expect(page.getByText(/do not match/i)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Suite 2: RoleSelector sign-in link and login page
// ---------------------------------------------------------------------------

test.describe('Login page (emulators)', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(checkEmulators);

  test.beforeEach(async () => {
    await clearEmulators();
  });

  test('role selector shows "Already have an account? Sign in" link', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible({ timeout: 10000 });
    expect(
      await page.getByRole('link', { name: /sign in/i }).getAttribute('href'),
    ).toBe('/login');
  });

  test('login page renders email and password fields', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByLabel(/email/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('login page shows error for wrong credentials', async ({ page }) => {
    // Create a user first so auth emulator has someone to reject against
    await createEmailUser('test@example.com', 'correctpassword');

    await page.goto('/login');
    await expect(page.getByLabel(/email/i)).toBeVisible({ timeout: 10000 });

    await page.getByLabel(/email/i).fill('test@example.com');
    await page.getByLabel(/password/i).fill('wrongpassword');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Should show an error message (either wrong password or generic error)
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 10000 });
  });

  test('login page has forgot password link', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('link', { name: /forgot password/i })).toBeVisible({
      timeout: 10000,
    });
    await page.getByRole('link', { name: /forgot password/i }).click();

    await expect(page).toHaveURL(/\/forgot-password/, { timeout: 5000 });
  });

  test('login page has continue as new user link back to role selector', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('link', { name: /continue as new user/i })).toBeVisible({
      timeout: 10000,
    });
    await page.getByRole('link', { name: /continue as new user/i }).click();

    await expect(page).toHaveURL('/', { timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Forgot password page
// ---------------------------------------------------------------------------

test.describe('Forgot password page (emulators)', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(checkEmulators);

  test.beforeEach(async () => {
    await clearEmulators();
  });

  test('forgot password page renders form', async ({ page }) => {
    await page.goto('/forgot-password');

    await expect(page.getByLabel(/email/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /send reset email/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /back to sign in/i })).toBeVisible();
  });

  test('forgot password shows success after submitting valid email', async ({ page }) => {
    // Create a user so the reset email can be "sent"
    await createEmailUser('reset@example.com', 'password123');

    await page.goto('/forgot-password');
    await expect(page.getByLabel(/email/i)).toBeVisible({ timeout: 10000 });

    await page.getByLabel(/email/i).fill('reset@example.com');
    await page.getByRole('button', { name: /send reset email/i }).click();

    await expect(page.getByText(/check your email/i)).toBeVisible({ timeout: 10000 });
  });

  test('forgot password back link navigates to login', async ({ page }) => {
    await page.goto('/forgot-password');

    await expect(page.getByRole('link', { name: /back to sign in/i })).toBeVisible({
      timeout: 10000,
    });
    await page.getByRole('link', { name: /back to sign in/i }).click();

    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// Suite 4: Returning caregiver sign-in flow (full round-trip)
// ---------------------------------------------------------------------------

test.describe('Returning caregiver sign-in (emulators)', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(checkEmulators);

  test('caregiver can sign in with email/password and access dashboard', async ({ page }) => {
    await clearEmulators();

    // 1. Create an email/password user in auth emulator (simulates a previously linked account)
    const emailUser = await createEmailUser('caregiver@example.com', 'mypassword123');

    // 2. Seed Firestore with caregiver role for that UID
    await seedUserAsCaregiver(emailUser.localId);

    // 3. Navigate to login page
    await page.goto('/login');
    await expect(page.getByLabel(/email/i)).toBeVisible({ timeout: 10000 });

    // 4. Fill in credentials and sign in
    await page.getByLabel(/email/i).fill('caregiver@example.com');
    await page.getByLabel(/password/i).fill('mypassword123');
    await page.getByRole('button', { name: /sign in/i }).click();

    // 5. Should navigate to caregiver dashboard
    await expect(page).toHaveURL(/\/caregiver/, { timeout: 15000 });
    await expect(page.getByText(/caregiver dashboard/i)).toBeVisible({ timeout: 10000 });
  });
});
