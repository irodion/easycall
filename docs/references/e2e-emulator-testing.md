# E2E Testing with Firebase Emulators

## Prerequisites

| Requirement         | Version | Check                                   |
| ------------------- | ------- | --------------------------------------- |
| Java JDK            | ≥ 21    | `java -version`                         |
| Firebase CLI        | ≥ 15    | `firebase --version`                    |
| Playwright browsers | current | `pnpm exec playwright install chromium` |

The Firebase Emulator Suite requires Java 21+. Older JDK versions will fail silently with exit code 1.

## One-time setup

```bash
# Install Playwright browsers if not already done
pnpm exec playwright install chromium

# Verify emulators can start (Ctrl-C to stop after confirming output)
firebase emulators:start --only auth,firestore,database
```

Expected output:

```text
✔  All emulators ready! ...
┌─────────────────────────────────────────────────────────┐
│ Emulator  | Host:Port        │
├───────────┼──────────────────┤
│ Auth      │ 127.0.0.1:9099   │
│ Firestore │ 127.0.0.1:8080   │
│ Database  │ 127.0.0.1:9000   │
└─────────────────────────────────────────────────────────┘
```

## Running the tests

### Step 1 — Start emulators in one terminal

```bash
firebase emulators:start --only auth,firestore,database
```

Leave this running. The Playwright script does **not** manage the emulator process.

### Step 2 — Run E2E tests in a second terminal

```bash
pnpm test:e2e:emulators
```

This is equivalent to:

```bash
USE_EMULATORS=true npx playwright test --project=chromium
```

The `USE_EMULATORS=true` flag causes:

1. Playwright to start the Vite dev server with `VITE_USE_EMULATORS=true`
2. The app to call `connectAuthEmulator` + `connectFirestoreEmulator` + `connectDatabaseEmulator` at startup

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
DELETE 127.0.0.1:9000/.json?ns=easycall-dev-default-rtdb  (with Authorization: Bearer owner)
```

All emulator suites use `test.describe.configure({ mode: 'serial' })` to prevent parallel workers from calling `clearEmulators()` concurrently and wiping each other's seeded data mid-test.

Additionally, the Playwright config forces `workers: 1` when `USE_EMULATORS=true` because emulator tests share global state (a single Auth + Firestore instance). Without this, separate spec files run in parallel workers and their `clearEmulators()` calls race against each other.

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

### `Incoming Call Flow` — 1 test

Pre-seeded with an elderly user doc (no contacts). Verifies:

- Writing an `incomingCall/current` doc via Firestore REST triggers the IncomingCallScreen overlay
- Answer and Decline buttons appear with the caller name
- Declining dismisses the ringing screen

Uses the same auth intercept pattern as the elderly-call suite. Does **not** need Jitsi or Cloud Function mocks since it only tests the incoming call overlay, not the call screen itself.

### `Call History (emulators)` — 4 tests

Pre-seeded with an elderly user doc and callHistory entries. Verifies:

- Empty state shows "No calls yet"
- Call history entries render with correct outcome badges (completed/missed/declined)
- Tapping an entry navigates to CallScreen
- Navigation between HomeScreen and CallHistory screen

### `Auto-Rejoin on Disconnect (emulators)` — 5 tests

Pre-seeded with an elderly user doc, contact, and activeCall doc. Verifies:

- Rejoin prompt appears when active call exists (within 5 minutes)
- Clicking rejoin navigates to CallScreen
- Dismiss clears the prompt
- No prompt for stale calls (>5 minutes old)
- No prompt when no activeCall document exists

### `Call history writing (emulators)` — 1 test

Verifies end-to-end that call history entries are written to Firestore:

- Completing a call writes an entry with outcome 'completed' and direction 'outgoing'

### `Online Presence Indicators` — 5 tests

Pre-seeded with two elderly users where one is a contact of the other. Verifies:

- Green status dot appears when a contact is online (RTDB state: `online`)
- Status dot updates to amber when contact enters a call (RTDB state: `in-call`)
- Status dot turns gray when contact goes offline (RTDB state: `offline`)
- No status dot (or offline) for contacts without RTDB presence data
- User's own presence is written to RTDB as `online` on page load

Uses the RTDB emulator REST API (`PUT /status/{uid}.json`) to simulate presence state changes from external users.

### `Smoke tests` — 2 tests

These run without emulators and do not require `USE_EMULATORS=true`.

## Ports used

| Service            | Port | Purpose                                     |
| ------------------ | ---- | ------------------------------------------- |
| Auth emulator      | 9099 | `signInAnonymously`, token issuance         |
| Firestore emulator | 8080 | Document reads/writes, `onSnapshot`         |
| RTDB emulator      | 9000 | Presence state (`/status/{uid}`), `onValue` |
| Vite dev server    | 5173 | App under test                              |
| Emulator UI        | 4000 | Optional — view data in browser             |

## Troubleshooting

### "Process from config.webServer was not able to start"

The Playwright webServer config does **not** start the Firebase emulators. Start them manually first with `firebase emulators:start --only auth,firestore,database`.

### "Firestore emulator not reachable"

The `beforeAll` health check will throw this error if the required emulator port is not responding. Confirm emulators are running: `curl http://127.0.0.1:8080` (Firestore), `curl http://127.0.0.1:9000` (RTDB).

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

The emulator suites use `mode: 'serial'` and `workers: 1`. If you add new emulator tests to a different `describe` block, make sure to also add `test.describe.configure({ mode: 'serial' })`. The `workers: 1` config is enforced in `playwright.config.ts` when `USE_EMULATORS=true`.
