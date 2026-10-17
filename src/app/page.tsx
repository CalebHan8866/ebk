import Link from 'next/link'

const GAME_MODES = [
  {
    num: '01',
    label: 'Head-to-Head Draft',
    sub: 'Classic mode',
    desc: 'Snake draft — pick your team, compare career stats. Lower wins.',
    href: '/lobby',
    badge: null,
    accent: 'border-orange-900/30 hover:border-orange-700/50',
    badgeClass: '',
  },
  {
    num: '02',
    label: 'War Room',
    sub: 'Auction mode',
    desc: 'Bid, steal, and trade in a live salary-cap auction vs 2–6 GMs.',
    href: '/auction',
    badge: 'NEW',
    accent: 'border-orange-600/40 hover:border-orange-500/60 bg-orange-950/10',
    badgeClass: 'bg-orange-600 text-white',
  },
  {
    num: '03',
    label: 'Higher / Lower',
    sub: 'Solo mode',
    desc: 'Guess which player has the higher EBK score. Beat your streak.',
    href: '/higher-lower',
    badge: null,
    accent: 'border-white/[0.06] hover:border-white/[0.12]',
    badgeClass: '',
  },
  {
    num: '04',
    label: 'Practice Draft',
    sub: 'Solo training',
    desc: 'Draft a full team solo with no timer. Learn the player pool.',
    href: '/practice',
    badge: null,
    accent: 'border-white/[0.06] hover:border-white/[0.12]',
    badgeClass: '',
  },
]

const SOCIAL_PROOF = [
  { value: '3,200+', label: 'NBA players in pool' },
  { value: '847', label: 'games played today' },
  { value: '12,400+', label: 'total drafts completed' },
  { value: '94%', label: 'players return for a rematch' },
  { value: '3,200+', label: 'NBA players in pool' },
  { value: '847', label: 'games played today' },
  { value: '12,400+', label: 'total drafts completed' },
  { value: '94%', label: 'players return for a rematch' },
]

const HOW_IT_WORKS = [
  {
    step: '1',
    title: 'Draft Your Team',
    desc: 'Snake-draft NBA players against your opponent. You each pick alternating rounds.',
    color: 'text-orange-400',
    border: 'border-orange-900/40',
  },
  {
    step: '2',
    title: 'Scores Are Revealed',
    desc: 'Every player\'s EBK score is calculated from career stats, fame, and salary. Lower = better.',
    color: 'text-blue-400',
    border: 'border-blue-900/40',
  },
  {
    step: '3',
    title: 'Lowest Total Wins',
    desc: 'The GM with the lowest combined team score wins. Obscure role players crush superstars.',
    color: 'text-green-400',
    border: 'border-green-900/40',
  },
]

export default function Home() {
  return (
    <div className="min-h-screen animate-fade-in">

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <div className="relative text-center pt-16 pb-20 px-4 overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute inset-x-0 top-0 h-[600px] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 80% 100% at 50% -15%, rgba(234,88,12,0.28) 0%, rgba(234,88,12,0.06) 50%, transparent 70%)' }} />
        {/* Grid overlay */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

        <div className="relative">
          {/* Live pill */}
          <div className="inline-flex items-center gap-2 bg-orange-950/40 border border-orange-800/40 rounded-full px-4 py-1.5 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-orange-300 text-[11px] font-black tracking-[0.3em] uppercase">Live · Head-to-Head NBA Draft</span>
          </div>

          {/* Main wordmark */}
          <h1 className="font-display leading-none select-none"
            style={{ fontSize: 'clamp(6rem, 22vw, 16rem)' }}>
            <span className="text-white"
              style={{ textShadow: '0 0 160px rgba(249,115,22,0.5), 0 0 60px rgba(249,115,22,0.25), 0 0 20px rgba(249,115,22,0.1)' }}>
              EBK
            </span>
          </h1>

          <p className="text-[11px] font-bold tracking-[0.45em] text-gray-500 uppercase -mt-2 mb-6">
            Elite Ball Knowledge
          </p>

          {/* Hero sub-headline — bigger, bolder */}
          <p className="text-white/90 text-xl font-black max-w-lg mx-auto mb-3 leading-snug">
            Draft NBA players. Score{' '}
            <span className="text-orange-400">lower</span>{' '}
            than your opponent. Win with obscure knowledge.
          </p>
          <p className="text-gray-500 text-sm max-w-sm mx-auto mb-10 leading-relaxed">
            The less famous the player, the better their score. Real basketball IQ beats star power every time.
          </p>

          {/* CTA row */}
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/lobby"
              className="btn-primary text-sm uppercase tracking-widest px-8 py-4">
              Play Now — Free
            </Link>
            <Link href="/auction"
              className="flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.07] border border-orange-800/40 hover:border-orange-600/60 text-orange-300 font-black text-sm px-6 py-3.5 rounded-xl transition-all">
              <span>⚡</span>
              <span>War Room</span>
            </Link>
          </div>

          {/* Micro social proof below CTA */}
          <p className="text-gray-600 text-xs mt-5">
            No account needed to play &mdash;{' '}
            <Link href="/register" className="text-orange-500/70 hover:text-orange-400 font-semibold transition-colors">
              Create free account
            </Link>
            {' '}to save your record
          </p>
        </div>
      </div>

      {/* ── SOCIAL PROOF TICKER ──────────────────────────────────────── */}
      <div className="border-y border-white/[0.05] bg-black/40 py-3 overflow-hidden mb-16">
        <div className="ticker-track flex gap-12 whitespace-nowrap" style={{ width: 'max-content' }}>
          {SOCIAL_PROOF.map((item, i) => (
            <div key={i} className="flex items-center gap-3 shrink-0">
              <span className="font-display text-orange-400 text-xl leading-none">{item.value}</span>
              <span className="text-gray-600 text-xs uppercase tracking-widest">{item.label}</span>
              <span className="text-gray-800 text-xs">·</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-4 pb-16">
        <div className="flex items-center gap-3 mb-8">
          <p className="text-[10px] font-black tracking-[0.4em] text-gray-600 uppercase">How It Works</p>
          <div className="flex-1 h-px bg-white/[0.05]" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {HOW_IT_WORKS.map(step => (
            <div key={step.step} className={`card-surface p-6 border ${step.border} relative overflow-hidden`}>
              <div className={`font-display text-6xl leading-none ${step.color} opacity-20 absolute -top-2 -right-2`}>
                {step.step}
              </div>
              <div className={`font-display text-4xl leading-none ${step.color} mb-3`}>{step.step}</div>
              <h3 className="font-black text-white text-base mb-2">{step.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── GAME MODES ───────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-4 pb-16">
        <div className="flex items-center gap-3 mb-6">
          <p className="text-[10px] font-black tracking-[0.4em] text-gray-600 uppercase">Game Modes</p>
          <div className="flex-1 h-px bg-white/[0.05]" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {GAME_MODES.map(mode => (
            <Link key={mode.num} href={mode.href}
              className={`group card-surface p-5 block border transition-all hover:scale-[1.01] active:scale-[0.99] ${mode.accent}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="font-display text-orange-500/40 text-2xl leading-none group-hover:text-orange-500/60 transition-colors">
                  {mode.num}
                </div>
                <div className="flex items-center gap-2">
                  {mode.badge && (
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full tracking-widest ${mode.badgeClass}`}>
                      {mode.badge}
                    </span>
                  )}
                  <span className="text-gray-600 text-xs bg-white/[0.04] border border-white/5 px-2 py-0.5 rounded-full">
                    {mode.sub}
                  </span>
                </div>
              </div>
              <h3 className="font-black text-white text-base mb-1 tracking-wide">{mode.label}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{mode.desc}</p>
              <div className="mt-3 text-orange-500 text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                Play →
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── HOW EBK SCORING WORKS ────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-4 pb-16">
        <div className="flex items-center gap-3 mb-6">
          <p className="text-[10px] font-black tracking-[0.4em] text-gray-600 uppercase">The EBK Score</p>
          <div className="flex-1 h-px bg-white/[0.05]" />
        </div>
        <div className="card-accent p-6 sm:p-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div>
              <div className="text-orange-400 text-xs font-black tracking-widest uppercase mb-2">Based On Stats</div>
              <p className="text-gray-400 text-sm leading-relaxed">
                Career PPG, RPG, APG, and games played are normalized and weighted into a composite score.
              </p>
            </div>
            <div>
              <div className="text-blue-400 text-xs font-black tracking-widest uppercase mb-2">Popularity Penalty</div>
              <p className="text-gray-400 text-sm leading-relaxed">
                Wikipedia pageviews measure fame. Famous players score <span className="text-white font-bold">lower</span> — EBK rewards the unknown.
              </p>
            </div>
            <div>
              <div className="text-green-400 text-xs font-black tracking-widest uppercase mb-2">Find the Hidden Gems</div>
              <p className="text-gray-400 text-sm leading-relaxed">
                Journeymen, cult heroes, and role players often outrank superstars. Real basketball knowledge wins.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── TEAM MODES ───────────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-4 pb-16">
        <div className="flex items-center gap-3 mb-6">
          <p className="text-[10px] font-black tracking-[0.4em] text-gray-600 uppercase">Team Formats</p>
          <div className="flex-1 h-px bg-white/[0.05]" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { n: '5', label: 'Starter 5', sub: 'PG · SG · SF · PF · C', desc: '~8 min' },
            { n: '8', label: 'Bench 8',   sub: 'Starters + 3 bench',    desc: '~15 min' },
            { n: '12', label: 'Full 12',  sub: 'Starters + 7 bench',    desc: '~25 min' },
          ].map(m => (
            <div key={m.n}
              className="card-surface flex flex-col items-center py-6 px-3 border border-white/[0.05] hover:border-orange-900/40 transition-colors">
              <span className="font-display text-5xl text-orange-500/60 leading-none mb-2">{m.n}</span>
              <span className="font-black text-white text-sm tracking-wide">{m.label}</span>
              <span className="text-gray-600 text-[10px] mt-1 text-center">{m.sub}</span>
              <span className="text-gray-700 text-[9px] mt-2">{m.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── FINAL CTA BANNER ─────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-4 pb-28">
        <div className="card-accent p-8 text-center">
          <p className="font-display text-4xl text-white mb-2">Ready to Prove Your EBK?</p>
          <p className="text-gray-500 text-sm mb-6">No download. No credit card. Jump into a live game in 30 seconds.</p>
          <Link href="/lobby" className="btn-primary text-sm uppercase tracking-widest px-10 py-4">
            Start Playing
          </Link>
        </div>
      </div>

    </div>
  )
}
