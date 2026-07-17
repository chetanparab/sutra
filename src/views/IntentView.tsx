import { ArrowRight, CircleDot, GitBranch, Loader2, Play, Sparkles, Target, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button, Chip, Label, Slab, cn } from '../components/ui'
import { BLAST_SUMMARY, INTENT_ID, INTENT_SUGGESTIONS, INTENT_TEXT, INTERPRETATION, SIGNALS } from '../scenario'
import type { Mode } from '../types'

type Phase = 'compose' | 'interpreting' | 'card'

// The live loop, code surface and WASM verification are wired to one built-in
// scenario (payment-retry idempotency). We detect when the typed intent is that
// scenario so a custom intent is framed honestly instead of being mislabelled.
const CANON_RE = /idempoten|payment[- ]?retr|retry[- ]?flow|duplicate charg|dedup/i
const isCanonIntent = (t: string) => CANON_RE.test(t)

export default function IntentView({ mode, dispatched, onDispatch }: { mode: Mode; dispatched: boolean; onDispatch: () => void }) {
  const [text, setText] = useState(dispatched ? INTENT_TEXT : '')
  const [canon, setCanon] = useState(true)
  const [phase, setPhase] = useState<Phase>(dispatched ? 'card' : 'compose')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (phase !== 'interpreting') return
    const id = setTimeout(() => setPhase('card'), 1100)
    return () => clearTimeout(id)
  }, [phase])

  const interpret = () => {
    if (!text.trim()) return
    setCanon(isCanonIntent(text))
    setPhase('interpreting')
  }

  const loadDemo = () => {
    setText(INTENT_TEXT)
    setCanon(true)
    setPhase('interpreting')
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-6 pb-28 pt-20">
        <div className="anim-rise mb-9">
          <Label>{mode === 'specless' ? 'Declare intent' : 'Declare intent · spec-driven'}</Label>
          <h1 className="serif-hero balance mt-5 font-display text-[clamp(40px,5.4vw,60px)] font-semibold leading-[1.0] tracking-[-0.035em]">
            What should <span className="italic font-medium text-accent">change?</span>
          </h1>
          <p className="pretty mt-4 max-w-[54ch] text-[15px] leading-[1.62] text-secondary">
            {mode === 'specless'
              ? 'Name the outcome. You’ll shape a loop that iterates against live context until every acceptance signal converges — no frozen spec.'
              : 'Name the outcome. Sutra drafts requirements, design and tasks for your review before a line is written.'}
          </p>
        </div>

        <div className="anim-rise surface flex items-center gap-3.5 px-5" style={{ animationDelay: '60ms' }}>
          <Sparkles size={18} className="shrink-0 text-accent" />
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && phase === 'compose' && interpret()}
            readOnly={phase !== 'compose'}
            placeholder="Describe the change in one sentence…"
            spellCheck={false}
            className="h-[68px] flex-1 bg-transparent font-display text-[18px] tracking-[-0.01em] text-primary outline-none placeholder:font-normal placeholder:text-muted"
          />
          {phase === 'compose' && (
            <Button variant="primary" onClick={interpret} disabled={!text.trim()}>
              Interpret
            </Button>
          )}
          {phase === 'interpreting' && (
            <span className="flex items-center gap-2 text-[12px] text-secondary">
              <Loader2 size={13} className="spin" /> Interpreting…
            </span>
          )}
          {phase === 'card' && <Chip tone={canon ? 'accent' : 'neutral'}>{canon ? INTENT_ID : 'Draft'}</Chip>}
        </div>

        {phase === 'compose' && (
          <div className="anim-in mt-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] text-muted">Try</span>
            {INTENT_SUGGESTIONS.map((s) => {
              const live = isCanonIntent(s)
              return (
                <button
                  key={s}
                  onClick={() => {
                    setText(s)
                    inputRef.current?.focus()
                  }}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] transition-colors',
                    live
                      ? 'border-accent/30 text-primary hover:border-accent/50'
                      : 'border-primary/10 text-secondary hover:border-primary/25 hover:text-primary',
                  )}
                >
                  {s.replace(/\.$/, '')}
                  {live && <span className="text-[9.5px] font-medium uppercase tracking-wider text-accent">live</span>}
                </button>
              )
            })}
          </div>
        )}

        {phase === 'card' && canon && (
          <div className="anim-rise mt-4 space-y-3">
            <Slab title="Interpretation">
              <p className="text-[13.5px] leading-relaxed text-primary">{INTERPRETATION}</p>
              <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-primary/10 pt-3.5">
                <span className="flex items-center gap-1.5 text-[12px] text-secondary">
                  <GitBranch size={13} className="text-muted" /> blast <span className="font-mono text-[11.5px]">{BLAST_SUMMARY}</span>
                </span>
                <span className="flex items-center gap-1.5 text-[12px] text-secondary">
                  <Users size={13} className="text-muted" /> {mode === 'specless' ? '6 agents · Sense→Reflect loop' : '5 agents · 12 tasks'}
                </span>
                <span className="flex items-center gap-1.5 text-[12px] text-secondary">
                  <Target size={13} className="text-muted" /> {SIGNALS.length} signals
                </span>
              </div>
            </Slab>

            <Slab title="Acceptance signals — machine-checkable, not prose" bodyClassName="divide-y divide-primary/[0.07]">
              {SIGNALS.map((s) => (
                <div key={s.id} className="flex items-center gap-2.5 py-2 first:pt-0 last:pb-0">
                  <CircleDot size={13} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 text-[12.5px] text-primary">{s.name}</span>
                  <span className="hidden shrink-0 font-mono text-[10px] text-muted sm:block">{s.test.split('#')[0]}</span>
                </div>
              ))}
            </Slab>

            <div className="flex items-center justify-end gap-2 pt-1">
              {!dispatched ? (
                <>
                  <Button variant="ghost" onClick={() => setPhase('compose')}>
                    Adjust intent
                  </Button>
                  <Button variant="primary" size="lg" onClick={onDispatch}>
                    {mode === 'specless' ? 'Design the loop' : 'Draft spec'} <ArrowRight size={14} />
                  </Button>
                </>
              ) : (
                <Chip tone="ok">{mode === 'specless' ? 'Loop designed' : 'Spec drafted'}</Chip>
              )}
            </div>
          </div>
        )}

        {phase === 'card' && !canon && (
          <div className="anim-rise mt-4 space-y-3">
            <Slab title="Your intent">
              <p className="text-[15px] font-display leading-relaxed text-primary">“{text.trim()}”</p>
              <p className="mt-3 border-t border-primary/10 pt-3.5 text-[12.5px] leading-relaxed text-secondary">
                This is a concept preview. Sutra’s live loop — the agent crew, the code surface and the WebAssembly
                verification — is wired to one built-in scenario: <span className="text-primary">payment-retry idempotency</span>.
                Load it to watch the loop actually run, resolve a conflict and converge with measured proof —
                <span className="text-primary"> running any intent with your own agents and models is on the roadmap.</span>
              </p>
            </Slab>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setPhase('compose')}>
                Adjust intent
              </Button>
              <Button variant="primary" size="lg" onClick={loadDemo}>
                <Play size={13} /> Load the live demo
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
