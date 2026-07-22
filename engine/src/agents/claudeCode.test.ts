/**
 * claude-code mode, proven without Claude: SUTRA_CLAUDE_BIN points at a stub
 * shell script that mimics the CLI's headless stream-json protocol. The stub
 * "agent" writes a failing hello.js on its first Build call and the fix on its
 * second; Reflect returns a canned memo JSON. Everything around the stub is
 * real — git init, commits, the verify command actually running node, the
 * memo pipeline, cost accounting from the stream's total_cost_usd.
 */
import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { resolveClaudeBinary, runClaudeCodeBuild } from './claudeCode'
import { runLoop } from '../loop/runLoop'

const isWindows = process.platform === 'win32'

function makeStub(dir: string): string {
  const bin = join(dir, 'claude')
  writeFileSync(
    bin,
    `#!/bin/sh
if [ "$1" = "--version" ]; then echo "9.9.9 (stub)"; exit 0; fi
PROMPT=$(cat); : "$PROMPT"
case "$*" in
  *acceptEdits*)
    C=0; [ -f "${dir}/count" ] && C=$(cat "${dir}/count")
    C=$((C+1)); echo "$C" > "${dir}/count"
    if [ "$C" = "1" ]; then printf 'process.exit(1)\\n' > hello.js; else printf "console.log('fixed')\\n" > hello.js; fi
    echo '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Write","input":{"file_path":"hello.js"}}]}}'
    echo '{"type":"result","subtype":"success","is_error":false,"result":"Wrote hello.js.","total_cost_usd":0.02,"usage":{"input_tokens":100,"output_tokens":50}}'
    ;;
  *)
    echo '{"type":"result","subtype":"success","is_error":false,"result":"{\\"finding\\":\\"stub finding\\",\\"directive\\":\\"stub directive\\"}","total_cost_usd":0.001,"usage":{"input_tokens":20,"output_tokens":10}}'
    ;;
esac
`,
    'utf8',
  )
  chmodSync(bin, 0o755)
  return bin
}

test('resolveClaudeBinary honors SUTRA_CLAUDE_BIN, and a broken override falls through without throwing', { skip: isWindows }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'sutra-claude-stub-'))
  try {
    const bin = makeStub(dir)
    assert.equal(resolveClaudeBinary({ SUTRA_CLAUDE_BIN: bin, PATH: '/nonexistent', HOME: '/nonexistent' }), bin)
    // A bogus override must not throw — it falls through to the other probes.
    // (What those find is machine-dependent: a dev box has a real install, CI
    // has none — so only the type is asserted, not the value.)
    const fallback = resolveClaudeBinary({ SUTRA_CLAUDE_BIN: '/nonexistent/claude', PATH: '/nonexistent', HOME: '/nonexistent' })
    assert.ok(fallback === null || typeof fallback === 'string')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('an expired-session error becomes an actionable "sign in again" message', { skip: isWindows }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sutra-claude-auth-'))
  const ws = mkdtempSync(join(tmpdir(), 'sutra-claude-ws-'))
  try {
    const bin = join(dir, 'claude')
    writeFileSync(
      bin,
      `#!/bin/sh
if [ "$1" = "--version" ]; then echo "9.9.9 (stub)"; exit 0; fi
cat >/dev/null
echo '{"type":"result","subtype":"error","is_error":true,"result":"Failed to authenticate: OAuth session expired and could not be refreshed"}'
`,
      'utf8',
    )
    chmodSync(bin, 0o755)
    await assert.rejects(
      runClaudeCodeBuild({ bin, workspaceRoot: ws, prompt: 'x' }),
      /sign in again/i,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
    rmSync(ws, { recursive: true, force: true })
  }
})

test('claude-code mode: new project from an empty folder converges via the stub CLI', { skip: isWindows }, async () => {
  const stubDir = mkdtempSync(join(tmpdir(), 'sutra-claude-stub-'))
  const workspace = mkdtempSync(join(tmpdir(), 'sutra-claude-ws-'))
  const savedBin = process.env.SUTRA_CLAUDE_BIN
  process.env.SUTRA_CLAUDE_BIN = makeStub(stubDir)
  try {
    const logs: string[] = []
    const outcome = await runLoop({
      workspacePath: workspace,
      intent: 'Create hello.js that exits cleanly.',
      providerId: 'claude-code',
      model: 'default',
      verifyCommand: 'node hello.js',
      consentToRun: true,
      maxIterations: 2,
      initIfNeeded: true,
      onLog: (l) => logs.push(l),
    })

    assert.equal(outcome.status, 'converged')
    if (outcome.status !== 'converged') return
    assert.equal(outcome.iterations, 2)
    assert.equal(outcome.finalVerify.passed, true)
    // the reflect memo came through the single-turn claude provider, parsed by the real reflect()
    assert.equal(outcome.memos.length, 1)
    assert.equal(outcome.memos[0].finding, 'stub finding')
    assert.equal(outcome.memos[0].directive, 'stub directive')
    // cost is the CLI's own total_cost_usd, not token-table math: 2 builds + 1 reflect
    assert.ok(Math.abs(outcome.totalCostUsd - 0.041) < 1e-9, `cost was ${outcome.totalCostUsd}`)
    // Build activity streamed through onLog for the live desktop panel
    assert.ok(logs.some((l) => l.includes('claude → Write hello.js')))
    // the diff against the empty initial commit is the whole new file
    assert.match(outcome.diff, /new file mode/)
  } finally {
    if (savedBin === undefined) delete process.env.SUTRA_CLAUDE_BIN
    else process.env.SUTRA_CLAUDE_BIN = savedBin
    rmSync(stubDir, { recursive: true, force: true })
    rmSync(workspace, { recursive: true, force: true })
  }
})
