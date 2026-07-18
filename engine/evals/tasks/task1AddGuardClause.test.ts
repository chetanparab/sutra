import assert from 'node:assert/strict'
import { test } from 'node:test'
import { structuralCheck } from './task1AddGuardClause'

test('flags a correctly-guarded function as plausible', () => {
  const content = 'export function divide(a: number, b: number): number {\n  if (b === 0) throw new Error("division by zero")\n  return a / b\n}\n'
  const result = structuralCheck(content)
  assert.equal(result.plausible, true)
  assert.deepEqual(result.notes, [])
})

test('flags an unguarded function as not plausible, with a helpful note', () => {
  const content = 'export function divide(a: number, b: number): number {\n  return a / b\n}\n'
  const result = structuralCheck(content)
  assert.equal(result.plausible, false)
  assert.ok(result.notes.length > 0)
})
