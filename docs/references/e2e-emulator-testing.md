# E2E Testing with Firebase Emulators

## Prerequisites

| Requirement | Version | Check |
|---|---|---|
| Java JDK | ≥ 21 | `java -version` |
| Firebase CLI | ≥ 15 | `firebase --version` |
| Playwright browsers | current | `pnpm exec playwright install chromium` |

The Firebase Emulator Suite requires Java 21+. Older JDK versions will fail silently with exit code 1.

## One-time setup

```bash
# Install Playwright browsers if not already done
pnpm exec playwright install chromium

# Verify emulators can start (Ctrl-C to stop after confirming output)
firebase emulators:start --only auth,firestore
```

Expected output:
```text
✔  All emulators ready! ...
┌─────────────────────────────────────────────────────────┐
│ Emulator  | Host:Port        │
├───────────┼──────────────────┤
│ Auth      │ 127.0.0.1:9099   │
│ Firestore │ 127.0.0.1:8080   │
└─────────────────────────────────────────────────────────┘
```

## Running the tests

### Step 1 — Start emulators in one terminal

```bash
firebase emulators:start --only auth,firestore
```

Leave this running. The Playwright script does **not** manage the emulator process.

### Step 2 — Run E2E tests in a second terminal

```bash
pnpm test:e2e:emulators
```

This is equivalent to:
```bash
USE_EMULATORS=true playwright test --project=chromium
```

The `USE_EMULATORS=true` flag causes:
1. Playwright to start the Vite dev server with `VITE_USE_EMULATORS=true`
2. The app to call `connectAuthEmulator` + `connectFirestoreEmulator` at startup

## How it works

### Auth flow

Each test pre-creates an anonymous user in the **Auth emulator** from the Node.js test process:

```text
Test runner (Node.js) → POST 127.0.0.1:9099/accounts:signUp → { localId, idToken }
```

The test then intercepts the **browser's** `signInAnonymously` request and returns that same token. This ensures the browser and test runner share the same UID before any Firestore reads happen.

### Firestore seeding

Data is seeded via the Firestore emulator REST API **before** `page.goto()`, using the admin bypass header:

```text
Authorization: Bearer owner
```

This header skips security rules evaluation entirely — it is accepted only by the emulator, never by production Firestore.

Seeded paths per test:
- `users/{uid}` — role: `elderly`, onboardingComplete: `true`
- `users/{uid}/contacts/contact-1` — name: `Contact 1`

### Test isolation

Each test calls `clearEmulators()` in `beforeEach`, which deletes all Firestore documents and all Auth users via the emulator admin REST endpoints:

```text
DELETE 127.0.0.1:8080/emulator/v1/projects/easycall-dev/databases/(default)/documents
DELETE 127.0.0.1:9099/emulator/v1/projects/easycall-dev/accounts
```

Both emulator suites use `test.describe.configure({ mode: 'serial' })` to prevent parallel workers from calling `clearEmulators()` concurrently and wiping each other's seeded data mid-test.

### Jitsi + JWT mocking

The Jitsi CDN script and the `generateJitsiJwt` Cloud Function are mocked via `page.route()` — no Functions emulator is needed.

## Test suites

### `Elderly user call flow (emulators)` — 4 tests

Pre-seeded with an elderly user doc and one contact. Verifies:
- Contact 1 appears on HomeScreen
- Tapping contact navigates to CallScreen (end call button visible)
- Ending a call returns to HomeScreen
- No JavaScript errors during the full flow

### `Role selection flow (emulators)` — 1 test

No pre-seeding. Verifies:
- AuthGuard shows RoleSelector when user has no role doc
- Clicking "I am an elderly user" writes role to Firestore
- After page reload, AuthGuard reads the written role and shows HomeScreen

> **Why reload?** React Router does not remount `AuthGuard` when navigating to
> the same route (`/elderly → /elderly`). Reloading lets `AuthGuard` re-evaluate
> the user doc from a clean state, using auth restored from IndexedDB.

### `Smoke tests` — 2 tests

These run without emulators and do not require `USE_EMULATORS=true`.

## Ports used

| Service | Port | Purpose |
|---|---|---|
| Auth emulator | 9099 | `signInAnonymously`, token issuance |
| Firestore emulator | 8080 | Document reads/writes, `onSnapshot` |
| Vite dev server | 5173 | App under test |
| Emulator UI | 4000 | Optional — view data in browser |

## Troubleshooting

### "Process from config.webServer was not able to start"

The Playwright webServer config does **not** start the Firebase emulators. Start them manually first with `firebase emulators:start --only auth,firestore`.

### "Firestore emulator not reachable"

The `beforeAll` health check in `e2e/elderly-call.spec.ts` will throw this error if port 8080 is not responding. Confirm emulators are running: `curl http://127.0.0.1:8080`.

### "Failed to seed user: 403 PERMISSION_DENIED"

The seeding requests must include `Authorization: Bearer owner`. If you see this error, the header is missing or the emulator version does not support the bypass. Update Firebase CLI: `npm install -g firebase-tools`.

### Java version error

```text
Error: firebase-tools no longer supports Java version before 21.
```

Install Java 21+:
```bash
brew install --cask temurin@21
```

Then set `JAVA_HOME`:
```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
```

Add this export to `~/.zshrc` to make it permanent.

### Tests interfere with each other (flaky parallel runs)

The emulator suites use `mode: 'serial'`. If you add new emulator tests to a different `describe` block, make sure to also add `test.describe.configure({ mode: 'serial' })`.
