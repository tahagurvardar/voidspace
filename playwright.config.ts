import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests run against the production build (`next build && next start`).
 *
 * Browser: CI defaults to Playwright's bundled Chromium; local runs default to
 * installed Microsoft Edge (`channel: 'msedge'`). Set PW_CHANNEL=chromium
 * (after `pnpm exec playwright install chromium`) or PW_CHANNEL=chrome to switch.
 * SwiftShader is enabled so WebGL is available even on headless/CI machines.
 */
const PORT = Number(process.env.PW_PORT ?? 3210);
const browserChannel = process.env.PW_CHANNEL ?? (process.env.CI ? 'chromium' : 'msedge');
const channel = browserChannel === 'chromium' ? undefined : browserChannel;
const launchOptions = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // Software WebGL, including two-tab tests, can starve concurrent workers.
  workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  // Generous: WebGL is software-rendered (SwiftShader) in this environment.
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], channel, viewport: { width: 1280, height: 800 }, launchOptions },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], channel, launchOptions },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: { NEXT_TELEMETRY_DISABLED: '1' },
  },
});
