import { Compass, Eye, FileText, GitMerge, Layers, ListChecks, Play, RotateCcw, SlidersHorizontal, Palette, RefreshCw, Square, Target } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AppBackdrop from './components/AppBackdrop'
import Conductor, { type Command } from './components/Conductor'
import ConsoleDock from './components/ConsoleDock'
import ContextDrawer from './components/ContextDrawer'
import { THEMES, initialTheme, type ThemeId } from './components/ThemeSwitcher'
import TopChrome from './components/TopChrome'
import { Button, cn } from './components/ui'
import { isDesktop } from './desktop/engine'
import Onboarding, { ONBOARDING_SEEN_KEY } from './desktop/Onboarding'
import type { RealLoopArgs } from './desktop/realLoop'
import { AUTONOMY_GATES, fmtElapsed, useLoop } from './loop/useLoop'
import { useRealLoop } from './loop/useRealLoop'
import type { LoopConfig } from './loop/types'
import { useSimulation } from './sim/useSimulation'
import type { LoopSubtab, Mode, SpecPhase, StageId, StageItem, StageState } from './types'
import IntentView from './views/IntentView'
import LoopDesignView from './views/LoopDesignView'
import LoopRunView from './views/LoopRunView'
import RealLoopRunView from './views/RealLoopRunView'
import MergeView from './views/MergeView'
import RealLauncher from './views/RealLauncher'
import RealSpecView from './views/RealSpecView'
import { draftSpec, specToIntent, type PlannedSpec } from './desktop/realLoop'
import { isLocalEngine, draftSpecHttp } from './desktop/localEngine'
import ConnectMachine from './views/ConnectMachine'
import RealMergeView from './views/RealMergeView'
import RealReviewView from './views/RealReviewView'
import ReviewView from './views/ReviewView'
import SpecView from './views/SpecView'
import TasksView from './views/TasksView'

const DEFAULT_LOOP_CONFIG: LoopConfig = {
  autonomy: 'guided',
  maxIterations: 3,
  gates: { onConflict: true, beforeIteration: false, onConvergence: false },
}

export default function App() {
  const sim = useSimulation()
  const loop = useLoop()
  // Real mode (desktop shell only): the same Loop contract, produced by the
  // actual engine's event stream instead of the scripted reducer. Whichever
  // is live feeds every loop-driven surface below.
  const real = useRealLoop()
  // The desktop shell's home is the real-repo launcher, not the scripted-demo
  // intent view: a desktop user should land on the folder picker + verify +
  // consent panel directly. The web demo keeps its Intent-first flow.
  // "Real mode" = the desktop shell, OR a web session connected to a local
  // `sutra serve` engine. Both drive the real loop; the transport differs.
  const desktop = isDesktop() || isLocalEngine()
  const [engineMode, setEngineMode] = useState<'demo' | 'real'>(desktop ? 'real' : 'demo')
  const [connectOpen, setConnectOpen] = useState(false)
  const activeLoop = engineMode === 'real' ? real.loop : loop
  const [mode, setMode] = useState<Mode>('specless')
  const [stage, setStage] = useState<StageId>(desktop ? 'loop' : 'intent')
  const [specPhase, setSpecPhase] = useState<SpecPhase>('none')
  const [loopEntered, setLoopEntered] = useState(desktop)
  const [loopSubtab, setLoopSubtab] = useState<LoopSubtab>('design')
  const [loopConfig, setLoopConfig] = useState<LoopConfig>(DEFAULT_LOOP_CONFIG)
  const [reviewApproved, setReviewApproved] = useState(false)
  // Spec mode (Phase 5+): the model's drafted spec awaiting the human's review,
  // plus the full launch args to reuse when they approve it. Null = not drafted.
  const [draftedSpec, setDraftedSpec] = useState<PlannedSpec | null>(null)
  const [specBaseArgs, setSpecBaseArgs] = useState<RealLoopArgs | null>(null)
  const [drafting, setDrafting] = useState(false)
  const [specError, setSpecError] = useState<string | null>(null)
  const [contextOpen, setContextOpen] = useState(false)
  const [theme, setTheme] = useState<ThemeId>(() => initialTheme('analogy'))
  const [paletteOpen, setPaletteOpen] = useState(false)
  // First-run onboarding: desktop shell only, once (dismissal persists to
  // localStorage). The web demo never shows it.
  const [showOnboarding, setShowOnboarding] = useState(() => {
    if (!isDesktop()) return false
    try {
      return localStorage.getItem(ONBOARDING_SEEN_KEY) !== '1'
    } catch {
      return true
    }
  })
  // The IDE's floating chrome, 3-column run view and code surface need width.
  // Below that, show a graceful notice instead of a broken layout.
  const [tooNarrow, setTooNarrow] = useState(false)
  useEffect(() => {
    // Guard against a transient 0 width during load reporting a false positive.
    const check = () => {
      const w = window.innerWidth
      if (w > 0) setTooNarrow(w < 880)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Each workflow keeps its own progress. Switching Loop ↔ Spec parks the
  // stage + review flag for the mode you leave and restores the one you enter,
  // so nothing is lost mid-run. The engines (sim/loop) and mode-scoped flags
  // (specPhase, loopEntered…) persist on their own — they're never reset here.
  const parked = useRef<Record<Mode, { stage: StageId; reviewApproved: boolean }>>({
    specless: { stage: 'intent', reviewApproved: false },
    spec: { stage: 'intent', reviewApproved: false },
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const switchMode = useCallback(
    (m: Mode) => {
      if (m === mode) return
      // Park where we are in the mode we're leaving…
      parked.current[mode] = { stage, reviewApproved }
      // …and resume the mode we're entering exactly where it left off.
      setMode(m)
      // A drafted spec belongs to the mode you're leaving — clear it.
      setDraftedSpec(null)
      setSpecError(null)
      // On desktop both modes live at the launcher (stage 'loop'); the web demo
      // resumes its parked stage.
      setStage(desktop ? 'loop' : parked.current[m].stage)
      setReviewApproved(desktop ? false : parked.current[m].reviewApproved)
    },
    [mode, stage, reviewApproved, desktop],
  )

  useEffect(() => {
    if (specPhase !== 'generating') return
    const id = setTimeout(() => setSpecPhase('draft'), 2600)
    return () => clearTimeout(id)
  }, [specPhase])

  const dispatched = mode === 'specless' ? loopEntered : specPhase !== 'none'
  const executionReady = mode === 'specless' ? activeLoop.ready : sim.phase === 'ready'

  const onDispatch = () => {
    if (mode === 'specless') {
      setLoopEntered(true)
      setLoopSubtab('design')
      setStage('loop')
    } else {
      setSpecPhase('generating')
      setStage('spec')
    }
  }
  const launchLoop = () => {
    // Launching the demo takes the stage back from real mode — never leave a
    // real engine running unseen behind it.
    if (real.running) void real.abort()
    setEngineMode('demo')
    loop.launch(loopConfig)
    setLoopSubtab('run')
    setStage('loop')
  }
  const launchReal = async (args: RealLoopArgs) => {
    setEngineMode('real')
    setReviewApproved(false)
    setLoopSubtab('run')
    setStage('loop')
    try {
      await real.launch(args)
    } catch {
      // launchError is surfaced in the panel; return the user to it.
      setLoopSubtab('design')
    }
  }
  // Spec mode: draft a real plan (one engine call), then show it for review.
  const doDraftSpec = async (args: RealLoopArgs) => {
    setSpecError(null)
    setDrafting(true)
    try {
      const draft = !isDesktop() && isLocalEngine() ? draftSpecHttp : draftSpec
      const spec = await draft({ workspacePath: args.workspacePath, intent: args.intent, provider: args.provider, model: args.model, apiKey: args.apiKey, storeKey: args.storeKey })
      setSpecBaseArgs(args)
      setDraftedSpec(spec)
    } catch (err) {
      setSpecError(err instanceof Error ? err.message : String(err))
    } finally {
      setDrafting(false)
    }
  }
  // Approve the (edited) spec → run the real loop with it folded into the intent.
  const buildSpec = (edited: PlannedSpec) => {
    if (!specBaseArgs) return
    const args = { ...specBaseArgs, intent: specToIntent(specBaseArgs.intent, edited) }
    setDraftedSpec(null)
    void launchReal(args)
  }
  // Web real-mode: after connecting to a local `sutra serve`, drop into the
  // real launcher (same as the desktop's front door).
  const onConnectedToEngine = () => {
    setConnectOpen(false)
    setEngineMode('real')
    setLoopEntered(true)
    setLoopSubtab('design')
    setStage('loop')
  }
  const replay = () => {
    setReviewApproved(false)
    if (mode === 'specless') {
      if (engineMode === 'real') {
        // A real run isn't replayable from a button — it costs money and
        // needs consent. Back to the launch surface instead.
        real.reset()
        setLoopSubtab('design')
        setStage('loop')
        return
      }
      loop.launch(loopConfig)
      setLoopSubtab('run')
      setStage('loop')
    } else {
      sim.start()
      setStage('tasks')
    }
  }

  const loopStageState = (): StageState => {
    if (!loopEntered) return 'locked'
    if (activeLoop.ready) return 'done'
    if (activeLoop.state.status === 'conflict' || activeLoop.state.status === 'gate' || activeLoop.state.status === 'exhausted') return 'attention'
    return 'active'
  }
  const loopHint = () => {
    if (activeLoop.state.status === 'conflict') return 'decision'
    if (activeLoop.state.status === 'gate') return 'sign-off'
    if (activeLoop.state.status === 'exhausted') return engineMode === 'real' ? 'stopped' : 'budget spent'
    if (activeLoop.state.status === 'accepted') return 'accepted 4/5'
    if (activeLoop.state.status === 'running') return `iter ${activeLoop.state.iteration}`
    if (activeLoop.ready) return 'converged'
    return 'designing'
  }
  const taskStageState = (): StageState => {
    if (!sim.state.started) return specPhase === 'approved' ? 'available' : 'locked'
    if (sim.phase === 'input') return 'attention'
    if (sim.phase === 'ready') return 'done'
    return 'active'
  }

  const headStages: StageItem[] = desktop
    ? // The desktop is the real tool — no scripted "Intent" step; the launcher
      // IS the first stage. Rail reads Loop/Spec → Review → Merge.
      [{ id: 'loop', label: mode === 'spec' ? 'Spec' : 'Loop', state: loopStageState(), hint: loopHint() }]
    : mode === 'specless'
      ? [
          { id: 'intent', label: 'Intent', state: dispatched ? 'done' : 'active' },
          { id: 'loop', label: 'Loop', state: loopStageState(), hint: loopHint() },
        ]
      : [
          { id: 'intent', label: 'Intent', state: dispatched ? 'done' : 'active' },
          {
            id: 'spec',
            label: 'Spec',
            state: specPhase === 'none' ? 'locked' : specPhase === 'approved' ? 'done' : specPhase === 'generating' ? 'active' : 'attention',
            hint: specPhase === 'draft' ? 'review' : 'drafting',
          },
          { id: 'tasks', label: 'Tasks', state: taskStageState(), hint: sim.phase === 'input' ? 'decision' : sim.phase === 'flight' ? 'executing' : sim.phase === 'ready' ? 'complete' : 'ready' },
        ]

  const stages: StageItem[] = headStages.concat([
    { id: 'review', label: 'Review', state: executionReady ? (reviewApproved ? 'done' : 'attention') : 'locked', hint: reviewApproved ? 'approved' : 'ready' },
    { id: 'merge', label: 'Merge', state: reviewApproved ? 'available' : 'locked', hint: 'governance' },
  ])

  useEffect(() => {
    const item = stages.find((s) => s.id === stage)
    if (!item || item.state === 'locked') setStage(desktop ? 'loop' : 'intent')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, stage, specPhase, sim.phase, activeLoop.state.status, loopEntered, reviewApproved])

  const activeStageIdx = (() => {
    const i = stages.findIndex((s) => s.state === 'active' || s.state === 'attention' || s.state === 'available')
    return i >= 0 ? i : Math.max(0, stages.filter((s) => s.state === 'done').length - 1)
  })()

  const runActive = mode === 'specless' ? activeLoop.state.started : sim.state.started
  const runTimeMs = mode === 'specless' ? (activeLoop.state.started ? activeLoop.state.t : null) : sim.state.started ? sim.state.t : null
  const cta = executionReady && !reviewApproved && stage !== 'review' ? { label: 'Open review', onClick: () => setStage('review') } : null

  const onApproveReview = () => {
    setReviewApproved(true)
    setStage('merge')
  }
  const onRequestChanges = () => {
    // Send the change back for another pass rather than approving it.
    if (mode === 'specless') {
      setLoopSubtab('design')
      setStage('loop')
    } else {
      setStage('tasks')
    }
  }
  const onApproveSpec = () => {
    setSpecPhase('approved')
    setStage('tasks')
  }

  // ── Conductor command registry ────────────────────────────────────────
  const stageIcon: Record<StageId, React.ReactNode> = {
    intent: <Compass size={14} />,
    spec: <FileText size={14} />,
    tasks: <ListChecks size={14} />,
    loop: <RefreshCw size={14} />,
    review: <Eye size={14} />,
    merge: <GitMerge size={14} />,
  }
  const commands: Command[] = useMemo(() => {
    const list: Command[] = []
    stages
      .filter((s) => s.state !== 'locked')
      .forEach((s) =>
        list.push({ id: 'go-' + s.id, group: 'Go to', label: s.label, hint: 'Jump to ' + s.label.toLowerCase(), icon: stageIcon[s.id], keywords: 'navigate open ' + s.id, run: () => setStage(s.id) }),
      )
    if (mode === 'specless') {
      // The demo's scripted launch + autonomy/budget tuning are web-only. On
      // desktop the real budget lives in the launcher; the loop is guided.
      if (!desktop && loopEntered && !loop.state.started) list.push({ id: 'launch', group: 'Loop', label: 'Launch loop', hint: 'Start iterating to convergence', icon: <Play size={14} />, keywords: 'run start', run: launchLoop })
      if (runActive) list.push({ id: 'replay', group: 'Loop', label: desktop ? 'New run' : 'Replay run', hint: 'Back to the launcher', icon: <RotateCcw size={14} />, keywords: 'restart again new', run: replay })
      if (executionReady && !reviewApproved) list.push({ id: 'openreview', group: 'Loop', label: 'Open review', hint: 'Inspect the converged change', icon: <Eye size={14} />, keywords: 'approve', run: () => setStage('review') })
      if (!desktop) {
        ;(['guided', 'copilot', 'autopilot'] as const).forEach((a) =>
          list.push({ id: 'aut-' + a, group: 'Tune the loop', label: 'Autonomy · ' + a, hint: 'How much the loop asks of you', icon: <SlidersHorizontal size={14} />, keywords: 'autonomy ' + a, run: () => setLoopConfig((c) => ({ ...c, autonomy: a, gates: { ...AUTONOMY_GATES[a] } })) }),
        )
        ;[1, 2, 3, 4, 5].forEach((n) =>
          list.push({ id: 'bud-' + n, group: 'Tune the loop', label: `Budget · ${n} iteration${n > 1 ? 's' : ''}`, hint: 'Stop and ask after this many passes', icon: <Target size={14} />, keywords: 'budget max iterations ' + n, run: () => setLoopConfig((c) => ({ ...c, maxIterations: n })) }),
        )
      }
    }
    // Two real workflows — switch between Loop and Spec.
    list.push({ id: 'wf-loop', group: 'Workflow', label: 'Loop workflow', hint: 'Say it, iterate to convergence', icon: <RefreshCw size={14} />, keywords: 'specless mode', run: () => switchMode('specless') })
    list.push({ id: 'wf-spec', group: 'Workflow', label: 'Spec workflow', hint: 'Plan → review → build', icon: <FileText size={14} />, keywords: 'sdd spec driven', run: () => switchMode('spec') })
    THEMES.forEach((t) =>
      list.push({
        id: 'th-' + t.id,
        group: 'Theme',
        label: t.name,
        hint: t.blurb,
        icon: <Palette size={14} />,
        keywords: `theme ${t.id} ${t.id === 'dark' ? 'ink dark' : t.id === 'light' ? 'light luminous' : t.id === 'mono' ? 'editorial print mono' : t.id === 'cinematic' ? 'cinematic film movie grade grain' : 'tactile clay soft'}`,
        run: () => setTheme(t.id),
      }),
    )
    if (!desktop) list.push({ id: 'ctx', group: 'View', label: 'Toggle context plane', hint: 'What agents read instead of a spec', icon: <Layers size={14} />, keywords: 'context sources', run: () => setContextOpen((v) => !v) })
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stages, mode, loopEntered, loop.state.started, runActive, executionReady, reviewApproved])

  if (tooNarrow) {
    return (
      <div data-shell="ide" className="relative flex h-screen flex-col items-center justify-center px-8 text-center text-primary">
        <AppBackdrop />
        <div className="relative flex max-w-sm flex-col items-center gap-5">
          <span className="flex h-12 w-12 items-center justify-center rounded-[var(--radius)] bg-accent text-accentink">
            <span className="h-4 w-4 rounded-full bg-current opacity-90 breathe" />
          </span>
          <h1 className="serif-hero font-display text-[26px] font-semibold tracking-[-0.02em]">The IDE needs a wider screen</h1>
          <p className="text-[14px] leading-relaxed text-secondary">
            Sutra's loop engine, living code surface and WebAssembly verifier are built for a desktop-sized canvas. Open it on a larger screen — or widen this window — to step inside.
          </p>
          <a href={`/?theme=${theme}`} className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-[13px] font-medium text-accentink transition-opacity hover:opacity-90">
            Back to the Sutra site
          </a>
        </div>
      </div>
    )
  }

  return (
    <div data-shell="ide" className="relative h-screen overflow-hidden text-primary">
      <AppBackdrop />
      {/* cinematic-only letterbox framing */}
      <div className="cine-frame cine-frame-top" />
      <div className="cine-frame cine-frame-bottom" />
      <TopChrome mode={mode} onModeChange={switchMode} runTime={runTimeMs !== null ? fmtElapsed(runTimeMs) : null} theme={theme} onThemeChange={setTheme} onOpenCommand={() => setPaletteOpen(true)} />

      {/* loop design/run switch — floats top-center; the real-run kill switch rides beside it */}
      {stage === 'loop' && loopEntered && (
        <div className="absolute left-1/2 top-5 z-30 flex -translate-x-1/2 items-center gap-2.5">
          <div className="surface flex items-center gap-1 rounded-full p-0.5">
            {(
              [
                // Desktop's "design" tab is the real launcher, not a loop-design surface.
                { id: 'design' as LoopSubtab, label: isDesktop() ? 'Launch' : 'Design' },
                { id: 'run' as LoopSubtab, label: 'Run' },
              ] as const
            ).map((t) => {
              const disabled = t.id === 'run' && !activeLoop.state.started
              return (
                <button
                  key={t.id}
                  disabled={disabled}
                  onClick={() => setLoopSubtab(t.id)}
                  className={cn(
                    'rounded-full px-4 py-1 text-[12px] font-medium transition-colors',
                    loopSubtab === t.id ? 'bg-primary/10 text-primary' : 'text-muted hover:text-secondary',
                    disabled && 'cursor-not-allowed opacity-35 hover:text-muted',
                  )}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
          {engineMode === 'real' && real.running && (
            <Button variant="danger" size="sm" onClick={() => void real.abort()}>
              <Square size={11} /> Stop loop
            </Button>
          )}
        </div>
      )}

      <main className="absolute inset-0 flex flex-col">
        {stage === 'intent' && <IntentView mode={mode} dispatched={dispatched} onDispatch={onDispatch} />}
        {stage === 'loop' &&
          (loopSubtab === 'run' && activeLoop.state.started ? (
            engineMode === 'real' ? (
              // Real runs get a real run view — your intent, live engine output,
              // your actual verify result — not the scripted demo mission.
              <RealLoopRunView real={real} onOpenReview={() => setStage('review')} />
            ) : (
              <LoopRunView loop={activeLoop} onOpenReview={() => setStage('review')} />
            )
          ) : desktop ? (
            // Desktop is a real tool. Loop mode → the launcher runs the loop.
            // Spec mode → the launcher drafts a plan, then RealSpecView reviews
            // it before the same loop builds it. Nothing scripted either way.
            mode === 'spec' && draftedSpec ? (
              <RealSpecView intent={specBaseArgs?.intent ?? ''} draft={draftedSpec} building={real.running} onBuild={buildSpec} onDiscard={() => setDraftedSpec(null)} />
            ) : (
              <RealLauncher
                mode={mode}
                running={real.running}
                drafting={drafting}
                launchError={real.meta.launchError ?? specError}
                onLaunch={(args) => void launchReal(args)}
                onDraftSpec={(args) => void doDraftSpec(args)}
              />
            )
          ) : (
            <LoopDesignView config={loopConfig} onChange={setLoopConfig} onLaunch={launchLoop} />
          ))}
        {stage === 'spec' && <SpecView specPhase={specPhase} onApprove={onApproveSpec} />}
        {stage === 'tasks' && <TasksView sim={sim} onStart={() => sim.start()} />}
        {stage === 'review' &&
          (engineMode === 'real' ? (
            <RealReviewView
              meta={real.meta}
              iterations={real.loop.state.history.length}
              costUsd={real.meta.outcome?.totalCostUsd ?? null}
              approved={reviewApproved}
              onApprove={onApproveReview}
              onRequestChanges={onRequestChanges}
            />
          ) : (
            <ReviewView
              mode={mode}
              approved={reviewApproved}
              onApprove={onApproveReview}
              onRequestChanges={onRequestChanges}
              iterations={mode === 'specless' ? loop.state.history.length : null}
              accepted={loop.state.status === 'accepted'}
            />
          ))}
        {stage === 'merge' && (engineMode === 'real' ? <RealMergeView meta={real.meta} /> : <MergeView reviewApproved={reviewApproved} />)}
      </main>

      <ConsoleDock
        stages={stages}
        current={stage}
        onNavigate={setStage}
        activeIndex={activeStageIdx}
        onToggleContext={desktop ? undefined : () => setContextOpen((v) => !v)}
        onReplay={runActive ? replay : undefined}
        cta={cta}
      />
      <ContextDrawer open={contextOpen} onClose={() => setContextOpen(false)} />
      <Conductor open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      <ConnectMachine open={connectOpen} onClose={() => setConnectOpen(false)} onConnected={onConnectedToEngine} />
      {/* On the web, offer connecting to a local engine to run for real. */}
      {!isDesktop() && !isLocalEngine() && stage === 'intent' && (
        <button
          onClick={() => setConnectOpen(true)}
          className="absolute bottom-5 right-6 z-30 flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/[0.08] px-3.5 py-1.5 text-[12px] font-medium text-accent transition-colors hover:bg-accent/15"
        >
          <Play size={12} /> Run for real on this machine
        </button>
      )}
      {showOnboarding && (
        <Onboarding
          onClose={() => setShowOnboarding(false)}
          onStartBuilding={() => {
            // Land the user straight on the real-repo launch panel — not the
            // scripted demo intent view. This is the desktop's front door.
            setShowOnboarding(false)
            setEngineMode('real')
            setLoopEntered(true)
            setLoopSubtab('design')
            setStage('loop')
          }}
        />
      )}
    </div>
  )
}
