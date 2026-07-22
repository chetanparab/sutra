/**
 * The desktop home — a real tool, not a demo. Point it at a folder, say what
 * you want, launch. Everything else the engine works out for itself:
 *   - New vs existing project: an empty/non-git folder is initialized and built
 *     from scratch; an existing repo is used as-is. No toggle.
 *   - How to verify: auto-detected from the project after each Build (test
 *     script, cargo test, pytest, …). No command to type.
 * No scripted scenario, no idempotency, no "demo loop" — that lives only on the
 * web preview (LoopDesignView). This screen never imports it.
 */
import { Boxes, ChevronDown, Cpu, FolderGit2, FolderOpen, KeyRound, Play, Plug, ShieldAlert, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Button, Label, Stepper, Toggle, cn } from '../components/ui'
import { keychainDelete, keychainStatus, pickWorkspaceFolder, type RealLoopArgs } from '../desktop/realLoop'

const FIELD =
  'w-full rounded-[var(--radius)] border border-primary/[0.14] bg-primary/[0.02] px-3.5 py-2.5 text-[13px] text-primary outline-none transition-all placeholder:text-faint hover:border-primary/25 focus:border-accent/55 focus:bg-primary/[0.04] focus:ring-2 focus:ring-accent/15'
const CUSTOM = '__custom__'

function Field({ icon, label, hint, children }: { icon?: ReactNode; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-1.5 text-[11px] font-medium tracking-[0.01em] text-secondary">
          {icon}
          {label}
        </span>
        {hint && <span className="text-[10.5px] text-faint">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function ToggleRow({ checked, onChange, title, desc }: { checked: boolean; onChange: (v: boolean) => void; title: ReactNode; desc?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 pt-px">
        <div className="text-[12.5px] font-medium text-primary">{title}</div>
        {desc && <div className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{desc}</div>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

const PROVIDERS = [
  {
    // No API key: drives the locally installed, signed-in Claude Code CLI.
    id: 'claude-code',
    label: 'Claude Code — your local sign-in',
    keyName: '',
    defaultModel: 'default',
    models: [
      { id: 'default', label: 'Your Claude Code default model' },
      { id: 'sonnet', label: 'Claude Sonnet — balanced' },
      { id: 'opus', label: 'Claude Opus — most capable' },
      { id: 'haiku', label: 'Claude Haiku — fastest' },
    ],
  },
  {
    id: 'anthropic',
    label: 'Anthropic API key',
    keyName: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-sonnet-5',
    models: [
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 — balanced (recommended)' },
      { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 — most capable' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 — fastest' },
    ],
  },
  {
    id: 'openai-compat',
    label: 'OpenAI-compatible API key',
    keyName: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o',
    models: [
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
      { id: 'o3-mini', label: 'o3-mini' },
    ],
  },
]

export default function RealLauncher({
  mode,
  running,
  drafting,
  launchError,
  onLaunch,
  onDraftSpec,
}: {
  /** 'specless' launches the loop directly; 'spec' drafts a reviewable plan first. */
  mode: 'specless' | 'spec'
  running: boolean
  drafting?: boolean
  launchError: string | null
  onLaunch: (args: RealLoopArgs) => void
  onDraftSpec?: (args: RealLoopArgs) => void
}) {
  const specMode = mode === 'spec'
  const [workspacePath, setWorkspacePath] = useState('')
  const [intent, setIntent] = useState('')
  const [provider, setProvider] = useState('claude-code')
  const [model, setModel] = useState('default')
  const [apiKey, setApiKey] = useState('')
  const [storeKey, setStoreKey] = useState(true)
  const [hasStoredKey, setHasStoredKey] = useState(false)
  const [maxIterations, setMaxIterations] = useState(3)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [useContainer, setUseContainer] = useState(false)
  const [verifyImage, setVerifyImage] = useState('node:alpine')
  const [allowNetwork, setAllowNetwork] = useState(false)
  const [mcpText, setMcpText] = useState('')

  useEffect(() => {
    let cancelled = false
    keychainStatus(provider).then((v) => !cancelled && setHasStoredKey(v))
    return () => {
      cancelled = true
    }
  }, [provider])

  const forgetKey = async () => {
    await keychainDelete(provider)
    setHasStoredKey(false)
  }

  const activeProvider = PROVIDERS.find((p) => p.id === provider)
  const keyName = activeProvider?.keyName ?? 'API key'
  const keyless = activeProvider?.keyName === ''
  const isCustomModel = !(activeProvider?.models ?? []).some((m) => m.id === model)
  const complete = workspacePath !== '' && intent.trim() !== '' && model.trim() !== ''

  const onProviderChange = (id: string) => {
    setProvider(id)
    setModel(PROVIDERS.find((p) => p.id === id)?.defaultModel ?? '')
  }

  const pick = async () => {
    const picked = await pickWorkspaceFolder()
    if (picked) setWorkspacePath(picked)
  }

  const buildArgs = (): RealLoopArgs => ({
    workspacePath,
    intent: intent.trim(),
    provider,
    model: model.trim(),
    // Clicking Launch / Build is the consent — the safety note is shown right
    // there, and the engine still refuses without this true.
    consentToRun: true,
    maxIterations,
    // The engine figures these out — no user input:
    //   verifyCmd omitted  → auto-detected after each Build
    //   initIfNeeded true  → empty folder scaffolds; existing repo untouched
    initIfNeeded: true,
    apiKey: keyless ? undefined : apiKey.trim() || undefined,
    storeKey: !keyless && apiKey.trim() !== '' ? storeKey : undefined,
    verifyMode: useContainer ? 'container' : 'local',
    verifyImage: useContainer ? verifyImage.trim() || undefined : undefined,
    verifyAllowNetwork: useContainer ? allowNetwork : undefined,
    mcpServers: mcpText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
  })

  const dropTypedKey = () => {
    if (!keyless && apiKey.trim() !== '' && storeKey) {
      setApiKey('')
      setHasStoredKey(true)
    }
  }

  const doLaunch = () => {
    onLaunch(buildArgs())
    dropTypedKey()
  }

  // Spec mode: hand the full args (so the eventual build has consent/budget/
  // isolation), draft the plan first.
  const doDraft = () => {
    onDraftSpec?.(buildArgs())
    dropTypedKey()
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-6 pb-28 pt-20">
        <div className="anim-rise mb-7">
          <Label>{specMode ? 'Plan, then build' : 'Run the loop'}</Label>
          <h1 className="serif-hero balance mt-3.5 font-display text-[clamp(26px,3.4vw,34px)] font-semibold leading-[1.05] tracking-[-0.03em]">
            What should Sutra <span className="italic font-medium text-accent">build or change?</span>
          </h1>
          <p className="pretty mt-2.5 max-w-[58ch] text-[13.5px] leading-[1.6] text-secondary">
            {specMode
              ? 'Say what you want and Sutra drafts a real spec — requirements, approach, tasks — for you to review and edit before it writes a line. Then the same loop builds it and verifies its own work.'
              : 'Point it at a folder and say what you want. It edits on a shadow branch, checks its own work, and hands you a real branch to merge — your code is never touched until you do.'}
          </p>
        </div>

        <section className="surface anim-rise overflow-hidden" style={{ animationDelay: '60ms' }}>
          <div className="space-y-5 p-5">
            {/* Folder — new vs existing is the engine's problem, not the user's */}
            <Field icon={<FolderGit2 size={12} className="text-muted" />} label="Folder" hint="new or existing — Sutra figures it out">
              {workspacePath === '' ? (
                <button
                  onClick={pick}
                  className="flex w-full items-center justify-center gap-2 rounded-[var(--radius)] border border-dashed border-primary/25 bg-primary/[0.02] px-3.5 py-3.5 text-[12.5px] text-muted transition-all hover:border-accent/45 hover:bg-accent/[0.03] hover:text-secondary"
                >
                  <FolderOpen size={14} className="text-accent" /> Choose a folder — an existing repo, or an empty one to start fresh
                </button>
              ) : (
                <button
                  onClick={pick}
                  className="group flex w-full items-center gap-3 rounded-[var(--radius)] border border-primary/[0.14] bg-primary/[0.02] px-3.5 py-2.5 text-left transition-all hover:border-accent/40"
                >
                  <FolderGit2 size={15} className="shrink-0 text-accent" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-primary">{basename(workspacePath)}</span>
                    <span className="block truncate font-mono text-[10.5px] text-faint">{workspacePath}</span>
                  </span>
                  <span className="shrink-0 text-[10.5px] text-muted opacity-0 transition-opacity group-hover:opacity-100">Change</span>
                </button>
              )}
            </Field>

            {/* Intent */}
            <Field icon={<Sparkles size={12} className="text-muted" />} label="What you want">
              <textarea
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                rows={3}
                placeholder="e.g. Add a --json flag to the CLI and cover it with a test. Or: build a small Express API that returns the weather for a city."
                className={cn(FIELD, 'resize-none leading-relaxed')}
              />
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
                <ShieldCheck size={12} className="text-ok" /> Sutra finds how to test your project automatically — no command to type.
              </p>
            </Field>

            {/* Model */}
            <Field icon={<Cpu size={12} className="text-muted" />} label="Model">
              <div className="grid grid-cols-2 gap-2.5">
                <select value={provider} onChange={(e) => onProviderChange(e.target.value)} className={FIELD}>
                  {PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <select value={isCustomModel ? CUSTOM : model} onChange={(e) => setModel(e.target.value === CUSTOM ? '' : e.target.value)} className={FIELD}>
                  {(activeProvider?.models ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                  <option value={CUSTOM}>Custom model…</option>
                </select>
              </div>
              {isCustomModel && (
                <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Exact model id" autoFocus className={cn(FIELD, 'mt-2 font-mono text-[12px]')} />
              )}
            </Field>

            {/* Key — or the keyless claude-code path */}
            {keyless ? (
              <div className="flex items-center gap-2.5 rounded-[var(--radius)] border border-ok/25 bg-ok/[0.05] px-3.5 py-2.5">
                <ShieldCheck size={14} className="shrink-0 text-ok" />
                <span className="text-[12px] leading-relaxed text-secondary">
                  <span className="font-medium text-primary">No API key needed.</span> Runs through your locally signed-in Claude
                  Code — its auth never passes through Sutra. Not signed in? Run <span className="font-mono text-[11px]">claude</span> once in a terminal.
                </span>
              </div>
            ) : (
              <Field icon={<KeyRound size={12} className="text-muted" />} label="API key" hint={keyName}>
                {hasStoredKey ? (
                  <div className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-ok/25 bg-ok/[0.05] px-3.5 py-2.5">
                    <span className="flex min-w-0 items-center gap-2 text-[12px] text-secondary">
                      <ShieldCheck size={14} className="shrink-0 text-ok" /> Saved in your OS keychain.
                    </span>
                    <Button size="sm" onClick={() => void forgetKey()}>
                      Forget
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <KeyRound size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
                      <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={`${keyName} — env only, never argv or plaintext disk`}
                        autoComplete="off"
                        className={cn(FIELD, 'pl-9 font-mono text-[12px]')}
                      />
                    </div>
                    <div className="mt-2.5 flex items-center justify-between gap-3">
                      <span className="text-[11.5px] text-muted">Remember in the OS keychain</span>
                      <Toggle checked={storeKey} onChange={setStoreKey} />
                    </div>
                  </>
                )}
              </Field>
            )}

            {/* Advanced */}
            <div className="overflow-hidden rounded-[var(--radius)] border border-primary/[0.1]">
              <button
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex w-full items-center justify-between px-3.5 py-2.5 text-[12px] text-secondary transition-colors hover:bg-primary/[0.02] hover:text-primary"
              >
                <span className="flex items-center gap-2">
                  <Boxes size={13} className="text-muted" /> Advanced — budget, isolation &amp; your own tools
                </span>
                <ChevronDown size={14} className={cn('text-muted transition-transform duration-200', showAdvanced && 'rotate-180')} />
              </button>
              {showAdvanced && (
                <div className="space-y-3.5 border-t border-primary/[0.08] px-3.5 py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[12.5px] font-medium text-primary">Iteration budget</div>
                      <div className="text-[11px] text-muted">Stop and hand back if it hasn’t converged in this many passes.</div>
                    </div>
                    <Stepper value={maxIterations} min={1} max={5} onChange={setMaxIterations} />
                  </div>
                  <div className="border-t border-primary/[0.08] pt-3.5">
                    <ToggleRow
                      checked={useContainer}
                      onChange={setUseContainer}
                      title="Isolate checks in a container"
                      desc="Run the project’s tests in a throwaway Docker container — only this folder mounted, network off. Needs Docker; falls back to local if it isn’t running."
                    />
                    {useContainer && (
                      <div className="mt-3 space-y-3 border-l-2 border-accent/20 pl-3.5">
                        <input value={verifyImage} onChange={(e) => setVerifyImage(e.target.value)} placeholder="Container image, e.g. node:alpine" className={cn(FIELD, 'font-mono text-[12px]')} />
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[11.5px] text-muted">
                            Allow network access <span className="text-faint">— off by default</span>
                          </span>
                          <Toggle checked={allowNetwork} onChange={setAllowNetwork} />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="border-t border-primary/[0.08] pt-3.5">
                    <div className="flex items-center gap-1.5 text-[12px] font-medium text-primary">
                      <Plug size={13} className="text-muted" /> Your MCP servers <span className="font-normal text-faint">(optional)</span>
                    </div>
                    <div className="mb-1.5 mt-1 text-[11px] leading-snug text-muted">
                      One per line — e.g. <span className="font-mono">npx -y @modelcontextprotocol/server-filesystem .</span>
                    </div>
                    <textarea value={mcpText} onChange={(e) => setMcpText(e.target.value)} rows={2} placeholder="(none)" className={cn(FIELD, 'resize-none font-mono text-[11.5px]')} />
                  </div>
                </div>
              )}
            </div>

            {launchError && (
              <div className="flex items-start gap-2 rounded-[var(--radius)] border border-warn/30 bg-warn/[0.08] p-3 text-[12px] text-secondary">
                <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warn" />
                <span className="min-w-0 break-words">{launchError}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-primary/[0.08] bg-primary/[0.015] px-5 py-3.5">
            <span className="flex items-start gap-1.5 text-[11px] leading-snug text-muted">
              <ShieldAlert size={13} className="mt-px shrink-0 text-warn" />
              {specMode ? (
                <>Drafting a plan runs nothing — you’ll confirm before it builds.</>
              ) : (
                <>
                  Launching runs this project’s tests — and the code the model writes — on your machine. Use a repo you
                  trust.
                </>
              )}
            </span>
            {specMode ? (
              <Button variant="primary" size="lg" disabled={!complete || drafting} onClick={doDraft}>
                <Sparkles size={14} /> {drafting ? 'Drafting the spec…' : 'Draft spec'}
              </Button>
            ) : (
              <Button variant="primary" size="lg" disabled={!complete || running} onClick={doLaunch}>
                <Play size={14} /> {running ? 'Loop running…' : 'Launch'}
              </Button>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function basename(p: string): string {
  return p.replace(/\/+$/, '').split('/').pop() || p
}
