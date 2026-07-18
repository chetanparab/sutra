/**
 * The first Phase 0 eval fixture: a tiny, deterministic git repo, generated at
 * run time rather than checked in. A nested `.git` committed inside this repo's
 * own `.git` causes real problems (git either ignores it or treats it as a
 * broken submodule reference) — generating it fresh avoids that entirely, and
 * every test run starts from the same known state.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const GREET_TS = "export function greet(name: string): string {\n  // TODO: implement\n  return `Hello, ${name}!`\n}\n"
const README_MD = "# toy-repo\n\nA throwaway fixture for Sutra's engine — Phase 0 tests only, not a real project.\n"

/**
 * Materializes the fixture at `targetPath`. Safe to call repeatedly: wipes and
 * recreates the target each time.
 */
export function makeToyRepo(targetPath: string): void {
  if (existsSync(targetPath)) rmSync(targetPath, { recursive: true, force: true })
  mkdirSync(join(targetPath, 'src'), { recursive: true })

  writeFileSync(join(targetPath, 'README.md'), README_MD)
  writeFileSync(join(targetPath, 'src', 'greet.ts'), GREET_TS)

  const git = (args: string[]) => execFileSync('git', args, { cwd: targetPath, stdio: 'ignore' })
  git(['init', '--initial-branch=main'])
  git(['config', 'user.email', 'engine@sutra.local'])
  git(['config', 'user.name', 'Sutra Engine Fixture'])
  // Pin line endings so the scripted, hardcoded-LF apply-test-edit matches on
  // every platform. Windows git defaults to core.autocrlf=true, which would
  // rewrite this LF fixture to CRLF in the working tree and break the exact
  // oldString match. (Real edits are fine — the model reads and matches the
  // file's actual bytes; only this fixed-string fixture needs the guarantee.)
  git(['config', 'core.autocrlf', 'false'])
  git(['config', 'core.eol', 'lf'])
  git(['add', '-A'])
  git(['commit', '-m', 'Initial toy-repo fixture'])
}
