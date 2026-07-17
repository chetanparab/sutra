import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Label, cn } from '../components/ui'

// ── reveal on scroll ─────────────────────────────────────────────────────

export function Reveal({ children, className, delay }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.classList.add('in')
            io.disconnect()
          }
        }
      },
      { threshold: 0.12 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} className={cn('reveal', className)} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  )
}

// ── section scaffold ─────────────────────────────────────────────────────

export function Section({
  id,
  eyebrow,
  title,
  sub,
  children,
  className,
}: {
  id?: string
  eyebrow: string
  title: ReactNode
  sub?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section id={id} className={cn('mx-auto w-full max-w-6xl px-6 py-24', className)}>
      <Reveal>
        <Label>{eyebrow}</Label>
        <h2 className="serif-hero balance mt-4 max-w-3xl font-display text-[clamp(28px,4vw,42px)] font-semibold leading-[1.05] tracking-[-0.03em]">
          {title}
        </h2>
        {sub && <p className="pretty mt-4 max-w-[62ch] text-[14.5px] leading-[1.65] text-secondary">{sub}</p>}
      </Reveal>
      <div className="mt-12">{children}</div>
    </section>
  )
}

// ── anchor styled as our buttons ─────────────────────────────────────────

export function LinkButton({
  href,
  variant = 'quiet',
  size = 'md',
  className,
  children,
}: {
  href: string
  variant?: 'primary' | 'quiet' | 'ghost'
  size?: 'md' | 'lg'
  className?: string
  children: ReactNode
}) {
  const styles = {
    primary: 'bg-accent text-accentink lift hover:brightness-[1.06]',
    quiet: 'bg-primary/[0.04] text-secondary border border-primary/12 hover:border-primary/25 hover:text-primary',
    ghost: 'text-muted hover:text-primary hover:bg-primary/[0.05]',
  }
  return (
    <a
      href={href}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 active:scale-[0.985]',
        size === 'lg' ? 'h-12 px-6 text-[13.5px]' : 'h-9 px-4 text-[12.5px]',
        'rounded-[var(--radius)]',
        styles[variant],
        className,
      )}
    >
      {children}
    </a>
  )
}

// ── visitor OS detection ─────────────────────────────────────────────────

export type OS = 'mac' | 'windows' | 'linux'

export function detectOS(): OS {
  const p = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`
  if (/Mac|iPhone|iPad/i.test(p)) return 'mac'
  if (/Win/i.test(p)) return 'windows'
  return 'linux'
}

export function useOS(): OS {
  const [os, setOS] = useState<OS>('mac')
  useEffect(() => setOS(detectOS()), [])
  return os
}
