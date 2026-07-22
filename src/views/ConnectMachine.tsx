/**
 * Web real-mode: connect the web IDE to a local `sutra serve` engine so it runs
 * REAL loops on your machine. A browser tab can't read your files or run your
 * tests itself — this bridges to a tiny local process that can. Paste the token
 * `sutra serve` prints; the connection is remembered across reloads.
 */
import { KeyRound, Play, ShieldCheck, TriangleAlert, X } from 'lucide-react'
import { useState } from 'react'
import { Button, cn } from '../components/ui'
import { connectLocalEngine } from '../desktop/localEngine'

const FIELD =
  'w-full rounded-[var(--radius)] border border-primary/12 bg-primary/[0.03] px-3 py-2 text-[12.5px] text-primary outline-none transition-colors placeholder:text-faint focus:border-accent/50'

export default function ConnectMachine({ open, onClose, onConnected }: { open: boolean; onClose: () => void; onConnected: () => void }) {
  const [url, setUrl] = useState('http://localhost:4317')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okVersion, setOkVersion] = useState<string | null>(null)

  if (!open) return null

  const connect = async () => {
    setBusy(true)
    setError(null)
    try {
      const info = await connectLocalEngine(url.trim(), token.trim())
      setOkVersion(info.engine)
      setTimeout(onConnected, 500)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm">
      <div className="surface relative w-full max-w-lg rounded-[calc(var(--radius)*1.5)] p-7">
        <button onClick={onClose} className="absolute right-4 top-4 text-muted transition-colors hover:text-primary" title="Close">
          <X size={16} />
        </button>

        <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius)] bg-accent/12 ring-1 ring-accent/25">
          <Play size={18} className="text-accent" />
        </span>
        <h2 className="serif-hero mt-4 font-display text-[23px] font-semibold tracking-[-0.02em]">Run for real on this machine</h2>
        <p className="mt-2.5 text-[12.5px] leading-relaxed text-secondary">
          A browser tab can’t touch your files or run your tests by itself. Start a tiny local engine and this page drives
          it — your repo, your tests, your model, a real branch to merge.
        </p>

        <div className="mt-4 rounded-[var(--radius)] border border-primary/10 bg-primary/[0.02] p-3.5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted">1 · start the engine</div>
          <p className="mt-1.5 text-[12px] text-secondary">In a terminal, run:</p>
          <code className="mt-1.5 block rounded-[var(--radius)] bg-primary/[0.06] px-3 py-2 font-mono text-[12px] text-primary">npx @sutra/engine serve</code>
          <p className="mt-1.5 text-[11px] text-muted">It prints a URL and a one-time token. Keep it running.</p>
        </div>

        <div className="mt-3 space-y-2">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted">2 · connect</div>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://localhost:4317" className={cn(FIELD, 'font-mono text-[11.5px]')} />
          <div className="relative">
            <KeyRound size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste the token from the terminal" className={cn(FIELD, 'pl-8 font-mono text-[11.5px]')} autoFocus />
          </div>
        </div>

        {error && (
          <p className="mt-3 flex items-start gap-1.5 text-[11.5px] text-warn">
            <TriangleAlert size={13} className="mt-0.5 shrink-0" /> {error}
          </p>
        )}
        {okVersion && (
          <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-ok">
            <ShieldCheck size={13} /> Connected — engine {okVersion}. Opening the launcher…
          </p>
        )}

        <div className="mt-6 flex items-center justify-between">
          <span className="text-[11px] text-muted">The token is what authorizes this page — nothing else can drive your engine.</span>
          <Button variant="primary" disabled={busy || token.trim() === '' || okVersion !== null} onClick={() => void connect()}>
            {busy ? 'Connecting…' : 'Connect'} <Play size={13} />
          </Button>
        </div>
      </div>
    </div>
  )
}
