import path from 'path'
import { defineConfig } from 'vitest/config'

// Change CWD to repo root for compatibility with piece-loader path resolution
const repoRoot = path.resolve(__dirname, '../../..')
process.chdir(repoRoot)

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 60000,
    hookTimeout: 60000,
    pool: 'forks',
    setupFiles: [path.resolve(__dirname, 'vitest.setup.ts').replaceAll('\\', '/')],
    include: [path.resolve(__dirname, 'test/**/*.test.ts').replaceAll('\\', '/')],
  },
  resolve: {
    alias: {
      'isolated-vm': path.resolve(__dirname, '__mocks__/isolated-vm.js'),
      '@inboxfm-connect/shared': path.resolve(__dirname, '../../../packages/core/shared/src/index.ts'),
      '@inboxfm-connect/pieces-framework': path.resolve(__dirname, '../../../packages/integrations/framework/src/index.ts'),
      '@inboxfm-connect/pieces-common': path.resolve(__dirname, '../../../packages/integrations/common/src/index.ts'),
      '@inboxfm-connect/server-utils': path.resolve(__dirname, '../../../packages/server/utils/src/index.ts'),

    },
  },
})
