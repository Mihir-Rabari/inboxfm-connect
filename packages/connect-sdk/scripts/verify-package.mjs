import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'esbuild'

const packageRoot = new URL('../', import.meta.url)
const temporaryRoot = mkdtempSync(join(tmpdir(), 'connect-sdk-pack-'))
const npmCli = process.env.npm_execpath
assert(npmCli, 'Run this script through npm run pack:verify')
const node = process.execPath
const require = createRequire(import.meta.url)

try {
    const packed = JSON.parse(execFileSync(node, [npmCli,
        'pack', '--json', '--ignore-scripts', '--pack-destination', temporaryRoot,
    ], { cwd: packageRoot, encoding: 'utf8' }))
    const archive = Array.isArray(packed) ? packed[0] : packed['@inboxfm-connect/sdk']
    assert(archive, 'npm pack did not report the SDK archive')
    const paths = archive.files.map((file) => file.path)
    const expected = ['package.json', 'README.md', 'CHANGELOG.md', 'LICENSE', 'dist/index.cjs', 'dist/index.mjs', 'dist/index.d.ts']
    for (const path of expected) {
        assert(paths.includes(path), `Missing package file: ${path}`)
    }
    for (const path of paths) {
        assert(
            expected.includes(path) || /^dist\/[\w/-]+\.d\.ts$/.test(path),
            `Unexpected package file: ${path}`,
        )
    }

    const consumer = join(temporaryRoot, 'consumer')
    const { mkdirSync } = await import('node:fs')
    mkdirSync(consumer)
    writeFileSync(join(consumer, 'package.json'), '{"private":true,"type":"module"}\n')
    execFileSync(node, [npmCli,
        'install', '--ignore-scripts', '--no-audit', '--no-fund', join(temporaryRoot, archive.filename),
    ], { cwd: consumer, stdio: 'inherit' })

    const installedPackage = JSON.parse(readFileSync(join(consumer, 'node_modules/@inboxfm-connect/sdk/package.json'), 'utf8'))
    assert.equal(installedPackage.version, archive.version)
    writeFileSync(join(consumer, 'smoke.mjs'), readFileSync(new URL('../test/consumer-smoke.mjs', import.meta.url)))
    execFileSync(node, ['smoke.mjs'], { cwd: consumer, stdio: 'inherit' })
    writeFileSync(join(consumer, 'smoke.mts'), "import { InboxFM } from '@inboxfm-connect/sdk'\nconst Client: typeof InboxFM = InboxFM\nvoid Client\n")
    writeFileSync(join(consumer, 'smoke.cts'), "import sdk = require('@inboxfm-connect/sdk')\nconst Client: typeof sdk.InboxFM = sdk.InboxFM\nvoid Client\n")
    execFileSync(node, [require.resolve('typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2022', 'smoke.mts', 'smoke.cts'], { cwd: consumer, stdio: 'inherit' })
    writeFileSync(join(consumer, 'browser.mjs'), "import { InboxFM } from '@inboxfm-connect/sdk'\nwindow.InboxFM = InboxFM\n")
    await build({ entryPoints: [join(consumer, 'browser.mjs')], bundle: true, platform: 'browser', format: 'esm', write: false })
    if (process.env.CONNECT_SDK_SMOKE_BASE_URL) {
        writeFileSync(join(consumer, 'live-smoke.mjs'), readFileSync(new URL('../test/live-smoke.mjs', import.meta.url)))
        execFileSync(node, ['live-smoke.mjs'], { cwd: consumer, stdio: 'inherit' })
    }
    console.log(`Verified ${archive.name}@${archive.version} (${paths.length} intended files)`)
}
finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
}
