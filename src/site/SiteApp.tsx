import {
  ArrowDown,
  ArrowRight,
  Code2,
  Command,
  Cpu,
  Eye,
  Feather,
  Globe,
  History,
  Layers,
  Orbit,
  Palette,
  Plug,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import ThemeSwitcher, { THEMES, type ThemeId } from '../components/ThemeSwitcher'
import { Chip, Label, cn } from '../components/ui'
import { LinkButton, Reveal, Section, useOS, type OS } from './bits'
import { ARCH, DOWNLOADS, FAQ, FEATURES, HERO_SUB, PHASES_SITE, RELEASES_URL, REPO_URL, STATS, TAGLINE, THESIS } from './content'
import HeroOrbit from './HeroOrbit'
import LiveWasmDemo from './LiveWasmDemo'

const ICONS: Record<string, typeof Code2> = {
  code: Code2,
  cpu: Cpu,
  sliders: SlidersHorizontal,
  orbit: Orbit,
  feather: Feather,
  history: History,
  command: Command,
  layers: Layers,
  eye: Eye,
  shield: ShieldCheck,
  plug: Plug,
  palette: Palette,
}

const OS_LABEL: Record<OS, string> = { mac: 'macOS', windows: 'Windows', linux: 'Linux' }

// lucide dropped brand marks (trademark); inline the GitHub octocat.
function GithubMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

// ── nav ──────────────────────────────────────────────────────────────────

function Nav({ theme, onTheme }: { theme: ThemeId; onTheme: (t: ThemeId) => void }) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 12)
    h()
    window.addEventListener('scroll', h, { passive: true })
    return () => window.removeEventListener('scroll', h)
  }, [])

  return (
    <header
      className={cn('fixed inset-x-0 top-0 z-50 transition-all duration-300', scrolled && 'backdrop-blur-md')}
      style={scrolled ? { background: 'color-mix(in srgb, var(--bg) 78%, transparent)', borderBottom: '1px solid var(--hairline)' } : undefined}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-6">
        <a href="#top" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent text-accentink">
            <span className="h-2.5 w-2.5 rounded-full bg-current opacity-90 breathe" />
          </span>
          <span className="font-display text-[16px] font-semibold tracking-[0.01em]">Sutra</span>
        </a>

        <nav className="ml-4 hidden items-center gap-5 text-[12.5px] text-secondary md:flex">
          <a href="#how" className="transition-colors hover:text-primary">How it works</a>
          <a href="#features" className="transition-colors hover:text-primary">Features</a>
          <a href="#engine" className="transition-colors hover:text-primary">The engine</a>
          <a href="#themes" className="transition-colors hover:text-primary">Design</a>
          <a href="#download" className="transition-colors hover:text-primary">Download</a>
          <a href="#faq" className="transition-colors hover:text-primary">FAQ</a>
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            title="Sutra on GitHub"
            className="hidden h-9 w-9 items-center justify-center rounded-[var(--radius)] text-muted transition-colors hover:bg-primary/[0.05] hover:text-primary sm:flex"
          >
            <GithubMark size={17} />
          </a>
          <ThemeSwitcher theme={theme} onChange={onTheme} />
          <LinkButton href="/app.html" variant="primary">
            Launch the IDE <ArrowRight size={13} />
          </LinkButton>
        </div>
      </div>
    </header>
  )
}

// ── hero ─────────────────────────────────────────────────────────────────

function Hero({ os }: { os: OS }) {
  return (
    <div id="top" className="mx-auto grid w-full max-w-6xl items-center gap-10 px-6 pb-16 pt-36 lg:grid-cols-[1.05fr_0.95fr]">
      <div>
        <Reveal>
          <Label>{TAGLINE}</Label>
          <h1 className="serif-hero balance mt-5 font-display text-[clamp(44px,6vw,72px)] font-semibold leading-[0.98] tracking-[-0.035em]">
            Software, engineered <span className="italic font-medium text-accent">as a loop.</span>
          </h1>
          <p className="pretty mt-6 max-w-[56ch] text-[15.5px] leading-[1.65] text-secondary">{HERO_SUB}</p>
        </Reveal>
        <Reveal delay={120}>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <LinkButton href="/app.html" variant="primary" size="lg">
              <Globe size={15} /> Launch the web IDE
            </LinkButton>
            <LinkButton href="#download" variant="quiet" size="lg">
              <ArrowDown size={14} /> Download for {OS_LABEL[os]}
            </LinkButton>
          </div>
          <p className="mt-4 text-[11.5px] text-muted">Free preview · nothing to install on the web · ~10 MB native shell for every OS</p>
        </Reveal>
      </div>

      <Reveal delay={180} className="justify-self-center">
        <HeroOrbit />
      </Reveal>
    </div>
  )
}

// ── stats strip ──────────────────────────────────────────────────────────

function Stats() {
  return (
    <div className="border-y" style={{ borderColor: 'var(--hairline)' }}>
      <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-px px-6 md:grid-cols-4">
        {STATS.map((s, i) => (
          <Reveal key={s.label} delay={i * 70} className="py-8 md:px-6">
            <div className="font-display text-[26px] font-semibold tracking-[-0.02em] text-accent tnum">{s.value}</div>
            <div className="mt-1 max-w-[24ch] text-[12px] leading-snug text-muted">{s.label}</div>
          </Reveal>
        ))}
      </div>
    </div>
  )
}

// ── downloads ────────────────────────────────────────────────────────────

function Downloads({ os }: { os: OS }) {
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr_1fr]">
        <Reveal className="h-full">
          <div className="surface flex h-full flex-col p-6" style={{ borderColor: 'color-mix(in srgb, var(--accent) 35%, transparent)' }}>
            <div className="flex items-center gap-2">
              <Globe size={17} className="text-accent" />
              <span className="font-display text-[17px] font-semibold">Web</span>
              <Chip tone="ok" className="ml-auto">live now</Chip>
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-secondary">
              The full IDE in your browser — loop engine, living code surface and the WASM sandbox included. Nothing to install.
            </p>
            <div className="mt-auto pt-5">
              <LinkButton href="/app.html" variant="primary" className="w-full">
                Open Sutra <ArrowRight size={13} />
              </LinkButton>
            </div>
          </div>
        </Reveal>

        {DOWNLOADS.map((d, i) => {
          const mine = d.id === os
          return (
            <Reveal key={d.id} delay={80 + i * 70} className="h-full">
              <a
                href={RELEASES_URL}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  'surface flex h-full w-full flex-col p-6 text-left transition-transform hover:-translate-y-0.5',
                  mine && 'ring-2 ring-accent/40',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="font-display text-[17px] font-semibold">{d.name}</span>
                  {mine && <Chip tone="accent" className="ml-auto">your OS</Chip>}
                </div>
                <div className="mt-2 font-mono text-[11px] text-muted">{d.formats}</div>
                <div className="mt-1 font-mono text-[11px] text-muted">{d.note}</div>
                <div className="mt-auto flex items-center gap-2 pt-5">
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-accent">
                    <ArrowDown size={13} /> Releases
                  </span>
                  <span className="ml-auto rounded-full border border-primary/12 px-2 py-0.5 text-[10px] text-muted">~10 MB</span>
                </div>
              </a>
            </Reveal>
          )
        })}
      </div>

      <Reveal delay={120}>
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[var(--radius)] border border-primary/10 bg-primary/[0.02] px-4 py-3 text-[12.5px] text-secondary">
          <span>
            Native installers are published to the <a href={RELEASES_URL} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">GitHub Releases</a> page as
            they roll out — signed <span className="font-mono text-[11.5px]">.dmg / .msi / .AppImage</span>. The web IDE is the same engine, available now with nothing to install.
          </span>
          <LinkButton href="/app.html" variant="primary" className="ml-auto">
            Launch the web IDE <ArrowRight size={13} />
          </LinkButton>
        </div>
      </Reveal>
    </>
  )
}

// ── page ─────────────────────────────────────────────────────────────────

export default function SiteApp() {
  const [theme, setTheme] = useState<ThemeId>('light')
  const os = useOS()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <div className="relative min-h-screen text-primary">
      {/* ambient wash + cinematic hooks, shared with the app */}
      <div className="grain pointer-events-none fixed inset-0 -z-10 overflow-hidden" style={{ background: 'var(--bg)' }}>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 90% 60% at 50% 0%, color-mix(in srgb, var(--bg-hi) 90%, transparent), transparent 70%)' }} />
        <div
          className="absolute left-1/2 top-[30%] h-[760px] w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--accent) 9%, transparent), transparent 62%)', filter: 'blur(52px)' }}
        />
        <div className="cine-sweep" />
      </div>
      <div className="cine-frame cine-frame-top" />
      <div className="cine-frame cine-frame-bottom" />

      <Nav theme={theme} onTheme={setTheme} />
      <Hero os={os} />
      <Stats />

      {/* thesis */}
      <Section
        id="why"
        eyebrow="Why loops"
        title={
          <>
            Prompts hope. Specs freeze. <span className="italic font-medium text-accent">Loops converge.</span>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          {THESIS.map((t, i) => (
            <Reveal key={t.title} delay={i * 90} className="h-full">
              <div
                className={cn('surface h-full p-6', t.tone === 'accent' && 'ring-2 ring-accent/35')}
                style={t.tone !== 'accent' ? { opacity: 0.82 } : undefined}
              >
                <div className="font-display text-[16px] font-semibold">{t.title}</div>
                <p className="mt-2.5 text-[13px] leading-relaxed text-secondary">{t.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* how it works */}
      <Section
        id="how"
        eyebrow="How it works"
        title="Four phases, one courier — until every signal is green."
        sub="You declare an intent and design the loop: its autonomy, its human gates, its iteration budget. Then the crew cycles."
      >
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {PHASES_SITE.map((p, i) => (
            <Reveal key={p.title} delay={i * 90} className="h-full">
              <div className="surface h-full p-6">
                <div className="font-mono text-[11px] text-faint">{p.n}</div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="font-display text-[17px] font-semibold">{p.title}</span>
                  {i === 3 && <Feather size={14} className="text-accent" />}
                </div>
                <p className="mt-2 text-[12.5px] leading-relaxed text-secondary">{p.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={140}>
          <div className="mt-6 flex flex-wrap items-center gap-2 text-[12px] text-muted">
            <RefreshCw size={13} className="text-accent" />
            <span>
              Not converged? <span className="text-secondary">Hermes routes the memo back to Sense</span> and the loop spins again — within the budget you set.
            </span>
          </div>
        </Reveal>
      </Section>

      {/* features */}
      <Section
        id="features"
        eyebrow="Everything in the box"
        title="An IDE built around convergence, not keystrokes."
        sub="Every surface exists to answer one question: is the change converging on what you asked for — and can you prove it?"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => {
            const Icon = ICONS[f.icon] ?? Code2
            return (
              <Reveal key={f.title} delay={(i % 3) * 80} className="h-full">
                <div className="surface group h-full p-6 transition-transform hover:-translate-y-0.5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-accent/12 text-accent">
                    <Icon size={18} />
                  </span>
                  <div className="mt-4 font-display text-[15.5px] font-semibold">{f.title}</div>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-secondary">{f.body}</p>
                </div>
              </Reveal>
            )
          })}
        </div>
      </Section>

      {/* the engine — live wasm */}
      <Section
        id="engine"
        eyebrow="The engine"
        title={
          <>
            It doesn’t claim. <span className="italic font-medium text-accent">It runs.</span>
          </>
        }
        sub="Sutra’s Verify phase executes the change inside a QuickJS sandbox compiled to WebAssembly — sandboxed from your OS, offline-capable, byte-identical on every platform. Try it right here."
      >
        <Reveal>
          <LiveWasmDemo />
        </Reveal>
      </Section>

      {/* themes */}
      <Section
        id="themes"
        eyebrow="Design languages"
        title="Five worlds. One IDE. Your eyes decide."
        sub="A single token system drives every surface — including this page. Pick one and watch the whole site re-light itself."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {THEMES.map((t, i) => (
            <Reveal key={t.id} delay={i * 60} className="h-full">
              <button
                onClick={() => setTheme(t.id)}
                className={cn('surface h-full w-full p-5 text-left transition-transform hover:-translate-y-0.5', theme === t.id && 'ring-2 ring-accent/45')}
              >
                <div className="flex -space-x-1.5">
                  {t.swatch.map((c, j) => (
                    <span key={j} className="h-7 w-7 rounded-full border border-primary/15" style={{ background: c }} />
                  ))}
                </div>
                <div className="mt-3 font-display text-[15px] font-semibold">{t.name}</div>
                <div className="mt-1 text-[11.5px] leading-snug text-muted">{t.blurb}</div>
              </button>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* download */}
      <Section
        id="download"
        eyebrow="Get Sutra"
        title="Use it now. Take it everywhere."
        sub="The web IDE runs the full engine today. Native desktop builds are a featherweight Tauri shell over the same codebase — around 10 MB, with the WebAssembly engine inside."
      >
        <Downloads os={os} />
      </Section>

      {/* architecture */}
      <Section
        id="architecture"
        eyebrow="Why it stays light"
        title="Heavy ideas. Featherweight machine."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {ARCH.map((a, i) => (
            <Reveal key={a.title} delay={i * 90} className="h-full">
              <div className="surface h-full p-6">
                <div className="font-display text-[15.5px] font-semibold">{a.title}</div>
                <p className="mt-2 text-[12.5px] leading-relaxed text-secondary">{a.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* faq */}
      <Section id="faq" eyebrow="Questions" title="The honest answers.">
        <div className="mx-auto max-w-3xl space-y-3">
          {FAQ.map((f, i) => (
            <Reveal key={f.q} delay={i * 60}>
              <details className="surface group px-6 py-4 open:pb-5">
                <summary className="cursor-pointer list-none font-display text-[14.5px] font-semibold marker:content-none">
                  <span className="mr-2 inline-block text-accent transition-transform group-open:rotate-90">›</span>
                  {f.q}
                </summary>
                <p className="pretty mt-3 pl-5 text-[13px] leading-relaxed text-secondary">{f.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* final CTA */}
      <div className="mx-auto w-full max-w-6xl px-6 pb-28 pt-4">
        <Reveal>
          <div className="surface relative overflow-hidden p-10 text-center md:p-14">
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: 'radial-gradient(ellipse 70% 90% at 50% 0%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 70%)' }}
            />
            <Label className="justify-center">Ready when you are</Label>
            <h2 className="serif-hero balance relative mt-4 font-display text-[clamp(30px,4.5vw,48px)] font-semibold leading-[1.02] tracking-[-0.03em]">
              Stop shipping hope. <span className="italic font-medium text-accent">Ship convergence.</span>
            </h2>
            <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
              <LinkButton href="/app.html" variant="primary" size="lg">
                <Globe size={15} /> Launch the web IDE
              </LinkButton>
              <LinkButton href="#download" variant="quiet" size="lg">
                <ArrowDown size={14} /> Get the desktop app
              </LinkButton>
            </div>
          </div>
        </Reveal>
      </div>

      {/* footer */}
      <footer style={{ borderTop: '1px solid var(--hairline)' }}>
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-6 py-10 text-[12px] text-muted">
          <span className="flex items-center gap-2 text-secondary">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent text-accentink">
              <span className="h-2 w-2 rounded-full bg-current" />
            </span>
            <span className="font-display text-[13.5px] font-semibold text-primary">Sutra</span>— the loop-engineering IDE
          </span>
          <a href="/app.html" className="transition-colors hover:text-primary">Launch</a>
          <a href="#download" className="transition-colors hover:text-primary">Download</a>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 transition-colors hover:text-primary">
            <GithubMark size={13} /> GitHub
          </a>
          <a href="#faq" className="transition-colors hover:text-primary">FAQ</a>
          <span className="ml-auto flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className="text-faint">Analogy Architect integration — soon</span>
            <span>A concept preview · © 2026 Sutra</span>
          </span>
        </div>
      </footer>
    </div>
  )
}
