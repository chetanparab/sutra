import { useEffect, useState } from 'react'
import type { LoopGates, LoopPhase, LoopStatus } from '../loop/types'
import { PHASE_ORDER } from '../loop/types'

const C = 230
const R = 168
const GAP = 6

function pt(theta: number, r: number): [number, number] {
  const rad = (theta * Math.PI) / 180
  return [C + r * Math.sin(rad), C - r * Math.cos(rad)]
}
function arc(from: number, to: number, r: number): string {
  const [x1, y1] = pt(from, r)
  const [x2, y2] = pt(to, r)
  const large = to - from > 180 ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
}

const STATION: Record<LoopPhase, number> = { sense: 0, build: 90, verify: 180, reflect: 270 }
const LABEL: Record<LoopPhase, string> = { sense: 'Sense', build: 'Build', verify: 'Verify', reflect: 'Reflect' }
const GATE_ANGLE: Record<keyof LoopGates, number> = { beforeIteration: 0, onConflict: 135, onConvergence: 315 }

export default function LoopOrbit({
  phase,
  fraction,
  iteration,
  maxIterations,
  status,
  gates,
  paused,
  green,
  total,
  memoCount,
}: {
  phase: LoopPhase
  fraction: number
  iteration: number
  maxIterations: number
  status: LoopStatus
  gates: LoopGates
  paused: boolean
  green: number
  total: number
  memoCount: number
}) {
  const activeIdx = PHASE_ORDER.indexOf(phase)
  const done = status === 'converged' || status === 'accepted'
  const stalled = status === 'exhausted'
  const running = status === 'running'

  const [ripple, setRipple] = useState(0)
  useEffect(() => {
    if (memoCount > 0) setRipple((r) => r + 1)
  }, [memoCount])

  const [bloom, setBloom] = useState(0)
  useEffect(() => {
    if (done) setBloom((b) => b + 1)
  }, [done])

  const accent = 'var(--color-accent)'
  const line = 'var(--color-line)'
  const faint = 'var(--color-faint)'
  const key = done ? (status === 'accepted' ? 'var(--color-warn)' : 'var(--color-ok)') : stalled || paused ? 'var(--color-warn)' : accent

  const progressAngle = STATION[phase] + fraction * 90
  const [cometX, cometY] = pt(progressAngle, R)

  const statusText = () => {
    if (status === 'converged') return 'converged'
    if (status === 'accepted') return 'shipped · 1 gap'
    if (status === 'exhausted') return 'budget spent'
    if (status === 'conflict') return 'awaiting you'
    if (status === 'gate') return 'sign-off'
    if (status === 'idle') return 'standby'
    return `${LABEL[phase].toLowerCase()}…`
  }

  return (
    <div className="relative flex items-center justify-center" style={{ width: 'min(58vh, 520px, 82vw)', height: 'min(58vh, 520px, 82vw)' }}>
      <div
        className={running ? 'orbit-slow' : ''}
        style={{
          position: 'absolute',
          inset: '8%',
          borderRadius: '50%',
          background: `conic-gradient(from 0deg, transparent 0deg, color-mix(in srgb, ${key} 34%, transparent) 55deg, transparent 120deg)`,
          maskImage: 'radial-gradient(circle, transparent 53%, #000 57%, #000 73%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(circle, transparent 53%, #000 57%, #000 73%, transparent 80%)',
          opacity: done || stalled ? 0.35 : 0.6,
        }}
      />
      <div
        className="breathe"
        style={{ position: 'absolute', height: '44%', width: '44%', borderRadius: '50%', background: `radial-gradient(circle, color-mix(in srgb, ${key} 16%, transparent), transparent 70%)` }}
      />

      <svg viewBox="0 0 460 460" className="relative h-full w-full">
        <circle cx={C} cy={C} r={R + 22} fill="none" stroke={line} strokeWidth={1} />
        <circle cx={C} cy={C} r={98} fill="none" stroke={line} strokeWidth={1} strokeOpacity={0.6} />

        {Array.from({ length: 60 }, (_, i) => {
          const [x1, y1] = pt(i * 6, R + 10)
          const [x2, y2] = pt(i * 6, R + (i % 5 === 0 ? 18 : 14))
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={i % 5 === 0 ? faint : line} strokeWidth={i % 5 === 0 ? 1.4 : 0.8} />
        })}

        <circle cx={C} cy={C} r={R} fill="none" stroke={line} strokeWidth={4} />
        {(running || done || stalled) && (
          <path
            d={done || stalled ? arc(GAP, 360 - GAP, R) : arc(0, Math.max(0.1, progressAngle), R)}
            fill="none"
            stroke={key}
            strokeWidth={4.5}
            strokeLinecap="round"
          />
        )}

        {running && (
          <>
            {[8, 16, 26].map((d, i) => {
              const [tx, ty] = pt(progressAngle - d, R)
              return <circle key={i} cx={tx} cy={ty} r={3.5 - i} fill={accent} opacity={0.28 - i * 0.08} />
            })}
            <circle cx={cometX} cy={cometY} r={5.5} fill={accent}>
              <animate attributeName="r" values="4.5;7;4.5" dur="1.1s" repeatCount="indefinite" />
            </circle>
          </>
        )}

        {PHASE_ORDER.map((p, i) => {
          const a = STATION[p]
          const [sx, sy] = pt(a, R)
          const [lx, ly] = pt(a, R + 34)
          const active = p === phase && running
          const passed = i < activeIdx || done
          return (
            <g key={p}>
              <circle
                cx={sx}
                cy={sy}
                r={active ? 9 : 6}
                fill={active ? accent : passed ? `color-mix(in srgb, ${accent} 42%, transparent)` : 'var(--color-bg)'}
                stroke={active || passed || done ? accent : faint}
                strokeWidth={1.6}
              />
              {active && (
                <circle cx={sx} cy={sy} r={14} fill="none" stroke={accent} strokeWidth={1.4} opacity={0.5}>
                  <animate attributeName="r" values="11;20;11" dur="2.2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.55;0;0.55" dur="2.2s" repeatCount="indefinite" />
                </circle>
              )}
              <text
                x={lx}
                y={ly + 4}
                textAnchor="middle"
                fontSize={12}
                fontWeight={active ? 600 : 500}
                fontFamily="var(--font-display)"
                fill={active ? 'var(--color-primary)' : passed ? 'var(--color-secondary)' : 'var(--color-muted)'}
              >
                {LABEL[p]}
              </text>
            </g>
          )
        })}

        {(Object.keys(GATE_ANGLE) as (keyof LoopGates)[])
          .filter((g) => gates[g])
          .map((g) => {
            const [gx, gy] = pt(GATE_ANGLE[g], R)
            const lit = paused && ((status === 'conflict' && g === 'onConflict') || status === 'gate')
            return (
              <g key={g} transform={`translate(${gx} ${gy}) rotate(45)`}>
                <rect x={-4} y={-4} width={8} height={8} rx={1.4} fill={lit ? 'var(--color-warn)' : 'var(--color-bg)'} stroke={lit ? 'var(--color-warn)' : faint} strokeWidth={1.4} />
              </g>
            )
          })}

        {ripple > 0 && (
          <circle key={ripple} cx={C} cy={C} r={70} fill="none" stroke={accent} strokeWidth={2} style={{ transformOrigin: 'center', animation: 'ripple 1.4s ease-out' }} />
        )}
        {done && bloom > 0 && (
          <g key={'bloom' + bloom} style={{ transformOrigin: 'center' }}>
            <circle cx={C} cy={C} r={92} fill="none" stroke={key} strokeWidth={2.5} style={{ transformOrigin: 'center', animation: 'ripple 1.7s cubic-bezier(0.2,0.7,0.2,1)' }} />
            <circle cx={C} cy={C} r={92} fill="none" stroke={key} strokeWidth={1.2} opacity={0.5} style={{ transformOrigin: 'center', animation: 'ripple 1.7s cubic-bezier(0.2,0.7,0.2,1) 0.12s' }} />
          </g>
        )}

        <text x={C} y={C - 42} textAnchor="middle" fontSize={10} fontWeight={600} fontFamily="var(--font-sans)" letterSpacing="3.5" fill="var(--color-muted)">
          ITERATION
        </text>
        <text
          x={C}
          y={C + 26}
          textAnchor="middle"
          fontSize={90}
          fontWeight={600}
          fontFamily="var(--font-display)"
          letterSpacing="-0.04em"
          fill={key}
          style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 0, 'WONK' 0" }}
        >
          {iteration}
        </text>
        <text x={C} y={C + 47} textAnchor="middle" fontSize={11} fontFamily="var(--font-mono)" fill={faint}>
          of {maxIterations}
        </text>
        <text x={C} y={C + 69} textAnchor="middle" fontSize={12.5} fontWeight={500} fontFamily="var(--font-display)" fill={key}>
          {statusText()}
        </text>

        <g>
          {Array.from({ length: total }, (_, i) => (
            <circle key={i} cx={C - (total - 1) * 6 + i * 12} cy={C + 88} r={3} fill={i < green ? 'var(--color-ok)' : line} />
          ))}
        </g>
      </svg>
    </div>
  )
}
