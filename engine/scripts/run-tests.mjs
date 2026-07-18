#!/usr/bin/env node
/**
 * Runs every engine/**\/*.test.ts file through tsx's Node-test-runner integration.
 *
 * Not a shell glob on purpose: `tsx --test 'engine/**\/*.test.ts'` resolves
 * differently across Node versions (native glob support in the test runner
 * varies by version), so this walks the directory tree itself in plain Node —
 * fs.readdirSync with withFileTypes has been stable since Node 10, no
 * version-sensitive glob behavior involved.
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const engineDir = fileURLToPath(new URL('..', import.meta.url))

function findTestFiles(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...findTestFiles(full))
    else if (entry.isFile() && entry.name.endsWith('.test.ts')) files.push(full)
  }
  return files
}

const testFiles = findTestFiles(engineDir)

if (testFiles.length === 0) {
  console.error(`No *.test.ts files found under ${engineDir}`)
  process.exit(1)
}

// Run under `npm test`, so node_modules/.bin (where tsx lives) is already on
// PATH — no npx indirection needed.
const result = spawnSync('tsx', ['--test', ...testFiles], { stdio: 'inherit' })
process.exit(result.status ?? 1)
