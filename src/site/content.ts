// All landing-page copy in one place.

export const REPO_URL = 'https://github.com/chetanparab/sutra'
export const RELEASES_URL = `${REPO_URL}/releases`

// Sutra is built alongside The Analogy Architect — link back to its home.
export const ANALOGY_ARCHITECT_URL = 'https://www.theanalogyarchitect.com/'

export const TAGLINE = 'The loop-engineering IDE'

export const HERO_SUB =
  'Point it at a repo — or an empty folder — and say what you want. A real loop edits on a shadow branch, runs your ' +
  'tests, reflects on failures and iterates until they pass, handing you a branch to merge. Bring your own model, or ' +
  'run it on your local Claude Code sign-in — no API key.'

export const STATS: { value: string; label: string }[] = [
  { value: 'Your tests', label: 'verified by running them — not promised' },
  { value: 'No API key', label: 'runs on your local Claude Code sign-in' },
  { value: 'Your branch', label: 'nothing merges until you click' },
  { value: 'Apache-2.0', label: 'open source, built in the open' },
]

export const THESIS: { title: string; body: string; tone: 'muted' | 'muted2' | 'accent' }[] = [
  {
    title: 'Prompting',
    body: 'One-shot generation into a chat box. No gates, no budget, no proof — hope is the QA strategy.',
    tone: 'muted',
  },
  {
    title: 'Spec-driven',
    body: 'Frozen documents that drift from the code the moment agents start typing. Review fatigue as a feature.',
    tone: 'muted2',
  },
  {
    title: 'Loop engineering',
    body: 'A designed loop with human gates, an iteration budget and machine-checkable signals — your own tests. It iterates until they pass, with evidence.',
    tone: 'accent',
  },
]

export const PHASES_SITE: { n: string; title: string; body: string }[] = [
  { n: '01', title: 'Sense', body: 'Reads your repo and the last pass’s memo — conventions, the failing test, what changed — and scopes the work. No frozen spec.' },
  { n: '02', title: 'Build', body: 'Proposes real edits through file tools on a shadow branch — new files, new projects and all. Your branch is never touched.' },
  { n: '03', title: 'Verify', body: 'Runs your actual test command — auto-detected — on your machine or in a throwaway container. Pass or fail is measured, not claimed.' },
  { n: '04', title: 'Reflect', body: 'Turns a failure into a memo — the finding and the directive — and carries it into the next pass.' },
]

export interface Feature {
  title: string
  body: string
  icon: string // lucide name key, resolved in the component
}

export const FEATURES: Feature[] = [
  {
    icon: 'cpu',
    title: 'Your model — or no key',
    body: 'Bring your own: Anthropic, or any OpenAI-compatible endpoint. Or no API key at all — Sutra drives your locally signed-in Claude Code. Your credentials never pass through it.',
  },
  {
    icon: 'shield',
    title: 'Verify by running it',
    body: 'Verify runs your project’s own tests — auto-detected (npm test, cargo test, pytest, go test…), on your machine or in an isolated container. It never grades its own homework, and never a fake green.',
  },
  {
    icon: 'sliders',
    title: 'Two real workflows',
    body: 'Loop — say it, iterate to green. Spec — the model drafts real requirements, an approach and tasks; you edit them; then the same loop builds it. No scripted demo either way.',
  },
  {
    icon: 'plus',
    title: 'New project or existing repo',
    body: 'Point at an existing repository, or an empty folder — Sutra initializes it and scaffolds from nothing. It works out which; you don’t type a thing.',
  },
  {
    icon: 'git-branch',
    title: 'Shadow branch, human-gated merge',
    body: 'Every run happens on a dedicated branch. Merge — fast-forward, rebase, or open a GitHub PR — only when you click. No autonomy setting can reach your branch on its own.',
  },
  {
    icon: 'plug',
    title: 'Your tools, plugged in',
    body: 'Bring your own MCP servers — their tools join the Build phase’s built-in file tools. Spec mode reads your requirements/design/tasks; your framework maps in the same way.',
  },
  {
    icon: 'orbit',
    title: 'Convergence orbit',
    body: 'The mission instrument: a live phase ring, gate diamonds that flare when it needs you, the active arc lit while a real phase runs, a green bloom when the loop closes.',
  },
  {
    icon: 'history',
    title: 'Flight recorder',
    body: 'Every event timestamped — iterations, verify verdicts, memos, your decisions, convergence. The run is a replayable record, not a vibe.',
  },
  {
    icon: 'eye',
    title: 'Review surface',
    body: 'What changed & why in three bullets, verification per signal, a risk strip, a blast-radius map — then per-file intent, raw diff last. Minutes, not an hour.',
  },
  {
    icon: 'command',
    title: 'Conductor · ⌘K',
    body: 'Steer everything by intent — jump stages, switch between Loop and Spec, change themes — without hunting through panels.',
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
    body: 'The desktop app is a Tauri shell over your OS’s native webview — around 10 MB, no bundled browser, low memory. The same UI ships to web (preview) and desktop (real).',
  },
  {
    title: 'The engine runs on your machine',
    body: 'The real engine is a Node sidecar the desktop app manages — it runs your git, your tests and your files directly, behind a workspace-root guard and an explicit run-consent. Nothing about your code leaves your machine.',
  },
  {
    title: 'Open runtime',
    body: 'Sutra is a runtime, not a methodology. Any model behind a small provider contract, and any tool that speaks MCP, joins the crew. Apache-2.0, developed in the open.',
  },
]

export const FAQ: { q: string; a: string }[] = [
  {
    q: 'Are the results real?',
    a: 'On the desktop app, completely: real edits on a shadow branch, your real test command actually run, a real branch merged only when you click. This web page is a preview — it runs one scripted scenario (with a genuine QuickJS-on-WebAssembly verifier, so you can see real verification) to let you feel the loop before you download.',
  },
  {
    q: 'Which agents and models does it use?',
    a: 'Bring your own: Anthropic or any OpenAI-compatible key. Or no key at all — it runs on your locally signed-in Claude Code, and your credentials never pass through Sutra. Plug your own tools in over MCP.',
  },
  {
    q: 'Do I have to write a test command or set the project up?',
    a: 'No. Sutra auto-detects how to verify your project after each build (npm test, cargo test, pytest, a build script, a Makefile target…). Point it at an empty folder and it initializes git and scaffolds from scratch; point it at a repo and it uses it as-is. It figures out which.',
  },
  {
    q: 'Does it replace our spec-driven framework?',
    a: 'No — it runs it. Spec mode drafts real requirements, an approach and traced tasks for your review and edit, then the same loop builds and verifies them. Bring your own SDD artifacts in over MCP; Sutra adds the loop, the review surface and governance on top.',
  },
  {
    q: 'Is it online-only?',
    a: 'The desktop app runs entirely on your machine — your files, your git, your tests — and needs the network only to reach your chosen model. This web page is an online preview of the loop; download the desktop app to run your own repo for real.',
  },
  {
    q: 'Is Sutra open source?',
    a: 'Yes — Apache-2.0, developed in the open on GitHub. It’s early and in active development, and contributions are genuinely welcome: issues, ideas and pull requests. The repository has the roadmap, the contributor guide and the security policy.',
  },
]
