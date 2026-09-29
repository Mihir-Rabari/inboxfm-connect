import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { devPieces } = require('../dev-pieces.js')

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

function fixture(t) {
    const root = mkdtempSync(path.join(os.tmpdir(), 'connect-dev-pieces-'))
    t.after(() => rmSync(root, { recursive: true, force: true }))
    const writePiece = ({ folder, name }) => {
        const dir = path.join(root, 'packages', 'integrations', folder)
        mkdirSync(dir, { recursive: true })
        writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name }))
    }
    return { root, writePiece }
}

test('unset or empty AP_DEV_PIECES resolves to no build filters', () => {
    assert.deepEqual(devPieces.resolveDevPieceFilters({ apDevPieces: undefined }), [])
    assert.deepEqual(devPieces.resolveDevPieceFilters({ apDevPieces: '' }), [])
    assert.deepEqual(devPieces.resolveDevPieceFilters({ apDevPieces: '  ' }), [])
})

test('resolves every requested piece to its package filter', (t) => {
    const { root, writePiece } = fixture(t)
    writePiece({ folder: path.join('community', 'google-sheets'), name: '@inboxfm-connect/piece-google-sheets' })
    writePiece({ folder: path.join('core', 'store'), name: '@inboxfm-connect/piece-store' })

    const filters = devPieces.resolveDevPieceFilters({
        apDevPieces: 'google-sheets,store',
        cwd: root,
    })

    assert.deepEqual(filters, [
        '--filter=@inboxfm-connect/piece-google-sheets',
        '--filter=@inboxfm-connect/piece-store',
    ])
})

test('an unknown piece fails with a clear error naming the piece and search root', (t) => {
    const { root, writePiece } = fixture(t)
    writePiece({ folder: path.join('core', 'store'), name: '@inboxfm-connect/piece-store' })

    assert.throws(
        () => devPieces.resolveDevPieceFilters({ apDevPieces: 'does-not-exist', cwd: root }),
        (error) =>
            error.message.includes('does-not-exist') && error.message.includes(path.join(root, 'packages', 'integrations')),
    )
})

test('a missing packages/integrations root fails with a clear discovery error', (t) => {
    const { root } = fixture(t)

    assert.throws(
        () => devPieces.resolveDevPieceFilters({ apDevPieces: 'store', cwd: root }),
        (error) =>
            error.message.includes('Piece discovery root not found') &&
            error.message.includes(path.join(root, 'packages', 'integrations')) &&
            !error.message.includes('ENOENT'),
    )
})

test('the default .env.dev pieces exist under packages/integrations', () => {
    const envDev = readFileSync(path.join(repoRoot, '.env.dev'), 'utf-8')
    const match = envDev.match(/^AP_DEV_PIECES="?([^"\n]*)"?\s*$/m)
    assert.ok(match, 'AP_DEV_PIECES must be defined in .env.dev')

    const filters = devPieces.resolveDevPieceFilters({ apDevPieces: match[1], cwd: repoRoot })
    assert.ok(filters.length > 0)
    for (const filter of filters) {
        assert.match(filter, /^--filter=@inboxfm-connect\//)
    }
})

test('crowdin piece globs point at the real packages/integrations paths', () => {
    const crowdin = readFileSync(path.join(repoRoot, 'crowdin.yml'), 'utf-8')
    assert.ok(!crowdin.includes('packages/pieces'), 'crowdin.yml must not reference the removed packages/pieces')
    assert.ok(crowdin.includes('packages/integrations/**/**/src/i18n/translation.json'))
    assert.ok(crowdin.includes('/packages/integrations/**/**/src/i18n/%two_letters_code%.json'))

    const withTranslations = devPieces
        .findAllPieceFolders(path.join(repoRoot, 'packages', 'integrations'))
        .filter((folder) => existsSync(path.join(folder, 'src', 'i18n', 'translation.json')))
    assert.ok(withTranslations.length > 0, 'at least one piece must ship a source translation.json')
})
