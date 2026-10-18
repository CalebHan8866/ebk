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

const HOW_IT_WORKS = [
  {
    emoji: '🏀',
    step: '1',
    title: 'Snake Draft',
    body: 'Take turns picking any NBA player from any era. 3,247 players across 80 years.',
  },
  {
    emoji: '📊',
    step: '2',
    title: 'Scores Revealed',
    body: "Career stats, fame, and salary add up to your team total. Lower is harder to build — that's the skill.",
  },
  {
    emoji: '🏆',
    step: '3',
    title: 'Lowest Wins',
    body: "Hidden gems beat superstars. Know your role players — they're worth more than LeBron here.",
  },
]

export default function Home() {
  return (
    /* pb-20 on mobile keeps last section clear of the bottom nav bar */
    <div className="min-h-screen animate-fade-in pb-20 sm:pb-0">

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <div className="relative text-center pt-10 sm:pt-24 pb-10 sm:pb-20 px-4 overflow-hidden">

        {/* Ambient glow — deep radial wash */}
        <div className="absolute inset-x-0 top-0 h-[640px] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 95% 120% at 50% -5%, rgba(234,88,12,0.40) 0%, rgba(234,88,12,0.10) 48%, transparent 70%)' }} />

        {/* Secondary inner glow to halo the wordmark */}
        <div className="absolute inset-x-0 top-0 h-[320px] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 55% 60% at 50% 12%, rgba(249,115,22,0.18) 0%, transparent 65%)' }} />

        <div className="relative">
          {/* Eyebrow pill */}
          <div className="inline-flex items-center gap-2 bg-orange-950/60 border border-orange-700/50 rounded-full px-4 py-1.5 mb-6 animate-fade-up"
            style={{ boxShadow: '0 0 0 1px rgba(249,115,22,0.08), 0 2px 12px rgba(234,88,12,0.18)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
            <span className="text-orange-300 text-[11px] font-black tracking-[0.22em] uppercase">Free to Play · No Download</span>
          </div>

          {/* Main wordmark — extra drop-shadow layers for depth */}
          <h1 className="font-display leading-none select-none animate-fade-up-1"
            style={{ fontSize: 'clamp(5rem, 22vw, 17rem)' }}>
            <span className="win-shimmer-text ebk-wordmark-glow">
              EBK
            </span>
          </h1>

          <p className="text-[11px] font-bold tracking-[0.55em] text-gray-400/80 uppercase -mt-2 mb-6 sm:mb-8 animate-fade-up-2">
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
              <span className="text-gray-500 text-xs tracking-widest uppercase">{item.label}</span>
              <span className="text-orange-800/60 text-xs">·</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-4 pb-16">
        <p className="text-center text-label mb-8 tracking-[0.25em]">How it works</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {HOW_IT_WORKS.map(({ emoji, step, title, body }) => (
            <div key={step} className="card-accent p-6 flex flex-col gap-3 how-it-works-card">
              {/* Step number + emoji row */}
              <div className="flex items-start justify-between">
                <span className="font-display text-[3.25rem] text-orange-500/80 leading-none how-it-works-step">{step}</span>
                <span className="text-2xl mt-0.5">{emoji}</span>
              </div>
              <div>
                <h3 className="font-black text-white text-base mb-1.5 tracking-wide">{title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── EXPLORE ──────────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-4 pb-16">
        <p className="text-center text-label mb-8 tracking-[0.25em]">Explore</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Fun Facts */}
          <Link href="/fun-facts"
            className="card-surface explore-card p-6 hover:border-orange-700/50 hover:bg-orange-950/10 transition-all group">
            <div className="flex items-center gap-3 mb-3">
              <div className="explore-icon-wrap w-11 h-11 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0 transition-all group-hover:bg-orange-500/20 group-hover:border-orange-500/40">
                <span className="font-display text-xl text-orange-400 leading-none">$</span>
              </div>
              <h3 className="font-black text-white text-base tracking-wide group-hover:text-orange-300 transition-colors">Fun Facts</h3>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed">See every NBA player&apos;s career earnings put in wild perspective — houses, iPhones, lobster dinners, and more.</p>
            <div className="mt-4 flex items-center gap-1.5 text-orange-500/60 group-hover:text-orange-400 transition-colors">
              <span className="text-xs font-bold tracking-wider uppercase">Explore</span>
              <svg className="w-3 h-3 translate-x-0 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
            </div>
          </Link>

          {/* Higher or Lower */}
          <Link href="/higher-lower"
            className="card-surface explore-card p-6 hover:border-orange-700/50 hover:bg-orange-950/10 transition-all group">
            <div className="flex items-center gap-3 mb-3">
              <div className="explore-icon-wrap w-11 h-11 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0 transition-all group-hover:bg-orange-500/20 group-hover:border-orange-500/40">
                <span className="font-display text-xl text-orange-400 leading-none">?</span>
              </div>
              <h3 className="font-black text-white text-base tracking-wide group-hover:text-orange-300 transition-colors">Higher or Lower</h3>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed">Guess which player had the higher stat. Streak-based — how far can you go?</p>
            <div className="mt-4 flex items-center gap-1.5 text-orange-500/60 group-hover:text-orange-400 transition-colors">
              <span className="text-xs font-bold tracking-wider uppercase">Play</span>
              <svg className="w-3 h-3 translate-x-0 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
            </div>
          </Link>

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
