'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface GameRecord {
  id: string
  opponentName: string
  result: 'win' | 'loss' | 'draw'
  mySeriesScore: number
  oppSeriesScore: number
  teamMode: string
  series: number
  source: string
  createdAt: string
}

const MODE_LABEL: Record<string, string> = { starter5: 'Starter 5', bench8: 'Bench 8', full12: 'Full 12' }

export default function HistoryPage() {
  const [records, setRecords] = useState<GameRecord[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/games/history')
      .then(r => { if (r.status === 401) { setLoading(false); router.push('/login'); return null } return r.json() })
      .then(d => { if (!d) return; if (d?.records) setRecords(d.records); setLoading(false) })
      .catch(() => setLoading(false))
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] py-10 px-4">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-4xl text-orange-500 leading-none">History</h1>
            <p className="text-gray-500 text-sm mt-1">Your last {records.length} games</p>
          </div>
          <Link href="/lobby" className="text-gray-500 hover:text-white text-sm transition-colors">← Lobby</Link>
        </div>

        {records.length === 0 ? (
          <div className="bg-[#111] border border-white/5 rounded-2xl p-12 text-center">
            <div className="text-4xl mb-3">🏀</div>
            <p className="text-gray-500 font-bold">No games yet</p>
            <p className="text-gray-600 text-sm mt-1">Play online to start tracking your history</p>
            <Link href="/lobby" className="inline-block mt-5 bg-orange-600 hover:bg-orange-700 text-white font-black px-6 py-3 rounded-xl transition-colors">
              Play Now
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {records.map(r => {
              const isWin = r.result === 'win'
              const isDraw = r.result === 'draw'
              const date = new Date(r.createdAt)
              const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

              return (
                <div key={r.id} className={`bg-[#111] border rounded-xl px-4 py-3 flex items-center gap-4 ${
                  isWin ? 'border-green-900/50' : isDraw ? 'border-yellow-900/30' : 'border-white/5'
                }`}>
                  {/* Result pill */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg shrink-0 ${
                    isWin ? 'bg-green-500/20 text-green-400' : isDraw ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/10 text-red-500'
                  }`}>
                    {isWin ? 'W' : isDraw ? 'D' : 'L'}
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-black text-sm truncate">vs {r.opponentName}</span>
                      {r.source === 'online' && (
                        <span className="text-[10px] font-bold text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded">EBK</span>
                      )}
                    </div>
                    <div className="text-gray-500 text-xs mt-0.5">
                      {MODE_LABEL[r.teamMode] || r.teamMode}
                      {r.series > 1 && <span className="text-gray-700 mx-1">·</span>}
                      {r.series > 1 && `Best of ${r.series}`}
                    </div>
                  </div>

                  {/* Score */}
                  {r.series > 1 && (
                    <div className="text-center shrink-0">
                      <div className={`font-black text-lg leading-none ${isWin ? 'text-green-400' : isDraw ? 'text-yellow-400' : 'text-red-500'}`}>
                        {r.mySeriesScore}–{r.oppSeriesScore}
                      </div>
                      <div className="text-gray-600 text-[10px]">series</div>
                    </div>
                  )}

                  {/* Date */}
                  <div className="text-right shrink-0">
                    <div className="text-gray-400 text-xs">{dateStr}</div>
                    <div className="text-gray-600 text-[10px]">{timeStr}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
