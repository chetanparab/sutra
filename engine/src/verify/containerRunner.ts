/**
 * Isolated Verify (ROADMAP.md Phase 5, issue #10): run the user's verify
 * command inside a throwaway Docker container instead of directly on the host.
 *
 * This closes SECURITY.md's #1 residual risk. The local runner executes a
 * consented command — and any code the loop just wrote — with the host's full
 * privileges; on an untrusted repo that command can do anything the user can.
 * The container runner confines it: only the workspace is mounted (nothing
 * else on the host filesystem is reachable), the network is off by default,
 * and the container is deleted when the run ends (`--rm`).
 *
 * Same `VerifyRunResult` shape as the local runner, so it drops into the loop
 * as an alternative Verify backend with no downstream changes. Consent is
 * still required — isolation reduces blast radius, it doesn't remove the fact
 * that you're running code.
 */
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import type { VerifyRunResult } from './runner'

const DEFAULT_TIMEOUT_MS = 120_000
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024
/** A small, ubiquitous default with a POSIX shell. Callers should pass an image with their repo's toolchain. */
export const DEFAULT_VERIFY_IMAGE = 'alpine:latest'

export interface ContainerVerifyParams {
  workspaceRoot: string
  /** The user's own verify command — never model-authored. Runs via `sh -lc` inside the container. */
  command: string
  /** Must be literally `true` — explicit human consent (see runner.ts). */
  consentToRun: true
  /** Container image with the repo's toolchain (node:alpine, python:slim, …). Defaults to alpine. */
  image?: string
  /** Allow the command network access. Off by default — isolation is the point. */
  allowNetwork?: boolean
  timeoutMs?: number
  /** Injected for tests; defaults to the real `docker` CLI. */
  dockerPath?: string
}

/** Whether a working Docker daemon is reachable — callers fall back to the local runner if not. */
export function isDockerAvailable(dockerPath = 'docker'): boolean {
  const probe = spawnSync(dockerPath, ['info', '--format', '{{.ServerVersion}}'], { encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'ignore'] })
  return probe.status === 0 && (probe.stdout?.trim().length ?? 0) > 0
}

export function runVerifyInContainer(params: ContainerVerifyParams): VerifyRunResult {
  if (params.consentToRun !== true) {
    throw new Error('Verify refused: consentToRun must be explicitly true. This executes real commands, even inside a container.')
  }

  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const image = params.image ?? DEFAULT_VERIFY_IMAGE
  const workspaceRoot = resolve(params.workspaceRoot)
  const dockerPath = params.dockerPath ?? 'docker'

  // Build the docker argv explicitly (no shell): the mount, the workdir, the
  // network posture, the image, then the user's command handed to the
  // container's own shell. The workspace is the ONLY host path exposed.
  const args = [
    'run',
    '--rm',
    ...(params.allowNetwork ? [] : ['--network', 'none']),
    '-v',
    `${workspaceRoot}:/work`,
    '-w',
    '/work',
    image,
    'sh',
    '-lc',
    params.command,
  ]

  const startedAt = Date.now()
  const result = spawnSync(dockerPath, args, {
    timeout: timeoutMs,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const durationMs = Date.now() - startedAt

  const timedOut = result.error !== undefined && 'code' in result.error && (result.error as NodeJS.ErrnoException).code === 'ETIMEDOUT'
  if (result.error && !timedOut) {
    throw new Error(`Could not run docker (${dockerPath}): ${result.error.message}. Is Docker installed and running?`)
  }

  return {
    passed: !timedOut && result.status === 0,
    exitCode: result.status,
    termSignal: result.signal,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    durationMs,
    timedOut,
  }
}
