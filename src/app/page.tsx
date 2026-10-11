import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <div className="text-center py-24 px-4">
        <p className="text-xs font-bold tracking-[0.4em] text-orange-500/70 uppercase mb-4">
          NBA Draft Battle
        </p>
        <h1 className="font-display text-[9rem] md:text-[12rem] leading-none mb-2 select-none">
          <span className="text-orange-500">EBK</span>
        </h1>
        <p className="text-lg font-semibold text-gray-400 tracking-wide mb-2">
          Elite Ball Knowledge
        </p>
        <p className="text-gray-600 max-w-md mx-auto mb-10 text-sm leading-relaxed">
          Live head-to-head NBA draft battles. Draft a team.
          Score <span className="text-orange-400 font-bold">LOWER</span> than your opponent. Win.
        </p>
        <Link
          href="/lobby"
          className="inline-block bg-orange-600 hover:bg-orange-500 text-white text-base font-black px-10 py-4 rounded-xl transition-all hover:scale-105 tracking-widest uppercase"
        >
          Play Now
        </Link>
      </div>

      {/* Feature cards */}
      <div className="max-w-4xl mx-auto px-4 pb-20 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { tag: '01', title: 'Create or Join', desc: 'Create a room or enter a code to challenge a friend live' },
          { tag: '02', title: 'Draft Smart', desc: 'Pick 1 per position. Lower career stats = better picks' },
          { tag: '03', title: 'Win the Series', desc: 'Play 1 game, Best of 3, or Best of 5 across all stat categories' },
        ].map(s => (
          <div key={s.title} className="bg-[#101010] border border-white/5 rounded-xl p-6">
            <div className="text-orange-600/50 text-xs font-bold tracking-widest mb-3 font-display">{s.tag}</div>
            <h3 className="font-black text-white text-base mb-2 tracking-wide">{s.title}</h3>
            <p className="text-gray-500 text-sm leading-relaxed">{s.desc}</p>
          </div>
        ))}
      </div>

      {/* Team Modes */}
      <div className="max-w-3xl mx-auto px-4 pb-24">
        <h2 className="text-center text-xs font-bold text-gray-600 tracking-[0.3em] uppercase mb-6">
          Team Modes
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { title: 'Starter 5', desc: 'PG · SG · SF · PF · C', count: '5' },
            { title: 'Bench 8', desc: 'Starting 5 + 3 bench', count: '8' },
            { title: 'Full Roster', desc: 'Starting 5 + 7 bench', count: '12' },
          ].map(m => (
            <div key={m.title} className="bg-[#101010] border border-white/5 rounded-xl p-5 flex items-center gap-4">
              <span className="font-display text-3xl text-orange-500/60 leading-none">{m.count}</span>
              <div>
                <div className="font-black text-white text-sm">{m.title}</div>
                <div className="text-gray-500 text-xs mt-0.5">{m.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
