#!/usr/bin/env node
/**
 * Build the publishable `sutra-engine` npm package into ./engine-npm.
 *
 * The engine is TypeScript that imports across the repo (contracts in src/),
 * so it isn't `npx`-runnable as-is. This bundles the CLI into ONE self-
 * contained CJS file with a shebang — no dependencies, no tsx — and writes a
 * package.json whose `bin` points at it. Then `npx sutra-engine serve` (once
 * published) Just Works, and that's what the web IDE's connect dialog tells
 * people to run.
 *
 * Usage: node engine/scripts/build-npm.mjs   →   engine-npm/ ready for `npm publish`
 */
import { build as esbuildBuild } from 'esbuild'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const outDir = join(repoRoot, 'engine-npm')
const distDir = join(outDir, 'dist')

// Version is the single source of truth in engine/src/version.ts.
const versionSrc = readFileSync(join(repoRoot, 'engine/src/version.ts'), 'utf8')
const version = versionSrc.match(/ENGINE_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1]
if (!version) throw new Error('Could not read ENGINE_VERSION from engine/src/version.ts')

rmSync(outDir, { recursive: true, force: true })
mkdirSync(distDir, { recursive: true })

const outfile = join(distDir, 'sutra-engine.cjs')
await esbuildBuild({
  entryPoints: [join(repoRoot, 'engine/src/cli.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile,
  banner: { js: '#!/usr/bin/env node' },
})
chmodSync(outfile, 0o755)

const pkg = {
  name: 'sutra-engine',
  version,
  description: 'The Sutra loop engine — run real Build→Verify→Reflect loops from the CLI, or `serve` it so the Sutra web IDE can run them for real.',
  keywords: ['sutra', 'ai', 'agent', 'loop', 'coding-agent', 'llm', 'claude'],
  bin: { 'sutra-engine': 'dist/sutra-engine.cjs' },
  files: ['dist', 'README.md', 'LICENSE'],
  engines: { node: '>=18' },
  license: 'Apache-2.0',
  repository: { type: 'git', url: 'git+https://github.com/chetanparab/sutra.git', directory: 'engine' },
  homepage: 'https://github.com/chetanparab/sutra#readme',
  bugs: 'https://github.com/chetanparab/sutra/issues',
}
writeFileSync(join(outDir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')

const readme = `# sutra-engine

The headless engine behind [Sutra](https://github.com/chetanparab/sutra) — the loop-engineering IDE.

Run a real Build → Verify → Reflect loop against a real repo from your terminal, or \`serve\` it so the Sutra **web IDE** can drive it for real (a browser tab can't run your tests itself).

\`\`\`bash
# let the web IDE run for real on this machine
npx sutra-engine serve

# …or run a loop straight from the CLI
npx sutra-engine loop <path> "<what to change>" --provider claude-code --model default --allow-run true
\`\`\`

\`serve\` binds to localhost only and prints a one-time token the web IDE must present. See the [repo](https://github.com/chetanparab/sutra) for the full CLI and the security model.

Apache-2.0.
`
writeFileSync(join(outDir, 'README.md'), readme)
if (existsSync(join(repoRoot, 'LICENSE'))) copyFileSync(join(repoRoot, 'LICENSE'), join(outDir, 'LICENSE'))

console.log(`Built sutra-engine@${version} → ${outDir}`)
console.log('Verify:  node engine-npm/dist/sutra-engine.cjs version')
console.log('Publish: cd engine-npm && npm publish --access public   (needs `npm login`)')
