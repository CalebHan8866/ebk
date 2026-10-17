import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen">

      {/* Hero */}
      <div className="relative text-center pt-20 pb-24 px-4 overflow-hidden">
        {/* Ambient glow blob */}
        <div className="absolute inset-x-0 top-0 h-96 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 70% 80% at 50% -10%, rgba(234,88,12,0.18) 0%, transparent 70%)' }} />

        <p className="relative text-[10px] font-black tracking-[0.5em] text-orange-500/60 uppercase mb-6">
          Head-to-Head NBA Draft Battle
        </p>

        <h1 className="relative font-display leading-none select-none mb-0"
          style={{ fontSize: 'clamp(7rem, 22vw, 17rem)' }}>
          <span
            className="text-white"
            style={{ textShadow: '0 0 120px rgba(249,115,22,0.45), 0 0 40px rgba(249,115,22,0.2)' }}>
            EBK
          </span>
        </h1>

        <p className="relative text-[11px] font-bold tracking-[0.4em] text-gray-500 uppercase mb-4 -mt-1">
          Elite Ball Knowledge
        </p>

        <p className="relative text-gray-400 max-w-sm mx-auto mb-10 text-sm leading-relaxed">
          Draft NBA players. Score{' '}
          <span className="text-orange-400 font-black">lower</span> than your opponent.{' '}
          <span className="text-white font-semibold">Win.</span>
        </p>

        <div className="relative flex items-center justify-center gap-4">
          <Link href="/lobby" className="btn-primary text-sm uppercase">
            Play Now
          </Link>
          <Link href="/register" className="text-gray-400 hover:text-white text-sm font-semibold transition-colors">
            Create Account →
          </Link>
        </div>
      </div>

      {/* How it works */}
      <div className="max-w-4xl mx-auto px-4 pb-16">
        <p className="text-center text-[10px] font-black tracking-[0.4em] text-gray-600 uppercase mb-8">
          How It Works
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              num: '01',
              title: 'Challenge a Friend',
              desc: 'Create a room or enter a code to start a live head-to-head draft',
            },
            {
              num: '02',
              title: 'Draft Smart',
              desc: 'Snake draft — one player per position. Lower career stats beats higher ones',
            },
            {
              num: '03',
              title: 'Win the Series',
              desc: 'Play 1 game, Best of 3, or Best of 5 across PPG, RPG, APG, and GP',
            },
          ].map(step => (
            <div key={step.num} className="card-accent p-6 group">
              <div className="font-display text-orange-500/40 text-3xl leading-none mb-4 group-hover:text-orange-500/60 transition-colors">
                {step.num}
              </div>
              <h3 className="font-black text-white text-sm mb-2 tracking-wide">{step.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Team Modes */}
      <div className="max-w-2xl mx-auto px-4 pb-28">
        <p className="text-center text-[10px] font-black tracking-[0.4em] text-gray-600 uppercase mb-8">
          Team Modes
        </p>
        <div className="card-surface p-1.5 grid grid-cols-3 gap-1.5">
          {[
            { label: 'Starter 5', sub: 'PG · SG · SF · PF · C', n: '5' },
            { label: 'Bench 8',   sub: 'Starters + 3 bench',    n: '8' },
            { label: 'Full 12',   sub: 'Starters + 7 bench',    n: '12' },
          ].map(m => (
            <div key={m.label}
              className="flex flex-col items-center py-5 rounded-xl bg-[#0a0a0a] border border-white/[0.05]">
              <span className="font-display text-4xl text-orange-500/70 leading-none mb-1">{m.n}</span>
              <span className="font-black text-white text-xs tracking-wide">{m.label}</span>
              <span className="text-gray-600 text-[10px] mt-0.5">{m.sub}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
