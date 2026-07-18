/**
 * The real-mode launch surface (ROADMAP.md Phase 3, issue #29): workspace
 * picker (Phase 0's workspace-root guard made user-facing), intent, provider,
 * the user's own verify command, a session API key, and the explicit consent
 * checkbox — the CLI's --allow-run flag as a surface a human reads. Renders
 * only inside the desktop shell; the web demo never sees it.
 */
import { FolderOpen, KeyRound, Play, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Button, Label, Slab, cn } from '../components/ui'
import { pickWorkspaceFolder, type RealLoopArgs } from '../desktop/realLoop'

const FIELD =
  'w-full rounded-[var(--radius)] border border-primary/12 bg-primary/[0.03] px-3 py-2 text-[12.5px] text-primary outline-none transition-colors placeholder:text-faint focus:border-accent/50'

const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic', keyName: 'ANTHROPIC_API_KEY' },
  { id: 'openai-compat', label: 'OpenAI-compatible', keyName: 'OPENAI_API_KEY' },
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
  const [model, setModel] = useState('')
  const [verifyCmd, setVerifyCmd] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [consent, setConsent] = useState(false)

  const complete = workspacePath !== '' && intent.trim() !== '' && model.trim() !== '' && verifyCmd.trim() !== '' && consent
  const keyName = PROVIDERS.find((p) => p.id === provider)?.keyName ?? 'API key'

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
        <select value={provider} onChange={(e) => setProvider(e.target.value)} className={FIELD}>
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model id" className={cn(FIELD, 'font-mono text-[11.5px]')} />
      </div>

      <input
        value={verifyCmd}
        onChange={(e) => setVerifyCmd(e.target.value)}
        placeholder="Verify command — yours, e.g. npm test"
        className={cn(FIELD, 'font-mono text-[11.5px]')}
      />

      <div className="relative">
        <KeyRound size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={`${keyName} — this session only, never written to disk`}
          autoComplete="off"
          className={cn(FIELD, 'pl-8 font-mono text-[11.5px]')}
        />
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-[var(--radius)] border border-warn/25 bg-warn/[0.06] p-3">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-[var(--warn,#b45309)]" />
        <span className="text-[11.5px] leading-snug text-secondary">
          <span className="font-medium text-primary">Run my verify command on this machine.</span> Verification executes
          the command above — and code the loop just modified. Only proceed on a repo you trust.
        </span>
      </label>

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
          onClick={() =>
            onLaunch({
              workspacePath,
              intent: intent.trim(),
              provider,
              model: model.trim(),
              verifyCmd: verifyCmd.trim(),
              consentToRun: consent,
              maxIterations,
              apiKey: apiKey.trim() || undefined,
            })
          }
        >
          <Play size={13} /> {running ? 'Loop running…' : 'Launch real loop'}
        </Button>
      </div>
    </Slab>
  )
}
