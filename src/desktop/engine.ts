/**
 * The webview side of the desktop shell's engine bridge (ROADMAP.md Phase 3).
 * In the browser build all of this is inert: `isDesktop()` is false, the
 * Tauri API module is loaded only behind that check (dynamic import, so Vite
 * splits it out of the web bundle), and every surface that uses it renders
 * nothing. The scripted demo stays exactly what it was.
 */

export interface EngineInfo {
  engine: string
  node: string
}

export function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * Save an API key into the OS keychain (onboarding, issue #42). The plaintext
 * crosses to the Rust host once and is dropped; afterwards only the host reads
 * it, into the engine child's env. Throws on the web (no keychain there).
 */
export async function keychainSave(provider: string, key: string): Promise<void> {
  if (!isDesktop()) throw new Error('The keychain is only available in the desktop app.')
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('keychain_save', { provider, key })
}

/**
 * The sidecar handshake, webview edition: asks the Rust host to spawn the
 * engine binary and report who it is. Null on the web, null on any failure —
 * callers render nothing rather than an error state, because in this phase
 * the chip is a diagnostic, not a feature.
 */
export async function fetchEngineVersion(): Promise<EngineInfo | null> {
  if (!isDesktop()) return null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const raw = await invoke<string>('engine_version')
    const parsed = JSON.parse(raw) as Partial<EngineInfo>
    return typeof parsed.engine === 'string' && typeof parsed.node === 'string'
      ? { engine: parsed.engine, node: parsed.node }
      : null
  } catch {
    return null
  }
}
