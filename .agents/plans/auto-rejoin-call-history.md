# Feature: Auto-Rejoin on Disconnect (3.1.1) + Call History Screen (3.2.1)

The following plan should be complete, but its important that you validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils types and models. Import from the right files etc.

## Feature Description

**Task 3.1.1 — Auto-Rejoin on Disconnect:** When the elderly user's browser disconnects during a call (page refresh, network drop, accidental close), the app detects an active call on page load and offers a one-tap "Return to call" prompt. After 30 seconds of inaction the call is marked ended. A `beforeunload` warning fires during active calls.

**Task 3.2.1 — Call History Screen:** A dedicated screen showing the elderly user's last 30 days of calls with contact photos, names, timestamps, durations, and outcome badges (completed/missed/declined). Missed calls are highlighted. Tapping an entry re-calls that contact. Paginated with "Show more" after 20 entries.

## User Stories

**3.1.1:**

```
As an elderly user
I want to automatically rejoin a call if my app disconnects
So that a dropped connection doesn't end my family conversation
```

**3.2.1:**

```
As an elderly user
I want to see my recent call history
So that I can see who called me and quickly call them back
```

## Problem Statement

- **3.1.1:** Currently, if the elderly user accidentally refreshes or loses connection during a call, there's no way to return. The call is effectively lost.
- **3.2.1:** There is no call history in the app. The `callHistory` subcollection exists in the Firestore data model and security rules but has no client-side implementation. Additionally, nothing currently writes to `callHistory` — task 2.1.3 specified this (AC-4.8) but it was not implemented. CallScreen must write history entries on call end.

## Solution Statement

- **3.1.1:** Write an `activeCall` document to Firestore when a call starts (in CallScreen). On HomeScreen mount, check for an active call within 5 minutes. Show a rejoin prompt with a large green button. Auto-dismiss after 30 seconds. Add `beforeunload` handler during active calls.
- **3.2.1:** Create a `CallHistory` component that queries `users/{userId}/callHistory` ordered by `startedAt` desc, limited to 30 days. Display entries with photo, name, time, duration, and outcome badge. Implement cursor-based pagination with "Show more" after 20 entries. Add a route and navigation link from HomeScreen.

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: Medium
**Primary Systems Affected**: CallScreen, HomeScreen, callStore, types/user.ts, App.tsx routing, formatTime utils
**Dependencies**: Firebase Firestore (already integrated), existing Contact types

---

## CONTEXT REFERENCES

### Relevant Codebase Files — MUST READ BEFORE IMPLEMENTING

- `src/components/elderly/CallScreen.tsx` — Current call lifecycle; must add activeCall doc write + beforeunload handler here
- `src/components/elderly/HomeScreen.tsx` — Must add rejoin prompt overlay + call history navigation link
- `src/components/elderly/HomeScreen.test.tsx` — Pattern for mocking stores and testing component rendering
- `src/stores/callStore.ts` (lines 1-30) — Existing call state store; extend with activeCall state
- `src/stores/contactStore.ts` — Pattern for Firestore subscription + Zustand store
- `src/types/user.ts` — Must add `CallHistoryEntry` type here
- `src/utils/formatTime.ts` — Has `formatRelativeTime`; must add `formatDuration` and `formatDateTime` utils
- `src/test/helpers/factories.ts` — Must add `createMockCallHistoryEntry` factory
- `src/test/helpers/render.tsx` — `renderWithProviders` pattern
- `src/services/callSignaling.ts` — Pattern for Firestore doc references (`incomingCallRef`)
- `firestore.rules` (lines 44-49) — callHistory rules already exist (read: owner + caregiver, write: owner)
- `src/App.tsx` (line 79) — Route for `/call/:contactId`; must add `/elderly/history` route

### New Files to Create

- `src/components/elderly/CallHistory.tsx` — Call history screen component
- `src/components/elderly/CallHistory.test.tsx` — Tests for call history screen
- `src/hooks/useActiveCall.ts` — Hook to check for active call on mount
- `src/hooks/useActiveCall.test.ts` — Tests for active call detection hook
- `src/components/elderly/RejoinPrompt.tsx` — Rejoin call prompt overlay component
- `src/components/elderly/RejoinPrompt.test.tsx` — Tests for rejoin prompt
- `src/services/callHistory.ts` — Firestore service for call history and active calls
- `src/services/callHistory.test.ts` — Tests for call history service

### Relevant Documentation

- Firestore data model (docs/PRD_EasyCall.md, section 8): `callHistory/{callId}` subcollection schema:
  ```
  contactId: string
  contactName: string
  direction: "outgoing" | "incoming"
  outcome: "completed" | "missed" | "declined"
  duration: number (seconds)
  startedAt: timestamp
  endedAt: timestamp
  ```
- Firestore `query()`, `orderBy()`, `where()`, `limit()`, `startAfter()` for pagination
- `beforeunload` event: `window.addEventListener('beforeunload', handler)` — set `e.preventDefault()` (modern browsers show generic message)

### Patterns to Follow

**Store Pattern (from contactStore.ts):**

```typescript
export const useContactStore = create<ContactStore>((set) => ({
  contacts: [],
  loading: false,
  error: null,
  fetchContacts: async (userId) => {
    /* ... */
  },
  subscribeToContacts: (userId) => {
    /* onSnapshot */
  },
}));
```

**Component Test Pattern (from HomeScreen.test.tsx):**

```typescript
const mockContacts: ReturnType<typeof createMockContact>[] = [];
vi.mock('@/stores/contactStore', () => ({
  useContactStore: vi.fn((selector) =>
    selector({
      contacts: mockContacts,
      /* ... */
    }),
  ),
}));
```

**Firestore Doc Reference Pattern (from callSignaling.ts):**

```typescript
export function incomingCallRef(elderlyUserId: string) {
  return doc(db, 'users', elderlyUserId, 'incomingCall', 'current');
}
```

**Factory Pattern (from factories.ts):**

```typescript
export function createMockContact(overrides: Partial<Contact> = {}): Contact {
  contactIdCounter += 1;
  return { id: `contact-${String(contactIdCounter)}`, /* defaults */, ...overrides };
}
```

**Navigation Pattern:**

```typescript
onClick={() => void navigate(`/call/${contact.id}`)}
```

**Touch Target Pattern:** All buttons use `min-h-14 min-w-14` (56px). The rejoin button must be >=72px per PRD (`min-h-[72px] min-w-[72px]`).

**Naming Conventions:**

- Components: PascalCase (`CallHistory`, `RejoinPrompt`)
- Hooks: camelCase with `use` prefix (`useActiveCall`)
- Types: PascalCase (`CallHistoryEntry`)
- Test files: co-located `ComponentName.test.tsx`
- Factories: `createMock{TypeName}`

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation — Types & Utilities

Add the `CallHistoryEntry` type and `ActiveCallData` type. Add `formatDuration` and `formatDateTime` utilities with tests.

### Phase 2: Active Call Infrastructure (3.1.1)

Create the `activeCall` Firestore document pattern. Write an `activeCall` doc when CallScreen mounts, clear it on unmount/hangup. Create `useActiveCall` hook that checks for active calls on HomeScreen mount. Create `RejoinPrompt` component. Add `beforeunload` handler to CallScreen.

### Phase 2.5: Call History Writer — Hybrid (prerequisite for 3.2.1, backfill from 2.1.3)

Hybrid approach for writing call history entries:

- **Client-side (CallScreen):** Write `callHistory` entries for completed calls. Only the client has accurate duration data from Jitsi API events (startedAt, endedAt, participantJoined/Left). Track call start time, compute duration on call end.
- **Server-side (Cloud Function):** Write `callHistory` entries for missed/declined incoming calls. These never reach CallScreen (elderly user doesn't answer), so a Firestore trigger on `incomingCall/current` status change handles them. Duration is 0, direction is `'incoming'`.

### Phase 3: Call History (3.2.1)

Create the `CallHistory` component with Firestore query, pagination, outcome badges, and tap-to-call. Add route in App.tsx. Add navigation from HomeScreen. Add the composite Firestore index for the callHistory query.

### Phase 4: Testing & Validation

Ensure all components have tests, all existing tests still pass, lint and type-check clean.

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

### Task 1: UPDATE `src/types/user.ts` — Add CallHistoryEntry and ActiveCallData types

- **IMPLEMENT**: Add types after the existing `Contact` interface:

  ```typescript
  export interface CallHistoryEntry {
    id: string;
    contactId: string;
    contactName: string;
    direction: 'outgoing' | 'incoming';
    outcome: 'completed' | 'missed' | 'declined';
    duration: number; // seconds
    startedAt: FirestoreTimestamp;
    endedAt: FirestoreTimestamp;
  }

  export interface ActiveCallData {
    contactId: string;
    contactName: string;
    jitsiRoomId: string;
    startedAt: FirestoreTimestamp;
    status: 'active' | 'ended';
  }
  ```

- **PATTERN**: Mirror `Contact` interface structure at `src/types/user.ts:34-42`
- **VALIDATE**: `pnpm exec tsc --noEmit`

### Task 2: UPDATE `src/utils/formatTime.ts` — Add formatDuration and formatDateTime

- **IMPLEMENT**:

  ```typescript
  export function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
  }

  export function formatDateTime(timestamp: FirestoreTimestamp): string {
    const date = timestamp.toDate();
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `Today ${time}`;
    if (isYesterday) return `Yesterday ${time}`;
    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
  }
  ```

- **PATTERN**: Follows existing `formatRelativeTime` at `src/utils/formatTime.ts:3-15`
- **IMPORTS**: `import type { FirestoreTimestamp } from '@/types/user';` (already imported)
- **VALIDATE**: `pnpm exec vitest run src/utils/formatTime.test.ts`

### Task 3: UPDATE `src/utils/formatTime.test.ts` — Add tests for new utils

- **IMPLEMENT**: Add test suites for `formatDuration` and `formatDateTime`:
  - `formatDuration`: test seconds only (<60), minutes+seconds, minutes only, hours+minutes, hours only
  - `formatDateTime`: test today shows "Today HH:MM", yesterday shows "Yesterday HH:MM", older shows "Mon DD HH:MM"
  - Use `mockTimestamp()` pattern from factories or inline
- **PATTERN**: Follow existing test structure in `src/utils/formatTime.test.ts`
- **VALIDATE**: `pnpm exec vitest run src/utils/formatTime.test.ts`

### Task 4: UPDATE `src/test/helpers/factories.ts` — Add createMockCallHistoryEntry

- **IMPLEMENT**: Add factory after `createMockContact`:

  ```typescript
  let callHistoryIdCounter = 0;

  export function createMockCallHistoryEntry(
    overrides: Partial<CallHistoryEntry> = {},
  ): CallHistoryEntry {
    callHistoryIdCounter += 1;
    return {
      id: `call-${String(callHistoryIdCounter)}`,
      contactId: `contact-${String(callHistoryIdCounter)}`,
      contactName: `Contact ${String(callHistoryIdCounter)}`,
      direction: 'outgoing',
      outcome: 'completed',
      duration: 300,
      startedAt: mockTimestamp(),
      endedAt: mockTimestamp(),
      ...overrides,
    };
  }
  ```

- **IMPORTS**: Add `CallHistoryEntry` to the import from `@/types/user`
- **GOTCHA**: Also reset `callHistoryIdCounter` in `resetFactoryCounters()`
- **GOTCHA**: `mockTimestamp` is already a private function in this file — reuse it as-is
- **PATTERN**: Mirror `createMockContact` at `src/test/helpers/factories.ts:42-56`
- **VALIDATE**: `pnpm exec tsc --noEmit`

### Task 5: UPDATE `src/test/helpers/index.ts` — Export new factory

- **IMPLEMENT**: Add `createMockCallHistoryEntry` to exports if not already re-exported
- **PATTERN**: Check current exports in `src/test/helpers/index.ts`
- **VALIDATE**: `pnpm exec tsc --noEmit`

### Task 6: CREATE `src/services/callHistory.ts` — Firestore service for call history and active calls

- **IMPLEMENT**: Service with functions:

  ```typescript
  import {
    doc,
    collection,
    query,
    orderBy,
    where,
    limit,
    startAfter,
    getDocs,
    setDoc,
    deleteDoc,
    addDoc,
    Timestamp,
  } from 'firebase/firestore';
  import { db } from '@/services/firebase';
  import type { CallHistoryEntry, ActiveCallData } from '@/types/user';

  export function activeCallRef(userId: string) {
    return doc(db, 'users', userId, 'activeCall', 'current');
  }

  export async function setActiveCall(
    userId: string,
    data: Omit<ActiveCallData, 'status'>,
  ): Promise<void> {
    await setDoc(activeCallRef(userId), { ...data, status: 'active' });
  }

  export async function clearActiveCall(userId: string): Promise<void> {
    await deleteDoc(activeCallRef(userId));
  }

  export async function fetchCallHistory(
    userId: string,
    pageSize: number = 20,
    lastDocSnapshot?: unknown,
  ): Promise<{ entries: CallHistoryEntry[]; lastDoc: unknown | null; hasMore: boolean }> {
    const thirtyDaysAgo = Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    const constraints = [
      orderBy('startedAt', 'desc'),
      where('startedAt', '>=', thirtyDaysAgo),
      limit(pageSize),
    ];
    if (lastDocSnapshot) constraints.push(startAfter(lastDocSnapshot));

    const q = query(collection(db, 'users', userId, 'callHistory'), ...constraints);
    const snap = await getDocs(q);
    const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CallHistoryEntry);
    const newLastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;

    return { entries, lastDoc: newLastDoc, hasMore: snap.docs.length === pageSize };
  }

  export async function writeCallHistoryEntry(
    userId: string,
    entry: Omit<CallHistoryEntry, 'id'>,
  ): Promise<string> {
    const ref = await addDoc(collection(db, 'users', userId, 'callHistory'), entry);
    return ref.id;
  }
  ```

- **PATTERN**: Mirror `incomingCallRef` pattern from `src/services/callSignaling.ts:5-7`
- **GOTCHA**: The 30-day filter uses `where('startedAt', '>=', thirtyDaysAgo)` where `thirtyDaysAgo` is a Firestore `Timestamp`
- **GOTCHA**: `startAfter` needs the actual Firestore document snapshot, not just the data. Store the raw `QueryDocumentSnapshot` as `lastDoc`.
- **VALIDATE**: `pnpm exec tsc --noEmit`

### Task 7: CREATE `src/services/callHistory.test.ts` — Tests for call history service

- **IMPLEMENT**: Test all service functions using `vi.resetModules()` + `vi.doMock()` pattern:
  - `activeCallRef` returns correct doc path
  - `setActiveCall` calls `setDoc` with correct data + `status: 'active'`
  - `clearActiveCall` calls `deleteDoc`
  - `fetchCallHistory` constructs correct query with orderBy, where, limit, startAfter
  - `fetchCallHistory` returns entries mapped from docs
  - `fetchCallHistory` returns `hasMore: true` when results equal pageSize
  - `writeCallHistoryEntry` calls `addDoc` with entry data
- **PATTERN**: Mirror `src/stores/contactStore.test.ts` for Firestore mocking approach
- **VALIDATE**: `pnpm exec vitest run src/services/callHistory.test.ts`

### Task 8: UPDATE `firestore.rules` — Add activeCall rules + harden callHistory rules

- **IMPLEMENT**: Three changes to `firestore.rules`:

  **8a. Add activeCall rules** after the `incomingCall/current` match block (around line 42):

  ```
  // Active call tracking (single doc "current", for auto-rejoin)
  match /activeCall/current {
    allow read: if request.auth.uid == userId;
    allow create, update: if request.auth.uid == userId
      && request.resource.data.keys().hasOnly(['contactId', 'contactName', 'jitsiRoomId', 'startedAt', 'status'])
      && request.resource.data.keys().hasAll(['contactId', 'contactName', 'jitsiRoomId', 'startedAt', 'status'])
      && request.resource.data.status in ['active', 'ended'];
    allow delete: if request.auth.uid == userId;
  }
  ```

  **8b. Harden callHistory rules** — replace the existing permissive rule (lines 45-48):

  ```
  // BEFORE (too permissive):
  // allow write: if request.auth.uid == userId;

  // AFTER (validated structure, immutable, no deletes):
  match /callHistory/{callId} {
    allow read: if request.auth.uid == userId
      || isCaregiverOf(userId, request.auth.uid);
    allow create: if request.auth.uid == userId
      && request.resource.data.keys().hasOnly(['contactId', 'contactName', 'direction', 'outcome', 'duration', 'startedAt', 'endedAt'])
      && request.resource.data.keys().hasAll(['contactId', 'contactName', 'direction', 'outcome', 'duration', 'startedAt', 'endedAt'])
      && request.resource.data.direction in ['outgoing', 'incoming']
      && request.resource.data.outcome in ['completed', 'missed', 'declined']
      && request.resource.data.duration is int
      && request.resource.data.duration >= 0
      && request.resource.data.startedAt is timestamp
      && request.resource.data.startedAt <= request.time;
    allow update: if false;
    allow delete: if false;
  }
  ```

- **GOTCHA**: The Cloud Function `onCallStatusChange` uses admin SDK which bypasses these rules — it can still write freely. These rules only constrain client-side writes.
- **GOTCHA**: `allow update: if false` + `allow delete: if false` makes callHistory immutable from the client — this is intentional (call records should not be tampered with, and caregivers can read them)
- **GOTCHA**: `duration is int` validates that duration is an integer, not a float or string
- **GOTCHA**: `startedAt <= request.time` prevents writing future-dated call records
- **VALIDATE**: Visual inspection; optionally use `mcp__plugin_firebase_firebase__firebase_validate_security_rules` MCP tool if available

### Task 9: UPDATE `firestore.indexes.json` — Add composite index for callHistory query

- **IMPLEMENT**: Add a composite index for the `callHistory` subcollection query which uses `orderBy('startedAt', 'desc')` + `where('startedAt', '>=', thirtyDaysAgo)`. Update the `indexes` array:
  ```json
  {
    "indexes": [
      {
        "collectionGroup": "callHistory",
        "queryScope": "COLLECTION",
        "fields": [
          { "fieldPath": "startedAt", "order": "DESCENDING" }
        ]
      }
    ],
    "fieldOverrides": [
      ...existing...
    ]
  }
  ```
- **GOTCHA**: A single-field `orderBy` + range filter on the SAME field (`startedAt`) does NOT require a composite index in Firestore — the single-field index is auto-created. However, if `startAfter` pagination is used with the same field, it still works with the auto-index. Adding an explicit index entry is still good practice for documentation and ensures `firebase deploy --only firestore:indexes` keeps the project in sync.
- **GOTCHA**: The existing `fieldOverrides` array must be preserved intact
- **PATTERN**: Existing `firestore.indexes.json` structure at project root
- **VALIDATE**: `cat firestore.indexes.json | python3 -m json.tool` (validate JSON syntax)

### Task 10: CREATE `src/hooks/useActiveCall.ts` — Hook to detect active calls on mount

- **IMPLEMENT**:

  ```typescript
  import { useState, useEffect } from 'react';
  import { getDoc } from 'firebase/firestore';
  import { activeCallRef, clearActiveCall } from '@/services/callHistory';
  import type { ActiveCallData } from '@/types/user';

  export function useActiveCall(userId: string | null) {
    const [activeCall, setActiveCall] = useState<ActiveCallData | null>(null);

    useEffect(() => {
      if (!userId) return;

      async function checkActiveCall() {
        const snap = await getDoc(activeCallRef(userId!));
        if (!snap.exists()) return;
        const data = snap.data() as ActiveCallData;

        // Only show rejoin if call is active and started within 5 minutes
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        const startedAtMs = data.startedAt.toDate().getTime();
        if (data.status === 'active' && startedAtMs > fiveMinutesAgo) {
          setActiveCall(data);
        } else {
          // Clean up stale/ended activeCall docs to prevent Firestore bloat.
          // This handles the case where beforeunload didn't fire (mobile kill,
          // force-close, crash) and the doc was never deleted.
          void clearActiveCall(userId!);
        }
      }

      void checkActiveCall();
    }, [userId]);

    const dismiss = () => setActiveCall(null);

    return { activeCall, dismiss };
  }
  ```

- **PATTERN**: Similar to `useIncomingCall` hook pattern
- **VALIDATE**: `pnpm exec vitest run src/hooks/useActiveCall.test.ts`

### Task 11: CREATE `src/hooks/useActiveCall.test.ts` — Tests for useActiveCall

- **IMPLEMENT**:
  - Mock `firebase/firestore` (`getDoc`) and `@/services/callHistory` (`activeCallRef`, `clearActiveCall`)
  - Test: no userId -> no Firestore call
  - Test: active call within 5 min -> returns ActiveCallData
  - Test: active call older than 5 min -> returns null AND calls `clearActiveCall` (stale cleanup)
  - Test: no activeCall doc -> returns null, does NOT call `clearActiveCall`
  - Test: status 'ended' -> returns null AND calls `clearActiveCall` (stale cleanup)
  - Test: `dismiss()` sets activeCall to null
- **PATTERN**: Mirror `src/hooks/useIncomingCall.test.ts` mocking pattern
- **VALIDATE**: `pnpm exec vitest run src/hooks/useActiveCall.test.ts`

### Task 12: CREATE `src/components/elderly/RejoinPrompt.tsx` — Rejoin call prompt overlay

- **IMPLEMENT**:

  ```typescript
  import { useEffect, useRef } from 'react';
  import { useNavigate } from 'react-router';
  import { EasyCallButton } from '@/components/shared/EasyCallButton';
  import { EasyCallText } from '@/components/shared/EasyCallText';
  import { clearActiveCall } from '@/services/callHistory';
  import type { ActiveCallData } from '@/types/user';

  interface RejoinPromptProps {
    activeCall: ActiveCallData;
    userId: string;
    onDismiss: () => void;
  }

  export function RejoinPrompt({ activeCall, userId, onDismiss }: RejoinPromptProps) {
    const navigate = useNavigate();
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
      timerRef.current = setTimeout(() => {
        void clearActiveCall(userId);
        onDismiss();
      }, 30_000);

      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }, [userId, onDismiss]);

    const handleRejoin = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      void navigate(`/call/${activeCall.contactId}`);
    };

    const handleDismiss = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      void clearActiveCall(userId);
      onDismiss();
    };

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
           role="dialog" aria-modal="true" aria-label="Rejoin call">
        <div className="bg-base-100 rounded-2xl p-6 max-w-sm w-full flex flex-col items-center gap-4">
          <EasyCallText as="h2" variant="heading" className="text-center">
            Return to call with {activeCall.contactName}?
          </EasyCallText>
          <EasyCallButton
            variant="primary"
            className="min-h-[72px] min-w-[72px] w-full"
            onClick={handleRejoin}
            aria-label={`Return to call with ${activeCall.contactName}`}
          >
            Return to Call
          </EasyCallButton>
          <EasyCallButton
            variant="secondary"
            onClick={handleDismiss}
          >
            Dismiss
          </EasyCallButton>
        </div>
      </div>
    );
  }
  ```

- **PATTERN**: Modal pattern from `src/components/shared/ConfirmDialog.tsx`
- **GOTCHA**: Rejoin button must be >=72px per PRD AC-10.2 — use `min-h-[72px]`
- **GOTCHA**: Use `variant="primary"` since primary is green in the elderly theme
- **VALIDATE**: `pnpm exec vitest run src/components/elderly/RejoinPrompt.test.tsx`

### Task 13: CREATE `src/components/elderly/RejoinPrompt.test.tsx` — Tests for RejoinPrompt

- **IMPLEMENT**:
  - Mock `@/services/callHistory` (`clearActiveCall`)
  - Test: renders prompt with contact name
  - Test: rejoin button is >=72px (check className contains `min-h-[72px]`)
  - Test: clicking rejoin navigates to `/call/{contactId}`
  - Test: 30-second timeout calls `clearActiveCall` and `onDismiss`
  - Test: clicking dismiss calls `clearActiveCall` and `onDismiss`
  - Test: passes vitest-axe accessibility check
  - Use `vi.useFakeTimers()` for timeout tests
- **PATTERN**: Mirror `src/components/elderly/HomeScreen.test.tsx`
- **VALIDATE**: `pnpm exec vitest run src/components/elderly/RejoinPrompt.test.tsx`

### Task 14: UPDATE `src/components/elderly/CallScreen.tsx` — Add activeCall tracking + beforeunload

- **IMPLEMENT**:
  1. Import `setActiveCall`, `clearActiveCall` from `@/services/callHistory`
  2. Import `auth` (already imported)
  3. After Jitsi API is created and call connects, write activeCall doc:
     ```typescript
     // After api is created (around line 66), inside the startCall function:
     const userId = auth.currentUser?.uid;
     if (userId) {
       void setActiveCall(userId, {
         contactId: contactId!,
         contactName: currentContact.name,
         jitsiRoomId,
         startedAt: {
           seconds: Math.floor(Date.now() / 1000),
           nanoseconds: 0,
           toDate: () => new Date(),
         },
       });
     }
     ```
  4. In cleanup (line 111-121) and `handleHangup` (line 124-127), call `clearActiveCall`:
     ```typescript
     if (userId) void clearActiveCall(userId);
     ```
  5. Add `beforeunload` handler:
     ```typescript
     // Inside the startCall function, after api creation:
     const handleBeforeUnload = (e: BeforeUnloadEvent) => {
       e.preventDefault();
     };
     window.addEventListener('beforeunload', handleBeforeUnload);
     // In cleanup:
     window.removeEventListener('beforeunload', handleBeforeUnload);
     ```
- **GOTCHA**: `beforeunload` handler must be added AFTER Jitsi API is created (call is active), not on mount
- **GOTCHA**: Clear activeCall in BOTH cleanup function AND handleHangup to cover all exit paths
- **GOTCHA**: Use `serverTimestamp()` for the Firestore write, but the local state can use `Date.now()`
- **VALIDATE**: `pnpm exec vitest run src/components/elderly/CallScreen.test.tsx`

### Task 15: UPDATE `src/components/elderly/CallScreen.test.tsx` — Add tests for activeCall + beforeunload

- **IMPLEMENT**:
  - Mock `@/services/callHistory` (`setActiveCall`, `clearActiveCall`)
  - Test: `setActiveCall` called after Jitsi API creation
  - Test: `clearActiveCall` called on component unmount
  - Test: `clearActiveCall` called on hangup
  - Test: `beforeunload` handler added during active call
  - Test: `beforeunload` handler removed on cleanup
- **VALIDATE**: `pnpm exec vitest run src/components/elderly/CallScreen.test.tsx`

### Task 16: UPDATE `src/components/elderly/CallScreen.tsx` — Write callHistory entry on call end (backfill from 2.1.3 AC-4.8)

- **IMPLEMENT**: Track call start time and write a `callHistory` entry when the call ends. This covers the missing AC-4.8 from task 2.1.3.
  1. Add a `callStartTimeRef = useRef<number | null>(null)` to track when the call started
  2. Import `writeCallHistoryEntry` from `@/services/callHistory` and `serverTimestamp` from `firebase/firestore`
  3. When Jitsi API is created (after line 66), record the start time:
     ```typescript
     callStartTimeRef.current = Date.now();
     ```
  4. Create a helper function inside the effect to write history:
     ```typescript
     function writeHistory(outcome: 'completed' | 'missed' | 'declined') {
       const userId = auth.currentUser?.uid;
       if (!userId || !callStartTimeRef.current) return;
       const startMs = callStartTimeRef.current;
       const endMs = Date.now();
       const durationSec = Math.floor((endMs - startMs) / 1000);
       void writeCallHistoryEntry(userId, {
         contactId: contactId!,
         contactName: currentContact.name,
         direction: 'outgoing',
         outcome,
         duration: durationSec,
         startedAt: {
           seconds: Math.floor(startMs / 1000),
           nanoseconds: 0,
           toDate: () => new Date(startMs),
         },
         endedAt: {
           seconds: Math.floor(endMs / 1000),
           nanoseconds: 0,
           toDate: () => new Date(endMs),
         },
       });
     }
     ```
  5. Call `writeHistory('completed')` in the `readyToClose` listener and in `handleHangup`
  6. Call `writeHistory('completed')` in the `participantLeft` auto-navigate timeout (when all participants leave)
  7. **Do NOT write history in the cleanup function** — cleanup runs on unmount which already goes through hangup or readyToClose
- **GOTCHA**: The `direction` field should be `'outgoing'` for calls initiated from HomeScreen. Incoming calls answered via `IncomingCallScreen` also route to `/call/:contactId`, but for now marking all as `'outgoing'` is acceptable — incoming call history will be handled when the IncomingCallScreen is updated to write its own history (for missed/declined calls)
- **GOTCHA**: Avoid double-writing — use a `historyWrittenRef = useRef(false)` guard to ensure only one history entry per call session
- **GOTCHA**: Use local timestamps (not `serverTimestamp()`) for `startedAt`/`endedAt` since we need the actual values for duration calculation; Firestore will still accept them
- **PATTERN**: Follows the PRD Jitsi events table (line 793): `videoConferenceLeft` -> "Write call history"
- **VALIDATE**: `pnpm exec vitest run src/components/elderly/CallScreen.test.tsx`

### Task 17: UPDATE `src/components/elderly/CallScreen.test.tsx` — Add tests for callHistory writing

- **IMPLEMENT**:
  - Mock `writeCallHistoryEntry` from `@/services/callHistory`
  - Test: `writeCallHistoryEntry` called with `outcome: 'completed'` on hangup
  - Test: `writeCallHistoryEntry` called with correct `contactId` and `contactName`
  - Test: `writeCallHistoryEntry` includes `duration` > 0 (use fake timers to advance time)
  - Test: `writeCallHistoryEntry` NOT called twice (guard ref prevents double-write)
  - Test: `direction` is `'outgoing'`
- **VALIDATE**: `pnpm exec vitest run src/components/elderly/CallScreen.test.tsx`

### Task 18: CREATE Cloud Function `onCallStatusChange` in `functions/src/index.ts` — Write callHistory for missed/declined calls

- **IMPLEMENT**: Add a new Firestore trigger that fires when `incomingCall/current` status changes to `'missed'` or `'declined'`, and writes a `callHistory` entry for the elderly user. This complements the client-side writer (Task 16) which only covers completed calls from `CallScreen`.

  ```typescript
  // ---------------------------------------------------------------------------
  // onCallStatusChange
  //
  // Triggers when incomingCall/current is updated. When the status transitions
  // to 'missed' or 'declined', writes a callHistory entry for the elderly user.
  // Completed calls are written client-side (CallScreen has accurate duration).
  // ---------------------------------------------------------------------------
  export const onCallStatusChange = onDocumentWritten(
    'users/{elderlyUserId}/incomingCall/current',
    async (event) => {
      const after = event.data?.after.data();
      const before = event.data?.before.data();

      if (!after) return; // doc deleted, nothing to do

      const status = after['status'] as string;
      // Only write history for missed/declined — completed calls are written client-side
      if (status !== 'missed' && status !== 'declined') return;
      // Don't re-process if status hasn't changed
      if (before && before['status'] === status) return;

      const elderlyUserId = event.params['elderlyUserId'];
      const db = getFirestore();

      const timestamp = after['timestamp'] as FirebaseFirestore.Timestamp | undefined;
      const now = FieldValue.serverTimestamp();

      // Truncate callerName — it's caller-supplied (any authenticated user can write
      // incomingCall/current), so cap at 100 chars to prevent storage bloat
      const callerName = String(after['callerName'] ?? 'Unknown').slice(0, 100);

      await db
        .collection('users')
        .doc(elderlyUserId)
        .collection('callHistory')
        .add({
          contactId: '', // caller is not necessarily in contacts
          contactName: callerName,
          direction: 'incoming' as const,
          outcome: status, // 'missed' or 'declined'
          duration: 0,
          startedAt: timestamp ?? now,
          endedAt: now,
        });
    },
  );
  ```

- **PATTERN**: Mirror the existing `onIncomingCall` trigger at `functions/src/index.ts:184-269` — same trigger path, same event shape
- **GOTCHA**: This trigger shares the same document path as `onIncomingCall`. Both `onDocumentWritten` triggers will fire on the same write — that's fine, they handle different status transitions (`onIncomingCall` handles `ringing`, `onCallStatusChange` handles `missed`/`declined`)
- **GOTCHA**: `contactId` is set to empty string because the caller may not be in the elderly user's contacts list. The `CallHistory` component already guards against empty `contactName` with `[0] ?? '?'`
- **GOTCHA**: `duration` is 0 for missed/declined calls (call was never connected)
- **GOTCHA**: Use `FieldValue.serverTimestamp()` for `endedAt` since the server is writing this, not the client
- **VALIDATE**: `cd functions && pnpm test`

### Task 19: UPDATE `functions/src/index.ts` tests — Add tests for onCallStatusChange

- **IMPLEMENT**: Since the functions project uses vitest with a simple node config, add a test file `functions/src/onCallStatusChange.test.ts` OR add tests to an existing test structure. Test:
  - Test: status changes to `'missed'` → `callHistory` entry written with `outcome: 'missed'`, `direction: 'incoming'`, `duration: 0`
  - Test: status changes to `'declined'` → `callHistory` entry written with `outcome: 'declined'`
  - Test: status changes to `'ringing'` → NO callHistory entry written
  - Test: status changes to `'active'` → NO callHistory entry written (handled client-side)
  - Test: status unchanged (same before/after) → NO callHistory entry written
  - Test: document deleted (after is null) → NO callHistory entry written
  - Test: `callerName` is included in the history entry
- **PATTERN**: Mirror test approach from `functions/src/jwtUtils.test.ts` — pure vitest, node environment
- **GOTCHA**: Cloud Function triggers are harder to unit test directly. Mock `getFirestore()` and verify `.collection().doc().collection().add()` calls. Alternatively, extract the core logic into a helper function and test that.
- **VALIDATE**: `cd functions && pnpm test`

### Task 20: UPDATE `src/components/elderly/HomeScreen.tsx` — Add rejoin prompt + history link

- **IMPLEMENT**:
  1. Import `useActiveCall` from `@/hooks/useActiveCall`
  2. Import `RejoinPrompt` from `./RejoinPrompt`
  3. Call `const { activeCall, dismiss } = useActiveCall(userId)` in component
  4. Render `RejoinPrompt` overlay when `activeCall` is non-null:
     ```tsx
     {
       activeCall && <RejoinPrompt activeCall={activeCall} userId={userId} onDismiss={dismiss} />;
     }
     ```
  5. Add a "Call History" navigation button in the header area (next to Settings):
     ```tsx
     <EasyCallButton
       variant="secondary"
       size="default"
       onClick={() => void navigate('/elderly/history')}
       aria-label="Call history"
     >
       history-icon
     </EasyCallButton>
     ```
- **PATTERN**: Follow existing header button pattern at `src/components/elderly/HomeScreen.tsx:25-33`
- **VALIDATE**: `pnpm exec vitest run src/components/elderly/HomeScreen.test.tsx`

### Task 21: UPDATE `src/components/elderly/HomeScreen.test.tsx` — Add tests for rejoin + history link

- **IMPLEMENT**:
  - Mock `@/hooks/useActiveCall`
  - Test: when `activeCall` is non-null, RejoinPrompt renders
  - Test: when `activeCall` is null, no RejoinPrompt
  - Test: call history button is present with aria-label
- **VALIDATE**: `pnpm exec vitest run src/components/elderly/HomeScreen.test.tsx`

### Task 22: CREATE `src/components/elderly/CallHistory.tsx` — Call history screen

- **IMPLEMENT**:

  ```typescript
  import { useState, useEffect } from 'react';
  import { useNavigate } from 'react-router';
  import { fetchCallHistory } from '@/services/callHistory';
  import { formatDuration, formatDateTime } from '@/utils/formatTime';
  import { EasyCallText } from '@/components/shared/EasyCallText';
  import { EasyCallButton } from '@/components/shared/EasyCallButton';
  import type { CallHistoryEntry } from '@/types/user';

  interface CallHistoryProps {
    userId: string;
  }

  const OUTCOME_STYLES: Record<CallHistoryEntry['outcome'], { label: string; badge: string; rowBg: string }> = {
    completed: { label: 'Completed', badge: 'badge-success', rowBg: '' },
    missed: { label: 'Missed', badge: 'badge-error', rowBg: 'bg-error/10' },
    declined: { label: 'Declined', badge: 'badge-ghost', rowBg: '' },
  };

  export function CallHistory({ userId }: CallHistoryProps) {
    const navigate = useNavigate();
    const [entries, setEntries] = useState<CallHistoryEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastDoc, setLastDoc] = useState<unknown>(null);
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);

    useEffect(() => {
      async function load() {
        setLoading(true);
        const result = await fetchCallHistory(userId);
        setEntries(result.entries);
        setLastDoc(result.lastDoc);
        setHasMore(result.hasMore);
        setLoading(false);
      }
      void load();
    }, [userId]);

    const handleShowMore = async () => {
      setLoadingMore(true);
      const result = await fetchCallHistory(userId, 20, lastDoc);
      setEntries((prev) => [...prev, ...result.entries]);
      setLastDoc(result.lastDoc);
      setHasMore(result.hasMore);
      setLoadingMore(false);
    };

    return (
      <div className="min-h-screen bg-base-100 p-4 flex flex-col">
        <div className="flex items-center gap-3 mb-6">
          <EasyCallButton
            variant="secondary"
            size="default"
            onClick={() => void navigate('/elderly')}
            aria-label="Back to contacts"
          >
            back-arrow
          </EasyCallButton>
          <EasyCallText as="h1" variant="heading">Call History</EasyCallText>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <span className="loading loading-spinner loading-lg text-primary"
                  role="status" aria-label="Loading call history" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <EasyCallText as="p" variant="body" className="text-center text-base-content/60">
              No calls yet
            </EasyCallText>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {entries.map((entry) => {
              const style = OUTCOME_STYLES[entry.outcome];
              return (
                <button
                  key={entry.id}
                  className={`flex items-center gap-3 p-3 rounded-xl min-h-14 w-full text-left ${style.rowBg}`}
                  onClick={() => void navigate(`/call/${entry.contactId}`)}
                  aria-label={`Call ${entry.contactName}`}
                >
                  <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center
                                  text-lg font-bold text-primary-content flex-shrink-0">
                    {entry.contactName[0] ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <EasyCallText as="span" variant="button" className="font-bold block truncate">
                      {entry.contactName}
                    </EasyCallText>
                    <EasyCallText as="span" variant="body" className="text-sm text-base-content/60 block">
                      {formatDateTime(entry.startedAt)} . {formatDuration(entry.duration)}
                    </EasyCallText>
                  </div>
                  <span className={`badge ${style.badge} badge-sm`}>{style.label}</span>
                </button>
              );
            })}

            {hasMore && (
              <EasyCallButton
                variant="secondary"
                onClick={() => void handleShowMore()}
                disabled={loadingMore}
                className="mt-2"
              >
                {loadingMore ? 'Loading...' : 'Show more'}
              </EasyCallButton>
            )}
          </div>
        )}
      </div>
    );
  }
  ```

- **PATTERN**: Layout from `src/components/elderly/HomeScreen.tsx`; list items follow `src/components/caregiver/ManageContacts.tsx` pattern
- **GOTCHA**: `callHistory` docs don't store `photoURL` — use initials circle fallback (same as HomeScreen null-photo pattern)
- **GOTCHA**: `contactName` could theoretically have empty string — use `[0] ?? '?'` guard (same as HomeScreen line 61)
- **GOTCHA**: Missed calls need subtle red background per PRD — use `bg-error/10` (10% opacity)
- **GOTCHA**: Touch targets must be >=56px — each row has `min-h-14`
- **VALIDATE**: `pnpm exec vitest run src/components/elderly/CallHistory.test.tsx`

### Task 23: CREATE `src/components/elderly/CallHistory.test.tsx` — Tests for CallHistory

- **IMPLEMENT**:
  - Mock `@/services/callHistory` (`fetchCallHistory`)
  - Mock `@/utils/formatTime` (or let real implementations run)
  - Test: renders entries from mock data (names, durations, dates visible)
  - Test: missed calls have red background styling (`bg-error/10`)
  - Test: completed calls have green badge (`badge-success`)
  - Test: declined calls have gray badge (`badge-ghost`)
  - Test: tapping entry has correct aria-label "Call {name}"
  - Test: "Show more" button appears when `hasMore: true`
  - Test: "Show more" button does NOT appear when `hasMore: false`
  - Test: clicking "Show more" loads more entries (calls `fetchCallHistory` again with lastDoc)
  - Test: empty state shows "No calls yet"
  - Test: loading state shows spinner
  - Test: passes vitest-axe accessibility check
- **PATTERN**: Mirror `src/components/elderly/HomeScreen.test.tsx`
- **VALIDATE**: `pnpm exec vitest run src/components/elderly/CallHistory.test.tsx`

### Task 24: UPDATE `src/App.tsx` — Add CallHistory route

- **IMPLEMENT**:
  1. Import `CallHistory` component:
     ```typescript
     import { CallHistory } from '@/components/elderly/CallHistory';
     ```
  2. Add route inside the elderly `AuthGuard` block (after the `/elderly/add-contact` route, around line 79):
     ```tsx
     <Route path="/elderly/history" element={userId ? <CallHistory userId={userId} /> : null} />
     ```
- **PATTERN**: Mirror existing route pattern at `src/App.tsx:58-79`
- **VALIDATE**: `pnpm exec vitest run src/App.test.tsx`

### Task 25: UPDATE `src/App.test.tsx` — Add test for history route

- **IMPLEMENT**: Add test that `/elderly/history` route renders (if App.test.tsx has route tests)
- **VALIDATE**: `pnpm exec vitest run src/App.test.tsx`

### Task 26: CREATE `e2e/call-history.spec.ts` — E2E tests for call history screen

- **IMPLEMENT**: New Playwright E2E spec covering the call history screen with Firebase emulators. Follow the established pattern from `e2e/elderly-call.spec.ts` exactly (same helpers, same auth intercept, same serial mode).

  ```typescript
  import { test, expect } from '@playwright/test';

  // Reuse constants + helpers: FIRESTORE_EMULATOR, AUTH_EMULATOR, PROJECT_ID,
  // EMULATOR_AUTH_HEADER, clearEmulators, createEmulatorUser, seedUserAsElderly, checkEmulators
  // (copy from elderly-call.spec.ts — no shared module exists yet)

  async function seedCallHistoryEntry(
    uid: string,
    callId: string,
    data: {
      contactId: string;
      contactName: string;
      direction: string;
      outcome: string;
      duration: number;
      startedAt: string; // ISO timestamp
    },
  ): Promise<void> {
    // PATCH to Firestore emulator REST:
    // /v1/projects/{PROJECT_ID}/databases/(default)/documents/users/{uid}/callHistory/{callId}
    // Fields: contactId, contactName, direction, outcome, duration (integerValue),
    //         startedAt (timestampValue), endedAt (timestampValue)
  }

  test.describe('Call History (emulators)', () => {
    test.describe.configure({ mode: 'serial' });
    test.beforeAll(checkEmulators);

    // beforeEach: clearEmulators, createEmulatorUser, seedUserAsElderly, route intercepts

    test('shows "No calls yet" when call history is empty', async ({ page }) => {
      // Navigate to /elderly/history
      // Verify "No calls yet" text visible
    });

    test('renders call history entries with correct outcome badges', async ({ page }) => {
      // Seed 3 callHistory entries: completed, missed, declined
      // Navigate to /elderly/history
      // Verify all 3 entries visible with contact names
      // Verify completed entry has "Completed" badge
      // Verify missed entry has "Missed" badge and red background (bg-error/10)
      // Verify declined entry has "Declined" badge
    });

    test('tapping a call history entry navigates to call screen', async ({ page }) => {
      // Seed 1 callHistory entry + 1 matching contact
      // Navigate to /elderly/history
      // Click the entry
      // Verify navigation to /call/{contactId}
      // Verify end call button visible (Jitsi mock loads)
    });

    test('Show more button appears with >20 entries and loads more on click', async ({ page }) => {
      // Seed 21 callHistory entries with descending startedAt timestamps
      // Navigate to /elderly/history
      // Verify first 20 entries visible
      // Verify "Show more" button visible
      // Click "Show more"
      // Verify 21st entry appears
    });

    test('navigating from HomeScreen to call history and back works', async ({ page }) => {
      // Navigate to /elderly
      // Click call history button (aria-label "Call history")
      // Verify URL contains /elderly/history
      // Click back button (aria-label "Back to contacts")
      // Verify URL contains /elderly and "Your Contacts" heading visible
    });
  });
  ```

- **PATTERN**: Mirror `e2e/elderly-call.spec.ts` structure exactly — same helpers, same `beforeEach` setup, same serial mode
- **GOTCHA**: Seed `startedAt` timestamps within the last 30 days (use `new Date().toISOString()` or recent dates), otherwise the query filter will exclude them
- **GOTCHA**: For the "tap entry navigates to call" test, also need to seed a matching contact (so CallScreen can find it) AND mock Jitsi CDN + generateJitsiJwt (same as elderly-call.spec.ts)
- **GOTCHA**: For the 21-entry pagination test, seed entries with distinct `startedAt` timestamps ordered DESC so Firestore returns them in the expected order. Use a loop decrementing by 1 hour per entry.
- **GOTCHA**: The `duration` field in Firestore REST API must be `integerValue` (string-encoded integer), not `numberValue`
- **VALIDATE**: `pnpm test:e2e:emulators e2e/call-history.spec.ts`

### Task 27: CREATE `e2e/auto-rejoin.spec.ts` — E2E tests for auto-rejoin on disconnect

- **IMPLEMENT**: New Playwright E2E spec covering the auto-rejoin flow with Firebase emulators.

  ```typescript
  import { test, expect } from '@playwright/test';

  // Same emulator helpers as call-history.spec.ts

  async function seedActiveCall(
    uid: string,
    data: { contactId: string; contactName: string; jitsiRoomId: string },
  ): Promise<void> {
    // PATCH to Firestore emulator REST:
    // /v1/projects/{PROJECT_ID}/databases/(default)/documents/users/{uid}/activeCall/current
    // Fields: contactId, contactName, jitsiRoomId, status: 'active',
    //         startedAt (timestampValue — must be within last 5 minutes)
  }

  test.describe('Auto-Rejoin on Disconnect (emulators)', () => {
    test.describe.configure({ mode: 'serial' });
    test.beforeAll(checkEmulators);

    // beforeEach: clearEmulators, createEmulatorUser, seedUserAsElderly, seedContact, route intercepts

    test('rejoin prompt appears when active call exists on HomeScreen load', async ({ page }) => {
      // Seed an activeCall/current doc with status 'active' and recent startedAt
      // Navigate to /elderly
      // Verify "Return to call with {contactName}?" prompt visible
      // Verify rejoin button visible with min-h-[72px]
    });

    test('clicking rejoin navigates to call screen', async ({ page }) => {
      // Seed activeCall + matching contact
      // Navigate to /elderly
      // Click "Return to Call" button
      // Verify navigation to /call/{contactId}
      // Verify end call button visible
    });

    test('dismiss button clears the prompt', async ({ page }) => {
      // Seed activeCall
      // Navigate to /elderly
      // Verify rejoin prompt visible
      // Click "Dismiss"
      // Verify prompt disappears
      // Verify "Your Contacts" heading still visible (HomeScreen remains)
    });

    test('no rejoin prompt when active call is older than 5 minutes', async ({ page }) => {
      // Seed activeCall with startedAt 6 minutes ago
      // Navigate to /elderly
      // Verify "Your Contacts" visible (no prompt)
      // Verify rejoin prompt NOT visible
    });

    test('no rejoin prompt when no activeCall document exists', async ({ page }) => {
      // Just seed user + contact (no activeCall)
      // Navigate to /elderly
      // Verify "Your Contacts" visible
      // Verify rejoin prompt NOT visible
    });
  });
  ```

- **PATTERN**: Mirror `e2e/elderly-call.spec.ts` and `e2e/incoming-call.spec.ts` patterns
- **GOTCHA**: For the "older than 5 minutes" test, use `new Date(Date.now() - 6 * 60 * 1000).toISOString()` for `startedAt`
- **GOTCHA**: For the rejoin-then-call test, need Jitsi CDN mock + JWT mock (same as elderly-call.spec.ts) AND a seeded contact matching the `contactId` in the activeCall doc
- **GOTCHA**: The auto-dismiss at 30s is too slow to test in E2E without making tests fragile — skip that scenario, it's covered by unit tests
- **VALIDATE**: `pnpm test:e2e:emulators e2e/auto-rejoin.spec.ts`

### Task 28: CREATE `e2e/call-history-write.spec.ts` — E2E test verifying call history is written after a call

- **IMPLEMENT**: End-to-end verification that completing a call writes a `callHistory` entry to Firestore. This is the integration test for Tasks 16-17 (client-side history writer).

  ```typescript
  import { test, expect } from '@playwright/test';

  // Same emulator helpers

  async function getCallHistoryEntries(uid: string): Promise<unknown[]> {
    // GET from Firestore emulator REST:
    // /v1/projects/{PROJECT_ID}/databases/(default)/documents/users/{uid}/callHistory
    // Parse response.documents array
  }

  test.describe('Call history writing (emulators)', () => {
    test.describe.configure({ mode: 'serial' });
    test.beforeAll(checkEmulators);

    test('completing a call writes a callHistory entry to Firestore', async ({ page }) => {
      // 1. Clear emulators, create user, seed elderly + contact
      // 2. Mock Jitsi + JWT
      // 3. Navigate to /elderly, tap contact, reach call screen
      // 4. End the call (click end call button)
      // 5. Wait for navigation back to /elderly
      // 6. Query Firestore emulator REST API for callHistory entries
      // 7. Verify exactly 1 entry exists
      // 8. Verify entry has: contactName matching seeded contact,
      //    direction: 'outgoing', outcome: 'completed', duration >= 0
    });

    test('declining an incoming call writes a callHistory entry via Cloud Function', async ({
      page,
    }) => {
      // NOTE: This test requires the Functions emulator to be running
      // (firebase emulators:start --only auth,firestore,functions)
      // If Functions emulator is not available, skip this test.
      //
      // 1. Clear emulators, create user, seed elderly
      // 2. Navigate to /elderly, wait for HomeScreen
      // 3. Write incomingCall/current with status 'ringing' via REST
      // 4. Verify IncomingCallScreen appears
      // 5. Click Decline
      // 6. Wait for Cloud Function to process (poll callHistory via REST, up to 5s)
      // 7. Verify callHistory entry exists with outcome: 'declined', direction: 'incoming'
    });
  });
  ```

- **PATTERN**: Mirror `e2e/elderly-call.spec.ts` for the call flow setup
- **GOTCHA**: The first test (completed call) needs the full Jitsi mock setup from elderly-call.spec.ts
- **GOTCHA**: The second test (declined via Cloud Function) requires the **Functions emulator** running too — add a note to skip this test or mark it with `test.skip` if the Functions emulator isn't available. Use `test.fixme` annotation with a comment if the Cloud Function hasn't been deployed to the emulator yet
- **GOTCHA**: Querying callHistory via REST: the response format is `{ documents: [{ fields: { ... } }] }` — parse the Firestore REST value types (`stringValue`, `integerValue`, `timestampValue`)
- **GOTCHA**: There may be a small delay between the hangup and the `writeCallHistoryEntry` completing — use `expect.poll()` or retry the REST query a few times
- **VALIDATE**: `pnpm test:e2e:emulators e2e/call-history-write.spec.ts`

### Task 29: UPDATE `docs/references/e2e-emulator-testing.md` — Document new E2E test suites

- **IMPLEMENT**: Add documentation for the 3 new E2E test suites under the "Test suites" section:

  ```markdown
  ### `Call History (emulators)` — 5 tests

  Pre-seeded with an elderly user doc and callHistory entries. Verifies:

  - Empty state shows "No calls yet"
  - Call history entries render with correct outcome badges (completed/missed/declined)
  - Missed calls have red background indicator
  - Tapping an entry navigates to CallScreen
  - "Show more" pagination after 20 entries
  - Navigation between HomeScreen and CallHistory screen

  ### `Auto-Rejoin on Disconnect (emulators)` — 5 tests

  Pre-seeded with an elderly user doc, contact, and activeCall doc. Verifies:

  - Rejoin prompt appears when active call exists (within 5 minutes)
  - Clicking rejoin navigates to CallScreen
  - Dismiss clears the prompt
  - No prompt for stale calls (>5 minutes old)
  - No prompt when no activeCall document exists

  ### `Call history writing (emulators)` — 2 tests

  Verifies end-to-end that call history entries are written to Firestore:

  - Completing a call writes an entry with outcome 'completed' and direction 'outgoing'
  - Declining an incoming call writes an entry via Cloud Function (requires Functions emulator)
  ```

- **PATTERN**: Follow existing documentation style in `docs/references/e2e-emulator-testing.md:102-131`
- **VALIDATE**: Visual inspection

---

## TESTING STRATEGY

### Unit Tests

Every new file gets a co-located `.test.tsx` / `.test.ts`:

- `formatDuration` / `formatDateTime` — pure function tests with various inputs
- `createMockCallHistoryEntry` — verify factory produces valid objects
- `callHistory` service — mock Firestore, verify correct queries/writes
- `useActiveCall` hook — mock Firestore `getDoc`, test age filtering and dismiss
- `RejoinPrompt` — render tests, timeout tests (fake timers), accessibility
- `CallHistory` — render tests, pagination, empty state, outcome badges, accessibility
- `CallScreen` updates — verify `setActiveCall`/`clearActiveCall`/`beforeunload`/`writeCallHistoryEntry`
- `HomeScreen` updates — verify rejoin prompt and history button
- `onCallStatusChange` Cloud Function — verify missed/declined calls write history entries (in `functions/` vitest)

### Integration Patterns

- Use `renderWithProviders` for all component tests (wraps in MemoryRouter)
- Use `vi.mock()` with selector pattern for Zustand stores
- Use `vi.useFakeTimers()` for timeout-related tests (RejoinPrompt 30s, etc.)
- Use `axe(container)` for accessibility checks on every component

### E2E Tests (Playwright + Firebase Emulators)

Three new E2E spec files, all following the established emulator pattern:

- `e2e/call-history.spec.ts` — Call history screen: empty state, entries with badges, pagination, navigation
- `e2e/auto-rejoin.spec.ts` — Auto-rejoin: prompt appears/dismissed, stale call ignored, rejoin navigates to call
- `e2e/call-history-write.spec.ts` — Verifies Firestore `callHistory` entries are created after completing a call and after declining an incoming call
- All use: `mode: 'serial'`, `workers: 1`, Chromium-only, auth intercept, Firestore REST seeding with `Authorization: Bearer owner`

### Edge Cases

- Active call older than 5 minutes -> no rejoin prompt
- Active call with status 'ended' -> no rejoin prompt
- No activeCall document -> no prompt
- Empty call history -> "No calls yet" message
- Exactly 20 entries -> "Show more" appears
- Fewer than 20 entries -> no "Show more"
- Call history entry with zero duration -> shows "0s"
- Contact name is empty string -> shows "?" as initial

---

## VALIDATION COMMANDS

### Level 1: Syntax & Style

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm format:check
```

### Level 2: Unit Tests

```bash
pnpm test
```

### Level 3: Specific Feature Tests

```bash
pnpm exec vitest run src/utils/formatTime.test.ts
pnpm exec vitest run src/services/callHistory.test.ts
pnpm exec vitest run src/hooks/useActiveCall.test.ts
pnpm exec vitest run src/components/elderly/RejoinPrompt.test.tsx
pnpm exec vitest run src/components/elderly/CallHistory.test.tsx
pnpm exec vitest run src/components/elderly/CallScreen.test.tsx
pnpm exec vitest run src/components/elderly/HomeScreen.test.tsx
pnpm exec vitest run src/App.test.tsx
```

### Level 4: Cloud Functions Tests

```bash
cd functions && pnpm test
```

### Level 5: Build Verification

```bash
pnpm build
cd functions && pnpm run build
```

### Level 6: E2E Tests (requires Firebase emulators)

```bash
# Terminal 1: start emulators
firebase emulators:start --only auth,firestore

# Terminal 2: run E2E tests
pnpm test:e2e:emulators e2e/call-history.spec.ts
pnpm test:e2e:emulators e2e/auto-rejoin.spec.ts
pnpm test:e2e:emulators e2e/call-history-write.spec.ts
```

### Level 7: Manual Validation

- Start dev server (`pnpm dev`)
- Navigate to `/elderly` — verify history button visible
- Navigate to `/elderly/history` — verify empty state
- Start a call — verify `beforeunload` fires on close attempt
- Refresh during call — verify rejoin prompt appears
- Wait 30s on rejoin prompt — verify auto-dismiss

---

## ACCEPTANCE CRITERIA

### Task 3.1.1: Auto-Rejoin on Disconnect

- [ ] AC-10.1: Active call detected on page load -> rejoin prompt shown
- [ ] AC-10.2: Rejoin button is >=72px green
- [ ] AC-10.3: Auto-dismiss after 30 seconds, call marked ended
- [ ] AC-10.4: beforeunload event fires during active calls

### Task 3.2.1: Call History Screen

- [ ] AC-9.1: Shows last 30 days of calls
- [ ] AC-9.2: Each entry has photo/initial, name, date/time, duration, outcome badge
- [ ] AC-9.3: Missed calls highlighted with red indicator (`bg-error/10`)
- [ ] AC-9.4: Tapping entry initiates call (navigates to `/call/{contactId}`)
- [ ] AC-9.5: "Show more" after 20 entries
- [ ] Empty state shows "No calls yet" message

### Backfill: Call History Writing (from 2.1.3 AC-4.8)

- [ ] CallScreen writes a `callHistory` entry on hangup with contactId, contactName, direction, outcome, duration
- [ ] CallScreen writes a `callHistory` entry on readyToClose / participantLeft auto-navigate
- [ ] Double-write guard prevents duplicate entries per call session
- [ ] `firestore.indexes.json` includes callHistory index entry
- [ ] Cloud Function `onCallStatusChange` writes callHistory for missed/declined incoming calls
- [ ] Cloud Function tests pass (`cd functions && pnpm test`)
- [ ] E2E tests pass for call history, auto-rejoin, and history writing flows
- [ ] E2E documentation updated in `docs/references/e2e-emulator-testing.md`

### Security

- [ ] `callHistory` Firestore rules validate field names, types, enums, and `startedAt <= request.time`
- [ ] `callHistory` is immutable from client (no update, no delete)
- [ ] `activeCall/current` Firestore rules validate field names and `status` enum
- [ ] Cloud Function truncates caller-supplied `callerName` to 100 chars
- [ ] Stale `activeCall` docs are cleaned up by `useActiveCall` hook on discovery

### General

- [ ] All validation commands pass with zero errors
- [ ] All new files have co-located test files
- [ ] All new components pass vitest-axe accessibility checks
- [ ] Touch targets >=56px on all interactive elements
- [ ] No regressions in existing 255 unit tests
- [ ] TypeScript strict mode — no type errors
- [ ] Lint clean, format clean

---

## COMPLETION CHECKLIST

- [ ] All 29 tasks completed in order
- [ ] Each task validation passed immediately
- [ ] All validation commands executed successfully
- [ ] Full test suite passes (`pnpm test`)
- [ ] No linting or type checking errors (`pnpm lint && pnpm exec tsc --noEmit`)
- [ ] Build succeeds (`pnpm build`)
- [ ] Acceptance criteria all met
- [ ] Code reviewed for quality and maintainability

---

## NOTES

### Design Decisions

1. **ActiveCall vs extending IncomingCall:** Using a separate `activeCall/current` Firestore doc rather than extending the `incomingCall` system. The incomingCall is for signaling (caller->callee), while activeCall is self-tracking (callee tracks their own call state for rejoin). Separate concerns, separate docs.

2. **Pagination approach:** Using Firestore cursor-based pagination (`startAfter`) rather than offset-based. This is the Firestore-recommended approach and avoids reading skipped documents.

3. **Call history photos:** The `callHistory` subcollection stores `contactName` but not `contactPhotoURL`. We use initials circles. If photos are needed later, they can be resolved by joining against the contacts subcollection, but this is unnecessary complexity for now.

4. **30-day filter:** Applied server-side via Firestore `where('startedAt', '>=', thirtyDaysAgo)` to avoid transferring old data.

5. **beforeunload:** Modern browsers ignore custom messages and show a generic prompt. We just need `e.preventDefault()` to trigger it.

### Risks

- **Call history writer (RESOLVED):** The PRD (task 2.1.3, AC-4.8) specified that call history should be written on call end, but this was not implemented in Phase 2. This plan uses a hybrid approach:
  - **Client-side** (Tasks 16-17): CallScreen writes `callHistory` for completed calls — only the client has accurate duration from Jitsi API events.
  - **Server-side** (Tasks 18-19): Cloud Function `onCallStatusChange` writes `callHistory` for missed/declined incoming calls — these never reach CallScreen so the client can't write them.

- **Firestore index (RESOLVED):** Task 9 adds the index entry to `firestore.indexes.json`. Note: a single-field `orderBy` + range filter on the same field (`startedAt`) uses Firestore's auto-created single-field index, so this will work even without an explicit composite index. The explicit entry is for documentation and deploy consistency.

- **activeCall Firestore rules (RESOLVED):** Task 8a adds validated rules for `activeCall/current` (field validation, status enum constraint, owner-only access).

- **callHistory field validation (RESOLVED):** Task 8b hardens callHistory rules with `keys().hasOnly()`, `keys().hasAll()`, enum validation for `direction`/`outcome`, integer check on `duration`, and `startedAt <= request.time` to prevent future-dated records. Records are immutable (`update: false`, `delete: false`) to prevent tampering.

- **Caller-supplied data in Cloud Function (RESOLVED):** Task 18 truncates `callerName` to 100 chars before writing to callHistory, preventing storage bloat from malicious callers.

- **Stale activeCall cleanup (RESOLVED):** Task 10 (`useActiveCall` hook) deletes stale/ended `activeCall` docs when it discovers them, handling the case where `beforeunload` didn't fire (mobile kill, force-close, crash).
