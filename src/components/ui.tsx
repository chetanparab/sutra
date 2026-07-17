import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function cn(...xs: (string | false | null | undefined)[]): string {
  return xs.filter(Boolean).join(' ')
}

export function Label({ children, tick = true, className }: { children: ReactNode; tick?: boolean; className?: string }) {
  return (
    <span className={cn('label inline-flex items-center gap-2', className)}>
      {tick && <span className="h-[3px] w-[3px] rounded-full bg-accent" />}
      {children}
    </span>
  )
}

// Surface — the one panel abstraction. Its look (floating paper, ruled
// section, cushioned material, matte ink) is entirely theme-driven.
export function Slab({
  title,
  right,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode
  right?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('surface', className)}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-1">
          {typeof title === 'string' ? <Label>{title}</Label> : title}
          {right}
        </div>
      )}
      <div className={cn(title || right ? 'px-4 pb-4 pt-2' : 'p-4', bodyClassName)}>{children}</div>
    </section>
  )
}

type Variant = 'primary' | 'quiet' | 'ghost' | 'danger'

export function Button({
  variant = 'quiet',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  const styles: Record<Variant, string> = {
    primary: 'bg-accent text-accentink lift hover:brightness-[1.06] disabled:opacity-45 disabled:hover:brightness-100',
    quiet: 'bg-primary/[0.04] text-secondary border border-primary/12 hover:border-primary/25 hover:text-primary disabled:opacity-40',
    ghost: 'text-muted hover:text-primary hover:bg-primary/[0.05] disabled:opacity-40',
    danger: 'text-err bg-err/[0.07] border border-err/25 hover:bg-err/12 disabled:opacity-40',
  }
  return (
    <button
      className={cn(
        'group inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 active:scale-[0.985] disabled:cursor-not-allowed disabled:active:scale-100',
        size === 'lg' ? 'h-11 px-5 text-[13px]' : size === 'md' ? 'h-9 px-4 text-[12.5px]' : 'h-8 px-3 text-[12px]',
        'rounded-[var(--radius)]',
        styles[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Dot({ className, pulse }: { className?: string; pulse?: boolean }) {
  return <span className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-current', pulse && 'soft-pulse', className)} />
}

export function Chip({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'ok' | 'warn' | 'err' | 'info'
  className?: string
}) {
  const tones = {
    neutral: 'text-secondary bg-primary/[0.05] border-primary/12',
    accent: 'text-accent bg-accent/10 border-accent/25',
    ok: 'text-ok bg-ok/10 border-ok/25',
    warn: 'text-warn bg-warn/10 border-warn/25',
    err: 'text-err bg-err/10 border-err/25',
    info: 'text-info bg-info/10 border-info/25',
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[10.5px] font-medium', tones[tone], className)}>
      {children}
    </span>
  )
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[22px] w-[38px] shrink-0 rounded-full transition-all duration-200 disabled:opacity-40',
        checked ? 'bg-accent' : 'bg-primary/[0.08] border border-primary/15',
      )}
    >
      <span className={cn('absolute top-[3px] h-[16px] w-[16px] rounded-full bg-white shadow transition-[left] duration-200', checked ? 'left-[19px]' : 'left-[3px]')} />
    </button>
  )
}

export function Stepper({ value, min = 1, max = 5, onChange }: { value: number; min?: number; max?: number; onChange: (v: number) => void }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-[var(--radius)] border border-primary/12 bg-primary/[0.03] p-0.5">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="flex h-7 w-7 items-center justify-center rounded-[calc(var(--radius)-3px)] text-secondary transition-colors hover:bg-primary/[0.06] hover:text-primary disabled:opacity-25"
      >
        −
      </button>
      <span className="w-9 text-center font-display text-[16px] font-medium tnum">{value}</span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="flex h-7 w-7 items-center justify-center rounded-[calc(var(--radius)-3px)] text-secondary transition-colors hover:bg-primary/[0.06] hover:text-primary disabled:opacity-25"
      >
        +
      </button>
    </div>
  )
}

export function ProgressThin({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn('h-[3px] w-full overflow-hidden rounded-full bg-primary/[0.08]', className)}>
      <div className="h-full rounded-full bg-accent transition-[width] duration-300 ease-linear" style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
    </div>
  )
}
