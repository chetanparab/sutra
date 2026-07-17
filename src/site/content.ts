// All landing-page copy in one place.

export const REPO_URL = 'https://github.com/chetanparab/sutra'
export const RELEASES_URL = `${REPO_URL}/releases`

// Sutra is built alongside The Analogy Architect — link back to its home.
export const ANALOGY_ARCHITECT_URL = 'https://www.theanalogyarchitect.com/'

export const TAGLINE = 'The loop-engineering IDE'

export const HERO_SUB =
  'Declare the outcome. A crew of agents cycles Sense → Build → Verify → Reflect until every acceptance ' +
  'signal turns green — measured in a WebAssembly sandbox, not promised. You conduct; the loop converges.'

export const STATS: { value: string; label: string }[] = [
  { value: '2 → 1', label: 'redis round-trips — measured live in WASM' },
  { value: '−92%', label: 'review load vs a 1,300-line spec' },
  { value: '~10 MB', label: 'native desktop shell, every OS' },
  { value: '⌘K', label: 'steer the whole IDE by intent' },
]

export const THESIS: { title: string; body: string; tone: 'muted' | 'muted2' | 'accent' }[] = [
  {
    title: 'Prompting',
    body: 'One-shot generation into a chat box. No gates, no budget, no proof — hope is the QA strategy.',
    tone: 'muted',
  },
  {
    title: 'Spec-driven',
    body: 'Frozen 1,300-line documents that drift from the code the moment agents start typing. Review fatigue as a feature.',
    tone: 'muted2',
  },
  {
    title: 'Loop engineering',
    body: 'A designed loop with human gates, iteration budgets and machine-checkable signals. It iterates until it converges — with evidence.',
    tone: 'accent',
  },
]

export const PHASES_SITE: { n: string; title: string; body: string }[] = [
  { n: '01', title: 'Sense', body: 'Agents read live context — conventions, ownership, telemetry, incidents — plus the last loop’s memo. No frozen spec.' },
  { n: '02', title: 'Build', body: 'Builders implement in parallel against the acceptance signals, visible in the code surface as they type.' },
  { n: '03', title: 'Verify', body: 'The change executes in a WebAssembly sandbox. Signals are computed from the run — replays, dedup counts, p99.' },
  { n: '04', title: 'Reflect', body: 'Hermes weighs the gap, writes a memo — finding, directive, route — and primes the next pass.' },
]

export interface Feature {
  title: string
  body: string
  icon: string // lucide name key, resolved in the component
}

export const FEATURES: Feature[] = [
  {
    icon: 'code',
    title: 'Living code surface',
    body: 'Watch Builder A & B write the executor with presence cursors. Hot lines get flagged over budget — and the fix lands as a live diff morph, line by line.',
  },
  {
    icon: 'cpu',
    title: 'Real WASM verification',
    body: 'Verify doesn’t claim — it runs. Your change executes in a QuickJS sandbox compiled to WebAssembly: 1,000 replays, 0 duplicate charges, p99 measured. Offline, sandboxed, identical on every OS.',
  },
  {
    icon: 'sliders',
    title: 'Loop designer',
    body: 'Engineer the loop itself: autonomy (copilot · guided · autopilot), human gates on conflict / iteration / convergence, and an iteration budget with extend-or-accept decisions at the wall.',
  },
  {
    icon: 'orbit',
    title: 'Convergence orbit',
    body: 'The mission instrument. Phase stations on a live ring, gate diamonds that flare when it needs you, a comet on the active arc, and a green bloom when the loop closes.',
  },
  {
    icon: 'feather',
    title: 'Hermes transmissions',
    body: 'The loop’s courier. After every iteration Hermes posts a memo — the finding, the directive, where it routes next. Learning carries forward between passes.',
  },
  {
    icon: 'history',
    title: 'Flight recorder',
    body: 'Every event timestamped: iterations, conflicts, your decisions, verdicts, memos, convergence. The run is a replayable record, not a vibe.',
  },
  {
    icon: 'command',
    title: 'Conductor · ⌘K',
    body: 'Steer everything by intent. Jump stages, tune autonomy and budget mid-flight, switch themes, toggle the context plane — without hunting through panels.',
  },
  {
    icon: 'layers',
    title: 'Context plane',
    body: 'Live sources replace the spec: codebase conventions, ownership graph, production telemetry, deploy calendar, recent incidents — refreshed continuously, read by agents on dispatch.',
  },
  {
    icon: 'eye',
    title: 'Review surface',
    body: 'What changed & why in three bullets, verification per signal, risk strip, a blast-radius map — then per-file intent, and raw diff only as the last resort. ~3 minutes instead of ~40.',
  },
  {
    icon: 'shield',
    title: 'Governance gate',
    body: 'Policy-as-code runs before merge: security scan, data privacy, change-freeze windows, an immutable audit entry. Nothing merges on vibes.',
  },
  {
    icon: 'plug',
    title: 'Your SDD, plugged in',
    body: 'Flows are manifests, agents plug in over MCP. Adapters read GitHub Spec Kit and Kiro artifacts as-is — requirements, design, tasks — and your custom framework maps in the same way.',
  },
  {
    icon: 'palette',
    title: 'Five design languages',
    body: 'Luminous, Editorial, Tactile, Ink, Cinematic. One token system drives every surface — switch live, keep your eyes fresh.',
  },
]

export const DOWNLOADS: { id: 'mac' | 'windows' | 'linux'; name: string; formats: string; note: string }[] = [
  { id: 'mac', name: 'macOS', formats: '.dmg · Apple Silicon & Intel', note: 'macOS 12+' },
  { id: 'windows', name: 'Windows', formats: '.msi · x64 & ARM', note: 'Windows 10+' },
  { id: 'linux', name: 'Linux', formats: '.AppImage · .deb', note: 'glibc 2.31+' },
]

export const ARCH: { title: string; body: string }[] = [
  {
    title: 'Featherweight shell',
    body: 'The desktop app is a Tauri shell over your OS’s native webview — around 10 MB, no bundled browser, low memory. The same codebase ships to web and desktop.',
  },
  {
    title: 'WebAssembly engine',
    body: 'Verification and heavy compute run in a sandboxed WASM VM: byte-identical on every OS, fully offline, and agent-generated code never touches your system directly.',
  },
  {
    title: 'Open runtime',
    body: 'Sutra is a runtime, not a methodology. Stage graphs are config, acceptance signals are the universal contract, and any agent that speaks MCP or HTTP joins the crew.',
  },
]

export const FAQ: { q: string; a: string }[] = [
  {
    q: 'Does it replace our spec-driven framework?',
    a: 'No — it runs it. Spec mode drafts EARS requirements, design and traced tasks natively, and adapters ingest GitHub Spec Kit or Kiro artifacts from your repo as-is. Your flow becomes a manifest; Sutra adds the loop, the review surface and governance on top.',
  },
  {
    q: 'Is it online-only?',
    a: 'The web IDE runs in any modern browser right now. Desktop preview builds (Tauri, ~10 MB) are rolling out for macOS, Windows and Linux — and because verification runs in WebAssembly, it works offline.',
  },
  {
    q: 'Are the results real?',
    a: 'The verification numbers are: the retry code genuinely executes inside a QuickJS-on-WASM sandbox in your browser, and the dedup counts and round-trip deltas are measured from that run. The demo mission and agent crew are a scripted scenario — this is a concept preview.',
  },
  {
    q: 'Which agents and models does it use?',
    a: 'Bring your own. Agents are contracts with adapters — MCP, HTTP, local process, or any LLM. The preview ships with a simulated crew (Scout, Builders, Verifier, Sentinel, Hermes) so you can feel the loop before wiring your own.',
  },
  {
    q: 'Is Sutra open source?',
    a: 'Yes — Apache-2.0, developed in the open on GitHub. This is an early, in-development preview, and contributions are genuinely welcome: issues, ideas and pull requests. The repository has the roadmap, the contributor guide and the security policy.',
  },
]
