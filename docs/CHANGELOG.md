# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Billing Alert System**
  - Budget monitoring with automated billing cutoff via Cloud Function (`onBillingAlert`)
  - Google Cloud budget (20 ILS/month) with Pub/Sub alerts at 60%, 90%, 100% thresholds
  - Cloud Function writes billing alert state to `config/billingAlert` Firestore document at all thresholds
  - Race guard: only overwrites if new threshold >= current (prevents out-of-order Pub/Sub downgrades)
  - Automatic billing disable at 100% threshold via Cloud Billing API
  - `useBillingAlert` hook with real-time `onSnapshot` listener and per-threshold localStorage dismiss
  - `BillingAlertBanner` component on caregiver dashboard with severity-based styling (warning/error/critical)
  - Firestore security rule for `config/billingAlert` (public read, Cloud Functions write only)
  - Localized in all 5 locales (en, es, he, ru, de)
- **Phase 2: Notifications, Incoming Calls & Pairing**
  - FCM push notifications with custom service worker (injectManifest strategy)
  - Incoming call detection via Firestore `onSnapshot` with 60s stale-call filtering
  - Full-screen IncomingCallScreen overlay with answer/decline and ringtone audio
  - 6-digit pairing code flow with 10-minute TTL and countdown timer
  - Admin pairing form (`PairElderlyUser`) with Cloud Function validation
  - Admin settings management (`ElderlyUserSettings`) with real-time sync
  - Multi-step OnboardingFlow with permission requests and role-dependent pairing
  - callStore (Zustand) for incoming call state management
  - callSignaling service (initiateCall, declineCall, validatePairingCode, incomingCallRef)
  - usePushNotifications, useIncomingCall, usePairingCode hooks
  - EasyCallButton `type` prop (button/submit)
  - DEFAULT_USER_SETTINGS exported from types/user.ts
  - E2E test for incoming call flow (incoming-call.spec.ts)
- Accessibility testing with vitest-axe (toHaveNoViolations matcher)
- API mocking with MSW v2 (Firestore request handlers)
- Playwright E2E testing (Chromium + WebKit) with smoke tests
- MockJitsiMeetExternalAPI for unit testing Jitsi integration
- Test helpers: renderWithProviders, createMockUser, createMockContact
- TypeScript types for User, Contact, and JitsiMeetExternalAPI
- Coverage thresholds (80% lines/functions/statements, 75% branches)

### Changed

- PWA strategy switched from `registerType: 'autoUpdate'` to `injectManifest` for custom FCM service worker
- Playwright emulator tests now run with `workers: 1` to prevent `clearEmulators()` race conditions
- Smoke test selector updated for DaisyUI `.loading` class compatibility

### Fixed

- CallScreen.tsx: destructure `jitsiRoomId` before async closure to fix TS narrowing loss
- E2E incoming-call test: use emulator auth pre-creation pattern instead of fragile `page.evaluate` import
- E2E smoke test: fixed selector mismatch (`.loading-spinner` → `.loading`)

## [0.1.0] - 2026-02-21

### Added

- Project scaffolding with Vite + React + TypeScript
- Tailwind CSS v4 + DaisyUI v5 with custom high-contrast accessibility theme
- PWA support via vite-plugin-pwa with manifest and service worker
- Vitest + Testing Library test setup
- ESLint (flat config) + Prettier configuration
- Design token CSS custom properties for accessible, low-friction UX
- Folder structure for components, hooks, stores, services, utils, types
- Smoke tests for App component and PWA manifest validation
