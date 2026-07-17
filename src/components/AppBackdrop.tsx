// Theme-aware depth: a soft graded wash, one accent highlight, a vignette and
// film grain whose strength each theme sets (dramatic in Cinematic, faint in
// the light themes) via the --vignette / --grain tokens.
export default function AppBackdrop() {
  return (
    <div className="grain pointer-events-none fixed inset-0 -z-10 overflow-hidden" style={{ background: 'var(--bg)' }}>
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 90% 70% at 50% 0%, color-mix(in srgb, var(--bg-hi) 90%, transparent), transparent 70%)' }}
      />
      <div
        className="absolute left-1/2 top-[38%] h-[760px] w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--accent) 9%, transparent), transparent 62%)', filter: 'blur(52px)' }}
      />
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 100% 100% at 50% 44%, transparent 52%, rgba(0,0,0,var(--vignette,0.1)) 100%)' }}
      />
      {/* cinematic-only slow anamorphic light sweep */}
      <div className="cine-sweep" />
    </div>
  )
}
