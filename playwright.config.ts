import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests run against the production build (`next build && next start`).
 *
 * Browser: by default the locally installed Microsoft Edge (Chromium) is used via
 * `channel: 'msedge'`, so no browser download is required. Set PW_CHANNEL=chromium
 * (after `pnpm exec playwright install chromium`) or PW_CHANNEL=chrome to switch.
 * SwiftShader is enabled so WebGL is available even on headless/CI machines.
 */
const PORT = Number(process.env.PW_PORT ?? 3210);
const channel = process.env.PW_CHANNEL === 'chromium' ? undefined : (process.env.PW_CHANNEL ?? 'msedge');
const launchOptions = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // Each worker renders WebGL in software (SwiftShader); more workers starve the CPU.
  workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  // Generous: WebGL is software-rendered (SwiftShader) in this environment.
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
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
