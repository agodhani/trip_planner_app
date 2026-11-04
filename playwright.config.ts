import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://localhost:3100',
  },
  webServer: {
    command: 'npx next dev -p 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL:
        'postgres://tripplanner:tripplanner@localhost:5434/tripplanner_test',
      APP_URL: 'http://localhost:3100',
      PROVIDER_FIXTURES_DIR: 'tests/fixtures',
      TP_TEST_NOW: '2026-10-30T12:00:00Z',
    },
  },
});
