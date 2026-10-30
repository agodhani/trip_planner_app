import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'server-only': path.resolve(__dirname, 'tests/unit/mocks/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    env: {
      DATABASE_URL:
        'postgres://tripplanner:tripplanner@localhost:5434/tripplanner_test',
    },
  },
});
