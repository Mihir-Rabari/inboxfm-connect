import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

// Guard against N+1 query patterns in the API server.
//
// `packages/server/AGENTS.md` documents the rule (never issue a query per row inside a
// loop), but until now it was documentation only - nothing failed if a new endpoint
// violated it. This is the same shape as check-license-boundaries.mjs: walk the tracked
// TypeScript with the compiler's own AST and report the pattern.
//
// A site is flagged when a `for`/`for...of`/`for await`/`while` loop body (at any depth)
// contains an `await` whose expression is a call on a repository or service accessor -
// `somethingRepo().findBy(...)`, `userService(log).getOne(...)`. A `Promise.all` over the
// same calls is NOT flagged: it is the batched form this rule is trying to push people
// towards, and rejecting it would be backwards.
//
// Existing sites are baselined in tools/ci/n-plus-one-baseline.json. New ones fail.

const SCAN_ROOTS = ['packages/server/api/src/app']
const QUERY_METHODS = new Set([
    'find', 'findBy', 'findOne', 'findOneBy', 'findOneOrFail', 'findWithCount',
    'findAndCount', 'count', 'countBy', 'exists', 'existsBy', 'get', 'getOne',
    'getOneOrFail', 'getOrFail', 'save', 'insert', 'upsert', 'query', 'delete',
])

const repoAccessor = /^(?:[A-Za-z_$][\w$]*Repo|[A-Za-z_$][\w$]*Service)\s*(\(\s*\)|\([\w\s,]*\)\s*)$/

// A loop whose iteration count is driven by data - that is where a per-iteration
// query turns into N+1. `while (true)` / `do {} while` are control-flow constructs
// (drain loops in seeds and cleanup scripts); flagging them would be a false positive.
function isLoop(node) {
    return ts.isForStatement(node) ||
        ts.isForOfStatement(node) ||
        ts.isForInStatement(node) ||
        (ts.isWhileStatement(node) && !isLiteralTrue(node.expression))
}

function isLiteralTrue(expr) {
    return expr.kind === ts.SyntaxKind.TrueKeyword ||
        (ts.isIdentifier(expr) && expr.text === 'true')
}

function isQueryCall(node, sourceFile) {
    if (!ts.isCallExpression(node)) return false
    const callee = ts.isPropertyAccessExpression(node.expression) ? node.expression : null
    if (!callee) return false
    if (!QUERY_METHODS.has(callee.name.text)) return false
    const receiver = callee.expression
    if (!ts.isCallExpression(receiver)) return false
    // getText() needs the source file to render the node.
    const src = receiver.getText(sourceFile).replace(/\s+/g, ' ')
    return repoAccessor.test(src)
}

function hasAwaitedQueryInLoopBody(loop, sourceFile) {
    let found = null
    const visit = (node) => {
        if (found) return
        // Do not descend into nested functions: a closure called later is not executed
        // per-iteration, and a nested loop is reported on its own.
        if (node !== loop && (ts.isFunctionExpression(node) || ts.isArrowFunction(node) ||
            ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || isLoop(node))) {
            return
        }
        if (ts.isAwaitExpression(node) && isQueryCall(node.expression, sourceFile)) {
            found = node.expression
            return
        }
        ts.forEachChild(node, visit)
    }
    visit(loop)
    return found
}

export function findNPlusOneSites({ file, source }) {
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
    const sites = []
    const visit = (node) => {
        if (isLoop(node)) {
            const call = hasAwaitedQueryInLoopBody(node, ast)
            if (call) {
                const { line } = ast.getLineAndCharacterOfPosition(call.getStart(ast))
                sites.push({ file, line: line + 1, snippet: call.getText(ast).replace(/\s+/g, ' ').slice(0, 120) })
            }
        }
        ts.forEachChild(node, visit)
    }
    visit(ast)
    return sites
}

function listTargets() {
    const files = execFileSync('git', ['ls-files', '-z', ...SCAN_ROOTS], {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
    }).split('\0').filter(Boolean)
    return files.filter((file) => /\.tsx?$/.test(file) && !/\.(test|spec)\.tsx?$/.test(file))
}

function main() {
    const baselinePath = path.join('tools', 'ci', 'n-plus-one-baseline.json')
    const sites = listTargets().flatMap((file) => findNPlusOneSites({ file, source: readFileSync(file, 'utf8') }))

    if (process.argv.includes('--write-baseline')) {
        writeFileSync(baselinePath, JSON.stringify({
            description: 'N+1 query sites found at the time this baseline was taken. Not a target - see packages/server/AGENTS.md. Batch with Promise.all, or hoist the lookup out of the loop.',
            sites: sites.map((s) => `${s.file}:${s.line}`),
        }, null, 2) + '\n')
        console.log(`Recorded ${sites.length} N+1 site(s).`)
        return
    }

    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')).sites
    const known = new Set(baseline)
    const introduced = sites.filter((s) => !known.has(`${s.file}:${s.line}`))

    if (introduced.length === 0) {
        console.log(`No new N+1 sites. Existing debt: ${sites.length}; see packages/server/AGENTS.md.`)
        return
    }

    console.error('New N+1 query site(s) introduced:')
    for (const site of introduced) {
        console.error(`  ${site.file}:${site.line}  ${site.snippet}`)
    }
    console.error('\nA query inside a loop runs once per row. Batch it:')
    console.error('  const rows = await repo().findBy({ id: In(ids) })   // one query')
    console.error('  await Promise.all(ids.map((id) => repo().findOne({ id })))')
    console.error('Removing a baselined site? Re-run with --write-baseline and include the diff.')
    process.exitCode = 1
}

if (process.argv[1] && path.basename(process.argv[1]) === 'check-n-plus-one.mjs') {
    main()
}