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
  statCategory?: string
  myScore?: number
  oppScore?: number
  createdAt: string
}

const MODE_LABEL: Record<string, string> = {
  starter5: 'Starter 5',
  bench8: 'Bench 8',
  full12: 'Full 12',
}

const RESULT_CONFIG = {
  win: {
    pill: 'bg-green-500/20 border border-green-500/40 text-green-400',
    row: 'border-l-2 border-l-green-500/50',
    label: 'W',
    textColor: 'text-green-400',
  },
  loss: {
    pill: 'bg-red-500/15 border border-red-500/30 text-red-400',
    row: 'border-l-2 border-l-red-500/40',
    label: 'L',
    textColor: 'text-red-400',
  },
  draw: {
    pill: 'bg-gray-500/15 border border-gray-500/30 text-gray-400',
    row: 'border-l-2 border-l-gray-500/30',
    label: 'D',
    textColor: 'text-gray-400',
  },
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  const hrs  = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hrs < 24) return `${hrs}h ago`
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Quick stats summary ────────────────────────────────────────────────────────
function QuickStats({ records }: { records: GameRecord[] }) {
  if (!records.length) return null
  const wins   = records.filter(r => r.result === 'win').length
  const losses = records.filter(r => r.result === 'loss').length
  const draws  = records.filter(r => r.result === 'draw').length
  const total  = records.length
  const pct    = total > 0 ? ((wins / total) * 100).toFixed(0) : '0'

  // Streak from most recent
  let streak = 0
  let streakResult: 'win' | 'loss' | null = null
  for (const r of records) {
    if (streak === 0) { streakResult = r.result === 'draw' ? null : r.result; streak = 1; continue }
    if (r.result === streakResult) streak++
    else break
  }

  return (
    <div className="grid grid-cols-4 gap-2 mb-6">
      {[
        { label: 'Wins', value: wins, color: 'text-green-400' },
        { label: 'Losses', value: losses, color: 'text-red-400' },
        { label: 'Win%', value: `${pct}%`, color: 'text-orange-400' },
        {
          label: streak > 1 ? (streakResult === 'win' ? '🔥 W Streak' : '📉 L Streak') : 'Streak',
          value: streak > 1 ? streak : draws,
          color: streak > 1 ? (streakResult === 'win' ? 'text-orange-400' : 'text-red-400') : 'text-gray-400',
        },
      ].map(s => (
        <div key={s.label} className="card-surface rounded-xl py-3 text-center border border-white/[0.05]">
          <div className={`font-display text-2xl leading-none ${s.color}`}>{s.value}</div>
          <div className="text-label mt-1 text-[10px]">{s.label}</div>
        </div>
      ))}
    </div>
  )
}

export default function HistoryPage() {
  const [records, setRecords] = useState<GameRecord[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/games/history')
      .then(r => {
        if (r.status === 401) { setLoading(false); router.push('/login'); return null }
        return r.json()
      })
      .then(d => {
        if (!d) return
        if (d?.records) setRecords(d.records)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen py-10 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="h-10 w-36 rounded-xl bg-white/[0.07] animate-pulse mb-2" />
          <div className="h-3 w-24 rounded bg-white/[0.04] animate-pulse mb-6" />
          <div className="grid grid-cols-4 gap-2 mb-6">
            {[0,1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-white/[0.04] animate-pulse" />)}
          </div>
          <div className="space-y-2">
            {[0,1,2,3,4].map(i => (
              <div key={i} className="h-16 rounded-xl bg-white/[0.04] animate-pulse border-l-2 border-l-white/[0.04]" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen py-10 px-4 animate-fade-in">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-4xl text-orange-500 leading-none tracking-wide">History</h1>
            <p className="text-gray-500 text-sm mt-1">Your last {records.length} game{records.length !== 1 ? 's' : ''}</p>
          </div>
          <Link href="/lobby" className="text-gray-500 hover:text-white text-sm transition-colors">← Lobby</Link>
        </div>

        {records.length === 0 ? (
          <div className="card-surface rounded-2xl p-12 text-center">
            <div className="text-4xl mb-3">🏀</div>
            <p className="text-gray-500 font-bold">No games yet</p>
            <p className="text-gray-600 text-sm mt-1">Play online to start tracking your history</p>
            <Link href="/lobby" className="inline-block mt-5 bg-orange-600 hover:bg-orange-700 text-white font-black px-6 py-3 rounded-xl transition-colors">
              Play Now
            </Link>
          </div>
        ) : (
          <>
            <QuickStats records={records} />

            <div className="space-y-1.5">
              {records.map((r, idx) => {
                const cfg = RESULT_CONFIG[r.result]
                const ago = timeAgo(r.createdAt)
                const date = new Date(r.createdAt)
                const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

                return (
                  <div
                    key={r.id}
                    className={`card-surface rounded-xl px-4 py-3 flex items-center gap-3 ${cfg.row} animate-slide-up`}
                    style={{ animationDelay: `${Math.min(idx * 25, 250)}ms`, animationFillMode: 'both' }}
                  >
                    {/* Result pill */}
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-display text-xl shrink-0 ${cfg.pill}`}>
                      {cfg.label}
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-black text-sm">
                          {r.result === 'win' ? 'Beat' : r.result === 'loss' ? 'Lost to' : 'Drew with'}{' '}
                          <span className={cfg.textColor}>{r.opponentName}</span>
                        </span>
                        {r.source === 'online' && (
                          <span className="text-[9px] font-black text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 px-1.5 py-0.5 rounded uppercase tracking-wider">Online</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-gray-500 text-xs">
                        <span>{MODE_LABEL[r.teamMode] || r.teamMode}</span>
                        {r.series > 1 && <><span className="text-gray-700">·</span><span>Bo{r.series}</span></>}
                        {r.statCategory && <><span className="text-gray-700">·</span><span className="text-gray-400">{r.statCategory}</span></>}
                      </div>
                    </div>

                    {/* Score block */}
                    <div className="text-right shrink-0">
                      {r.series > 1 ? (
                        <>
                          <div className={`font-black text-base leading-none tabular-nums ${cfg.textColor}`}>
                            {r.mySeriesScore}–{r.oppSeriesScore}
                          </div>
                          <div className="text-gray-600 text-[10px] mt-0.5">series</div>
                        </>
                      ) : (r.myScore !== undefined && r.myScore !== null) ? (
                        <>
                          <div className="font-black text-sm leading-none tabular-nums text-white">
                            <span className={cfg.textColor}>{r.myScore?.toFixed(1)}</span>
                            <span className="text-gray-600 mx-1">vs</span>
                            <span className="text-gray-400">{r.oppScore?.toFixed(1)}</span>
                          </div>
                          <div className="text-gray-600 text-[10px] mt-0.5">EBK score</div>
                        </>
                      ) : null}
                      <div className="text-gray-600 text-[10px] mt-0.5 tabular-nums">{ago}</div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Footer link */}
            <div className="mt-8 text-center">
              <Link href="/profile" className="text-gray-600 text-sm hover:text-orange-400 transition-colors">
                View full stats on profile →
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
