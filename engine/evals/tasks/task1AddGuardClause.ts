/**
 * Phase 1's first hand-picked benchmark task (ROADMAP.md): a real one-line
 * intent against a real small fixture. Phase 1 doesn't run real tests yet —
 * that's Phase 2 — so "correct" here means structurally plausible on
 * inspection, not behaviorally verified. The structural check below is a
 * best-effort heuristic to flag for a human reviewer, not a pass/fail gate.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const TASK_1 = {
  id: 'add-guard-clause',
  intent: 'Add a guard clause to the divide function in src/math.ts that throws an Error with a clear message when the divisor (b) is zero.',
  targetFile: 'src/math.ts',
}

export function makeTask1Fixture(targetPath: string): void {
  if (existsSync(targetPath)) rmSync(targetPath, { recursive: true, force: true })
  mkdirSync(join(targetPath, 'src'), { recursive: true })

  writeFileSync(join(targetPath, 'README.md'), '# eval-task-1\n\nBenchmark fixture for ROADMAP.md Phase 1. Not a real project.\n')
  writeFileSync(join(targetPath, 'src', 'math.ts'), 'export function divide(a: number, b: number): number {\n  return a / b\n}\n')

  const git = (args: string[]) => execFileSync('git', args, { cwd: targetPath, stdio: 'ignore' })
  git(['init', '--initial-branch=main'])
  git(['config', 'user.email', 'engine@sutra.local'])
  git(['config', 'user.name', 'Sutra Engine Fixture'])
  git(['add', '-A'])
  git(['commit', '-m', 'Initial task-1 fixture'])
}

export interface StructuralCheckResult {
  plausible: boolean
  notes: string[]
}

/** A loose heuristic, not a gate — a correct, differently-worded edit may still fail this and still be right. Meant to flag things for the human reviewing the diff, per Phase 1's acceptance criterion. */
export function structuralCheck(finalFileContent: string): StructuralCheckResult {
  const notes: string[] = []
  const hasThrow = /throw\s+(new\s+)?Error/i.test(finalFileContent)
  const mentionsZero = /===?\s*0\b/.test(finalFileContent) || /\bzero\b/i.test(finalFileContent)

  if (!hasThrow) notes.push('No "throw ... Error" found in the edited file.')
  if (!mentionsZero) notes.push('No obvious zero-check found (heuristic — a correctly-worded check may still be missed by this regex).')

  return { plausible: hasThrow && mentionsZero, notes }
}
