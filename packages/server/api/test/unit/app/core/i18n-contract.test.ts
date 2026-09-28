import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { beforeAll, describe, expect, it } from 'vitest'
import { formErrors } from '@inboxfm-connect/shared'

/**
 * Enforcement test for the AGENTS.md i18n contract (Issue #145): every
 * user-facing zod validation message in packages/core/shared and
 * packages/server/api must be a `formErrors` constant or a string that
 * exists as a key in the web app's en/translation.json.
 *
 * Scope (deliberate): only zod *message positions* are collected —
 *  - the 2nd argument of .min()/.max()/.regex()/.refine()/... when it is a
 *    static string literal,
 *  - `message:` string literals inside refine()/superRefine()/addIssue()
 *    options objects.
 * `.describe()` texts, API error `params.message` values, and template
 * literals with substitutions are NOT validation messages and are ignored:
 * dynamic messages cannot be static translation keys.
 */
const ZOD_MESSAGE_METHODS = new Set([
    'min',
    'max',
    'regex',
    'refine',
    'uuid',
    'email',
    'url',
    'nonempty',
    'datetime',
    'length',
])

interface AllowlistedMessage {
    /** File suffix match, e.g. 'mcp/tools/mcp-utils.ts'. */
    fileSuffix: string
    message: string
    rationale: string
}

/**
 * Internal-only messages that may stay raw English. Entries require a
 * rationale; prefer adding a formErrors key + translation instead.
 */
export const MESSAGE_ALLOWLIST: AllowlistedMessage[] = []

interface CollectedMessage {
    file: string
    message: string
}

function isStaticString(node: ts.Node): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
    return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
}

function messagePropertiesOf(
    sourceFile: ts.SourceFile,
    objectLiteral: ts.ObjectLiteralExpression,
    into: string[],
): void {
    for (const prop of objectLiteral.properties) {
        if (
            ts.isPropertyAssignment(prop)
            && prop.name.getText(sourceFile) === 'message'
            && isStaticString(prop.initializer)
        ) {
            into.push(prop.initializer.text)
        }
    }
}

function collectFromSourceFile(sourceFile: ts.SourceFile, messages: string[], usedKeys: Set<string>): void {
    function visit(node: ts.Node): void {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
            const method = node.expression.name.text
            if (method === 'addIssue') {
                const [firstArgument] = node.arguments
                if (firstArgument && ts.isObjectLiteralExpression(firstArgument)) {
                    messagePropertiesOf(sourceFile, firstArgument, messages)
                }
            }
            else if (ZOD_MESSAGE_METHODS.has(method)) {
                const [, secondArgument] = node.arguments
                if (secondArgument && isStaticString(secondArgument)) {
                    messages.push(secondArgument.text)
                }
                else if (secondArgument && ts.isObjectLiteralExpression(secondArgument)) {
                    messagePropertiesOf(sourceFile, secondArgument, messages)
                }
            }
        }
        if (
            ts.isPropertyAccessExpression(node)
            && ts.isIdentifier(node.expression)
            && node.expression.text === 'formErrors'
        ) {
            usedKeys.add(node.name.text)
        }
        ts.forEachChild(node, visit)
    }
    visit(sourceFile)
}

interface ScanResult {
    literals: CollectedMessage[]
    usedFormErrorsKeys: Set<string>
}

function scanTree(): ScanResult {
    // packages/server/api/test/unit/app/core -> packages/
    const packagesDir = path.resolve(__dirname, '../../../../../..')
    const roots = [
        path.join(packagesDir, 'core/shared/src'),
        path.join(packagesDir, 'server/api/src'),
    ]
    const literals: CollectedMessage[] = []
    const usedFormErrorsKeys = new Set<string>()
    function walk(dir: string): void {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const fullPath = path.join(dir, entry.name)
            if (entry.isDirectory()) {
                walk(fullPath)
            }
            else if (
                entry.name.endsWith('.ts')
                && !entry.name.endsWith('.d.ts')
                && !entry.name.endsWith('.test.ts')
                && !entry.name.endsWith('.spec.ts')
                && !fullPath.includes('migration')
            ) {
                const relativePath = path.relative(packagesDir, fullPath).replace(/\\/g, '/')
                const sourceFile = ts.createSourceFile(fullPath, fs.readFileSync(fullPath, 'utf-8'), ts.ScriptTarget.Latest, true)
                const messages: string[] = []
                collectFromSourceFile(sourceFile, messages, usedFormErrorsKeys)
                for (const message of messages) {
                    literals.push({ file: relativePath, message })
                }
            }
        }
    }
    for (const root of roots) {
        walk(root)
    }
    return { literals, usedFormErrorsKeys }
}

function loadTranslationKeys(): Set<string> {
    const translationPath = path.resolve(
        __dirname,
        '../../../../../../web/public/locales/en/translation.json',
    )
    const parsed: unknown = JSON.parse(fs.readFileSync(translationPath, 'utf-8'))
    if (typeof parsed !== 'object' || parsed === null) {
        throw new Error(`Expected a JSON object at ${translationPath}`)
    }
    return new Set(Object.keys(parsed))
}

let scan: ScanResult
let translationKeys: Set<string>

beforeAll(() => {
    scan = scanTree()
    translationKeys = loadTranslationKeys()
})

describe('i18n contract for zod validation messages (Issue #145)', () => {
    it('resolves every formErrors key used in server and shared code', () => {
        const definedKeys = new Set(Object.keys(formErrors))
        const unknownKeys = [...scan.usedFormErrorsKeys].filter((key) => !definedKeys.has(key))
        expect(unknownKeys).toEqual([])
    })

    it('covers every formErrors value with an en translation key', () => {
        const missing = Object.values(formErrors).filter((value) => !translationKeys.has(value))
        expect(missing).toEqual([])
    })

    it('requires raw zod message strings to be en translation keys', () => {
        const violations = scan.literals.filter(
            ({ file, message }) =>
                !translationKeys.has(message)
                && !MESSAGE_ALLOWLIST.some((entry) => entry.message === message && file.endsWith(entry.fileSuffix)),
        )
        if (violations.length > 0) {
            const details = violations.map((v) => `  - ${v.file}: ${JSON.stringify(v.message)}`).join('\n')
            expect.fail(
                `Found ${violations.length} zod validation message(s) that are not en translation keys:\n${details}\n\n` +
                'Fix: use a formErrors constant (and add the key to en/translation.json), or add an entry to MESSAGE_ALLOWLIST with a rationale.',
            )
        }
    })
})
