import { defineConfig, devices } from '@playwright/test';

const useEmulators = process.env['USE_EMULATORS'] === 'true';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: !useEmulators,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: (process.env['CI'] || useEmulators) ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Pixel 7'],
        permissions: ['camera', 'microphone', 'notifications'],
        launchOptions: {
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
          ],
        },
      },
    },
    {
      name: 'webkit',
      use: { ...devices['iPad Mini'] },
    },
  ],
  webServer: {
    command: useEmulators ? 'VITE_USE_EMULATORS=true pnpm dev' : 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env['CI'],
    env: useEmulators ? { VITE_USE_EMULATORS: 'true' } : {},
  },
});
