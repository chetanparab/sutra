import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { extractPlanJson, plan, shallowRepoListing, specToIntent } from './plan'
import { scriptedProvider } from '../testing/scriptedProvider'

function withRepo(fn: (root: string) => void | Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), 'sutra-plan-'))
  return (async () => {
    try {
      await fn(root)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })()
}

test('plan parses a well-formed spec from the model', async () => {
  await withRepo(async (root) => {
    writeFileSync(join(root, 'package.json'), '{"name":"x"}')
    const provider = scriptedProvider([
      {
        text: JSON.stringify({
          requirements: ['The CLI accepts --json and prints valid JSON', 'A test covers the --json path'],
          approach: 'Add a --json flag parsed in src/cli.ts and branch the formatter.',
          tasks: [
            { title: 'Parse --json', detail: 'read the flag in cli.ts' },
            { title: 'Add a test', detail: 'assert JSON output' },
          ],
        }),
      },
    ])
    const { spec } = await plan({ provider, model: 'test', intent: 'Add a --json flag', workspaceRoot: root })
    assert.equal(spec.requirements.length, 2)
    assert.match(spec.requirements[0], /--json/)
    assert.match(spec.approach, /cli\.ts/)
    assert.equal(spec.tasks.length, 2)
    assert.equal(spec.tasks[0].title, 'Parse --json')
    // the model was given a real repo listing to ground the plan
    const call = provider.callLog[0]
    assert.match(call.messages[1].content, /package\.json/)
  })
})

test('a malformed plan degrades to an honest, editable minimal spec (never dead-ends)', async () => {
  await withRepo(async (root) => {
    const provider = scriptedProvider([{ text: 'Sure! Here is my plan: just do the thing.' }])
    const { spec } = await plan({ provider, model: 'test', intent: 'Do the thing', workspaceRoot: root })
    assert.ok(spec.requirements.length >= 1)
    assert.ok(spec.tasks.length >= 1)
    assert.match(spec.requirements[0], /Do the thing/)
  })
})

test('extractPlanJson tolerates prose and code fences around the JSON', () => {
  const wrapped = 'Here you go:\n```json\n{"requirements":["a"],"approach":"b","tasks":[{"title":"t","detail":"d"}]}\n```\nDone.'
  const spec = extractPlanJson(wrapped)
  assert.ok(spec)
  assert.deepEqual(spec?.requirements, ['a'])
})

test('shallowRepoListing skips .git/node_modules and reports empty folders', () => {
  return withRepo((root) => {
    assert.match(shallowRepoListing(root), /empty folder/)
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src', 'index.ts'), 'export {}')
    mkdirSync(join(root, 'node_modules'))
    writeFileSync(join(root, 'node_modules', 'junk.js'), 'x')
    const listing = shallowRepoListing(root)
    assert.match(listing, /src\//)
    assert.match(listing, /index\.ts/)
    assert.doesNotMatch(listing, /node_modules/)
  })
})

test('specToIntent folds requirements + tasks into one build instruction', () => {
  const intent = specToIntent('Add retries', {
    requirements: ['Retries cap at 3'],
    approach: 'Wrap the call.',
    tasks: [{ title: 'Add backoff', detail: 'exponential' }],
  })
  assert.match(intent, /Add retries/)
  assert.match(intent, /Retries cap at 3/)
  assert.match(intent, /Add backoff/)
  assert.match(intent, /Approach: Wrap the call/)
})
