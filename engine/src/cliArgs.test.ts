import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseArgs } from './cliArgs'

test('splits positional args from --flag value pairs', () => {
  const { positional, flags } = parseArgs(['./repo', 'do the thing', '--provider', 'anthropic', '--model', 'claude-x'])
  assert.deepEqual(positional, ['./repo', 'do the thing'])
  assert.deepEqual(flags, { provider: 'anthropic', model: 'claude-x' })
})

test('a flag with no following value throws', () => {
  assert.throws(() => parseArgs(['--provider']), /needs a value/)
})

test('a flag immediately followed by another flag throws', () => {
  assert.throws(() => parseArgs(['--provider', '--model', 'x']), /needs a value/)
})

test('no flags at all is fine', () => {
  assert.deepEqual(parseArgs(['a', 'b']), { positional: ['a', 'b'], flags: {} })
})
