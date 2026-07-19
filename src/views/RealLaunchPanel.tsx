/**
 * The real-mode launch surface (ROADMAP.md Phase 3, issue #29): workspace
 * picker (Phase 0's workspace-root guard made user-facing), intent, provider,
 * the user's own verify command, a session API key, and the explicit consent
 * checkbox — the CLI's --allow-run flag as a surface a human reads. Renders
 * only inside the desktop shell; the web demo never sees it.
 */
import { Boxes, ChevronDown, FolderOpen, KeyRound, Play, Plug, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, Label, Slab, cn } from '../components/ui'
import { keychainDelete, keychainStatus, pickWorkspaceFolder, type RealLoopArgs } from '../desktop/realLoop'

const FIELD =
  'w-full rounded-[var(--radius)] border border-primary/12 bg-primary/[0.03] px-3 py-2 text-[12.5px] text-primary outline-none transition-colors placeholder:text-faint focus:border-accent/50'

const CUSTOM = '__custom__'

const PROVIDERS = [
  {
    id: 'anthropic',
    label: 'Anthropic',
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
    label: 'OpenAI-compatible',
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
  const [intent, setIntent] = useState('')
  const [provider, setProvider] = useState('anthropic')
  const [model, setModel] = useState('claude-sonnet-5')
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

  return (
    <Slab
      className="mt-4"
      title={
        <span className="flex items-center gap-1.5">
          <Play size={12} className="text-muted" /> <Label tick={false}>Real repo</Label>
        </span>
      }
      bodyClassName="space-y-3.5"
    >
      <p className="text-[11.5px] leading-snug text-muted">
        Point the loop at a real repository. Real edits on a shadow branch, your test command actually executed, a real
        branch at the end — your branch is never touched until you merge.
      </p>

      <div className="flex items-center gap-2">
        <button onClick={pick} className={cn(FIELD, 'flex items-center gap-2 text-left', workspacePath === '' && 'text-faint')}>
          <FolderOpen size={13} className="shrink-0 text-accent" />
          <span className="truncate font-mono text-[11.5px]">{workspacePath || 'Choose the repo the loop may touch…'}</span>
        </button>
      </div>

      <textarea
        value={intent}
        onChange={(e) => setIntent(e.target.value)}
        rows={2}
        placeholder="Intent — what should change, and how you'll know it worked"
        className={cn(FIELD, 'resize-none leading-relaxed')}
      />

      <div className="grid grid-cols-2 gap-2.5">
        <select value={provider} onChange={(e) => onProviderChange(e.target.value)} className={FIELD}>
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <select
          value={isCustomModel ? CUSTOM : model}
          onChange={(e) => setModel(e.target.value === CUSTOM ? '' : e.target.value)}
          className={FIELD}
        >
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
          className={cn(FIELD, 'font-mono text-[11.5px]')}
        />
      )}

      <input
        value={verifyCmd}
        onChange={(e) => setVerifyCmd(e.target.value)}
        placeholder="Verify command — yours, e.g. npm test"
        className={cn(FIELD, 'font-mono text-[11.5px]')}
      />

      {hasStoredKey ? (
        <div className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-primary/12 bg-primary/[0.03] px-3 py-2">
          <span className="flex min-w-0 items-center gap-2 text-[11.5px] text-secondary">
            <ShieldCheck size={13} className="shrink-0 text-ok" />
            {keyName} saved in your OS keychain — it never enters this window again.
          </span>
          <Button size="sm" onClick={() => void forgetKey()}>
            Forget key
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <KeyRound size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={`${keyName} — reaches the engine as env only, never argv or plaintext disk`}
              autoComplete="off"
              className={cn(FIELD, 'pl-8 font-mono text-[11.5px]')}
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted">
            <input type="checkbox" checked={storeKey} onChange={(e) => setStoreKey(e.target.checked)} />
            Remember in the OS keychain (Keychain / Credential Manager / Secret Service)
          </label>
        </div>
      )}

      <label className="flex cursor-pointer items-start gap-2.5 rounded-[var(--radius)] border border-warn/25 bg-warn/[0.06] p-3">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-[var(--warn,#b45309)]" />
        <span className="text-[11.5px] leading-snug text-secondary">
          <span className="font-medium text-primary">Run my verify command on this machine.</span>{' '}
          {useContainer
            ? 'It runs inside an isolated container (below), not directly on your host — but it is still your code executing.'
            : 'Verification executes the command above — and code the loop just modified. Only proceed on a repo you trust.'}
        </span>
      </label>

      {/* Phase 5 advanced options — isolated Verify (#10) + BYO-agent MCP (#9) */}
      <div className="rounded-[var(--radius)] border border-primary/10">
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2 text-[11.5px] text-secondary transition-colors hover:text-primary"
        >
          <span className="flex items-center gap-1.5">
            <Boxes size={13} className="text-muted" /> Advanced — isolation & your own tools
          </span>
          <ChevronDown size={14} className={cn('text-muted transition-transform', showAdvanced && 'rotate-180')} />
        </button>
        {showAdvanced && (
          <div className="space-y-3 border-t border-primary/10 p-3">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input type="checkbox" checked={useContainer} onChange={(e) => setUseContainer(e.target.checked)} className="mt-0.5" />
              <span className="text-[11.5px] leading-snug text-secondary">
                <span className="font-medium text-primary">Isolate Verify in a container.</span> Runs your test command in a
                throwaway Docker container — only this folder mounted, network off — instead of on your host. Needs Docker
                running; falls back to local if it isn't.
              </span>
            </label>
            {useContainer && (
              <div className="ml-6 space-y-2">
                <input
                  value={verifyImage}
                  onChange={(e) => setVerifyImage(e.target.value)}
                  placeholder="Container image (your repo's toolchain), e.g. node:alpine"
                  className={cn(FIELD, 'font-mono text-[11.5px]')}
                />
                <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted">
                  <input type="checkbox" checked={allowNetwork} onChange={(e) => setAllowNetwork(e.target.checked)} />
                  Allow the command network access (off by default — that's the isolation)
                </label>
              </div>
            )}

            <div className="flex items-start gap-2.5 border-t border-primary/10 pt-3">
              <Plug size={13} className="mt-0.5 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <div className="text-[11.5px] font-medium text-primary">Your MCP servers (optional)</div>
                <div className="mb-1.5 text-[11px] leading-snug text-muted">
                  One per line, as you'd run it — e.g. <span className="font-mono">npx -y @modelcontextprotocol/server-filesystem .</span>. Their
                  tools join the Build agent's built-in file tools.
                </div>
                <textarea
                  value={mcpText}
                  onChange={(e) => setMcpText(e.target.value)}
                  rows={2}
                  placeholder="(none)"
                  className={cn(FIELD, 'resize-none font-mono text-[11px]')}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {launchError && (
        <div className="flex items-start gap-2 rounded-[var(--radius)] border border-warn/30 bg-warn/[0.08] p-2.5 text-[11.5px] text-secondary">
          <TriangleAlert size={13} className="mt-0.5 shrink-0 text-warn" />
          <span className="min-w-0 break-words">{launchError}</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-primary/10 pt-3">
        <span className="text-[11px] text-muted">
          Budget: {maxIterations} iteration{maxIterations === 1 ? '' : 's'} · guided · abort anytime
        </span>
        <Button
          variant="primary"
          disabled={!complete || running}
          onClick={() => {
            onLaunch({
              workspacePath,
              intent: intent.trim(),
              provider,
              model: model.trim(),
              verifyCmd: verifyCmd.trim(),
              consentToRun: consent,
              maxIterations,
              apiKey: apiKey.trim() || undefined,
              storeKey: apiKey.trim() !== '' ? storeKey : undefined,
              verifyMode: useContainer ? 'container' : 'local',
              verifyImage: useContainer ? verifyImage.trim() || undefined : undefined,
              verifyAllowNetwork: useContainer ? allowNetwork : undefined,
              mcpServers: mcpText
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean),
            })
            if (apiKey.trim() !== '' && storeKey) {
              // The host saves it at launch; reflect that here and drop the
              // plaintext from React state.
              setApiKey('')
              setHasStoredKey(true)
            }
          }}
        >
          <Play size={13} /> {running ? 'Loop running…' : 'Launch real loop'}
        </Button>
      </div>
    </Slab>
  )
}
