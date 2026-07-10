import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    include: [path.resolve(__dirname, 'test/**/*.test.ts').replaceAll('\\', '/')],
    exclude: [path.resolve(__dirname, 'test/e2e/**').replaceAll('\\', '/')],
  },
  resolve: {
    alias: {
      '@inboxfm-connect/shared': path.resolve(__dirname, '../../../packages/core/shared/src/index.ts'),
      '@inboxfm-connect/server-utils': path.resolve(__dirname, '../../../packages/server/utils/src/index.ts'),
      '@inboxfm-connect/core-utils': path.resolve(__dirname, '../../../packages/core/utils/src/index.ts'),
    },
  },
})
