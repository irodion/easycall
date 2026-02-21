# EasyCall

Elderly-friendly video calling PWA built with Jitsi.

## Tech Stack

- **Framework:** React 19 + TypeScript (strict mode)
- **Build:** Vite 7
- **Styling:** Tailwind CSS v4 + DaisyUI v5 (custom "elderly" high-contrast theme)
- **State:** Zustand v5
- **Routing:** React Router v7
- **PWA:** vite-plugin-pwa + Workbox
- **Testing:** Vitest + Testing Library
- **Linting:** ESLint (flat config) + Prettier

## Getting Started

```bash
pnpm install
pnpm dev        # Start dev server at localhost:5173
pnpm test       # Run tests
pnpm build      # Production build
pnpm preview    # Preview production build
```

## Scripts

| Command             | Description                   |
| ------------------- | ----------------------------- |
| `pnpm dev`          | Start development server      |
| `pnpm build`        | Type check + production build |
| `pnpm preview`      | Preview production build      |
| `pnpm test`         | Run tests once                |
| `pnpm test:watch`   | Run tests in watch mode       |
| `pnpm lint`         | Run ESLint                    |
| `pnpm lint:fix`     | Run ESLint with auto-fix      |
| `pnpm format`       | Format code with Prettier     |
| `pnpm format:check` | Check formatting              |

## Project Structure

```
src/
  components/
    elderly/      # Elderly-facing UI components
    caregiver/    # Caregiver dashboard UI
    shared/       # Shared components (buttons, modals)
  hooks/          # Custom React hooks
  stores/         # Zustand state stores
  services/       # Firebase, Jitsi, FCM service layers
  utils/          # Pure utility functions
  test/           # Test setup and fixtures
  types/          # TypeScript type definitions
  styles/         # Design tokens and CSS
```
