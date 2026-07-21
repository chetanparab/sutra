/**
 * First-run onboarding (ROADMAP.md Phase 4, issue #42): a three-step wizard
 * shown once in the desktop shell before the first real run — provider → key
 * (saved into the OS keychain) → how it works. Renders only in the desktop
 * shell and only when no key is stored yet; the web demo never sees it, and it
 * dismisses to localStorage so it doesn't reappear.
 *
 * It intentionally does NOT gate the app — a user can skip straight to the demo
 * or the launch panel. It's a welcome, not a paywall.
 */
import { ArrowLeft, ArrowRight, Check, FolderGit2, KeyRound, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import { Button, cn } from '../components/ui'
import { keychainSave } from './engine'

const FIELD =
  'w-full rounded-[var(--radius)] border border-primary/12 bg-primary/[0.03] px-3 py-2 text-[12.5px] text-primary outline-none transition-colors placeholder:text-faint focus:border-accent/50'

const PROVIDERS = [
  { id: 'claude-code', label: 'Claude Code', keyName: '', hint: 'Your local sign-in — no key' },
  { id: 'anthropic', label: 'Anthropic', keyName: 'ANTHROPIC_API_KEY', hint: 'Claude models' },
  { id: 'openai-compat', label: 'OpenAI-compatible', keyName: 'OPENAI_API_KEY', hint: 'OpenAI, Groq, Ollama, …' },
]

export const ONBOARDING_SEEN_KEY = 'sutra.onboarding.seen.v1'

export default function Onboarding({ onClose, onStartBuilding }: { onClose: () => void; onStartBuilding: () => void }) {
  const [step, setStep] = useState(0)
  const [provider, setProvider] = useState('claude-code')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const markSeen = () => {
    try {
      localStorage.setItem(ONBOARDING_SEEN_KEY, '1')
    } catch {
      /* private mode / storage disabled — worst case it shows again */
    }
  }
  const dismiss = () => {
    markSeen()
    onClose()
  }
  const startBuilding = () => {
    markSeen()
    onStartBuilding()
  }

  const keyName = PROVIDERS.find((p) => p.id === provider)?.keyName ?? 'API key'
  const keyless = PROVIDERS.find((p) => p.id === provider)?.keyName === ''

  const saveKeyAndAdvance = async () => {
    if (keyless || apiKey.trim() === '') {
      setStep(2)
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      await keychainSave(provider, apiKey.trim())
      setApiKey('')
      setStep(2)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm">
      <div className="surface relative w-full max-w-lg rounded-[calc(var(--radius)*1.5)] p-7">
        <button onClick={dismiss} className="absolute right-4 top-4 text-muted transition-colors hover:text-primary" title="Skip">
          <X size={16} />
        </button>

        {/* progress dots */}
        <div className="mb-5 flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className={cn('h-1 rounded-full transition-all', i === step ? 'w-6 bg-accent' : i < step ? 'w-3 bg-accent/40' : 'w-3 bg-primary/12')} />
          ))}
        </div>

        {step === 0 && (
          <div className="anim-rise">
            <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius)] bg-accent/12 ring-1 ring-accent/25">
              <Sparkles size={18} className="text-accent" />
            </span>
            <h2 className="serif-hero mt-4 font-display text-[24px] font-semibold tracking-[-0.02em]">Welcome to Sutra</h2>
            <p className="mt-2.5 text-[13px] leading-relaxed text-secondary">
              Point it at a folder — a real repo, or an empty one to start fresh — say what you want, and a real loop
              iterates until it works: edit, run the checks, reflect, again, ending on a branch you merge.
            </p>
            <p className="mt-3 text-[12px] leading-relaxed text-muted">
              No API key needed — it can run on your local Claude Code sign-in. One quick thing first.
            </p>
            <div className="mt-6 flex justify-end">
              <Button variant="primary" onClick={() => setStep(1)}>
                Get started <ArrowRight size={13} />
              </Button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="anim-rise">
            <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius)] bg-accent/12 ring-1 ring-accent/25">
              <KeyRound size={18} className="text-accent" />
            </span>
            <h2 className="serif-hero mt-4 font-display text-[22px] font-semibold tracking-[-0.02em]">Choose a model</h2>
            <p className="mt-2 text-[12.5px] leading-relaxed text-secondary">
              Easiest: your local <span className="font-medium text-primary">Claude Code</span> sign-in — no key, its auth
              never passes through Sutra. Or bring your own key; it’s saved in your OS keychain and handed to the engine
              as an env var only — never disk, never a command line, never logged.
            </p>

            <div className="mt-4 space-y-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setProvider(p.id)}
                  className={cn('flex w-full items-center justify-between rounded-[var(--radius)] border p-3 text-left transition-all', provider === p.id ? 'border-accent/45 bg-accent/[0.09]' : 'border-primary/10 hover:border-primary/20')}
                >
                  <span>
                    <span className="block font-display text-[13px] font-medium">{p.label}</span>
                    <span className="block text-[11px] text-muted">{p.hint}</span>
                  </span>
                  {p.keyName === '' && <span className="rounded-full bg-ok/12 px-2 py-0.5 text-[10px] font-medium text-ok">no key</span>}
                </button>
              ))}
            </div>

            {keyless ? (
              <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-muted">
                <Check size={13} className="text-ok" /> Nothing to enter. Just make sure you’ve run <span className="font-mono text-[11px] text-secondary">claude</span> once to sign in.
              </p>
            ) : (
              <div className="relative mt-3">
                <KeyRound size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={`${keyName} (optional now — you can add it later)`}
                  autoComplete="off"
                  className={cn(FIELD, 'pl-8 font-mono text-[11.5px]')}
                />
              </div>
            )}
            {saveError && <p className="mt-2 text-[11px] text-warn">{saveError}</p>}

            <div className="mt-6 flex items-center justify-between">
              <button onClick={() => setStep(0)} className="flex items-center gap-1 text-[12px] text-muted transition-colors hover:text-secondary">
                <ArrowLeft size={12} /> Back
              </button>
              <div className="flex items-center gap-3">
                <button onClick={() => setStep(2)} className="text-[12px] text-muted transition-colors hover:text-secondary">
                  Skip for now
                </button>
                <Button variant="primary" disabled={saving} onClick={() => void saveKeyAndAdvance()}>
                  {saving ? 'Saving…' : apiKey.trim() ? 'Save key' : 'Continue'} <ArrowRight size={13} />
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="anim-rise">
            <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius)] bg-ok/12 ring-1 ring-ok/25">
              <FolderGit2 size={18} className="text-ok" />
            </span>
            <h2 className="serif-hero mt-4 font-display text-[22px] font-semibold tracking-[-0.02em]">You're set</h2>
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-secondary">
              On the <span className="font-medium text-primary">Launch</span> screen: pick a folder — a repo, or an empty
              one to start fresh — say what you want, and go. Sutra works out how to test it. Three things stay true,
              always:
            </p>
            <ul className="mt-3 space-y-1.5 text-[12px] text-secondary">
              {[
                'It only touches the folder you pick.',
                'It runs the project’s checks only after you consent.',
                'Nothing merges to your branch until you click merge.',
              ].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <Check size={13} className="mt-0.5 shrink-0 text-ok" /> {t}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex items-center justify-between">
              <button onClick={() => setStep(1)} className="flex items-center gap-1 text-[12px] text-muted transition-colors hover:text-secondary">
                <ArrowLeft size={12} /> Back
              </button>
              <Button variant="primary" onClick={startBuilding}>
                Start <ArrowRight size={13} />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
