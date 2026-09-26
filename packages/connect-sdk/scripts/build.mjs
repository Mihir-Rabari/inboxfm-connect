import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)

rmSync(new URL('../dist/', import.meta.url), { recursive: true, force: true })

execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.lib.json'], {
    cwd: new URL('../', import.meta.url),
    stdio: 'inherit',
})

for (const output of [
    { format: 'cjs', outfile: 'dist/index.cjs' },
    { format: 'esm', outfile: 'dist/index.mjs' },
]) {
    await build({
        entryPoints: ['src/index.ts'],
        bundle: true,
        platform: 'neutral',
        target: 'es2022',
        sourcemap: false,
        packages: 'external',
        ...output,
    })
}
