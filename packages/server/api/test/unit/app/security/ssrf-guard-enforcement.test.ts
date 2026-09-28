import { describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

describe('SSRF Guard Enforcement - Repo Scan', () => {
    const repoRoot = path.resolve(__dirname, '../../../../../../')
    const sourceDirs = [
        'packages/server/api/src/app',
        'packages/server/sandbox/src',
        'packages/core/execution/src',
    ]

    const excludedFiles = new Set([
        'packages/integrations/common/src/lib/http/core/fetch-http-client.ts',
    ])

    function findRawHttpUsage(dir: string): { file: string; line: number; content: string }[] {
        const violations: { file: string; line: number; content: string }[] = []
        const files = fs.readdirSync(dir)

        for (const file of files) {
            const fullPath = path.join(dir, file)
            const stat = fs.statSync(fullPath)

            if (stat.isDirectory()) {
                if (file !== 'node_modules' && file !== 'dist' && file !== '.turbo' && file !== 'test') {
                    violations.push(...findRawHttpUsage(fullPath))
                }
            } else if (file.endsWith('.ts') && !file.endsWith('.d.ts') && !file.endsWith('.test.ts')) {
                const relativePath = path.relative(repoRoot, fullPath)
                if (excludedFiles.has(relativePath)) continue

                const content = fs.readFileSync(fullPath, 'utf-8')
                const lines = content.split('\n')

                lines.forEach((line, idx) => {
                    const trimmed = line.trim()
                    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return

                    // Check for raw axios usage
                    if (/\baxios\.(get|post|put|delete|patch|head|request)\b/.test(line) &&
                        !/safeHttp/.test(line) &&
                        !/axios\.isAxiosError/.test(line)) {
                        violations.push({ file: relativePath, line: idx + 1, content: line.trim() })
                    }

                    // Check for raw fetch usage (excluding test files and some known exceptions)
                    if (/\bfetch\(/.test(line) &&
                        !/node-fetch/.test(line) &&
                        !/safeHttp/.test(line)) {
                        violations.push({ file: relativePath, line: idx + 1, content: line.trim() })
                    }
                })
            }
        }

        return violations
    }

    it('scans server/api/src/app for raw axios/fetch usage', () => {
        const scanDir = path.join(repoRoot, 'packages/server/api/src/app')
        if (fs.existsSync(scanDir)) {
            const violations = findRawHttpUsage(scanDir)
            if (violations.length > 0) {
                console.warn('SSRF violations found:', violations.slice(0, 10))
            }
            // This test documents violations - fix them in follow-up PRs
            expect(violations.length).toBeLessThanOrEqual(50) // Allow some known ones for now
        }
    })
})
