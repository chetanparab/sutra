import { BLAST_EDGES, BLAST_NODES } from '../scenario'

const NODE_H = 26

function center(id: string) {
  const n = BLAST_NODES.find((n) => n.id === id)!
  return { x: n.x + n.w / 2, y: n.y + NODE_H / 2, left: n.x, right: n.x + n.w, top: n.y, bottom: n.y + NODE_H }
}

export default function BlastMap() {
  return (
    <div>
      <svg viewBox="0 0 324 214" className="w-full">
        {BLAST_EDGES.map((e) => {
          const a = center(e.from)
          const b = center(e.to)
          const sameCol = Math.abs(a.x - b.x) < 4
          const d = sameCol
            ? `M ${a.x} ${a.y < b.y ? a.bottom : a.top} L ${b.x} ${a.y < b.y ? b.top : b.bottom}`
            : `M ${a.right} ${a.y} C ${a.right + 24} ${a.y}, ${b.left - 24} ${b.y}, ${b.left} ${b.y}`
          return (
            <path
              key={`${e.from}-${e.to}`}
              d={d}
              fill="none"
              stroke={e.dashed ? 'var(--color-accent)' : 'var(--color-line)'}
              strokeOpacity={e.dashed ? 0.6 : 1}
              strokeWidth={1}
              strokeDasharray={e.dashed ? '3 3' : undefined}
            />
          )
        })}
        {BLAST_NODES.map((n) => (
          <g key={n.id}>
            <rect
              x={n.x}
              y={n.y}
              width={n.w}
              height={NODE_H}
              rx={5}
              fill={n.kind === 'hot' ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)' : 'var(--color-panel2)'}
              stroke={n.kind === 'dim' ? 'var(--color-line)' : 'var(--color-accent)'}
              strokeOpacity={n.kind === 'dim' ? 1 : 0.55}
              strokeDasharray={n.kind === 'new' ? '3 3' : undefined}
            />
            <text
              x={n.x + 8}
              y={n.y + 16.5}
              fontSize={9.5}
              fontFamily="var(--font-mono)"
              fill={n.kind === 'dim' ? 'var(--color-muted)' : 'var(--color-primary)'}
            >
              {n.label}
              {n.star ? ' ✦' : ''}
            </text>
          </g>
        ))}
      </svg>
      <div className="mt-2 flex items-center gap-3 text-[10.5px] text-muted">
        <span className="text-accent">■ touched</span>
        <span className="text-accent">▫ new</span>
        <span>gray = unaffected</span>
        <span className="ml-auto">✦ enforcement point</span>
      </div>
    </div>
  )
}
