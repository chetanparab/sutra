/**
 * The real-mode launch surface (ROADMAP.md Phase 3, issue #29): workspace
 * picker (Phase 0's workspace-root guard made user-facing), intent, provider,
 * the user's own verify command, a session API key, and the explicit consent
 * checkbox — the CLI's --allow-run flag as a surface a human reads. Renders
 * only inside the desktop shell; the web demo never sees it.
 */
import { Boxes, ChevronDown, Cpu, FolderGit2, FolderOpen, KeyRound, Play, Plug, ShieldCheck, Sparkles, Terminal, TriangleAlert } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Button, Toggle, cn } from '../components/ui'
import { keychainDelete, keychainStatus, pickWorkspaceFolder, type RealLoopArgs } from '../desktop/realLoop'

const FIELD =
  'w-full rounded-[var(--radius)] border border-primary/[0.14] bg-primary/[0.02] px-3.5 py-2.5 text-[13px] text-primary outline-none transition-all placeholder:text-faint hover:border-primary/25 focus:border-accent/55 focus:bg-primary/[0.04] focus:ring-2 focus:ring-accent/15'

const CUSTOM = '__custom__'

/** A labelled field group — the unit of the panel's hierarchy. */
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

/** A label↔toggle row — the panel's boolean control, replacing raw checkboxes. */
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

export default function RealLaunchPanel({
  maxIterations,
  running,
  launchError,
  onLaunch,
}: {
  maxIterations: number
  running: boolean
  launchError: string | null
  onLaunch: (args: RealLoopArgs) => void
}) {
  const [workspacePath, setWorkspacePath] = useState('')
  const [initProject, setInitProject] = useState(false)
  const [intent, setIntent] = useState('')
  const [provider, setProvider] = useState('claude-code')
  const [model, setModel] = useState('default')
  const [verifyCmd, setVerifyCmd] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [storeKey, setStoreKey] = useState(true)
  const [hasStoredKey, setHasStoredKey] = useState(false)
  const [consent, setConsent] = useState(false)
  // Phase 5 advanced options
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [useContainer, setUseContainer] = useState(false)
  const [verifyImage, setVerifyImage] = useState('node:alpine')
  const [allowNetwork, setAllowNetwork] = useState(false)
  const [mcpText, setMcpText] = useState('')

  // The stored key itself never reaches this webview — only whether one
  // exists. Re-checked per provider (each has its own keychain entry).
  useEffect(() => {
    let cancelled = false
    keychainStatus(provider).then((v) => {
      if (!cancelled) setHasStoredKey(v)
    })
    return () => {
      cancelled = true
    }
  }, [provider])

  const forgetKey = async () => {
    await keychainDelete(provider)
    setHasStoredKey(false)
  }

  const complete = workspacePath !== '' && intent.trim() !== '' && model.trim() !== '' && verifyCmd.trim() !== '' && consent
  const activeProvider = PROVIDERS.find((p) => p.id === provider)
  const keyName = activeProvider?.keyName ?? 'API key'
  /** claude-code drives the local signed-in CLI — there is no key to collect. */
  const keyless = activeProvider?.keyName === ''

  // The dropdown shows a fixed list; anything not on it is a custom model, and
  // the select falls to "Custom…" which reveals a free-text box (OpenAI-compat
  // endpoints and future models need that escape hatch).
  const isCustomModel = !(activeProvider?.models ?? []).some((m) => m.id === model)

  // Switching provider swaps in that provider's default model, so the field is
  // never left pointing at a model the new provider doesn't have.
  const onProviderChange = (id: string) => {
    setProvider(id)
    setModel(PROVIDERS.find((p) => p.id === id)?.defaultModel ?? '')
  }

  const pick = async () => {
    const picked = await pickWorkspaceFolder()
    if (picked) setWorkspacePath(picked)
  }

  const doLaunch = () => {
    onLaunch({
      workspacePath,
      intent: intent.trim(),
      provider,
      model: model.trim(),
      verifyCmd: verifyCmd.trim(),
      consentToRun: consent,
      maxIterations,
      initIfNeeded: initProject || undefined,
      // A key typed under another provider must not ride along into keyless mode.
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
    if (apiKey.trim() !== '' && storeKey) {
      // The host saves it at launch; reflect that here and drop the plaintext.
      setApiKey('')
      setHasStoredKey(true)
    }
  }

  return (
    <section className="surface overflow-hidden">
      <div className="space-y-5 p-5">
        {/* Repository */}
        <Field icon={<FolderGit2 size={12} className="text-muted" />} label="Repository">
          {workspacePath === '' ? (
            <button
              onClick={pick}
              className="flex w-full items-center justify-center gap-2 rounded-[var(--radius)] border border-dashed border-primary/25 bg-primary/[0.02] px-3.5 py-3.5 text-[12.5px] text-muted transition-all hover:border-accent/45 hover:bg-accent/[0.03] hover:text-secondary"
            >
              <FolderOpen size={14} className="text-accent" /> Choose the folder the loop may touch
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
          <div className="mt-2.5">
            <ToggleRow
              checked={initProject}
              onChange={setInitProject}
              title="Start a new project here"
              desc="Pick an empty folder and the loop scaffolds it: git init + a first commit, then the model builds from nothing. Off for existing repos."
            />
          </div>
        </Field>

        {/* Intent */}
        <Field icon={<Sparkles size={12} className="text-muted" />} label="What should change">
          <textarea
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            rows={2}
            placeholder="Describe the change and how you'll know it worked — e.g. add a retry to the upload helper; the flaky test should pass."
            className={cn(FIELD, 'resize-none leading-relaxed')}
          />
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
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Exact model id (e.g. from your OpenAI-compatible endpoint)"
              autoFocus
              className={cn(FIELD, 'mt-2 font-mono text-[12px]')}
            />
          )}
        </Field>

        {/* Verify */}
        <Field icon={<Terminal size={12} className="text-muted" />} label="Verify command" hint="yours — the model can't change it">
          <input
            value={verifyCmd}
            onChange={(e) => setVerifyCmd(e.target.value)}
            placeholder="e.g. npm test"
            className={cn(FIELD, 'font-mono text-[12px]')}
          />
        </Field>

        {/* API key — or the keyless claude-code path */}
        {keyless ? (
          <div className="flex items-center gap-2.5 rounded-[var(--radius)] border border-ok/25 bg-ok/[0.05] px-3.5 py-2.5">
            <ShieldCheck size={14} className="shrink-0 text-ok" />
            <span className="text-[12px] leading-relaxed text-secondary">
              <span className="font-medium text-primary">No API key needed.</span> Runs through your locally signed-in Claude
              Code — its auth never passes through Sutra. Not installed?{' '}
              <span className="font-mono text-[11px]">npm i -g @anthropic-ai/claude-code</span>, then run{' '}
              <span className="font-mono text-[11px]">claude</span> once to sign in.
            </span>
          </div>
        ) : (
        <Field icon={<KeyRound size={12} className="text-muted" />} label="API key" hint={keyName}>
          {hasStoredKey ? (
            <div className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-ok/25 bg-ok/[0.05] px-3.5 py-2.5">
              <span className="flex min-w-0 items-center gap-2 text-[12px] text-secondary">
                <ShieldCheck size={14} className="shrink-0 text-ok" />
                Saved in your OS keychain — it never enters this window again.
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

        {/* Consent — the one deliberate moment */}
        <div className="flex items-start justify-between gap-4 rounded-[var(--radius)] border border-warn/30 bg-warn/[0.06] p-3.5">
          <span className="text-[12px] leading-relaxed text-secondary">
            <span className="font-medium text-primary">Run my verify command on this machine.</span>{' '}
            {useContainer
              ? 'It runs inside an isolated container (below), not directly on your host — but it is still your code executing.'
              : 'It executes the command above, and code the loop just wrote. Only proceed on a repo you trust.'}
          </span>
          <Toggle checked={consent} onChange={setConsent} />
        </div>

        {/* Advanced — isolated Verify (#10) + BYO-agent MCP (#9) */}
        <div className="overflow-hidden rounded-[var(--radius)] border border-primary/[0.1]">
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex w-full items-center justify-between px-3.5 py-2.5 text-[12px] text-secondary transition-colors hover:bg-primary/[0.02] hover:text-primary"
          >
            <span className="flex items-center gap-2">
              <Boxes size={13} className="text-muted" /> Advanced — isolation &amp; your own tools
            </span>
            <ChevronDown size={14} className={cn('text-muted transition-transform duration-200', showAdvanced && 'rotate-180')} />
          </button>
          {showAdvanced && (
            <div className="space-y-3.5 border-t border-primary/[0.08] px-3.5 py-3.5">
              <ToggleRow
                checked={useContainer}
                onChange={setUseContainer}
                title="Isolate Verify in a container"
                desc="Runs your test command in a throwaway Docker container — only this folder mounted, network off. Needs Docker running; falls back to local if it isn't."
              />
              {useContainer && (
                <div className="space-y-3 border-l-2 border-accent/20 pl-3.5">
                  <input value={verifyImage} onChange={(e) => setVerifyImage(e.target.value)} placeholder="Container image, e.g. node:alpine" className={cn(FIELD, 'font-mono text-[12px]')} />
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11.5px] text-muted">
                      Allow network access <span className="text-faint">— off by default, that's the isolation</span>
                    </span>
                    <Toggle checked={allowNetwork} onChange={setAllowNetwork} />
                  </div>
                </div>
              )}
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

      {/* Launch bar — the primary moment */}
      <div className="flex items-center justify-between gap-3 border-t border-primary/[0.08] bg-primary/[0.015] px-5 py-3.5">
        <span className="text-[11px] text-muted">
          {maxIterations} iteration{maxIterations === 1 ? '' : 's'} · guided · abort anytime
        </span>
        <Button variant="primary" size="lg" disabled={!complete || running} onClick={doLaunch}>
          <Play size={14} /> {running ? 'Loop running…' : 'Launch real loop'}
        </Button>
      </div>
    </section>
  )
}

function basename(p: string): string {
  return p.replace(/\/+$/, '').split('/').pop() || p
}
