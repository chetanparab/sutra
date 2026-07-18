import { ArrowRight, Compass, Feather, FlaskConical, Gauge, Hammer, Play, RefreshCw, ShieldQuestion, Target } from 'lucide-react'
import { Button, Label, Slab, Stepper, Toggle, cn } from '../components/ui'
import { PHASES } from '../loop/script'
import { AUTONOMY_GATES } from '../loop/useLoop'
import type { Autonomy, LoopConfig } from '../loop/types'
import { SIGNALS } from '../scenario'

const PHASE_ICON = [Compass, Hammer, FlaskConical, Feather]

const AUTONOMY: { value: Autonomy; label: string; desc: string }[] = [
  { value: 'copilot', label: 'Copilot', desc: 'Stop at every gate — you approve each iteration' },
  { value: 'guided', label: 'Guided', desc: 'Run free, stop only on a genuine conflict' },
  { value: 'autopilot', label: 'Autopilot', desc: 'Resolve conflicts itself, logged for review' },
]

const GATES: { key: keyof LoopConfig['gates']; label: string; hint: string }[] = [
  { key: 'onConflict', label: 'On conflict', hint: 'Pause when agents disagree on an approach' },
  { key: 'beforeIteration', label: 'Before each iteration', hint: 'Approve the plan before the loop spins again' },
  { key: 'onConvergence', label: 'On convergence', hint: 'Sign off before the loop exits to review' },
]

export default function LoopDesignView({
  config,
  onChange,
  onLaunch,
  realPanel,
}: {
  config: LoopConfig
  onChange: (c: LoopConfig) => void
  onLaunch: () => void
  /** Desktop shell only: the real-repo launch surface (issue #29). Null on the web. */
  realPanel?: React.ReactNode
}) {
  const setAutonomy = (a: Autonomy) => onChange({ ...config, autonomy: a, gates: { ...AUTONOMY_GATES[a] } })
  const setGate = (k: keyof LoopConfig['gates'], v: boolean) => onChange({ ...config, gates: { ...config.gates, [k]: v } })

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-6 pb-28 pt-20">
        <div className="anim-rise">
          <Label>Design the loop</Label>
          <h1 className="serif-hero balance mt-3.5 font-display text-[clamp(26px,3.4vw,34px)] font-semibold leading-[1.05] tracking-[-0.03em]">
            Shape the loop, then <span className="italic font-medium text-accent">set it running</span>
          </h1>
          <p className="pretty mt-2.5 max-w-[60ch] text-[13.5px] leading-[1.6] text-secondary">
            Work runs as a loop, not a one-shot. Agents cycle the four phases until the acceptance signals converge — you engineer its autonomy, its human gates and its budget.
          </p>
        </div>

        <Slab className="anim-rise mt-6" bodyClassName="py-5">
          <div className="flex items-center">
            {PHASES.map((p, i) => {
              const Icon = PHASE_ICON[i]
              return (
                <div key={p.id} className="flex flex-1 items-center">
                  <div className="flex-1">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius)] bg-accent/12 ring-1 ring-accent/25">
                        <Icon size={16} className="text-accent" />
                      </span>
                      <div>
                        <div className="font-display text-[14px] font-medium">{p.label}</div>
                        <div className="font-mono text-[9.5px] text-faint">0{i + 1}</div>
                      </div>
                    </div>
                    <p className="mt-2 pr-3 text-[11px] leading-snug text-muted">{p.blurb}</p>
                  </div>
                  {i < PHASES.length - 1 ? <ArrowRight size={15} className="mx-1 shrink-0 text-primary/25" /> : <RefreshCw size={15} className="mx-1 shrink-0 text-accent/70" />}
                </div>
              )
            })}
          </div>
          <div className="mt-4 flex items-center gap-1.5 border-t border-primary/10 pt-3 text-[11.5px] text-muted">
            <Feather size={12} className="text-accent" />
            Hermes carries each iteration’s memo into the next Sense — the loop’s memory between passes.
          </div>
        </Slab>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <Slab
            title={
              <span className="flex items-center gap-1.5">
                <Gauge size={12} className="text-muted" /> <Label tick={false}>Autonomy</Label>
              </span>
            }
            bodyClassName="space-y-2"
          >
            {AUTONOMY.map((a) => (
              <button
                key={a.value}
                onClick={() => setAutonomy(a.value)}
                className={cn('flex w-full items-center gap-3 rounded-[var(--radius)] border p-3 text-left transition-all', config.autonomy === a.value ? 'border-accent/45 bg-accent/[0.09]' : 'border-primary/10 hover:border-primary/20')}
              >
                <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border', config.autonomy === a.value ? 'border-accent' : 'border-primary/25')}>
                  {config.autonomy === a.value && <span className="h-2 w-2 rounded-full bg-accent" />}
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-[13px] font-medium">{a.label}</span>
                  <span className="block text-[11px] leading-snug text-muted">{a.desc}</span>
                </span>
              </button>
            ))}
          </Slab>

          <Slab
            title={
              <span className="flex items-center gap-1.5">
                <ShieldQuestion size={12} className="text-muted" /> <Label tick={false}>Human gates</Label>
              </span>
            }
            bodyClassName="space-y-3.5"
          >
            {GATES.map((g) => {
              const forced = config.autonomy === 'autopilot' && g.key === 'onConflict'
              return (
                <div key={g.key} className="flex items-start gap-3">
                  <Toggle checked={config.gates[g.key]} disabled={forced} onChange={(v) => setGate(g.key, v)} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-medium text-primary">{g.label}</div>
                    <div className="text-[11px] leading-snug text-muted">{g.hint}</div>
                  </div>
                </div>
              )
            })}
          </Slab>
        </div>

        <Slab
          className="mt-4"
          title={
            <span className="flex items-center gap-1.5">
              <Target size={12} className="text-muted" /> <Label tick={false}>Exit criteria</Label>
            </span>
          }
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[12.5px] font-medium text-primary">All {SIGNALS.length} acceptance signals green</div>
              <div className="text-[11.5px] text-muted">The loop converges when every machine-checkable signal passes at once.</div>
            </div>
            <span className="rounded-full border border-primary/12 px-2.5 py-1 font-mono text-[10px] text-secondary">primary</span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-4 border-t border-primary/10 pt-3.5">
            <div>
              <div className="text-[12.5px] font-medium text-primary">Iteration budget</div>
              <div className="text-[11.5px] text-muted">Stop and ask if the loop hasn’t converged in this many passes.</div>
            </div>
            <Stepper value={config.maxIterations} min={1} max={5} onChange={(v) => onChange({ ...config, maxIterations: v })} />
          </div>
        </Slab>

        {realPanel}

        <div className="mt-6 flex items-center justify-between gap-4">
          <p className="max-w-md text-[11.5px] leading-snug text-muted">
            {config.autonomy === 'autopilot'
              ? 'Autopilot — the loop resolves the retry-path conflict itself and logs it.'
              : config.maxIterations === 1
                ? 'Budget of 1 — the loop can’t self-correct; you’ll decide at the wall.'
                : 'The loop pauses the moment it needs you, and not before.'}
          </p>
          <Button variant="primary" size="lg" onClick={onLaunch}>
            <Play size={14} /> {realPanel ? 'Launch demo loop' : 'Launch loop'}
          </Button>
        </div>
      </div>
    </div>
  )
}
