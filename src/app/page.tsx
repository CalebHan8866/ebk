import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <div className="text-center py-24 px-4">
        <div className="text-7xl mb-6">🏀</div>
        <h1 className="text-6xl md:text-8xl font-black mb-3">
          <span className="text-orange-500">EBK</span>
        </h1>
        <p className="text-2xl font-bold text-gray-300 mb-3">Elite Ball Knowledge</p>
        <p className="text-gray-500 max-w-lg mx-auto mb-10 text-lg">
          Live head-to-head NBA draft battles. Draft a team. Score <span className="text-orange-400 font-bold">LOWER</span> than your opponent. Win.
        </p>
        <Link href="/lobby" className="bg-orange-600 hover:bg-orange-700 text-white text-xl font-black px-10 py-5 rounded-2xl transition-all hover:scale-105 inline-block">
          Play Now
        </Link>
      </div>

      <div className="max-w-4xl mx-auto px-4 pb-20 grid grid-cols-1 sm:grid-cols-3 gap-6">
        {[
          { icon: '🏟️', title: 'Create or Join', desc: 'Create a room or enter a code to challenge a friend live' },
          { icon: '🧠', title: 'Draft Smart', desc: 'Pick 1 per position. Lower career stats = better picks' },
          { icon: '🏆', title: 'Win the Series', desc: 'Play 1 game, Best of 3, or Best of 5 across all stat categories' },
        ].map(s => (
          <div key={s.title} className="bg-[#111827] rounded-2xl p-6 text-center">
            <div className="text-4xl mb-3">{s.icon}</div>
            <h3 className="font-black text-white text-lg mb-2">{s.title}</h3>
            <p className="text-gray-400 text-sm">{s.desc}</p>
          </div>
        ))}
      </div>

      <div className="max-w-3xl mx-auto px-4 pb-20">
        <h2 className="text-center text-xl font-bold text-gray-300 mb-6">Team Modes</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { title: 'Starter 5', desc: 'PG · SG · SF · PF · C', icon: '5️⃣' },
            { title: 'Bench 8', desc: 'Starting 5 + 3 bench', icon: '8️⃣' },
            { title: 'Full Roster', desc: 'Starting 5 + 7 bench (12 total)', icon: '🔢' },
          ].map(m => (
            <div key={m.title} className="bg-[#111827] rounded-xl p-5 text-center">
              <div className="text-3xl mb-2">{m.icon}</div>
              <div className="font-black text-white">{m.title}</div>
              <div className="text-gray-400 text-sm mt-1">{m.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
