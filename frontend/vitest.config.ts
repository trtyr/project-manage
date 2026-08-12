import { defineConfig } from 'vitest/config'

// Pure-logic tests run in the Node environment. Component / DOM tests would
// switch `environment` to 'jsdom' here and reuse the react() plugin already
// declared in vite.config.ts (vitest loads both files and merges them).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
  },
})
