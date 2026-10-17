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

const STAT_SHOWCASE = [
  { label: 'Players in pool', value: '3,200+', color: 'text-orange-400' },
  { label: 'Stats categories', value: '4', color: 'text-blue-400' },
  { label: 'Team formats', value: '3', color: 'text-green-400' },
  { label: 'Series lengths', value: 'BO1 · BO3 · BO5', color: 'text-yellow-400' },
]

export default function Home() {
  return (
    <div className="min-h-screen animate-fade-in">

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <div className="relative text-center pt-16 pb-20 px-4 overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute inset-x-0 top-0 h-[500px] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 80% 100% at 50% -15%, rgba(234,88,12,0.22) 0%, rgba(234,88,12,0.04) 50%, transparent 70%)' }} />
        {/* Grid overlay */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

        <div className="relative">
          <div className="inline-flex items-center gap-2 bg-orange-950/40 border border-orange-800/40 rounded-full px-4 py-1.5 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-orange-300 text-[11px] font-black tracking-[0.3em] uppercase">Live · Head-to-Head NBA Draft</span>
          </div>

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

          <p className="text-gray-400 max-w-md mx-auto mb-3 leading-relaxed">
            Draft NBA players and{' '}
            <span className="text-orange-400 font-black">score lower</span> than your opponent.
            The less famous the player, the higher their EBK value.
          </p>
          <p className="text-gray-600 text-xs max-w-xs mx-auto mb-10">
            Career stats · Wikipedia popularity · Real salary data
          </p>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/lobby"
              className="btn-primary text-sm uppercase tracking-widest">
              Play Now
            </Link>
            <Link href="/auction"
              className="flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.07] border border-orange-800/40 hover:border-orange-600/60 text-orange-300 font-black text-sm px-6 py-3.5 rounded-xl transition-all">
              <span>⚡</span>
              <span>War Room</span>
            </Link>
            <Link href="/register"
              className="text-gray-500 hover:text-gray-300 text-sm font-semibold transition-colors">
              Create Account →
            </Link>
          </div>
        </div>
      </div>

      {/* ── STAT BAR ─────────────────────────────────────────────────── */}
      <div className="border-y border-white/[0.05] bg-black/60 py-4 px-4 mb-16">
        <div className="max-w-3xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {STAT_SHOWCASE.map(s => (
            <div key={s.label}>
              <div className={`font-display text-2xl leading-none ${s.color}`}>{s.value}</div>
              <div className="text-gray-600 text-[11px] mt-1 tracking-wide">{s.label}</div>
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
      <div className="max-w-2xl mx-auto px-4 pb-28">
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

    </div>
  )
}
