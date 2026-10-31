import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './scripts/dev', testMatch: 'live-scan.spec.ts', use: { baseURL: 'http://localhost:3030' }, timeout: 300000 });
