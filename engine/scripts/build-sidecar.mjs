/**
 * Builds the engine into a standalone sidecar binary via Node SEA (single
 * executable applications) — the mechanism chosen by the Phase 3 packaging
 * spike (issue #25; decision record in engine/SIDECAR.md).
 *
 * Steps: esbuild-bundle the CLI to one CJS file → generate the SEA blob →
 * inject it (postject) into a SELF-CONTAINED official nodejs.org binary →
 * ad-hoc codesign on macOS → smoke-test the result by running the Phase 0
 * apply-test-edit path for real.
 *
 * The one sharp edge this script guards (found the hard way in the spike):
 * Homebrew's `node` is a ~66KB thin wrapper linking libnode.dylib — a SEA
 * built from it is NOT self-contained. Only official dist binaries (~140MB,
 * statically plumbed) work. We download one matching the running Node version
 * unless SUTRA_SEA_NODE points at a binary to use.
 *
 * Usage: node engine/scripts/build-sidecar.mjs [--out dist-sidecar]
 * Output: <out>/sutra-engine-<rust-target-triple>  (the name Tauri's
 * externalBin sidecar mechanism expects).
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..', '..')
const outDirArg = process.argv.indexOf('--out')
const outDir = resolve(repoRoot, outDirArg !== -1 ? process.argv[outDirArg + 1] : 'dist-sidecar')

const TRIPLES = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'win32-x64': 'x86_64-pc-windows-msvc',
}
const platformKey = `${process.platform}-${process.arch}`
const triple = TRIPLES[platformKey]
if (!triple) throw new Error(`No rust target triple mapping for ${platformKey}.`)

const isWindows = process.platform === 'win32'
const isMac = process.platform === 'darwin'
// Tauri's externalBin appends the triple and, on Windows, .exe.
const outExt = isWindows ? '.exe' : ''

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts })
const work = mkdtempSync(join(tmpdir(), 'sutra-sidecar-'))
mkdirSync(outDir, { recursive: true })

try {
  // 1. Bundle the engine CLI to a single CJS file. esbuild is already a
  //    dependency via Vite — no new toolchain.
  const bundle = join(work, 'sutra-engine.cjs')
  run('npx', ['esbuild', join(repoRoot, 'engine/src/cli.ts'), '--bundle', '--platform=node', '--format=cjs', '--target=node26', `--outfile=${bundle}`], { cwd: repoRoot })

  // 2. SEA preparation blob.
  const seaConfig = join(work, 'sea-config.json')
  const blob = join(work, 'sea-prep.blob')
  writeFileSync(seaConfig, JSON.stringify({ main: bundle, output: blob, disableExperimentalSEAWarning: true }))
  run(process.execPath, ['--experimental-sea-config', seaConfig])

  // 3. A self-contained node binary to inject into.
  const nodeBinary = await resolveSelfContainedNode(work)

  // 4. Copy, strip signature (macOS), inject, re-sign ad hoc.
  //    Windows: no codesign, `.exe` suffix, and postject omits the Mach-O
  //    segment flag (that's a macOS-only concept). Real signing is the CI's
  //    job with a user cert (issue #42); the local build stays unsigned.
  const out = join(outDir, `sutra-engine-${triple}${outExt}`)
  rmSync(out, { force: true })
  copyFileSync(nodeBinary, out)
  chmodSync(out, 0o755)
  if (isMac) run('codesign', ['--remove-signature', out])
  run('npx', ['postject', out, 'NODE_SEA_BLOB', blob, '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2', ...(isMac ? ['--macho-segment-name', 'NODE_SEA'] : [])], { cwd: repoRoot })
  if (isMac) run('codesign', ['--sign', '-', out])

  // 5. Smoke test — the binary must run the REAL Phase 0 path, not just --help.
  const smokeRepo = join(work, 'smoke-repo')
  const smokeOut = execFileSync(out, ['apply-test-edit', smokeRepo], { encoding: 'utf8' })
  if (!/Committed iteration 1/.test(smokeOut)) {
    throw new Error(`Sidecar smoke test failed — unexpected output:\n${smokeOut}`)
  }

  const mb = (statSync(out).size / 1024 / 1024).toFixed(0)
  console.log(`\nSidecar built and smoke-tested: ${out} (${mb} MB)`)
} finally {
  rmSync(work, { recursive: true, force: true })
}

/**
 * Finds (or downloads) an official nodejs.org binary — the self-contained
 * kind. SUTRA_SEA_NODE overrides; downloads are cached in <out>/.node-cache.
 */
async function resolveSelfContainedNode(work) {
  const explicit = process.env.SUTRA_SEA_NODE
  if (explicit) {
    assertSelfContained(explicit)
    return explicit
  }

  const version = process.version // match the dev/CI node
  // Windows dist names use "win", not "win32", and ship as .zip with node.exe
  // at the archive root; posix ships .tar.xz with the binary under bin/.
  const distOs = isWindows ? 'win' : process.platform
  const distName = `node-${version}-${distOs}-${process.arch}`
  const cacheDir = join(outDir, '.node-cache')
  const cached = join(cacheDir, `${distName}-bin${outExt}`)
  if (existsSync(cached)) {
    assertSelfContained(cached)
    return cached
  }

  mkdirSync(cacheDir, { recursive: true })
  const archiveExt = isWindows ? 'zip' : 'tar.xz'
  const archiveFile = `${distName}.${archiveExt}`
  const url = `https://nodejs.org/dist/${version}/${archiveFile}`
  console.log(`Downloading official node binary: ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}. Set SUTRA_SEA_NODE to a self-contained node binary instead.`)
  const archive = join(work, `node-dist.${archiveExt}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  writeFileSync(archive, bytes)

  // Supply-chain integrity: verify the download against nodejs.org's signed
  // SHASUMS256 for this exact release before we ever unpack or execute it. A
  // MITM or a compromised mirror serving a tampered node — the binary the
  // whole sidecar is built on — is caught here, not after it runs.
  await verifyNodeChecksum(version, archiveFile, bytes)

  if (isWindows) {
    // PowerShell's Expand-Archive is always present on windows-latest runners.
    run('powershell', ['-NoProfile', '-Command', `Expand-Archive -Path '${archive}' -DestinationPath '${work}' -Force`])
    copyFileSync(join(work, distName, 'node.exe'), cached)
  } else {
    run('tar', ['-xf', archive, '-C', work, `${distName}/bin/node`])
    copyFileSync(join(work, distName, 'bin', 'node'), cached)
    chmodSync(cached, 0o755)
  }
  assertSelfContained(cached)
  return cached
}

/**
 * Verify a downloaded node archive against nodejs.org's published
 * SHASUMS256.txt for that release. Throws on any mismatch or a missing entry —
 * the sidecar must never be built on an unverified node binary.
 */
async function verifyNodeChecksum(version, archiveFile, bytes) {
  const sumsUrl = `https://nodejs.org/dist/${version}/SHASUMS256.txt`
  const res = await fetch(sumsUrl)
  if (!res.ok) throw new Error(`Could not fetch ${sumsUrl} (${res.status}) to verify the node download.`)
  const sums = await res.text()

  const actual = createHash('sha256').update(bytes).digest('hex')
  // Each line is "<sha256>  <filename>".
  const line = sums.split('\n').find((l) => l.trim().endsWith(` ${archiveFile}`) || l.trim().endsWith(`  ${archiveFile}`))
  if (!line) throw new Error(`No SHASUMS256 entry for ${archiveFile} — cannot verify the node download.`)
  const expected = line.trim().split(/\s+/)[0]
  if (actual !== expected) {
    throw new Error(`Checksum mismatch for ${archiveFile}: expected ${expected}, got ${actual}. Refusing to build the sidecar on an unverified node binary.`)
  }
  console.log(`Verified ${archiveFile} against nodejs.org SHASUMS256.`)
}

function assertSelfContained(path) {
  // The spike's finding: Homebrew's node is a ~66KB libnode.dylib wrapper and
  // silently produces a broken SEA. Official self-contained binaries are
  // >50MB; anything smaller is certainly a wrapper or a shim.
  const size = statSync(path).size
  if (size < 50 * 1024 * 1024) {
    throw new Error(
      `${path} is ${(size / 1024).toFixed(0)}KB — that's a thin wrapper (Homebrew node links libnode.dylib), not a self-contained binary. ` +
        'Use an official nodejs.org dist binary (or unset SUTRA_SEA_NODE to let this script download one).',
    )
  }
}
