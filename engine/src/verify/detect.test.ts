import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { detectVerifyCommand } from './detect'

function withRepo(fn: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'sutra-detect-'))
  try {
    fn(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('a real package.json test script → npm test', () => {
  withRepo((root) => {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }))
    assert.equal(detectVerifyCommand(root)?.command, 'npm test')
  })
})

test('the npm-init placeholder test script is ignored, falls through to build', () => {
  withRepo((root) => {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1', build: 'tsc' } }))
    assert.equal(detectVerifyCommand(root)?.command, 'npm run build')
  })
})

test('a vitest devDependency without a script still resolves', () => {
  withRepo((root) => {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ devDependencies: { vitest: '^1' } }))
    assert.equal(detectVerifyCommand(root)?.command, 'npx vitest run')
  })
})

test('Cargo / Go / pytest projects each resolve', () => {
  withRepo((root) => {
    writeFileSync(join(root, 'Cargo.toml'), '[package]\nname="x"')
    assert.equal(detectVerifyCommand(root)?.command, 'cargo test')
  })
  withRepo((root) => {
    writeFileSync(join(root, 'go.mod'), 'module x')
    assert.equal(detectVerifyCommand(root)?.command, 'go test ./...')
  })
  withRepo((root) => {
    mkdirSync(join(root, 'tests'))
    assert.equal(detectVerifyCommand(root)?.command, 'python -m pytest -q')
  })
})

test('a bare/empty folder yields null — nothing to verify yet', () => {
  withRepo((root) => {
    assert.equal(detectVerifyCommand(root), null)
    writeFileSync(join(root, 'README.md'), '# hi') // still nothing runnable
    assert.equal(detectVerifyCommand(root), null)
  })
})
