# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Context

EasyCall is a PWA for elderly video calling using Jitsi. Two user roles: **elderly** (simplified call UI) and **caregiver** (dashboard to manage contacts/settings for elderly users). See `docs/PRD_EasyCall.md` for full specs and task list — check off tasks as completed.

## Commands

```bash
pnpm dev                    # Start dev server (localhost:5173)
pnpm build                  # TypeScript check + Vite build
pnpm test                   # Run all unit tests (vitest)
pnpm test:watch             # Watch mode
pnpm test -- src/hooks/usePresence.test.ts  # Run a single test file
pnpm test:coverage          # Coverage report (thresholds: 80% lines/fns/stmts, 75% branches)
pnpm lint                   # ESLint (flat config)
pnpm lint:fix               # ESLint autofix
pnpm format:check           # Prettier check
pnpm security               # Semgrep security scan
pnpm security:deps          # vet dependency vulnerability scan (slow ~3min, on-demand)

# E2E (Playwright)
pnpm test:e2e               # All E2E tests (Chromium + WebKit)
pnpm test:e2e:emulators     # E2E with Firebase Emulators (Chromium only, serial)
# Emulator E2E requires: firebase emulators:start --only auth,firestore (separate terminal, needs Java 21+)
```

## Pre-commit Hook

The hook (`scripts/hooks/pre-commit`) blocks direct commits to `main`, runs semgrep, then `pnpm test`. All merges go through GitHub PRs — never merge locally.

## Development Approach

- **TDD**: Write tests FIRST, then implement.
- TypeScript strict mode with `noUncheckedIndexedAccess`.
- All components must pass vitest-axe accessibility checks.
- All touch targets ≥ 56px (`min-h-14 min-w-14`).

## Architecture

### Routing & Auth

`App.tsx` wraps everything in `BrowserRouter` → `AuthenticatedApp`. Auth state comes from `onAuthStateChanged` (Firebase Auth). Routes are split by role via `<AuthGuard requiredRole="elderly|caregiver">`. User settings sync in real-time from Firestore via `onSnapshot`. App-level hooks: `useIncomingCall` (call signaling), `usePresence` (online status via RTDB), `useAppLock` (PIN lock).

### State Management

- **Zustand stores** (`src/stores/`): `contactStore` (contacts CRUD + Firestore sync), `callStore` (incoming call state)
- **Firebase services** (`src/services/`): `firebase.ts` (SDK init), `callSignaling.ts` (call initiation/decline via Firestore), `caregiverAuth.ts` (email/password linking), `callHistory.ts`, `jitsi.ts` (API loader)
- **Custom hooks** (`src/hooks/`): media permissions, push notifications, pairing codes, presence, focus traps, app lock, billing alerts

### i18n

5 locales (en, es, he, ru, de) via i18next. English bundled; others lazy-loaded. RTL support for Hebrew. Translation files in `src/locales/{code}/translation.json`.

### PWA

`injectManifest` strategy with custom `src/firebase-messaging-sw.ts` service worker (FCM background notifications + Workbox precaching). Shared manifest in `src/pwa-config.ts`.

### Path Alias

`@/` → `src/` (configured in both `vite.config.ts` and `tsconfig.app.json`).

## Code Style

- React functional components only.
- Zustand for global state, React Query for server state.
- Tailwind CSS v4 + DaisyUI v5 — custom "elderly" theme (`data-theme="elderly"` on `<html>`).
- All text styling via design tokens from `src/styles/tokens.css`.

## Testing Patterns

- Test file goes next to source: `Component.tsx` → `Component.test.tsx`
- `@testing-library/react` for components, MSW v2 for API mocking
- Jitsi mock: `src/test/mocks/jitsi.ts` (sets `window.JitsiMeetExternalAPI`)
- Test helpers in `src/test/helpers.ts`: `renderWithProviders` (MemoryRouter), `createMockUser`, `createMockContact`
- Firebase service tests: use `vi.resetModules()` + `vi.doMock()` per test (top-level init cached by module system)
- Firebase config validation skipped in test mode (`import.meta.env.MODE !== 'test'`)
- jsdom limitation: vitest-axe color-contrast checks go to `incomplete`, not `violations`

## Key Libraries

- Firebase v12 (modular SDK) — Auth, Firestore, RTDB, Cloud Messaging
- JitsiMeetExternalAPI (loaded via script tag, not npm)
- vite-plugin-pwa + Workbox
- Zustand v5, React Router v7, i18next

## Environment

- macOS (Apple Silicon), Node 20+, pnpm
- `semgrep` required for pre-commit hook (`brew install semgrep`)
- `vet` for dependency scanning (`brew install safedep/tap/vet`)
