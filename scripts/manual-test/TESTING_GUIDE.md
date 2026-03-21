# EasyCall Manual Testing Guide

Complete step-by-step guide to test the full application flow locally using Firebase Emulators (no hosting, no production database).

---

## Prerequisites

| Requirement  | Check command        | Install                          |
| ------------ | -------------------- | -------------------------------- |
| Node 20+     | `node -v`            | `brew install node`              |
| pnpm         | `pnpm -v`            | `npm i -g pnpm`                  |
| Java 21+     | `java -version`      | `brew install --cask oracle-jdk` |
| Firebase CLI | `firebase --version` | `npm i -g firebase-tools`        |
| Python 3.10+ | `python3 --version`  | Pre-installed on macOS           |

## Setup (one-time)

Run from the repository root:

```bash
pnpm install
cd functions && pnpm install && cd ..
```

---

## Step 1: Start Firebase Emulators

```bash
firebase emulators:start --only auth,firestore,database,functions
```

Leave this terminal open. You should see the Emulator UI at **http://127.0.0.1:4000**.

> The `demo-easycall` project prefix tells Firebase this is a demo project — no real credentials needed.

## Step 2: Start Dev Server (with emulators)

In a second terminal:

```bash
VITE_USE_EMULATORS=true pnpm dev
```

The app is now at **http://localhost:5173**.

> **Important:** The `VITE_USE_EMULATORS=true` flag connects to local emulators instead of production Firebase.

## Step 3: Seed Test Data for the Member User

The member flow uses **anonymous auth** — the app creates a fresh UID when you first visit. You need to seed data under _that_ UID:

1. Open http://localhost:5173
2. Click **"I need help calling"** (member role in product language; currently `elderly` in implementation) — the app signs in anonymously
3. Find your UID in the browser console (DevTools → Console):
   ```js
   (await import('/src/services/firebase.ts')).auth.currentUser.uid;
   ```
4. Seed data under that UID:
   ```bash
   python3 scripts/manual-test/seed_emulator.py --elderly-uid <YOUR_UID>
   ```
5. **Reload the page** — contacts appear

This also creates an admin account: `caregiver@test.local` / `test1234`.

> **Why not just `seed_emulator.py`?** Running without `--elderly-uid` creates auth users with _new_ UIDs, but the app's anonymous sign-in won't use those UIDs. The `--elderly-uid` flag seeds data under your actual browser session's UID.

---

## Test Flows

### Flow 1: Member User — Browse & Navigate

1. Complete Step 3 above (seed with your UID)
2. You see **HomeScreen** with two contact cards (Alex, Sarah)
3. Click the **gear icon** (top-right) → **SettingsScreen**
   - Change font size, language, etc.
   - Changes sync to Firestore emulator in real-time (verify in Emulator UI → Firestore tab)
4. Go back, click **"History"** → **CallHistory** screen (empty initially)
5. Click **"+"** or **"Add Contact"** if visible → **AddContact** screen

### Flow 2: Member User — Make a Call

> **Note on Jitsi:** Video calls require a JaaS App ID + JWT. Without `VITE_JAAS_APP_ID` and the `generateJitsiJwt` Cloud Function configured with JaaS keys, the call will fail to load the Jitsi iframe. To test the **call UI flow** (loading state → controls → hangup) without actual video:

**Option A — Without JaaS (test UI only):**

1. From HomeScreen, tap a contact card
2. You'll see the **CallScreen** loading spinner
3. It will fail to load Jitsi (expected without JaaS keys)
4. You can verify the call screen UI renders correctly

**Option B — With JaaS (full video call):**

1. Sign up at https://jaas.8x8.vc/ (free tier, 25 MAU)
2. Get your App ID, Key ID, and Private Key
3. Add to `.env.local`:
   ```
   VITE_JAAS_APP_ID=vpaas-magic-cookie-YOUR_ID
   ```
4. Set Cloud Function env (for emulator, create `functions/.env`):
   ```
   JAAS_APP_ID=vpaas-magic-cookie-YOUR_ID
   JAAS_KEY_ID=your-key-id
   JAAS_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
   ```
5. Restart emulators + dev server
6. Tap a contact → Jitsi loads → you get video/audio
7. Open the **same room URL** in a second browser/incognito to simulate the other person joining
8. Test: mute mic, mute camera, hang up
9. After hanging up, check CallHistory — a "completed" entry should appear

### Flow 3: Incoming Call (Simulated)

1. Make sure the member user's browser is on `/elderly` (HomeScreen; current route name)
2. In another terminal:
   ```bash
   python3 scripts/manual-test/simulate_incoming_call.py
   ```
3. The member user's browser should immediately show **IncomingCallScreen** overlay with:
   - Caller name: "Test Caller"
   - Answer button (green)
   - Decline button (red)
4. Click **Decline** → overlay dismisses, call status updates to "declined"
5. Run the script again and click **Answer** → navigates to CallScreen

To cancel without user interaction:

```bash
python3 scripts/manual-test/simulate_incoming_call.py --cancel
```

### Flow 4: Admin Dashboard

1. Open a **second browser** (or incognito window) at http://localhost:5173
2. Click **"I manage calls for someone"** (admin role in product language; currently `caregiver` in implementation)
3. Signs in anonymously → redirects to `/caregiver`
4. **Dashboard** shows the list of linked members (empty for this anonymous user)

To test with the seeded admin account:

1. Click **"Already have an account? Sign in"** on the RoleSelector
2. Enter `caregiver@test.local` / `test1234`
3. Dashboard should show "Grandma Rose" as a linked member
4. Click **Manage** → **ManageContacts** for that member
5. Add/remove contacts — changes reflect in the member's HomeScreen in real-time

### Flow 5: Admin Pairing

1. In the **member user's** browser, go to Settings → you should see a pairing code displayed (or generate one)
2. Alternatively, create a pairing code via script:
   ```bash
   python3 scripts/manual-test/create_pairing_code.py
   ```
3. In the **admin's** browser, go to Dashboard → **"Pair New User"**
4. Enter the 6-digit code
5. If using the emulator, the `validatePairingCode` Cloud Function runs locally
6. On success, the member appears in the admin dashboard

### Flow 6: Admin Account (Email/Password)

1. In admin browser, go to Dashboard → **Account**
2. Link an email/password to the anonymous account
3. Test **Forgot Password** flow (emails won't actually send in emulator, but the UI flow works)
4. Sign out and sign back in with the linked credentials

### Flow 7: App Lock (PIN)

1. In the member user's browser, go to **Settings**
2. Enable **App Lock** → set a 4-digit PIN
3. Reload the page → **AppLock** screen appears
4. Enter wrong PIN 3 times → cooldown timer activates
5. Enter correct PIN → unlocks

### Flow 8: Language & RTL

1. In Settings, change language to **Hebrew (עברית)**
2. The entire UI should flip to RTL
3. All text should be translated
4. Try **Russian**, **German**, **Spanish** as well

### Flow 9: Install Prompt (PWA)

1. In Chrome, the **InstallPrompt** component shows a banner suggesting "Add to Home Screen"
2. This only appears when `beforeinstallprompt` fires (requires HTTPS or localhost)
3. On localhost it may appear — try dismissing and accepting

---

## Verifying State in Emulator UI

Open **http://127.0.0.1:4000** to inspect:

| Tab           | What to check                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| **Auth**      | Users created, anonymous + email-linked accounts                                                     |
| **Firestore** | `users/{uid}` docs, `contacts` subcollections, `incomingCall/current`, `callHistory`, `pairingCodes` |
| **Database**  | `status/{uid}` presence entries                                                                      |
| **Functions** | Logs for `validatePairingCode`, `generateJitsiJwt`, `onIncomingCall`                                 |

---

## Two-Device Video Call Testing

To test an actual two-way video call on your local network:

1. Find your local IP: `ipconfig getifaddr en0` (e.g., `192.168.1.42`)
2. Start dev server bound to network:
   ```bash
   VITE_USE_EMULATORS=true pnpm dev --host
   ```
3. On your phone/tablet, open `http://192.168.1.42:5173`
4. Phone = member user, laptop = admin/contact
5. Both join the same Jitsi room → two-way video call

> **Note:** Camera/mic permissions require a secure context. `localhost` is treated as secure, but your local IP address is NOT. You may need to use Chrome flags or mDNS (`.local`) to work around this. Alternatively, use [ngrok](https://ngrok.com/) or [localtunnel](https://localtunnel.me/) to get an HTTPS URL for your dev server.

---

## Cleanup

Emulator data is ephemeral — it's gone when you stop the emulators. No cleanup needed.

To re-seed fresh data, just run `seed_emulator.py` again (it clears first).

---

## Troubleshooting

| Problem                          | Solution                                                                 |
| -------------------------------- | ------------------------------------------------------------------------ |
| Emulators won't start            | Check Java version (`java -version`, need 21+)                           |
| "Missing Firebase config" error  | Make sure `VITE_USE_EMULATORS=true` is set                               |
| Auth emulator connection refused | Verify port 9099 is free                                                 |
| Contacts not showing             | Check Firestore emulator UI for `users/{uid}/contacts`                   |
| Incoming call not triggering     | Verify member UID matches, check browser console for `onSnapshot` errors |
| Jitsi won't load                 | Need `VITE_JAAS_APP_ID` in `.env.local` — see Flow 2 Option B            |
| Camera/mic blocked               | Use `localhost` not `127.0.0.1`; or use HTTPS tunnel                     |
