# Feature: Optional PIN Lock (Task 3.3.1)

The following plan should be complete, but validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils, types, and models. Import from the right files.

## Feature Description

Create an AppLock component that, when enabled by the caregiver, requires a 4-digit PIN before showing the app content. The caregiver enables/disables the lock and sets the PIN from their dashboard. Lock engages when the app is opened or after 5 minutes of inactivity. Incoming call notifications bypass the lock screen. 3 failed PIN attempts trigger a 30-second cooldown.

## User Story

As an elderly user's caregiver
I want to enable a PIN lock on the elderly user's app
So that unauthorized people (children, strangers) cannot access the calling app on the elderly user's device

## Problem Statement

The elderly user's device may be accessible to others (grandchildren, visitors). Without a lock, anyone could make calls or modify settings. A simple PIN lock provides basic access control without adding complexity.

## Solution Statement

Add an `AppLock` component that wraps the authenticated app content. Lock settings (enabled, PIN hash) are stored in Firestore as part of `UserSettings`, managed by the caregiver. The lock engages on app open and after 5 minutes of inactivity. The `IncomingCallScreen` renders above the lock (it already uses `z-50` and is driven by `callStore`).

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: Medium
**Primary Systems Affected**: `UserSettings` type, `App.tsx` (wrapper), `ElderlyUserSettings` (caregiver dashboard), new `AppLock` component + `useAppLock` hook
**Dependencies**: Task 2.3.1 (Caregiver Settings) and Task 2.1.3 (Incoming Call UI) — both completed

---

## CONTEXT REFERENCES

### Relevant Codebase Files — YOU MUST READ THESE BEFORE IMPLEMENTING

- `src/types/user.ts` (lines 20-32) — `UserSettings` interface and `DEFAULT_USER_SETTINGS`. You will extend these with lock fields.
- `src/App.tsx` (lines 43-96) — `AuthenticatedApp` component. The `AppLock` wrapper goes here, wrapping `<Routes>` but NOT `<IncomingCallScreen>`.
- `src/stores/callStore.ts` (lines 1-26) — `useCallStore` with `isRinging`. Used to detect incoming call state (bypass lock).
- `src/components/elderly/IncomingCallScreen.tsx` (lines 1-98) — Renders as a `fixed inset-0 z-50` overlay. Already above everything. Lock screen must NOT block this.
- `src/components/caregiver/ElderlyUserSettings.tsx` (lines 1-90) — Caregiver settings panel. You will add lock enable/disable toggle and PIN setup here.
- `src/components/caregiver/ElderlyUserSettings.test.tsx` (lines 1-99) — Test pattern for caregiver settings (onSnapshot mock, `renderAndEmit` helper).
- `src/components/shared/AuthGuard.tsx` (lines 1-72) — Auth flow pattern. AppLock is a separate concern (post-auth, pre-content).
- `src/components/shared/EasyCallButton.tsx` (lines 1-47) — Button component with variant/size props. Use for PIN keypad buttons.
- `src/styles/tokens.css` (lines 1-41) — Design tokens. Use `--touch-min: 56px` for PIN buttons, `--text-display` for PIN digits.
- `src/test/helpers/render.tsx` (lines 1-18) — `renderWithProviders` test helper.
- `src/test/helpers/factories.ts` (lines 1-71) — `createMockUser` factory. Update to include new lock settings defaults.
- `firestore.rules` (lines 10-12) — User doc read/write rules.

### IMPORTANT: Firestore Rules Consideration

The current rule `allow read, write: if request.auth.uid == userId` on `/users/{userId}` means only the user themselves can write their own doc. Caregivers currently write settings via `updateDoc(doc(db, 'users', elderlyUserId), { settings: updated })` in `ElderlyUserSettings.tsx`. **This will fail** because the caregiver's UID ≠ elderlyUserId.

Looking at `ElderlyUserSettings.tsx` line 42: `updateDoc(ref, { settings: updated })` — this is called by the caregiver. Either:

1. This is a pre-existing bug that hasn't been caught yet (caregiver settings writes silently fail, but optimistic UI makes it look like it works), OR
2. There's something else going on.

**For this plan, assume caregiver writes to user settings work** (the existing `ElderlyUserSettings` component already does this). If they don't, that's a separate bug to fix. The Firestore rule may need updating to:

```
allow update: if request.auth.uid == userId || isCaregiverOf(userId, request.auth.uid);
```

But that's out of scope — flag it if encountered during implementation.

### New Files to Create

- `src/components/shared/AppLock.tsx` — Lock screen component (PIN keypad)
- `src/components/shared/AppLock.test.tsx` — Unit tests for AppLock
- `src/hooks/useAppLock.ts` — Hook managing lock state, inactivity timer, PIN verification
- `src/hooks/useAppLock.test.ts` — Unit tests for useAppLock
- `src/utils/pinHash.ts` — PIN hashing utility (SHA-256)
- `src/utils/pinHash.test.ts` — Tests for PIN hashing

### Relevant Documentation — READ BEFORE IMPLEMENTING

- [SubtleCrypto.digest() - MDN](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest)
  - SHA-256 hashing for PIN storage
  - Why: PIN hash stored in Firestore, verified on client

### Patterns to Follow

**Component Pattern** (from `IncomingCallScreen.tsx`):

- Full-screen overlay: `fixed inset-0 z-40` (use z-40, below IncomingCallScreen's z-50)
- Design tokens: `text-[length:var(--text-display)]`, `gap-[var(--space-lg)]`, `p-[var(--space-md)]`
- Touch targets: `min-h-14 min-w-14` (≥56px)

**Test Pattern** (from `ElderlyUserSettings.test.tsx`):

- Mock firebase/firestore with `vi.mock()`
- Capture onSnapshot callback for reactive data
- Use `renderWithProviders` + `act()` for state updates
- Always include vitest-axe accessibility test

**Settings Update Pattern** (from `ElderlyUserSettings.tsx`):

- Optimistic UI: update local state immediately, revert on error
- `updateDoc(ref, { settings: updated })` for Firestore writes

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation (Types + Utilities)

Extend `UserSettings` with lock fields. Create PIN hashing utility. These are pure functions with no UI dependencies.

### Phase 2: Core Lock Hook

Create `useAppLock` hook that manages: locked/unlocked state, inactivity timer (5 min), PIN verification, failed attempts + cooldown tracking.

### Phase 3: Lock Screen UI

Create `AppLock` component with: 4-digit PIN keypad (large buttons), error/cooldown states. Elderly-friendly: large text, high contrast, simple layout.

### Phase 4: Caregiver Dashboard Integration

Extend `ElderlyUserSettings` with: lock enable/disable toggle, PIN setup (4-digit input with confirmation).

### Phase 5: App Integration

Wrap app content in `App.tsx` with `AppLock`. Ensure `IncomingCallScreen` renders outside/above the lock.

### Phase 6: Testing & Validation

Unit tests for all new files. Update existing tests affected by type changes.

---

## STEP-BY-STEP TASKS

### Task 1: UPDATE `src/types/user.ts` — Extend UserSettings

- **IMPLEMENT**: Add lock-related fields to `UserSettings` interface:
  ```typescript
  appLockEnabled: boolean;
  appLockPinHash: string | null; // SHA-256 hex hash, set by caregiver
  ```
- **IMPLEMENT**: Update `DEFAULT_USER_SETTINGS`:
  ```typescript
  appLockEnabled: false,
  appLockPinHash: null,
  ```
- **GOTCHA**: All existing code that spreads `UserSettings` must still work. These are additive fields with defaults.
- **VALIDATE**: `pnpm tsc --noEmit`

### Task 2: UPDATE `src/test/helpers/factories.ts` — Update createMockUser

- **IMPLEMENT**: Add new default settings fields to the mock user factory so existing tests don't break.
- **PATTERN**: `src/test/helpers/factories.ts:28-33` — existing settings object in factory
- **VALIDATE**: `pnpm test -- --run`

### Task 3: CREATE `src/utils/pinHash.ts` — PIN Hashing Utility

- **IMPLEMENT**: Two functions:

  ```typescript
  export async function hashPin(pin: string): Promise<string>;
  // Uses crypto.subtle.digest('SHA-256', ...) with a fixed app-level salt
  // Returns hex string

  export async function verifyPin(pin: string, storedHash: string): Promise<boolean>;
  // Hashes input and compares to storedHash
  ```

- **IMPORTS**: No external deps — uses Web Crypto API (`crypto.subtle`)
- **GOTCHA**: `crypto.subtle` is available in jsdom (via Node's webcrypto). If not, use `globalThis.crypto.subtle` or polyfill in test setup.
- **GOTCHA**: Use a static salt (e.g., `'easycall-pin-v1'`) — this is a basic app lock PIN, not a password. The salt prevents trivial rainbow table lookups but the threat model is "prevent accidental access," not "resist determined attacker."
- **VALIDATE**: `pnpm test -- --run src/utils/pinHash.test.ts`

### Task 4: CREATE `src/utils/pinHash.test.ts` — PIN Hash Tests

- **IMPLEMENT**: Tests:
  - `hashPin` returns a consistent hex string for the same input
  - `hashPin` returns different hashes for different PINs
  - `verifyPin` returns true for correct PIN
  - `verifyPin` returns false for wrong PIN
  - Hash output is 64 chars (SHA-256 hex)
- **PATTERN**: `src/utils/formatTime.test.ts` — simple utility test pattern
- **VALIDATE**: `pnpm test -- --run src/utils/pinHash.test.ts`

### Task 5: CREATE `src/hooks/useAppLock.ts` — Lock State Hook

- **IMPLEMENT**: Hook signature:

  ```typescript
  interface UseAppLockOptions {
    userId: string | null;
    settings: UserSettings;
  }

  interface UseAppLockReturn {
    isLocked: boolean;
    failedAttempts: number;
    cooldownRemaining: number; // seconds, 0 = no cooldown
    unlockWithPin: (pin: string) => Promise<boolean>;
  }

  export function useAppLock({ userId, settings }: UseAppLockOptions): UseAppLockReturn;
  ```

- **IMPLEMENT**: Lock logic:
  1. If `settings.appLockEnabled` is false OR `settings.appLockPinHash` is null, `isLocked` is always false (early return).
  2. On mount (or when `appLockEnabled` becomes true), set `isLocked = true`.
  3. **Inactivity timer**: Track last interaction via `document` event listeners (`pointerdown`, `keydown`). After 5 minutes of no activity, set `isLocked = true`. Use a `useRef` for the timeout ID. Clear and restart on each interaction. Only run when unlocked.
  4. **PIN verification**: Call `verifyPin(pin, settings.appLockPinHash)`. On success, set `isLocked = false`, reset `failedAttempts`. On failure, increment `failedAttempts`. If `failedAttempts >= 3`, start 30-second cooldown.
  5. **Cooldown**: Use `setInterval` to decrement `cooldownRemaining` every second. During cooldown, `unlockWithPin` is a no-op returning false.
  6. **Visibility change**: Listen to `document.visibilitychange`. When page becomes hidden, record the timestamp. When visible again, if ≥5 min elapsed, lock.
- **GOTCHA**: Don't lock during an active call (check if current path includes `/call/`). Use `useLocation()` from react-router.
- **GOTCHA**: Clean up all timers and event listeners in the effect cleanup.
- **GOTCHA**: When `appLockEnabled` changes from true→false (caregiver disables remotely), unlock immediately.
- **IMPORTS**: `verifyPin` from `@/utils/pinHash`, `useState`/`useEffect`/`useRef`/`useCallback` from react, `useLocation` from react-router.
- **VALIDATE**: `pnpm test -- --run src/hooks/useAppLock.test.ts`

### Task 6: CREATE `src/hooks/useAppLock.test.ts` — Hook Tests

- **IMPLEMENT**: Tests (use `renderHook` from `@testing-library/react`):
  - Returns `isLocked: false` when `appLockEnabled` is false
  - Returns `isLocked: false` when `appLockPinHash` is null (lock enabled but no PIN set)
  - Returns `isLocked: true` on mount when `appLockEnabled` is true and PIN hash is set
  - `unlockWithPin` with correct PIN sets `isLocked: false`
  - `unlockWithPin` with wrong PIN increments `failedAttempts`
  - 3 failed attempts triggers 30-second cooldown
  - During cooldown, `unlockWithPin` returns false without verifying
  - Cooldown decrements each second and resets after 30s
  - Inactivity timer re-locks after 5 minutes (use `vi.useFakeTimers`)
  - Does not lock when on a `/call/` route
  - Unlocks when `appLockEnabled` changes to false
- **PATTERN**: Mock `@/utils/pinHash` with `vi.mock()`. Use `vi.useFakeTimers()` / `vi.advanceTimersByTime()` for timer tests.
- **GOTCHA**: `renderHook` needs a wrapper with `MemoryRouter` for `useLocation`. Use the pattern:
  ```typescript
  const wrapper = ({ children }) => <MemoryRouter initialEntries={['/']}>{children}</MemoryRouter>;
  renderHook(() => useAppLock(options), { wrapper });
  ```
- **VALIDATE**: `pnpm test -- --run src/hooks/useAppLock.test.ts`

### Task 7: CREATE `src/components/shared/AppLock.tsx` — Lock Screen Component

- **IMPLEMENT**: Component that renders a full-screen lock overlay when `isLocked` is true.
  ```typescript
  interface AppLockProps {
    isLocked: boolean;
    failedAttempts: number;
    cooldownRemaining: number;
    onPinSubmit: (pin: string) => Promise<boolean>;
    children: ReactNode;
  }
  ```
- **IMPLEMENT**: UI layout (elderly-friendly):
  1. **Lock overlay**: `fixed inset-0 z-40 bg-base-100` (below IncomingCallScreen's z-50)
  2. **Title**: "Enter PIN to unlock" — `text-[length:var(--text-heading)]`
  3. **PIN display**: 4 dots/circles showing entered digits (filled = entered, empty = remaining). Use `text-[length:var(--text-display)]` for large dots.
  4. **Numeric keypad**: 3×4 grid (1-9, clear, 0, backspace). Each button ≥56px (`min-h-14 min-w-14`). Use plain buttons with DaisyUI `btn` classes + design tokens.
  5. **Error state**: "Wrong PIN" message after failed attempt. Use `text-error` class.
  6. **Cooldown state**: "Too many attempts. Try again in {N}s" message. Disable all input buttons during cooldown.
  7. When 4 digits are entered, auto-submit (call `onPinSubmit`). Clear input on wrong PIN.
- **GOTCHA**: PIN input must NOT use a native `<input type="text">` — use button-driven input to prevent keyboard issues on elderly devices. Store entered digits in local state.
- **GOTCHA**: When `isLocked` is false, render only `children` (no lock overlay).
- **ACCESSIBILITY**: `role="dialog"`, `aria-label="App lock screen"`, `aria-live="polite"` on error region.
- **VALIDATE**: `pnpm test -- --run src/components/shared/AppLock.test.tsx`

### Task 8: CREATE `src/components/shared/AppLock.test.tsx` — Lock Screen Tests

- **IMPLEMENT**: Tests:
  - Renders children when `isLocked` is false
  - Renders lock screen when `isLocked` is true
  - PIN keypad has buttons 0-9, clear, backspace
  - Tapping 4 digits calls `onPinSubmit` with the PIN string
  - Shows "Wrong PIN" after `failedAttempts > 0`
  - Shows cooldown message when `cooldownRemaining > 0`
  - Disables keypad during cooldown
  - Clear button resets entered digits
  - Backspace removes last digit
  - Passes vitest-axe accessibility check
- **PATTERN**: `src/components/shared/ConfirmDialog.test.tsx` — dialog component test pattern
- **VALIDATE**: `pnpm test -- --run src/components/shared/AppLock.test.tsx`

### Task 9: UPDATE `src/components/caregiver/ElderlyUserSettings.tsx` — Add Lock Controls

- **IMPLEMENT**: Add a new `<fieldset>` section below the existing ringtone volume control:
  1. **Lock toggle**: "App Lock" with a DaisyUI `toggle` switch. Maps to `settings.appLockEnabled`.
  2. **PIN setup** (shown only when lock is enabled): Two 4-digit inputs for PIN and confirmation. For the caregiver (tech-savvy), native `<input type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}">` is fine.
  3. **Save PIN button**: Hashes the PIN with `hashPin()` and saves to `settings.appLockPinHash`.
  4. Validation: PIN must be exactly 4 digits. Confirmation must match.
- **IMPORTS**: `hashPin` from `@/utils/pinHash`
- **GOTCHA**: When disabling the lock (`appLockEnabled: false`), also clear `appLockPinHash: null`.
- **PATTERN**: Follow existing `updateSettings` pattern at `ElderlyUserSettings.tsx:37-44`.
- **VALIDATE**: `pnpm test -- --run src/components/caregiver/ElderlyUserSettings.test.tsx`

### Task 10: UPDATE `src/components/caregiver/ElderlyUserSettings.test.tsx` — Add Lock Tests

- **IMPLEMENT**: Additional tests:
  - Lock toggle renders and defaults to off
  - Toggling lock on shows PIN setup fields
  - Toggling lock off calls updateDoc with `appLockEnabled: false, appLockPinHash: null`
  - Setting PIN: entering matching 4-digit PINs and clicking save calls updateDoc with hashed PIN
  - PIN validation: mismatched PINs show error
  - PIN validation: non-4-digit input shows error
- **PATTERN**: Extend existing `renderAndEmit` helper with lock settings
- **VALIDATE**: `pnpm test -- --run src/components/caregiver/ElderlyUserSettings.test.tsx`

### Task 11: UPDATE `src/App.tsx` — Integrate AppLock

- **IMPLEMENT**: In `AuthenticatedApp`:
  1. Import `useAppLock` and `AppLock`.
  2. Call `useAppLock({ userId, settings })` to get lock state.
  3. Wrap the main content with `<AppLock>`, BUT keep `<IncomingCallScreen />` OUTSIDE (rendered after) the `AppLock` wrapper so it always renders on top.
  4. Structure:
     ```tsx
     return (
       <>
         <AppLock
           isLocked={lockState.isLocked}
           failedAttempts={lockState.failedAttempts}
           cooldownRemaining={lockState.cooldownRemaining}
           onPinSubmit={lockState.unlockWithPin}
         >
           <Routes>...</Routes>
           <InstallPrompt />
         </AppLock>
         <IncomingCallScreen />
       </>
     );
     ```
  5. **Add a Firestore listener** for the user's settings so lock settings from the caregiver are picked up in real-time. Add a `useEffect` with `onSnapshot(doc(db, 'users', userId), ...)` to keep `settings` in sync (similar to `ElderlyUserSettings.tsx` pattern).
- **GOTCHA**: Currently `settings` in `AuthenticatedApp` is initialized with `DEFAULT_USER_SETTINGS` and only updated by the elderly SettingsScreen's `onSettingsChange`. For AppLock to work, settings must sync from Firestore.
- **VALIDATE**: `pnpm test -- --run src/App.test.tsx`

### Task 12: UPDATE `src/App.test.tsx` — Update App Tests

- **IMPLEMENT**: Ensure existing tests pass with the new AppLock wrapper. Mock `useAppLock` to return `isLocked: false` by default so existing tests aren't affected.
- **PATTERN**: `vi.mock('@/hooks/useAppLock', () => ({ useAppLock: () => ({ isLocked: false, failedAttempts: 0, cooldownRemaining: 0, unlockWithPin: vi.fn() }) }))`
- **VALIDATE**: `pnpm test -- --run src/App.test.tsx`

---

## TESTING STRATEGY

### Unit Tests

| File                                                    | Key Scenarios                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `src/utils/pinHash.test.ts`                             | Hash consistency, different inputs → different hashes, verify correct/wrong    |
| `src/hooks/useAppLock.test.ts`                          | Lock/unlock lifecycle, PIN flow, cooldown, inactivity timer, call route bypass |
| `src/components/shared/AppLock.test.tsx`                | Render states, keypad interaction, error/cooldown display, a11y                |
| `src/components/caregiver/ElderlyUserSettings.test.tsx` | Lock toggle, PIN setup/validation, Firestore writes                            |

### Integration Tests

The `App.test.tsx` tests serve as integration tests verifying the lock wraps correctly and incoming calls bypass it.

### Edge Cases

- Lock enabled but no PIN hash set → don't lock (nothing to verify against)
- App backgrounded during call → should NOT lock during active call
- Caregiver disables lock while elderly device is locked → unlock on next settings sync
- Cooldown timer persists across lock state changes
- PIN with leading zeros (e.g., "0042") — ensure string comparison, not numeric
- `crypto.subtle` unavailable (HTTP context) — graceful degradation

---

## VALIDATION COMMANDS

### Level 1: Syntax & Style

```bash
pnpm tsc --noEmit
pnpm lint
pnpm format:check
```

### Level 2: Unit Tests

```bash
pnpm test -- --run
```

### Level 3: Specific Test Files

```bash
pnpm test -- --run src/utils/pinHash.test.ts
pnpm test -- --run src/hooks/useAppLock.test.ts
pnpm test -- --run src/components/shared/AppLock.test.tsx
pnpm test -- --run src/components/caregiver/ElderlyUserSettings.test.tsx
pnpm test -- --run src/App.test.tsx
```

### Level 4: Build Verification

```bash
pnpm build
```

### Level 5: Coverage Check

```bash
pnpm test:coverage
```

---

## ACCEPTANCE CRITERIA

- [ ] 4-digit PIN input uses large numeric keypad (≥56px buttons)
- [ ] Lock engages on app open and after 5-minute inactivity
- [ ] Incoming calls bypass the lock screen (IncomingCallScreen renders above AppLock)
- [ ] Caregiver can enable/disable lock and set PIN remotely (via ElderlyUserSettings)
- [ ] 3 failed PIN attempts show 30-second cooldown
- [ ] All new components pass vitest-axe accessibility checks
- [ ] All validation commands pass with zero errors
- [ ] Unit test coverage ≥80% for new code
- [ ] No regressions in existing 255+ tests

---

## COMPLETION CHECKLIST

- [ ] All tasks (1-12) completed in order
- [ ] Each task validation passed
- [ ] Full test suite passes (`pnpm test -- --run`)
- [ ] TypeScript compiles (`pnpm tsc --noEmit`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Build succeeds (`pnpm build`)
- [ ] Coverage thresholds met (`pnpm test:coverage`)

---

## NOTES

### Design Decisions

1. **PIN-only, no WebAuthn/biometric**: Keeps implementation simple and avoids cross-browser/PWA compatibility issues. PIN is sufficient for the threat model (prevent accidental access).

2. **PIN stored as SHA-256 hash in Firestore**: The caregiver sets the PIN, it's hashed client-side before writing to Firestore. The elderly device reads the hash and verifies locally. SHA-256 with a static app salt is sufficient for a 4-digit PIN.

3. **z-index layering**: AppLock uses `z-40`, IncomingCallScreen uses `z-50`. This ensures incoming calls always appear above the lock.

4. **Inactivity timer excluded during calls**: When the route includes `/call/`, the inactivity timer is paused to avoid locking during a video call.

5. **Button-driven PIN keypad**: No native text input — uses on-screen buttons to avoid virtual keyboard issues on elderly devices and provide larger touch targets.

6. **Lock disabled when no PIN hash**: If the caregiver enables the lock but hasn't set a PIN yet, the lock doesn't engage. This prevents locking users out with no way to unlock.

### Risk Areas

- **Firestore rules for caregiver writes**: The existing `ElderlyUserSettings` component writes to the elderly user's doc. If Firestore rules don't allow this, it's a pre-existing issue. Flag during implementation.
- **Settings sync latency**: If the caregiver enables the lock, there's a brief delay before the elderly device receives the settings update via onSnapshot. This is acceptable.
