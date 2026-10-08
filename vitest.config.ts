import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Command tests change the working directory, which needs child processes, not worker threads.
    pool: 'forks',
    setupFiles: ['test/setup.ts'],
    testTimeout: 30000,
  },
})
