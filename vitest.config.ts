import { defineConfig } from 'vitest/config'

// The server suite runs in plain Node; it must not pull in the React plugin or
// the dev-server proxy from vite.config.ts.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts', 'src/**/*.test.ts'],
    hookTimeout: 20_000,
    testTimeout: 20_000,
    pool: 'forks',
  },
})
