import path from 'path'
import { defineConfig } from 'vitest/config'

// Change CWD to repo root for compatibility with piece-loader path resolution
const repoRoot = path.resolve(__dirname, '../../..')
process.chdir(repoRoot)

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // CI runners are resource-constrained enough that a handful of these forks bootstrapping
    // a full app (DB init + 700+-piece sync) concurrently can blow past 60s even though no
    // single test hangs — tool-search.test.ts already found this and bumped its own beforeAll
    // to 300_000; raise the shared default instead of scattering more per-file overrides.
    testTimeout: 120000,
    hookTimeout: 120000,
    pool: 'forks',
    // Turbo already runs several packages' test suites concurrently in CI, so vitest's own
    // fork pool (which otherwise defaults to the detected CPU count) stacks a second layer of
    // parallelism on top and oversubscribes the runner — each api test file boots a full app +
    // 700+-piece sync. Capping to 2 concurrent forks still left two files (app-connection.test.ts,
    // tool-search.test.ts) blowing through the 120s hook/test timeout, so go all the way to a
    // single fork: every file gets the runner's full CPU share, trading suite wall-clock time for
    // not timing out.
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
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
