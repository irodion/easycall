# Feature: Phase 2 — Notifications, Incoming Calls & Pairing

The following plan should be complete, but validate documentation and codebase patterns before
implementing. Pay special attention to naming of existing types/models and import paths.

## Feature Description

Phase 2 implements the real-time communication features that make EasyCall actually useful: push
notifications when someone calls, the incoming call answer screen, the 6-digit pairing code flow
that lets caregivers link to elderly devices remotely, caregiver settings management, and an
onboarding flow. The Firebase Cloud Functions for all server-side work are **already implemented**
in `functions/src/index.ts` — Phase 2 is primarily client-side work.

## User Story

As an elderly user
I want to see a full-screen alert when a family member calls me
So that I can answer with a single tap without navigating to the app

As a caregiver
I want to enter a 6-digit code to link my account to grandma's device
So that I can manage her contacts and settings remotely

## Problem Statement

Phase 1 (MVP) gives elderly users a contact list and call screen but lacks:

- Push notifications to wake the device when backgrounded
- Incoming call UI (full-screen, single-tap answer)
- Remote pairing (caregiver ↔ elderly link)
- Settings synchronization from caregiver to elderly device
- Guided onboarding for first-time users

## Solution Statement

Client-side hooks (`usePushNotifications`, `useIncomingCall`, `usePairingCode`) subscribe to
Firebase services and update Zustand stores. UI components render the appropriate states. A custom
FCM service worker handles background message display. All server-side logic is already live in
Cloud Functions.

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: High
**Primary Systems Affected**: hooks/, stores/, components/elderly/, components/caregiver/, components/shared/, vite.config.ts (PWA strategy change)
**Dependencies**: Firebase v12 (modular SDK), Zustand v5, React Router v7, vite-plugin-pwa InjectManifest

---

## PREREQUISITE CHECK

**Phase 1 tasks that MUST be complete before implementing Phase 2:**

| Task  | Title                           | Status                                                                            |
| ----- | ------------------------------- | --------------------------------------------------------------------------------- |
| 1.0.4 | Design Tokens & Base Components | Components exist (EasyCallButton, EasyCallCard, EasyCallText) — verify tests pass |
| 1.1.1 | Contact List Store (Zustand)    | ❌ Not done                                                                       |
| 1.1.2 | Home Screen                     | ❌ Not done                                                                       |
| 1.2.1 | useMediaPermissions hook        | ❌ Not done                                                                       |
| 1.2.2 | PermissionCheck component       | ❌ Not done                                                                       |
| 1.3.1 | Jitsi API Loader service        | ❌ Not done                                                                       |
| 1.3.2 | generateJitsiJwt Cloud Function | ✅ Done (in functions/src/index.ts)                                               |
| 1.3.3 | CallScreen component            | ❌ Not done                                                                       |
| 1.4.1 | Elderly SettingsScreen          | ❌ Not done                                                                       |
| 1.5.1 | CaregiverDashboard basic layout | ❌ Not done                                                                       |
| 1.6.1 | Routing & Role-Based Views      | ❌ Not done                                                                       |
| 1.7.1 | PWA Install Prompt              | ❌ Not done                                                                       |
| 1.8.1 | E2E: Elderly Makes a Call       | ❌ Not done                                                                       |

**Phase 2 Cloud Functions already done** (in `functions/src/index.ts`):

- `onIncomingCall` — FCM push on Firestore write
- `validatePairingCode` — atomic pairing code validation + caregiver link creation
- `generateJitsiJwt` — JaaS JWT generation with room ownership verification

---

## CONTEXT REFERENCES

### Relevant Codebase Files — READ BEFORE IMPLEMENTING

- `src/services/firebase.ts` — Firebase init pattern; lazy async `getFirebaseMessaging()` with `isSupported()`; config validation skipped in test mode. Mirror this pattern for any new Firebase service.
- `src/types/user.ts` — `EasyCallUser`, `Contact`, `UserSettings`, `FirestoreTimestamp` types. Import from here.
- `src/types/jitsi.ts` — `JitsiEvent`, `JitsiCommand` types. Note: `setVideoQuality` command is missing and needs to be added for task 1.3.4 (Phase 1), but not blocking Phase 2.
- `src/styles/tokens.css` — All CSS custom properties (--touch-min/primary/call, --text-body/button/heading/display, --color-call-green/red, --space-_, --radius-_). Use these in Tailwind arbitrary values.
- `src/index.css` (lines 51–63) — Custom Tailwind utilities: `touch-target-min` (56px), `touch-target-primary` (80px), `touch-target-call` (100px). Use these classes on interactive elements.
- `src/components/shared/EasyCallButton.tsx` — Component pattern: functional, typed props interface, DaisyUI class composition, design token font via `text-[length:var(--text-button)]`.
- `src/components/shared/EasyCallCard.tsx` — Renders as `<button>` when `onClick` provided, `<div>` otherwise.
- `src/components/shared/EasyCallButton.test.tsx` — Test pattern: `describe/it`, RTL `render/screen`, `userEvent.setup()`, `axe(container)` + `toHaveNoViolations()`, `vi.fn()`.
- `src/test/helpers/render.tsx` — `renderWithProviders` wraps in `MemoryRouter`. Use for all component tests.
- `src/test/helpers/factories.ts` — `createMockUser(overrides)`, `createMockContact(overrides)`. Import from `@/test/helpers`.
- `src/test/mocks/firebase.ts` — MSW handlers for Firestore REST. Extend for new Firestore paths.
- `src/test/mocks/server.ts` — MSW server with `onUnhandledRequest: 'error'`. Add handlers before running tests; unmatched requests fail tests.
- `src/test/mocks/jitsi.ts` — `MockJitsiMeetExternalAPI` with `_emit(event, data)` test helper and `getExecutedCommands()`.
- `src/test/setup.ts` — vitest-axe matchers extended; MSW server lifecycle. No changes needed.
- `functions/src/index.ts` — All Cloud Functions. `onIncomingCall`, `validatePairingCode`, `generateJitsiJwt` are done. Do NOT re-implement these.
- `vite.config.ts` — VitePWA uses `workbox` strategy currently. **Must switch to `injectManifest`** for FCM service worker support.
- `src/pwa-config.ts` — Shared PWA manifest object (read this to understand current PWA setup).
- `firestore.rules` — Security rules (incomingCall, pairingCodes, caregivers sub-collections). Understand access patterns before writing client code.

### New Files to Create

**Hooks:**

- `src/hooks/usePushNotifications.ts` — FCM token registration, permission request, foreground message handling
- `src/hooks/usePushNotifications.test.ts` — Unit tests
- `src/hooks/useIncomingCall.ts` — Firestore onSnapshot listener for incomingCall/current
- `src/hooks/useIncomingCall.test.ts` — Unit tests
- `src/hooks/usePairingCode.ts` — 6-digit code generation, Firestore write, countdown timer
- `src/hooks/usePairingCode.test.ts` — Unit tests

**Stores:**

- `src/stores/callStore.ts` — Zustand store for incoming call state (ringing, callerInfo)
- `src/stores/callStore.test.ts` — Unit tests

**Services:**

- `src/services/callSignaling.ts` — `initiateCall()` function (writes to incomingCall/current)
- `src/services/callSignaling.test.ts` — Unit tests

**Components:**

- `src/components/elderly/IncomingCallScreen.tsx`
- `src/components/elderly/IncomingCallScreen.test.tsx`
- `src/components/shared/PairingCodeDisplay.tsx`
- `src/components/shared/PairingCodeDisplay.test.tsx`
- `src/components/caregiver/PairElderlyUser.tsx`
- `src/components/caregiver/PairElderlyUser.test.tsx`
- `src/components/caregiver/ElderlyUserSettings.tsx`
- `src/components/caregiver/ElderlyUserSettings.test.tsx`
- `src/components/shared/OnboardingFlow.tsx`
- `src/components/shared/OnboardingFlow.test.tsx`

**PWA Service Worker:**

- `src/firebase-messaging-sw.ts` — Background FCM message handler

**E2E:**

- `e2e/incoming-call.spec.ts` — Playwright E2E for incoming call flow

### Relevant Documentation — READ BEFORE IMPLEMENTING

- Firebase Cloud Messaging Web setup: https://firebase.google.com/docs/cloud-messaging/js/client
  - Section "Configure the web credentials with FCM": VAPID key setup
  - Section "Access the registration token": `getToken()` with vapidKey
  - Section "Receive messages in a web app": `onMessage()` for foreground, service worker for background
  - Why: FCM token registration and foreground message handling patterns

- vite-plugin-pwa InjectManifest strategy: https://vite-pwa-org.netlify.app/guide/inject-manifest
  - Why: Must switch from `workbox` to `injectManifest` to use a custom service worker that handles FCM
  - The custom SW file is specified via `srcDir` + `filename` in the VitePWA config

- Firebase onSnapshot: https://firebase.google.com/docs/firestore/query-data/listen
  - Section "Detach a listener": cleanup pattern to prevent memory leaks in hooks
  - Why: `useIncomingCall` needs to subscribe and unsubscribe correctly

- Zustand v5 docs: https://zustand.docs.pmnd.rs/getting-started/introduction
  - Zustand v5 uses `create` from `zustand`. Selectors use `useStore((state) => state.field)`.
  - `useStore.setState()` for external (non-hook) updates (used in foreground FCM handler)
  - Why: Zustand v5 has API changes from v4; ensure correct usage.

- Firebase callable functions client SDK: https://firebase.google.com/docs/functions/callable?gen=2nd#call_the_function
  - `httpsCallable(functions, 'functionName')` — import `getFunctions`, `httpsCallable` from `firebase/functions`
  - Why: PairElderlyUser calls `validatePairingCode` Cloud Function

---

## PATTERNS TO FOLLOW

### Component Pattern (mirror from EasyCallButton.tsx)

```tsx
// Named export, functional component, typed props interface
interface MyComponentProps {
  someRequired: string;
  someOptional?: () => void;
}

export function MyComponent({ someRequired, someOptional }: MyComponentProps) {
  return <div className="...">...</div>;
}
```

### Touch Targets

```tsx
// Minimum: touch-target-min (56px)
// Primary actions: touch-target-primary (80px)
// Call/answer buttons: touch-target-call (100px)
<button className="btn btn-success touch-target-call font-bold text-[length:var(--text-button)]">
  Answer
</button>
```

### Design Token Usage in Tailwind

```tsx
// Font sizes via CSS vars
className = 'text-[length:var(--text-heading)] font-bold';
className = 'text-[length:var(--text-body)]';
className = 'text-[length:var(--text-display)]'; // pairing code

// Colors via CSS vars
className = 'text-[color:var(--color-call-green)]';
className = 'text-[color:var(--color-call-red)]';

// Spacing
className = 'p-[var(--space-md)] gap-[var(--space-lg)]';
```

### Zustand v5 Store Pattern

```ts
import { create } from 'zustand';

interface CallState {
  isRinging: boolean;
  callerName: string | null;
  callerPhotoURL: string | null;
  roomId: string | null;
  setIncomingCall: (data: { callerName: string; callerPhotoURL: string; roomId: string }) => void;
  clearIncomingCall: () => void;
}

export const useCallStore = create<CallState>((set) => ({
  isRinging: false,
  callerName: null,
  callerPhotoURL: null,
  roomId: null,
  setIncomingCall: (data) => set({ isRinging: true, ...data }),
  clearIncomingCall: () =>
    set({ isRinging: false, callerName: null, callerPhotoURL: null, roomId: null }),
}));
```

### Firebase Modular SDK Imports

```ts
// Firestore
import {
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  onSnapshot,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/services/firebase';

// Messaging
import { getToken, onMessage } from 'firebase/messaging';
import { getFirebaseMessaging } from '@/services/firebase'; // lazy, may return null

// Functions (callable)
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '@/services/firebase';
const functions = getFunctions(app);
const validatePairingCode = httpsCallable(functions, 'validatePairingCode');
```

### Hook Cleanup Pattern (onSnapshot)

```ts
useEffect(() => {
  const unsubscribe = onSnapshot(ref, (snap) => {
    /* ... */
  });
  return unsubscribe; // cleanup on unmount
}, [userId]);
```

### Test: Firebase Service Mocking

```ts
// For hooks/services that import firebase modules directly:
// Use vi.resetModules() + vi.doMock() per test (top-level module init is cached)
// See src/services/firebase.test.ts for the established pattern

// For components using Firestore via hooks:
// Mock the hook itself with vi.mock()
vi.mock('@/hooks/useIncomingCall', () => ({
  useIncomingCall: vi.fn().mockReturnValue({ isRinging: false }),
}));
```

### Test: MSW Handler Addition Pattern

```ts
// In test files, add handlers for new Firestore paths:
import { server } from '@/test/mocks/server';
import { http, HttpResponse } from 'msw';

server.use(
  http.post(
    'https://firestore.googleapis.com/v1/projects/*/databases/*/documents/pairingCodes/*',
    () =>
      HttpResponse.json({
        name: 'projects/test/databases/(default)/documents/pairingCodes/123456',
        fields: {},
        createTime: new Date().toISOString(),
        updateTime: new Date().toISOString(),
      }),
  ),
);
```

### Test: axe Accessibility Check

```tsx
import { axe } from 'vitest-axe';

it('passes vitest-axe accessibility audit', async () => {
  const { container } = renderWithProviders(<MyComponent />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

### FCM Token Registration Pattern

```ts
// GOTCHA: getFirebaseMessaging() returns null in jsdom (isSupported() → false)
// Always null-check before using
export async function usePushNotifications(userId: string) {
  const requestPermission = async () => {
    const messaging = await getFirebaseMessaging();
    if (!messaging) return null; // not supported (iOS Safari, jsdom)

    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    });

    await updateDoc(doc(db, 'users', userId), {
      pushTokens: arrayUnion(token),
    });

    return token;
  };
  // ...
}
```

### Pairing Code Generation

```ts
// 6-digit numeric code as zero-padded string
const code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
// Write to Firestore pairingCodes/{code}
await setDoc(doc(db, 'pairingCodes', code), {
  elderlyUserId: userId,
  expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min
  used: false,
});
```

### Stale Call Detection

```ts
// In useIncomingCall — ignore calls older than 60 seconds
const timestamp = snap.data()?.timestamp?.toDate?.() ?? new Date(0);
const isStale = Date.now() - timestamp.getTime() > 60_000;
if (isStale) return;
```

---

## IMPLEMENTATION PLAN

### Phase A: Foundation (must be first)

VitePWA strategy switch from `workbox` to `injectManifest` + FCM service worker file.
Without this, FCM background notifications won't work on any test/prod environment.

### Phase B: FCM Token Registration (2.1.1)

`usePushNotifications` hook + Zustand `callStore`. These are consumed by Onboarding and `useIncomingCall`.

### Phase C: Incoming Call (2.1.2 + 2.1.3)

`useIncomingCall` hook + `initiateCall` service + `IncomingCallScreen` component.
`callStore` from Phase B required.

### Phase D: Pairing (2.2.1 + 2.2.2)

`usePairingCode` hook + `PairingCodeDisplay` component + `PairElderlyUser` component.
These are independent of Phase C.

### Phase E: Caregiver Settings (2.3.1)

`ElderlyUserSettings` component. Depends on Phase 1 caregiver dashboard being done.

### Phase F: Onboarding (2.4.1)

`OnboardingFlow` component. Depends on Phase B, Phase D, Phase 1 permission check.

### Phase G: E2E Test (2.5.1)

Playwright test for incoming call flow. Depends on everything above.

---

## STEP-BY-STEP TASKS

### TASK A1: UPDATE vite.config.ts — Switch VitePWA to InjectManifest

- **WHY**: FCM requires a custom service worker file (`firebase-messaging-sw.ts`). The current `workbox` strategy auto-generates the SW without the FCM background handler. `injectManifest` lets us write our own SW while still injecting the Workbox precache manifest.
- **IMPLEMENT**: Change `VitePWA` config in `vite.config.ts`:
  ```ts
  VitePWA({
    strategies: 'injectManifest',
    srcDir: 'src',
    filename: 'firebase-messaging-sw.ts',
    manifest: pwaManifest,
    devOptions: { enabled: true, type: 'module' },
  });
  ```
- **GOTCHA**: `injectManifest` strategy requires `self.__WB_MANIFEST` in the custom SW for precaching to work. The custom SW file must include `import { precacheAndRoute } from 'workbox-precaching'; precacheAndRoute(self.__WB_MANIFEST);`
- **GOTCHA**: The SW file (`firebase-messaging-sw.ts`) must be processed by Vite — use `srcDir: 'src'` and `filename: 'firebase-messaging-sw.ts'`. Vite will output `firebase-messaging-sw.js` in `dist/`.
- **VALIDATE**: `pnpm run build && ls dist/ | grep sw`

### TASK A2: CREATE src/firebase-messaging-sw.ts — FCM Background Message Handler

- **IMPLEMENT**: Background message handler per PRD Section 10:

  ```ts
  import { initializeApp } from 'firebase/app';
  import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';
  import { precacheAndRoute } from 'workbox-precaching';

  declare const self: ServiceWorkerGlobalScope & {
    __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
  };

  precacheAndRoute(self.__WB_MANIFEST);

  const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    // ... all VITE_FIREBASE_* vars
  };

  const app = initializeApp(firebaseConfig);
  const messaging = getMessaging(app);

  onBackgroundMessage(messaging, (payload) => {
    const { callerName, callerPhoto, roomId } = payload.data ?? {};
    self.registration.showNotification(`${callerName ?? 'Someone'} is calling!`, {
      body: 'Tap to answer',
      icon: callerPhoto || '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: 'incoming-call',
      requireInteraction: true,
      vibrate: [200, 100, 200, 100, 200],
      data: { roomId },
    });
  });

  self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const { roomId } = event.notification.data as { roomId: string };
    event.waitUntil(clients.openWindow(`/call/${roomId}`));
  });
  ```

- **IMPORTS**: `firebase/messaging/sw` (NOT `firebase/messaging`) — different entry point for service worker context
- **GOTCHA**: Service workers cannot access `localStorage` or the DOM. Firebase config must come from `import.meta.env` (injected by Vite at build time), not from `window`.
- **GOTCHA**: `workbox-precaching` must be installed: `pnpm add -D workbox-precaching workbox-routing` (check if already present in deps)
- **VALIDATE**: `pnpm run build` (no TypeScript errors)

### TASK B1: CREATE src/stores/callStore.ts — Incoming Call Zustand Store

- **IMPLEMENT**: Zustand v5 store managing incoming call state. Pattern: mirror from Zustand docs and the `ContactStore` shape described in PRD task 1.1.1.

  ```ts
  import { create } from 'zustand';

  interface IncomingCallData {
    callerName: string;
    callerPhotoURL: string;
    roomId: string;
    elderlyUserId: string;
  }

  interface CallState {
    isRinging: boolean;
    incomingCall: IncomingCallData | null;
    setIncomingCall: (data: IncomingCallData) => void;
    clearIncomingCall: () => void;
  }

  export const useCallStore = create<CallState>((set) => ({
    isRinging: false,
    incomingCall: null,
    setIncomingCall: (data) => set({ isRinging: true, incomingCall: data }),
    clearIncomingCall: () => set({ isRinging: false, incomingCall: null }),
  }));
  ```

- **VALIDATE**: `pnpm test src/stores/callStore.test.ts`

### TASK B2: CREATE src/stores/callStore.test.ts — TDD First

- **IMPLEMENT** (write BEFORE callStore.ts):

  ```ts
  import { describe, it, expect, beforeEach } from 'vitest';
  import { useCallStore } from './callStore';

  const mockCall = {
    callerName: 'Alex',
    callerPhotoURL: 'https://example.com/alex.jpg',
    roomId: 'easycall-rose-alex-k8m2p1',
    elderlyUserId: 'user-1',
  };

  describe('callStore', () => {
    beforeEach(() => {
      useCallStore.setState({ isRinging: false, incomingCall: null });
    });

    it('initial state: not ringing, no call data', () => {
      const state = useCallStore.getState();
      expect(state.isRinging).toBe(false);
      expect(state.incomingCall).toBeNull();
    });

    it('setIncomingCall: sets ringing=true and stores call data', () => {
      useCallStore.getState().setIncomingCall(mockCall);
      const state = useCallStore.getState();
      expect(state.isRinging).toBe(true);
      expect(state.incomingCall).toEqual(mockCall);
    });

    it('clearIncomingCall: resets to initial state', () => {
      useCallStore.getState().setIncomingCall(mockCall);
      useCallStore.getState().clearIncomingCall();
      const state = useCallStore.getState();
      expect(state.isRinging).toBe(false);
      expect(state.incomingCall).toBeNull();
    });
  });
  ```

- **VALIDATE**: Test fails first (Red), then passes after implementing callStore.ts (Green)

### TASK C1: CREATE src/hooks/usePushNotifications.ts — FCM Token Hook

- **IMPLEMENT**:

  ```ts
  import { getToken, onMessage } from 'firebase/messaging';
  import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
  import { db, getFirebaseMessaging } from '@/services/firebase';
  import { useCallStore } from '@/stores/callStore';

  export function usePushNotifications(userId: string) {
    const requestPermission = async (): Promise<string | null> => {
      const messaging = await getFirebaseMessaging();
      if (!messaging) return null;

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return null;

      const token = await getToken(messaging, {
        vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
      });

      await updateDoc(doc(db, 'users', userId), {
        pushTokens: arrayUnion(token),
      });

      return token;
    };

    const removeToken = async (token: string): Promise<void> => {
      await updateDoc(doc(db, 'users', userId), {
        pushTokens: arrayRemove(token),
      });
    };

    // Handle foreground messages (app is open/focused)
    const subscribeForeground = async () => {
      const messaging = await getFirebaseMessaging();
      if (!messaging) return () => {};

      return onMessage(messaging, (payload) => {
        if (payload.data?.type === 'incoming_call') {
          useCallStore.getState().setIncomingCall({
            callerName: payload.data.callerName ?? '',
            callerPhotoURL: payload.data.callerPhoto ?? '',
            roomId: payload.data.roomId ?? '',
            elderlyUserId: payload.data.elderlyUserId ?? '',
          });
        }
      });
    };

    return { requestPermission, removeToken, subscribeForeground };
  }
  ```

- **GOTCHA**: `getFirebaseMessaging()` returns `null` in jsdom (isSupported() returns false). All tests must mock `getFirebaseMessaging` to return a mock messaging object or null.
- **GOTCHA**: `onMessage` returns an unsubscribe function — call it in useEffect cleanup.
- **IMPORTS**: `import.meta.env.VITE_FIREBASE_VAPID_KEY` — add to `.env.example` if not present.
- **VALIDATE**: `pnpm test src/hooks/usePushNotifications.test.ts`

### TASK C2: CREATE src/hooks/usePushNotifications.test.ts — TDD First

- **IMPLEMENT** (write BEFORE the hook):

  ```ts
  import { describe, it, expect, vi, beforeEach } from 'vitest';

  // Mock firebase/messaging and firebase.ts service
  vi.mock('firebase/messaging', () => ({
    getToken: vi.fn(),
    onMessage: vi.fn(() => vi.fn()), // returns unsubscribe fn
  }));
  vi.mock('firebase/firestore', () => ({
    doc: vi.fn(),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    arrayUnion: vi.fn((v) => ({ _type: 'arrayUnion', value: v })),
    arrayRemove: vi.fn((v) => ({ _type: 'arrayRemove', value: v })),
  }));
  vi.mock('@/services/firebase', () => ({
    db: {},
    getFirebaseMessaging: vi.fn(),
  }));

  // Tests: requestPermission returns null when messaging not supported,
  // returns token when permission granted, calls updateDoc with arrayUnion,
  // removeToken calls updateDoc with arrayRemove,
  // subscribeForeground: onMessage callback sets callStore when type=incoming_call
  ```

- **NOTE**: Use `vi.resetModules()` + `vi.doMock()` pattern (per established pattern in `src/services/firebase.test.ts`) if top-level mocks don't isolate correctly.
- **VALIDATE**: `pnpm test src/hooks/usePushNotifications.test.ts`

### TASK D1: CREATE src/services/callSignaling.ts — initiateCall Function

- **IMPLEMENT**: Client-side function to write the `incomingCall/current` doc:

  ```ts
  import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
  import { db } from '@/services/firebase';

  interface InitiateCallParams {
    elderlyUserId: string;
    callerId: string;
    callerName: string;
    callerPhotoURL?: string;
    jitsiRoomId: string;
  }

  export async function initiateCall(params: InitiateCallParams): Promise<void> {
    const { elderlyUserId, callerId, callerName, callerPhotoURL, jitsiRoomId } = params;
    const ref = doc(db, 'users', elderlyUserId, 'incomingCall', 'current');
    await setDoc(ref, {
      callerId,
      callerName,
      callerPhotoURL: callerPhotoURL ?? null,
      jitsiRoomId,
      status: 'ringing',
      timestamp: serverTimestamp(),
    });
  }

  export async function declineCall(elderlyUserId: string): Promise<void> {
    const ref = doc(db, 'users', elderlyUserId, 'incomingCall', 'current');
    await import('firebase/firestore').then(({ updateDoc }) =>
      updateDoc(ref, { status: 'declined' }),
    );
  }
  ```

- **PATTERN**: Matches the Firestore rules in `firestore.rules` — required fields: callerId, callerName, jitsiRoomId, status, timestamp. status must be 'ringing' on create.
- **VALIDATE**: `pnpm test src/services/callSignaling.test.ts`

### TASK D2: CREATE src/services/callSignaling.test.ts — TDD First

- **IMPLEMENT**:
  ```ts
  // Mock firebase/firestore and @/services/firebase
  // Test: initiateCall calls setDoc with correct fields
  // Test: initiateCall sets status='ringing'
  // Test: declineCall calls updateDoc with status='declined'
  // Test: setDoc is called with path users/{elderlyUserId}/incomingCall/current
  ```
- **VALIDATE**: `pnpm test src/services/callSignaling.test.ts`

### TASK E1: CREATE src/hooks/useIncomingCall.ts — Real-time Call Listener

- **IMPLEMENT**: Subscribes to `users/{userId}/incomingCall/current` via onSnapshot:

  ```ts
  import { useEffect } from 'react';
  import { doc, onSnapshot } from 'firebase/firestore';
  import { db } from '@/services/firebase';
  import { useCallStore } from '@/stores/callStore';

  export function useIncomingCall(userId: string | null): void {
    useEffect(() => {
      if (!userId) return;

      const ref = doc(db, 'users', userId, 'incomingCall', 'current');

      const unsubscribe = onSnapshot(ref, (snap) => {
        if (!snap.exists()) {
          useCallStore.getState().clearIncomingCall();
          return;
        }

        const data = snap.data();
        const status = data['status'] as string;

        if (status !== 'ringing') {
          useCallStore.getState().clearIncomingCall();
          return;
        }

        // Ignore stale calls (>60 seconds old)
        const timestamp = data['timestamp']?.toDate?.() ?? new Date(0);
        if (Date.now() - timestamp.getTime() > 60_000) {
          useCallStore.getState().clearIncomingCall();
          return;
        }

        useCallStore.getState().setIncomingCall({
          callerName: String(data['callerName'] ?? ''),
          callerPhotoURL: String(data['callerPhotoURL'] ?? ''),
          roomId: String(data['jitsiRoomId'] ?? ''),
          elderlyUserId: userId,
        });
      });

      return unsubscribe;
    }, [userId]);
  }
  ```

- **GOTCHA**: `onSnapshot` callback fires immediately with current state. If `userId` is null (loading), skip subscription.
- **GOTCHA**: Timer-based staleness check uses `Date.now()` — mock `vi.useFakeTimers()` in tests to control staleness.
- **VALIDATE**: `pnpm test src/hooks/useIncomingCall.test.ts`

### TASK E2: CREATE src/hooks/useIncomingCall.test.ts — TDD First

- **IMPLEMENT**:

  ```ts
  // Mock firebase/firestore: control onSnapshot callback manually
  // Mock callStore.setIncomingCall and clearIncomingCall via vi.spyOn

  // Tests:
  // - does not subscribe when userId is null
  // - calls setIncomingCall when snapshot has status='ringing' (recent)
  // - calls clearIncomingCall when snapshot has status='ended'
  // - calls clearIncomingCall when snapshot doesn't exist
  // - ignores stale calls (timestamp >60s ago) — use vi.useFakeTimers()
  // - unsubscribes (calls returned fn) on unmount
  ```

- **PATTERN**: Use `renderHook` from `@testing-library/react` to test hooks.
- **VALIDATE**: `pnpm test src/hooks/useIncomingCall.test.ts`

### TASK F1: CREATE src/components/elderly/IncomingCallScreen.tsx — Answer UI

- **IMPLEMENT**: Full-screen overlay when `useCallStore` has `isRinging: true`:

  ```tsx
  // Renders: full-screen fixed overlay (z-50 or similar)
  // - Caller photo: <img> with min 120×120px, rounded-full, alt="callerName"
  // - Caller name: ≥24px bold (text-[length:var(--text-heading)] font-bold)
  // - Pulsing animation: DaisyUI animate-pulse or Tailwind animate-ping on a ring
  // - ANSWER button: btn-success touch-target-call (100px min), full-width or wide
  // - DECLINE button: btn-error touch-target-primary (80px), smaller
  // - Plays ringtone: <audio src="/ringtone.mp3" loop autoPlay>
  // - 60s timeout: useEffect + setTimeout → clears ringing + logs missed call
  ```

  **Key logic:**
  - `onAnswer`: navigate to `/call/${roomId}` + clear store
  - `onDecline`: write `status: 'declined'` to Firestore (via `declineCall`) + clear store + log to callHistory
  - On unmount: stop audio, clear timeout
  - 60s auto-dismiss: `useEffect(() => { const t = setTimeout(handleMissed, 60_000); return () => clearTimeout(t); }, [])`
  - Log to callHistory on every outcome (answered, declined, missed): `setDoc(doc(db, 'users', elderlyUserId, 'callHistory', crypto.randomUUID()), { ... })`

- **IMPORTS**: `useCallStore` from `@/stores/callStore`, `useNavigate` from `react-router`, `declineCall` from `@/services/callSignaling`
- **GOTCHA**: This component must be rendered at the router level (likely in App.tsx or a Layout component) so it appears over all routes. Use `position: fixed` + high z-index.
- **GOTCHA**: `<audio>` autoPlay may be blocked by browsers in tests — mock `HTMLAudioElement.prototype.play` in tests with `vi.spyOn`.
- **VALIDATE**: `pnpm test src/components/elderly/IncomingCallScreen.test.tsx`

### TASK F2: CREATE src/components/elderly/IncomingCallScreen.test.tsx — TDD First

- **IMPLEMENT**:

  ```ts
  // Mock useCallStore to control isRinging/incomingCall
  // Mock useNavigate from react-router
  // Mock declineCall from @/services/callSignaling
  // Mock HTMLAudioElement.prototype.play = vi.fn()
  // Mock vi.useFakeTimers() for 60s timeout test

  // Tests:
  // - renders nothing when isRinging=false
  // - renders caller photo (≥120px) and name (≥24px class) when isRinging=true
  // - Answer button click: navigates to /call/:roomId, clears store
  // - Decline button click: calls declineCall, clears store
  // - 60s timeout: vi.runAllTimers() → store cleared (missed call)
  // - passes vitest-axe accessibility audit
  ```

- **VALIDATE**: `pnpm test src/components/elderly/IncomingCallScreen.test.tsx`

### TASK G1: CREATE src/hooks/usePairingCode.ts — Code Generation Hook

- **IMPLEMENT**:

  ```ts
  import { useState, useEffect, useRef, useCallback } from 'react';
  import { doc, setDoc } from 'firebase/firestore';
  import { db } from '@/services/firebase';

  function generateCode(): string {
    return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
  }

  export function usePairingCode(userId: string | null) {
    const [code, setCode] = useState<string | null>(null);
    const [secondsRemaining, setSecondsRemaining] = useState(600); // 10 minutes
    const refreshRef = useRef<ReturnType<typeof setTimeout>>();
    const countdownRef = useRef<ReturnType<typeof setInterval>>();

    const generateAndSave = useCallback(async () => {
      if (!userId) return;
      const newCode = generateCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await setDoc(doc(db, 'pairingCodes', newCode), {
        elderlyUserId: userId,
        expiresAt,
        used: false,
      });
      setCode(newCode);
      setSecondsRemaining(600);
    }, [userId]);

    useEffect(() => {
      void generateAndSave();
      refreshRef.current = setTimeout(() => void generateAndSave(), 10 * 60 * 1000);
      countdownRef.current = setInterval(() => {
        setSecondsRemaining((s) => (s <= 1 ? 0 : s - 1));
      }, 1000);
      return () => {
        clearTimeout(refreshRef.current);
        clearInterval(countdownRef.current);
      };
    }, [generateAndSave]);

    const formattedCountdown = `${String(Math.floor(secondsRemaining / 60)).padStart(2, '0')}:${String(secondsRemaining % 60).padStart(2, '0')}`;

    return { code, secondsRemaining, formattedCountdown, refresh: generateAndSave };
  }
  ```

- **GOTCHA**: Firestore `setDoc` — path `pairingCodes/{code}` requires Firestore rules: code must be 6 digits, `elderlyUserId == request.auth.uid`, `used == false`, `expiresAt` within 10 min. This is already enforced in `firestore.rules`.
- **GOTCHA**: `generateCode()` is pure — extract as named export for testability.
- **VALIDATE**: `pnpm test src/hooks/usePairingCode.test.ts`

### TASK G2: CREATE src/hooks/usePairingCode.test.ts — TDD First

- **IMPLEMENT**:

  ```ts
  // Mock firebase/firestore (setDoc, doc)
  // Mock @/services/firebase (db)
  // Use vi.useFakeTimers() for countdown and auto-refresh tests

  // Tests:
  // - generateCode returns 6-digit string (all chars are digits, length=6)
  // - hook calls setDoc on mount with correct fields (elderlyUserId, used=false)
  // - code is updated in state after successful setDoc
  // - formattedCountdown is 'MM:SS' format
  // - secondsRemaining decrements by 1 each second (vi.advanceTimersByTime(1000))
  // - auto-refresh fires at 600 seconds (vi.advanceTimersByTime(600_000))
  // - cleanup: clearTimeout/clearInterval called on unmount
  // - does nothing when userId is null
  ```

- **VALIDATE**: `pnpm test src/hooks/usePairingCode.test.ts`

### TASK H1: CREATE src/components/shared/PairingCodeDisplay.tsx

- **IMPLEMENT**:

  ```tsx
  interface PairingCodeDisplayProps {
    userId: string;
  }

  export function PairingCodeDisplay({ userId }: PairingCodeDisplayProps) {
    const { code, formattedCountdown, refresh } = usePairingCode(userId);

    return (
      <div className="flex flex-col items-center gap-[var(--space-md)]">
        <p className="text-[length:var(--text-body)]">Your pairing code:</p>
        {code ? (
          <p
            className="text-[length:var(--text-display)] font-bold tracking-[0.25em]"
            aria-label={`Pairing code: ${code.split('').join(' ')}`}
            aria-live="polite"
          >
            {code}
          </p>
        ) : (
          <span className="loading loading-spinner loading-lg" aria-label="Generating code" />
        )}
        <p className="text-[length:var(--text-body)] text-[color:var(--color-text-secondary)]">
          Expires in {formattedCountdown}
        </p>
        <EasyCallButton variant="secondary" onClick={() => void refresh()}>
          Get new code
        </EasyCallButton>
      </div>
    );
  }
  ```

- **GOTCHA**: The 6-digit code should be announced by screen readers as individual digits (space-separated aria-label), not as a number word. Use `aria-label` with spaced digits + `aria-live="polite"` for live updates.
- **VALIDATE**: `pnpm test src/components/shared/PairingCodeDisplay.test.tsx`

### TASK H2: CREATE src/components/shared/PairingCodeDisplay.test.tsx — TDD First

- **IMPLEMENT**:
  ```ts
  // Mock usePairingCode hook
  // Tests:
  // - shows loading spinner when code is null
  // - renders code in large text when code is provided
  // - renders formatted countdown
  // - 'Get new code' button calls refresh
  // - passes vitest-axe
  ```
- **VALIDATE**: `pnpm test src/components/shared/PairingCodeDisplay.test.tsx`

### TASK I1: CREATE src/components/caregiver/PairElderlyUser.tsx — Pairing Entry

- **IMPLEMENT**: 6-digit code entry form calling the `validatePairingCode` Cloud Function:

  ```tsx
  import { getFunctions, httpsCallable } from 'firebase/functions';
  import { app } from '@/services/firebase';

  export function PairElderlyUser({ onSuccess }: { onSuccess: (elderlyUserId: string) => void }) {
    const [code, setCode] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setStatus('loading');
      try {
        const functions = getFunctions(app);
        const validatePairingCode = httpsCallable<{ code: string }, { elderlyUserId: string }>(
          functions,
          'validatePairingCode',
        );
        const result = await validatePairingCode({ code });
        onSuccess(result.data.elderlyUserId);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Something went wrong';
        setErrorMessage(message);
        setStatus('error');
      }
    };

    return (
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-[var(--space-md)]">
        <label htmlFor="pairing-code" className="text-[length:var(--text-body)] font-bold">
          Enter the 6-digit code shown on grandma's screen:
        </label>
        <input
          id="pairing-code"
          type="text"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="input input-bordered text-center text-[length:var(--text-display)] tracking-widest touch-target-primary"
          aria-describedby={status === 'error' ? 'pairing-error' : undefined}
        />
        {status === 'error' && (
          <p id="pairing-error" role="alert" className="text-error text-[length:var(--text-body)]">
            {errorMessage}
          </p>
        )}
        <EasyCallButton type="submit" disabled={code.length !== 6 || status === 'loading'}>
          {status === 'loading' ? 'Linking...' : 'Link Account'}
        </EasyCallButton>
      </form>
    );
  }
  ```

- **GOTCHA**: Cloud Function errors come back as `FirebaseError` with `.code` and `.message`. The error messages from `validatePairingCode` in `functions/src/index.ts` are: "Pairing code has already been used.", "Pairing code has expired.", "Invalid pairing code." — display these directly to users.
- **GOTCHA**: `EasyCallButton` doesn't accept `type="submit"` prop by default — you may need to add it to `EasyCallButtonProps`, or use a raw `<button>` for the submit action.
- **VALIDATE**: `pnpm test src/components/caregiver/PairElderlyUser.test.tsx`

### TASK I2: CREATE src/components/caregiver/PairElderlyUser.test.tsx — TDD First

- **IMPLEMENT**:

  ```ts
  // Mock firebase/functions (getFunctions, httpsCallable)
  // Mock app from @/services/firebase

  // Tests:
  // - renders input with inputMode="numeric"
  // - submit button disabled when code.length < 6
  // - submit button enabled when code.length === 6
  // - entering non-numeric chars: they are filtered out
  // - submit calls httpsCallable with { code }
  // - success: calls onSuccess(elderlyUserId)
  // - error: renders error message with role="alert"
  // - passes vitest-axe
  ```

- **VALIDATE**: `pnpm test src/components/caregiver/PairElderlyUser.test.tsx`

### TASK J1: CREATE src/components/caregiver/ElderlyUserSettings.tsx — Settings Panel

- **IMPLEMENT**: Reads and updates elderly user's Firestore settings:

  ```tsx
  // Fetches users/{elderlyUserId} from Firestore (via onSnapshot or one-time get)
  // Shows: font size selector (large/x-large), ringtone volume slider (0-100)
  // Uses optimistic UI: update local state immediately, then write to Firestore
  // Writes to: updateDoc(doc(db, 'users', elderlyUserId), { settings: { fontSize, ringtoneVolume } })

  // Font size selector: 3 labeled buttons using EasyCallButton size="default"
  // Ringtone volume: <input type="range" min="0" max="100" step="5">
  ```

- **IMPORTS**: `UserSettings` from `@/types/user`, `doc`, `updateDoc`, `onSnapshot` from `firebase/firestore`
- **VALIDATE**: `pnpm test src/components/caregiver/ElderlyUserSettings.test.tsx`

### TASK J2: CREATE src/components/caregiver/ElderlyUserSettings.test.tsx — TDD First

- **IMPLEMENT**:
  ```ts
  // Mock onSnapshot to emit user document with current settings
  // Mock updateDoc
  // Tests:
  // - renders current fontSize value from Firestore
  // - clicking a fontSize button calls updateDoc with new value
  // - optimistic update: UI updates before Firestore confirms
  // - ringtone volume slider updates on change
  // - passes vitest-axe
  ```
- **VALIDATE**: `pnpm test src/components/caregiver/ElderlyUserSettings.test.tsx`

### TASK K1: CREATE src/components/shared/OnboardingFlow.tsx — Multi-Step Onboarding

- **IMPLEMENT**: 5-step onboarding per PRD task 2.4.1:

  ```tsx
  // Steps:
  // 1. Welcome (app description, EasyCall logo/name, role-specific text)
  // 2. PWA Install prompt (if available, show InstallPrompt component; else skip)
  // 3. Camera/mic permission (renders PermissionCheck component, waits for granted)
  // 4. Notification permission (Notification.requestPermission() with pre-prompt explanation)
  // 5. Pairing:
  //    - elderly role: show PairingCodeDisplay
  //    - caregiver role: show PairElderlyUser

  // Each step: ≥20px text, ≥72px primary button, 'Skip' option
  // On final step completion: write onboardingComplete=true to Firestore
  // On subsequent loads: if onboardingComplete=true in user doc, skip entire flow

  interface OnboardingFlowProps {
    user: EasyCallUser;
    onComplete: () => void;
  }
  ```

- **IMPORTS**: `EasyCallUser` from `@/types/user`, `PairingCodeDisplay` from `@/components/shared/PairingCodeDisplay`, `PairElderlyUser` from `@/components/caregiver/PairElderlyUser`, `PermissionCheck` from `@/components/elderly/PermissionCheck`
- **GOTCHA**: `Notification.requestPermission()` is not available in jsdom by default — mock it with `vi.stubGlobal('Notification', { requestPermission: vi.fn().mockResolvedValue('granted'), permission: 'default' })`
- **VALIDATE**: `pnpm test src/components/shared/OnboardingFlow.test.tsx`

### TASK K2: CREATE src/components/shared/OnboardingFlow.test.tsx — TDD First

- **IMPLEMENT**:

  ```ts
  // Mock child components (PairingCodeDisplay, PairElderlyUser, PermissionCheck)
  // Mock Notification.requestPermission
  // Mock updateDoc for onboardingComplete write

  // Tests:
  // - renders step 1 (welcome) initially
  // - 'Next' advances to next step
  // - 'Skip' also advances to next step
  // - step 5 (pairing) shows PairingCodeDisplay for elderly role
  // - step 5 shows PairElderlyUser for caregiver role
  // - completing final step writes onboardingComplete=true to Firestore
  // - completing final step calls onComplete callback
  // - buttons are ≥72px (have touch-target-primary or touch-target-call class)
  // - all text is ≥20px (text-[length:var(--text-button)] class)
  // - passes vitest-axe on each step
  ```

- **VALIDATE**: `pnpm test src/components/shared/OnboardingFlow.test.tsx`

### TASK L1: CREATE e2e/incoming-call.spec.ts — E2E Test (2.5.1)

- **IMPLEMENT**: Playwright test using two browser contexts:

  ```ts
  import { test, expect } from '@playwright/test';

  // NOTE: Requires Firebase emulator running locally
  // Setup: start emulators with `firebase emulators:start`

  test.describe('Incoming Call Flow', () => {
    test('elderly user sees ringing screen and can answer', async ({ browser }) => {
      // Context 1: elderly user (already logged in, on home screen)
      const elderlyCtx = await browser.newContext({
        /* permissions */
      });
      const elderlyPage = await elderlyCtx.newPage();
      await elderlyPage.goto('/elderly');

      // Context 2: caregiver/caller (initiates call)
      const callerCtx = await browser.newContext();
      const callerPage = await callerCtx.newPage();
      await callerPage.goto('/caregiver');

      // Caller initiates call → writes to Firestore incomingCall/current
      await callerPage.getByRole('button', { name: /call/i }).click();

      // Verify ringing screen on elderly side
      await expect(elderlyPage.getByRole('button', { name: /answer/i })).toBeVisible();

      // Answer the call
      await elderlyPage.getByRole('button', { name: /answer/i }).click();

      // Verify call screen loaded
      await expect(elderlyPage.getByRole('button', { name: /end call/i })).toBeVisible();

      // End call
      await elderlyPage.getByRole('button', { name: /end call/i }).click();

      // Verify return to home
      await expect(elderlyPage).toHaveURL('/elderly');
    });
  });
  ```

- **GOTCHA**: E2E test requires Firebase emulator — add `VITE_USE_FIREBASE_EMULATOR=true` env var and connect SDK to emulator in a dev/test initialization path.
- **VALIDATE**: `pnpm test:e2e e2e/incoming-call.spec.ts`

---

## TESTING STRATEGY

### Unit Tests (Vitest + RTL + vitest-axe)

Each file gets a co-located `.test.ts(x)` file. Written FIRST per TDD.

**Hooks testing:**

- Use `renderHook` from `@testing-library/react`
- Mock Firebase modules at the top of test files with `vi.mock()`
- Use `vi.useFakeTimers()` for timer-based logic (countdown, 60s timeout, 10-min refresh)
- Use `vi.spyOn(useCallStore, 'getState')` to verify store updates

**Component testing:**

- Use `renderWithProviders` (MemoryRouter) from `@/test/helpers`
- Mock hooks that use Firebase to keep tests isolated
- Mock `useNavigate` from `react-router` for navigation assertions
- All components: include `axe(container)` accessibility test

**Store testing:**

- Use `useCallStore.setState()` to reset state in `beforeEach`
- Use `useCallStore.getState()` to read state directly (no React rendering needed)

### Handling MSW strict mode

`src/test/setup.ts` uses `onUnhandledRequest: 'error'` — any test hitting an unmatched MSW route will **fail**. For tests mocking Firebase SDK modules directly (not via HTTP), this isn't an issue. For tests that do use the real Firebase SDK (integration-style), add handlers via `server.use(...)` in the test file.

### Edge Cases

- FCM token: null when `isSupported()` → false (jsdom/Safari) — all hooks must handle null messaging
- Incoming call: stale (>60s old) timestamp — must be ignored
- Pairing code: expired, already-used, or mistyped — each has distinct error from Cloud Function
- Notification permission: denied by user — graceful degradation (no crash, informative message)
- `useIncomingCall` with `userId=null` (auth loading) — must not subscribe

---

## VALIDATION COMMANDS

### Level 1: Type Check & Lint

```bash
pnpm run lint
pnpm exec tsc --noEmit
```

### Level 2: Unit Tests (individual)

```bash
pnpm test src/stores/callStore.test.ts
pnpm test src/hooks/usePushNotifications.test.ts
pnpm test src/hooks/useIncomingCall.test.ts
pnpm test src/hooks/usePairingCode.test.ts
pnpm test src/services/callSignaling.test.ts
pnpm test src/components/elderly/IncomingCallScreen.test.tsx
pnpm test src/components/shared/PairingCodeDisplay.test.tsx
pnpm test src/components/caregiver/PairElderlyUser.test.tsx
pnpm test src/components/caregiver/ElderlyUserSettings.test.tsx
pnpm test src/components/shared/OnboardingFlow.test.tsx
```

### Level 3: Full Test Suite with Coverage

```bash
pnpm test
pnpm run test:coverage
```

Coverage thresholds: 80% lines/functions/statements, 75% branches. Coverage report in `coverage/`.

### Level 4: E2E Tests

```bash
# Start Firebase emulator first:
# firebase emulators:start

pnpm test:e2e e2e/incoming-call.spec.ts
```

### Level 5: Build Check

```bash
pnpm run build
# Verify dist/ contains firebase-messaging-sw.js
ls dist/ | grep sw
```

---

## ACCEPTANCE CRITERIA

- [ ] **2.1.1**: `usePushNotifications` requests notification permission, registers FCM token, stores in `users/{userId}.pushTokens` via `arrayUnion`, handles foreground messages by updating `callStore`
- [ ] **2.1.1**: `firebase-messaging-sw.ts` handles background messages and shows browser notification with correct data
- [ ] **2.1.2**: `useIncomingCall` subscribes to Firestore `incomingCall/current` and updates `callStore` when status='ringing' (recent, <60s)
- [ ] **2.1.2**: `initiateCall()` writes correct fields to `incomingCall/current` matching Firestore security rules
- [ ] **2.1.3**: `IncomingCallScreen` renders caller photo (≥120px), name (≥24px bold), Answer (green, ≥100px), Decline (red, ≥80px)
- [ ] **2.1.3**: Answer navigates to `/call/:roomId`, Decline writes 'declined' to Firestore, 60s timeout auto-dismisses
- [ ] **2.2.1**: `usePairingCode` generates 6-digit code, writes to Firestore with 10-min TTL, countdown in MM:SS
- [ ] **2.2.2**: `PairElderlyUser` calls `validatePairingCode` Cloud Function, shows distinct error messages for expired/used/invalid codes
- [ ] **2.3.1**: `ElderlyUserSettings` loads current settings from Firestore and persists changes with optimistic updates
- [ ] **2.4.1**: `OnboardingFlow` shows 5 steps, each skippable, adapts to role (elderly/caregiver), writes `onboardingComplete=true` on completion
- [ ] All new components pass `vitest-axe` with zero violations
- [ ] All touch targets ≥56px (interactive elements use `touch-target-*` utilities)
- [ ] All text uses design token CSS vars via Tailwind arbitrary values
- [ ] `pnpm test` passes with zero failures
- [ ] Coverage thresholds maintained (80% lines, 75% branches)
- [ ] `pnpm run lint` passes with zero errors
- [ ] `pnpm exec tsc --noEmit` passes

---

## COMPLETION CHECKLIST

- [ ] VitePWA switched to `injectManifest` strategy (Task A1)
- [ ] `firebase-messaging-sw.ts` created with background handler (Task A2)
- [ ] `callStore.ts` implemented and tested (Tasks B1, B2)
- [ ] `usePushNotifications` implemented and tested (Tasks C1, C2)
- [ ] `callSignaling.ts` service implemented and tested (Tasks D1, D2)
- [ ] `useIncomingCall` hook implemented and tested (Tasks E1, E2)
- [ ] `IncomingCallScreen` component implemented and tested (Tasks F1, F2)
- [ ] `usePairingCode` hook implemented and tested (Tasks G1, G2)
- [ ] `PairingCodeDisplay` component implemented and tested (Tasks H1, H2)
- [ ] `PairElderlyUser` component implemented and tested (Tasks I1, I2)
- [ ] `ElderlyUserSettings` component implemented and tested (Tasks J1, J2)
- [ ] `OnboardingFlow` component implemented and tested (Tasks K1, K2)
- [ ] E2E incoming call test implemented (Task L1)
- [ ] `pnpm test` → all pass
- [ ] `pnpm run lint` → no errors
- [ ] `pnpm exec tsc --noEmit` → no errors

---

## NOTES

### Cloud Functions Already Done

Do **not** re-implement:

- `onIncomingCall` — already in `functions/src/index.ts:184`
- `validatePairingCode` — already in `functions/src/index.ts:18`
- `generateJitsiJwt` — already in `functions/src/index.ts:82`

### Critical: VitePWA Strategy Switch

The current `vite.config.ts` uses `workbox` strategy which auto-generates the service worker. Switching to `injectManifest` is required for FCM but is a **breaking change** to the PWA caching setup. After switching:

1. Ensure `workbox-precaching` is installed
2. Include `precacheAndRoute(self.__WB_MANIFEST)` in the custom SW
3. Update `src/test/pwa-manifest.test.ts` if it references the SW registration

### Phase 1 Dependency Risk

Phase 2 components depend on Phase 1 components (`PermissionCheck`, `CallScreen`, `CaregiverDashboard`) being implemented. If running Phase 2 in parallel with Phase 1, mock the Phase 1 components in Phase 2 component tests. The `OnboardingFlow` in particular needs `PermissionCheck` — use `vi.mock('@/components/elderly/PermissionCheck', ...)` in its tests.

### FCM in Development/Tests

FCM does not work in jsdom (no service worker support) or `localhost` without HTTPS. Tests mock `getFirebaseMessaging` to return null (the `isSupported()` false path). Manual FCM testing requires:

- HTTPS (use `ngrok` or a staging deployment)
- A real Firebase project with VAPID key in `.env.local`
- Android device or Chrome desktop (FCM Web Push)

### Ringtone Audio

Task 2.1.3 requires a ringtone audio file. Add a short ringtone MP3/OGG to `public/ringtone.mp3`. In tests, mock `HTMLAudioElement.prototype.play = vi.fn()` and `HTMLAudioElement.prototype.pause = vi.fn()`.

### PRD Task IDs for Commit Messages

Use conventional commits with task IDs:

```
feat(2.1.1): add usePushNotifications hook with FCM token registration
feat(2.1.2): add useIncomingCall hook and initiateCall service
feat(2.1.3): add IncomingCallScreen component
feat(2.2.1): add usePairingCode hook and PairingCodeDisplay
feat(2.2.2): add PairElderlyUser caregiver component
feat(2.3.1): add ElderlyUserSettings caregiver component
feat(2.4.1): add multi-step OnboardingFlow component
test(2.5.1): add E2E test for incoming call flow
```

### Confidence Score: 8/10

High confidence because:

- Cloud Functions are already implemented and tested
- Firebase SDK patterns are established in the codebase (`firebase.ts`, `firebase.test.ts`)
- Component and test patterns are clear from Phase 1 components
- Firestore security rules are already correct

Risks:

- VitePWA strategy switch may have unexpected build implications
- `workbox-precaching` dependency may need adding
- `vi.useFakeTimers()` interaction with `renderHook` can be tricky
