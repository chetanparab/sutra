/**
 * Auto-detect how to verify a workspace — so the user never has to type a test
 * command (dogfooding: "verify command user kyu de, AI ko samajhna chahiye").
 *
 * Pure inspection: reads a few well-known files, runs nothing. Returns the
 * command a human would run to check the project, or null if there's no
 * automatic signal (a brand-new empty folder before the agent scaffolds it,
 * or a repo with no recognizable toolchain). The loop re-detects after each
 * Build, so a project the agent just scaffolded (package.json, Cargo.toml, …)
 * becomes verifiable on the very next check.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** The npm-init placeholder — a real "test" script, but it only ever fails. */
const NPM_TEST_PLACEHOLDER = /no test specified/i

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

function hasFileMatching(dir: string, re: RegExp): boolean {
  try {
    return readdirSync(dir).some((n) => re.test(n))
  } catch {
    return false
  }
}

export interface DetectedVerify {
  command: string
  /** Short human reason, shown in the UI ("package.json test script"). */
  reason: string
}

export function detectVerifyCommand(workspaceRoot: string): DetectedVerify | null {
  const has = (rel: string) => existsSync(join(workspaceRoot, rel))

  // — Node / Bun / Deno —
  const pkg = readJson(join(workspaceRoot, 'package.json'))
  if (pkg) {
    const scripts = (pkg.scripts ?? {}) as Record<string, string>
    if (typeof scripts.test === 'string' && !NPM_TEST_PLACEHOLDER.test(scripts.test)) {
      return { command: 'npm test', reason: 'package.json test script' }
    }
    // No usable test script — a build or typecheck still proves it compiles.
    for (const [name, label] of [
      ['typecheck', 'package.json typecheck script'],
      ['build', 'package.json build script'],
      ['lint', 'package.json lint script'],
    ] as const) {
      if (typeof scripts[name] === 'string') return { command: `npm run ${name}`, reason: label }
    }
    // A dependency-declared test runner, even without a script.
    const deps = { ...(pkg.dependencies as object), ...(pkg.devDependencies as object) } as Record<string, unknown>
    if ('vitest' in deps) return { command: 'npx vitest run', reason: 'vitest dependency' }
    if ('jest' in deps) return { command: 'npx jest', reason: 'jest dependency' }
  }
  if (has('deno.json') || has('deno.jsonc')) return { command: 'deno test -A', reason: 'Deno project' }

  // — Rust —
  if (has('Cargo.toml')) return { command: 'cargo test', reason: 'Cargo project' }

  // — Go —
  if (has('go.mod')) return { command: 'go test ./...', reason: 'Go module' }

  // — Python —
  const pyTestish =
    has('pytest.ini') ||
    has('tox.ini') ||
    (has('pyproject.toml') && /pytest/.test(safeRead(join(workspaceRoot, 'pyproject.toml')))) ||
    has('tests') ||
    hasFileMatching(workspaceRoot, /^test_.*\.py$|_test\.py$/)
  if (pyTestish) return { command: 'python -m pytest -q', reason: 'Python tests' }

  // — Make —
  if (has('Makefile') && /^test:/m.test(safeRead(join(workspaceRoot, 'Makefile')))) {
    return { command: 'make test', reason: 'Makefile test target' }
  }

  return null
}

function safeRead(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}
