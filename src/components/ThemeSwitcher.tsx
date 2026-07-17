import { Check, Palette } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from './ui'

export type ThemeId = 'analogy' | 'light' | 'mono' | 'tactile' | 'dark' | 'cinematic'

export const THEME_IDS: ThemeId[] = ['analogy', 'light', 'mono', 'tactile', 'dark', 'cinematic']

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === 'string' && (THEME_IDS as string[]).includes(v)
}

// Carries the theme across the site → IDE launch (via ?theme=) so the IDE opens
// in whatever theme the visitor was browsing. They can still switch in-app.
export function initialTheme(fallback: ThemeId = 'analogy'): ThemeId {
  try {
    const p = new URLSearchParams(window.location.search).get('theme')
    if (isThemeId(p)) return p
  } catch {
    /* ignore */
  }
  return fallback
}

export const THEMES: { id: ThemeId; name: string; blurb: string; swatch: [string, string, string] }[] = [
  { id: 'analogy', name: 'Analogy', blurb: 'Warm ink + orange — the Analogy Architect look', swatch: ['#0b0b0d', '#161619', '#ff6b35'] },
  { id: 'light', name: 'Luminous', blurb: 'Warm paper, editorial, easy on the eyes', swatch: ['#f2efe7', '#fbfaf6', '#4b40cf'] },
  { id: 'mono', name: 'Editorial', blurb: 'Near-mono, print-grade, type does the work', swatch: ['#f6f5f1', '#14120c', '#d63f26'] },
  { id: 'tactile', name: 'Tactile', blurb: 'Soft clay, cushioned material, calm', swatch: ['#e7e2d9', '#ece7de', '#3f8f86'] },
  { id: 'dark', name: 'Ink', blurb: 'Refined dark, no neon, restful', swatch: ['#16141a', '#211e29', '#c9a24d'] },
  { id: 'cinematic', name: 'Cinematic', blurb: 'Teal-and-amber film grade, grain, vignette', swatch: ['#0a0f14', '#121b24', '#f2a24a'] },
]

export default function ThemeSwitcher({ theme, onChange }: { theme: ThemeId; onChange: (t: ThemeId) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [open])

  const current = THEMES.find((t) => t.id === theme)!

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Theme"
        className="flex h-8 items-center gap-2 rounded-full border border-primary/12 bg-primary/[0.03] px-2.5 text-[11.5px] text-secondary transition-colors hover:border-primary/25 hover:text-primary"
      >
        <span className="flex -space-x-1">
          {current.swatch.map((c, i) => (
            <span key={i} className="h-3 w-3 rounded-full border border-primary/15" style={{ background: c }} />
          ))}
        </span>
        <Palette size={13} />
      </button>

      {open && (
        <div className="surface anim-in absolute right-0 top-10 z-50 w-[248px] p-1.5" style={{ boxShadow: '0 24px 60px -24px rgba(0,0,0,0.4)' }}>
          <div className="label px-2.5 py-1.5">Design language</div>
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                onChange(t.id)
                setOpen(false)
              }}
              className={cn('flex w-full items-center gap-3 rounded-[var(--radius)] px-2.5 py-2 text-left transition-colors', theme === t.id ? 'bg-primary/[0.06]' : 'hover:bg-primary/[0.03]')}
            >
              <span className="flex shrink-0 -space-x-1.5">
                {t.swatch.map((c, i) => (
                  <span key={i} className="h-5 w-5 rounded-full border border-primary/15" style={{ background: c }} />
                ))}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="font-display text-[13px] font-medium">{t.name}</span>
                  {theme === t.id && <Check size={12} className="text-accent" />}
                </span>
                <span className="block text-[10.5px] leading-snug text-muted">{t.blurb}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
