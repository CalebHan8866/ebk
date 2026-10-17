import Link from 'next/link'

const TICKER = [
  { value: '3,247', label: 'NBA players' },
  { value: 'Snake draft', label: 'real-time' },
  { value: 'Lower', label: 'score wins' },
  { value: 'Free', label: 'to play' },
  { value: '3,247', label: 'NBA players' },
  { value: 'Snake draft', label: 'real-time' },
  { value: 'Lower', label: 'score wins' },
  { value: 'Free', label: 'to play' },
]

export default function Home() {
  return (
    <div className="min-h-screen animate-fade-in">

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <div className="relative text-center pt-16 pb-16 px-4 overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute inset-x-0 top-0 h-[500px] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 80% 100% at 50% -15%, rgba(234,88,12,0.28) 0%, rgba(234,88,12,0.06) 50%, transparent 70%)' }} />

        <div className="relative">
          {/* Main wordmark */}
          <h1 className="font-display leading-none select-none"
            style={{ fontSize: 'clamp(6rem, 22vw, 16rem)' }}>
            <span className="text-white"
              style={{ textShadow: '0 0 160px rgba(249,115,22,0.5), 0 0 60px rgba(249,115,22,0.25), 0 0 20px rgba(249,115,22,0.1)' }}>
              EBK
            </span>
          </h1>

          <p className="text-[11px] font-bold tracking-[0.45em] text-gray-400 uppercase -mt-2 mb-8">
            Elite Ball Knowledge
          </p>

          <p className="text-white/90 text-2xl font-black max-w-md mx-auto mb-10 leading-snug tracking-wide uppercase">
            Draft NBA Players.<br />
            <span className="text-orange-400">Score lower. Win.</span>
          </p>

          <Link href="/lobby"
            className="btn-primary text-sm uppercase tracking-widest px-10 py-4">
            Play Now — Free
          </Link>

          <p className="text-gray-500 text-xs mt-5">
            No account needed &mdash;{' '}
            <Link href="/register" className="text-orange-500/70 hover:text-orange-400 font-semibold transition-colors">
              sign up free
            </Link>
            {' '}to save your record
          </p>
        </div>
      </div>

      {/* ── ROLLING TICKER ───────────────────────────────────────────── */}
      <div className="border-y border-white/[0.05] bg-black/40 py-3 overflow-hidden mb-16">
        <div className="ticker-track flex gap-12 whitespace-nowrap" style={{ width: 'max-content' }}>
          {TICKER.map((item, i) => (
            <div key={i} className="flex items-center gap-3 shrink-0">
              <span className="font-display text-orange-400 text-xl leading-none">{item.value}</span>
              <span className="text-gray-400 text-xs uppercase tracking-widest">{item.label}</span>
              <span className="text-gray-800 text-xs">·</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── EXPLAIN EBK ──────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-4 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card-accent p-6">
            <div className="font-display text-5xl text-orange-400 leading-none mb-4">1</div>
            <h3 className="font-black text-white text-base mb-2 tracking-wide">Snake Draft</h3>
            <p className="text-gray-400 text-sm leading-relaxed">Take turns picking NBA players against your opponent — any era, any position.</p>
          </div>
          <div className="card-accent p-6">
            <div className="font-display text-5xl text-orange-400 leading-none mb-4">2</div>
            <h3 className="font-black text-white text-base mb-2 tracking-wide">EBK Score Revealed</h3>
            <p className="text-gray-400 text-sm leading-relaxed">Each player's score combines career stats, fame, and salary. Lower is better — role players beat superstars.</p>
          </div>
          <div className="card-accent p-6">
            <div className="font-display text-5xl text-orange-400 leading-none mb-4">3</div>
            <h3 className="font-black text-white text-base mb-2 tracking-wide">Lowest Score Wins</h3>
            <p className="text-gray-400 text-sm leading-relaxed">The GM with the lowest team total wins. Real basketball IQ beats star power every time.</p>
          </div>
        </div>
      </div>

      {/* ── READY TO PLAY ────────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-4 pb-28">
        <div className="card-accent p-10 text-center animate-glow">
          <p className="font-display text-5xl sm:text-6xl text-white mb-1 leading-none">Ready to Prove</p>
          <p className="font-display text-5xl sm:text-6xl text-orange-500 mb-4 leading-none">Your EBK?</p>
          <p className="text-gray-400 text-sm mb-8 max-w-xs mx-auto leading-relaxed">No download. No credit card. Jump into a live game in 30 seconds.</p>
          <Link href="/lobby" className="btn-primary text-sm uppercase tracking-widest px-12 py-4">
            Start Playing Free
          </Link>
        </div>
      </div>

    </div>
  )
}
