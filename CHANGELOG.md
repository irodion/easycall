# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Accessibility testing with vitest-axe (toHaveNoViolations matcher)
- API mocking with MSW v2 (Firestore request handlers)
- Playwright E2E testing (Chromium + WebKit) with smoke tests
- MockJitsiMeetExternalAPI for unit testing Jitsi integration
- Test helpers: renderWithProviders, createMockUser, createMockContact
- TypeScript types for User, Contact, and JitsiMeetExternalAPI
- Coverage thresholds (80% lines/functions/statements, 75% branches)

## [0.1.0] - 2026-02-21

### Added

- Project scaffolding with Vite + React + TypeScript
- Tailwind CSS v4 + DaisyUI v5 with custom "elderly" high-contrast theme
- PWA support via vite-plugin-pwa with manifest and service worker
- Vitest + Testing Library test setup
- ESLint (flat config) + Prettier configuration
- Design token CSS custom properties for elderly-friendly UX
- Folder structure for components, hooks, stores, services, utils, types
- Smoke tests for App component and PWA manifest validation
