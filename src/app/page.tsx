import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'EBK — Elite Ball Knowledge | Free NBA Draft Game',
  description: 'Play EBK free: a real-time head-to-head NBA snake draft where lower career stats win. No download, no credit card — jump in a live game in 30 seconds.',
  openGraph: {
    title: 'EBK — Elite Ball Knowledge | Free NBA Draft Game',
    description: 'Play EBK free: a real-time head-to-head NBA snake draft where lower career stats win. No download, no credit card — jump in a live game in 30 seconds.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'EBK — Elite Ball Knowledge | Free NBA Draft Game',
    description: 'Play EBK free: a real-time head-to-head NBA snake draft where lower career stats win. No download, no credit card — jump in a live game in 30 seconds.',
  },
}

const TICKER = [
  { value: '3,247', label: 'NBA players' },
  { value: 'Snake draft', label: 'real-time head-to-head' },
  { value: 'Lower', label: 'score wins' },
  { value: 'Free', label: 'to play' },
  { value: '6 stat modes', label: 'PPG · RPG · APG · Games · Salary · EBK' },
  { value: 'Any era', label: 'from 1946 to today' },
  { value: 'Hidden gems', label: 'beat superstars' },
  { value: 'No download', label: 'play in 30 seconds' },
  { value: '3,247', label: 'NBA players' },
  { value: 'Snake draft', label: 'real-time head-to-head' },
  { value: 'Lower', label: 'score wins' },
  { value: 'Free', label: 'to play' },
  { value: '6 stat modes', label: 'PPG · RPG · APG · Games · Salary · EBK' },
  { value: 'Any era', label: 'from 1946 to today' },
  { value: 'Hidden gems', label: 'beat superstars' },
  { value: 'No download', label: 'play in 30 seconds' },
]

export default function Home() {
  return (
    <div className="min-h-screen animate-fade-in">

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <div className="relative text-center pt-10 sm:pt-24 pb-10 sm:pb-20 px-4 overflow-hidden">
        {/* Ambient glow — wider and brighter */}
        <div className="absolute inset-x-0 top-0 h-[600px] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 90% 110% at 50% -10%, rgba(234,88,12,0.35) 0%, rgba(234,88,12,0.08) 50%, transparent 72%)' }} />

        <div className="relative">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 bg-orange-950/50 border border-orange-700/40 rounded-full px-4 py-1.5 mb-6 animate-fade-up">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
            <span className="text-orange-300 text-[11px] font-black tracking-[0.2em] uppercase">Free to Play · No Download</span>
          </div>

          {/* Main wordmark */}
          <h1 className="font-display leading-none select-none animate-fade-up-1"
            style={{ fontSize: 'clamp(5rem, 22vw, 17rem)' }}>
            <span className="win-shimmer-text"
              style={{ filter: 'drop-shadow(0 0 80px rgba(249,115,22,0.5))' }}>
              EBK
            </span>
          </h1>

          <p className="text-[11px] font-bold tracking-[0.5em] text-gray-400 uppercase -mt-1 mb-6 sm:mb-8 animate-fade-up-2">
            Elite Ball Knowledge
          </p>

          <p className="text-white/90 text-lg sm:text-2xl font-black max-w-sm mx-auto mb-8 sm:mb-10 leading-snug tracking-wide uppercase animate-fade-up-3">
            Draft NBA Players.<br />
            <span className="text-orange-400">Score lower. Win.</span>
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 animate-fade-up-4">
            <Link href="/lobby"
              className="btn-primary text-sm uppercase tracking-widest px-10 py-4 w-full sm:w-auto max-w-xs">
              Play Now — Free
            </Link>
            <Link href="/practice"
              className="btn-secondary text-sm uppercase tracking-widest px-8 py-4 w-full sm:w-auto max-w-xs">
              Practice First
            </Link>
          </div>

          <p className="text-gray-500 text-xs mt-5 animate-fade-up-5">
            No account needed &mdash;{' '}
            <Link href="/register" className="text-orange-500/70 hover:text-orange-400 font-semibold transition-colors">
              sign up free
            </Link>
            {' '}to save your win record
          </p>
        </div>
      </div>

      {/* ── ROLLING TICKER ───────────────────────────────────────────── */}
      <div className="border-y border-white/[0.06] bg-black/50 py-3 overflow-hidden mb-14 sm:mb-16">
        <div className="ticker-track flex gap-10 whitespace-nowrap" style={{ width: 'max-content' }}>
          {TICKER.map((item, i) => (
            <div key={i} className="flex items-center gap-2.5 shrink-0">
              <span className="font-display text-orange-400 text-xl leading-none">{item.value}</span>
              <span className="text-gray-500 text-xs tracking-widest">{item.label}</span>
              <span className="text-gray-700 text-xs">·</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── EXPLAIN EBK ──────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-4 pb-16">
        <p className="text-center text-label mb-6 tracking-[0.2em]">How it works</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card-accent p-6">
            <div className="text-3xl mb-3">🏀</div>
            <div className="font-display text-4xl text-orange-400 leading-none mb-3">1</div>
            <h3 className="font-black text-white text-base mb-2 tracking-wide">Snake Draft</h3>
            <p className="text-gray-400 text-sm leading-relaxed">Take turns picking any NBA player from any era. 3,247 players across 80 years.</p>
          </div>
          <div className="card-accent p-6">
            <div className="text-3xl mb-3">📊</div>
            <div className="font-display text-4xl text-orange-400 leading-none mb-3">2</div>
            <h3 className="font-black text-white text-base mb-2 tracking-wide">Scores Revealed</h3>
            <p className="text-gray-400 text-sm leading-relaxed">Career stats, fame, and salary add up to your team total. Lower is harder to build — that&apos;s the skill.</p>
          </div>
          <div className="card-accent p-6">
            <div className="text-3xl mb-3">🏆</div>
            <div className="font-display text-4xl text-orange-400 leading-none mb-3">3</div>
            <h3 className="font-black text-white text-base mb-2 tracking-wide">Lowest Wins</h3>
            <p className="text-gray-400 text-sm leading-relaxed">Hidden gems beat superstars. Know your role players — they&apos;re worth more than LeBron here.</p>
          </div>
        </div>
      </div>

      {/* ── READY TO PLAY ────────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-4 pb-24 sm:pb-28">
        <div className="card-accent p-8 sm:p-12 text-center animate-glow">
          <p className="font-display text-5xl sm:text-7xl text-white mb-1 leading-none">Ready to Prove</p>
          <p className="font-display text-5xl sm:text-7xl leading-none mb-5" style={{
            background: 'linear-gradient(90deg,#f97316,#fbbf24,#f97316)',
            backgroundSize: '200% auto',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>Your EBK?</p>
          <p className="text-gray-400 text-sm mb-8 max-w-xs mx-auto leading-relaxed">No download. No credit card. Jump into a live game in 30 seconds.</p>
          <Link href="/lobby" className="btn-primary text-sm uppercase tracking-widest px-12 py-4 w-full sm:w-auto">
            Start Playing Free
          </Link>
        </div>
      </div>

    </div>
  )
}
