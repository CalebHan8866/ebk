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
    step: '1',
    title: 'Snake Draft',
    body: 'Take turns picking any NBA player from any era. 3,247 players across 80 years.',
    icon: (
      <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
  },
  {
    step: '2',
    title: 'Scores Revealed',
    body: "Career stats, fame, and salary add up to your team total. Lower is harder to build — that's the skill.",
    icon: (
      <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    step: '3',
    title: 'Lowest Wins',
    body: "Hidden gems beat superstars. Know your role players — they're worth more than LeBron here.",
    icon: (
      <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />
      </svg>
    ),
  },
]

const EXPLORE_CARDS = [
  {
    href: '/fun-facts',
    icon: '$',
    title: 'Fun Facts',
    desc: 'See every NBA player\'s career earnings in wild perspective',
    cta: 'Explore',
    color: 'orange',
  },
  {
    href: '/salary',
    icon: '#',
    title: 'Salary Rankings',
    desc: 'Career earnings ranked — who got paid and who earned it?',
    cta: 'Explore',
    color: 'orange',
  },
  {
    href: '/higher-lower',
    icon: '?',
    title: 'Higher or Lower',
    desc: 'Guess which player had the higher stat. How far can you go?',
    cta: 'Play',
    color: 'orange',
  },
  {
    href: '/practice',
    icon: '▶',
    title: 'Practice',
    desc: 'Solo draft practice — test your EBK knowledge before going live',
    cta: 'Play',
    color: 'orange',
  },
]

export default function Home() {
  return (
    <div className="min-h-screen animate-fade-in pb-20 sm:pb-0">

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <div className="relative text-center pt-10 sm:pt-24 pb-10 sm:pb-20 px-4 overflow-hidden">

        {/* Ambient glow */}
        <div className="absolute inset-x-0 top-0 h-[640px] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 95% 120% at 50% -5%, rgba(234,88,12,0.40) 0%, rgba(234,88,12,0.10) 48%, transparent 70%)' }} />
        <div className="absolute inset-x-0 top-0 h-[320px] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 55% 60% at 50% 12%, rgba(249,115,22,0.18) 0%, transparent 65%)' }} />

        <div className="relative">
          {/* Eyebrow pill */}
          <div className="inline-flex items-center gap-2 bg-orange-950/60 border border-orange-700/50 rounded-full px-4 py-1.5 mb-6 animate-fade-up"
            style={{ boxShadow: '0 0 0 1px rgba(249,115,22,0.08), 0 2px 12px rgba(234,88,12,0.18)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
            <span className="text-orange-300 text-[11px] font-black tracking-[0.22em] uppercase">Free to Play · No Download</span>
          </div>

          {/* Main wordmark */}
          <h1 className="font-display leading-none select-none animate-fade-up-1"
            style={{ fontSize: 'clamp(5rem, 22vw, 17rem)' }}>
            <span className="win-shimmer-text ebk-wordmark-glow">
              EBK
            </span>
          </h1>

          <p className="text-[11px] font-bold tracking-[0.55em] text-white/50 uppercase -mt-2 mb-6 sm:mb-8 animate-fade-up-2">
            Elite Ball Knowledge
          </p>

          <p className="text-white/80 text-lg sm:text-2xl font-black max-w-sm mx-auto mb-3 sm:mb-4 leading-snug tracking-wide uppercase animate-fade-up-3">
            Draft NBA Players.<br />
            <span className="text-orange-400">Score lower. Win.</span>
          </p>
          <p className="text-white/35 text-sm sm:text-base max-w-xs mx-auto mb-8 sm:mb-10 leading-relaxed animate-fade-up-3">
            Real-time head-to-head snake drafts. Hidden gems beat superstars. 3,247 players across 80 years.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 animate-fade-up-4">
            <Link href="/lobby"
              className="btn-primary text-sm uppercase tracking-widest px-10 py-4 w-full sm:w-auto max-w-xs min-h-[52px]">
              Play Now — Free
            </Link>
            <Link href="/practice"
              className="btn-secondary text-sm uppercase tracking-widest px-8 py-4 w-full sm:w-auto max-w-xs min-h-[52px]">
              Practice First
            </Link>
          </div>

          <p className="text-white/40 text-xs mt-5 animate-fade-up-5">
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
              <span className="text-white/40 text-xs tracking-widest uppercase">{item.label}</span>
              <span className="text-orange-800/60 text-xs">·</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── QUICK PLAY INLINE CTA ─────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-4 pb-14">
        <div className="relative card-accent p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4 overflow-hidden">
          {/* Subtle right-side glow */}
          <div className="absolute right-0 top-0 bottom-0 w-40 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse 100% 100% at 100% 50%, rgba(249,115,22,0.08) 0%, transparent 70%)' }} />
          <div className="relative text-center sm:text-left">
            <p className="text-label mb-1.5 tracking-widest">No account needed</p>
            <p className="font-display text-2xl sm:text-3xl text-white leading-none">
              Try <span className="text-orange-400">Quick Play</span> right now
            </p>
            <p className="text-white/35 text-xs mt-1.5 leading-relaxed">Pick the player with lower career stats. One round, instant fun.</p>
          </div>
          <Link
            href="/play"
            className="btn-primary text-sm uppercase tracking-widest px-8 py-3 shrink-0 w-full sm:w-auto relative"
          >
            Play Free →
          </Link>
        </div>
      </div>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-4 pb-16">
        <p className="text-center text-label mb-8 tracking-[0.25em]">How it works</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {HOW_IT_WORKS.map(({ step, title, body, icon }) => (
            <div key={step} className="card-accent p-6 flex flex-col gap-3 how-it-works-card">
              {/* Step number + icon row */}
              <div className="flex items-start justify-between">
                <span className="font-display text-[3.25rem] text-orange-500/80 leading-none how-it-works-step">{step}</span>
                <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mt-0.5">
                  {icon}
                </div>
              </div>
              <div>
                <h3 className="font-black text-white text-base mb-1.5 tracking-wide">{title}</h3>
                <p className="text-white/60 text-sm leading-relaxed">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── EXPLORE ──────────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-4 pb-16">
        <p className="text-center text-label mb-8 tracking-[0.25em]">Explore</p>
        <div className="grid grid-cols-2 gap-3">
          {EXPLORE_CARDS.map(({ href, icon, title, desc, cta }) => (
            <Link
              key={href}
              href={href}
              className="card-surface explore-card p-4 hover:border-orange-700/50 hover:bg-orange-950/10 hover:-translate-y-0.5 hover:shadow-[0_6px_24px_rgba(249,115,22,0.08)] transition-all duration-200 group rounded-xl"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="explore-icon-wrap w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0 transition-all group-hover:bg-orange-500/20 group-hover:border-orange-500/40">
                  <span className="font-display text-xl text-orange-400 leading-none">{icon}</span>
                </div>
                <h3 className="font-black text-white text-sm tracking-wide group-hover:text-orange-300 transition-colors">{title}</h3>
              </div>
              <p className="text-white/60 text-xs leading-relaxed">{desc}</p>
              <div className="mt-3 flex items-center gap-1 text-orange-500/60 group-hover:text-orange-400 transition-colors">
                <span className="text-[10px] font-bold tracking-wider uppercase">{cta}</span>
                <svg className="w-2.5 h-2.5 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                </svg>
              </div>
            </Link>
          ))}
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
          <p className="text-white/60 text-sm mb-8 max-w-xs mx-auto leading-relaxed">
            No download. No credit card. Jump into a live game in 30 seconds.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/lobby" className="btn-primary text-sm uppercase tracking-widest px-12 py-4">
              Start Playing Free
            </Link>
            <Link href="/play" className="btn-secondary text-sm uppercase tracking-widest px-8 py-4">
              Quick Play First
            </Link>
          </div>
        </div>
      </div>

    </div>
  )
}
