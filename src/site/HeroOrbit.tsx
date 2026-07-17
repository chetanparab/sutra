import { useEffect } from 'react'
import LoopOrbit from '../components/LoopOrbit'
import { useLoop } from '../loop/useLoop'
import type { LoopConfig } from '../loop/types'

// Autopilot: no human gates, so the hero runs the full story hands-free —
// iteration 1 fails p99, Hermes reflects, iteration 2 converges.
const DEMO_CONFIG: LoopConfig = {
  autonomy: 'autopilot',
  maxIterations: 3,
  gates: { onConflict: false, beforeIteration: false, onConvergence: false },
}

export default function HeroOrbit() {
  const loop = useLoop()

  useEffect(() => {
    const t = setTimeout(() => loop.launch(DEMO_CONFIG), 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Loop the demo: pause on the converged state, then run again.
  useEffect(() => {
    if (!loop.ready) return
    const t = setTimeout(() => loop.launch(DEMO_CONFIG), 4200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loop.ready])

  const green = loop.state.signals.filter((s) => s.status === 'pass').length

  return (
    <div className="relative flex flex-col items-center">
      <LoopOrbit
        phase={loop.state.phase}
        fraction={loop.phaseFraction}
        iteration={loop.state.iteration}
        maxIterations={loop.state.config.maxIterations}
        status={loop.state.status}
        gates={loop.state.config.gates}
        paused={false}
        green={green}
        total={loop.state.signals.length}
        memoCount={loop.state.memos.length}
      />
      <div className="mt-1 flex items-center gap-2 rounded-full border border-primary/12 bg-primary/[0.03] px-3 py-1 text-[11px] text-secondary">
        <span className="h-1.5 w-1.5 rounded-full bg-ok soft-pulse" />
        live — the real loop engine, running on this page
      </div>
    </div>
  )
}
