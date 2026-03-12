# EasyCall Project Instructions for Claude Code

## Project Context

EasyCall is a PWA for elderly video calling using Jitsi. See docs/PRD_EasyCall.md for full specs.

## Development Approach

- TDD: Always write tests FIRST, then implement.
- TypeScript strict mode is enabled.
- All components must pass vitest-axe accessibility checks.
- Follow the task list in docs/PRD_EasyCall.md — check off tasks as completed.

## Code Style

- React functional components only (no class components).
- Use Zustand for global state, React Query for server state.
- Tailwind CSS for styling — use DaisyUI component classes where applicable.
- All text must use design tokens from src/styles/tokens.css.
- All touch targets must be ≥56px (use min-h-14 min-w-14 in Tailwind).

## File Structure

```
src/
  components/     # React components
    elderly/      # Elderly-facing UI
    caregiver/    # Caregiver dashboard UI
    shared/       # Shared components (buttons, modals)
  hooks/          # Custom React hooks
  stores/         # Zustand stores
  services/       # Firebase, Jitsi, FCM service layers
  utils/          # Pure utility functions
  test/           # Test setup, mocks, fixtures
  types/          # TypeScript type definitions
```

## Testing Rules

- Every new file in components/, hooks/, stores/, or services/ must have a
  corresponding .test.ts(x) file.
- Test file goes next to the source file: Component.tsx → Component.test.tsx
- Use @testing-library/react for component tests.
- Use MSW for API mocking.
- Mock JitsiMeetExternalAPI using the mock in src/test/mocks/jitsi.ts.
- Run `pnpm test` before committing.

## Key Libraries

- Firebase v12 (modular SDK)
- JitsiMeetExternalAPI (loaded via script tag, not npm)
- vite-plugin-pwa + Workbox
- Zustand v5
- React Router v7

## Environment

- macOS (Apple Silicon)
- Node 20+
- pnpm (package manager)
