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
  bench8:   'Bench 8',
  full12:   'Full 12',
}

const RESULT_CONFIG = {
  win: {
    badge:      'result-win',
    leftBorder: 'border-l-2 border-l-green-500/50',
    label:      'W',
    verb:       'Beat',
    nameColor:  'text-green-400',
    scoreColor: 'text-green-400',
    hoverBg:    'hover:bg-green-500/[0.03]',
  },
  loss: {
    badge:      'result-loss',
    leftBorder: 'border-l-2 border-l-red-500/40',
    label:      'L',
    verb:       'Lost to',
    nameColor:  'text-red-400',
    scoreColor: 'text-red-400',
    hoverBg:    'hover:bg-red-500/[0.03]',
  },
  draw: {
    badge:      'result-draw',
    leftBorder: 'border-l-2 border-l-yellow-500/30',
    label:      'D',
    verb:       'Drew with',
    nameColor:  'text-yellow-400',
    scoreColor: 'text-yellow-400',
    hoverBg:    'hover:bg-yellow-500/[0.02]',
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

function QuickStats({ records }: { records: GameRecord[] }) {
  if (!records.length) return null
  const wins   = records.filter(r => r.result === 'win').length
  const losses = records.filter(r => r.result === 'loss').length
  const draws  = records.filter(r => r.result === 'draw').length
  const total  = records.length
  const pct    = total > 0 ? ((wins / total) * 100).toFixed(0) : '0'

  let streak = 0
  let streakResult: 'win' | 'loss' | null = null
  for (const r of records) {
    if (streak === 0) { streakResult = r.result === 'draw' ? null : r.result; streak = 1; continue }
    if (r.result === streakResult) streak++
    else break
  }

  const streakLabel    = streak > 1 ? (streakResult === 'win' ? `W${streak}` : `L${streak}`) : draws > 0 ? draws : '—'
  const streakColor    = streak > 1 ? (streakResult === 'win' ? 'text-orange-400' : 'text-red-400') : 'text-white/40'
  const streakSubLabel = streak > 1 ? (streakResult === 'win' ? 'Win Streak' : 'Loss Streak') : 'Draws'

  return (
    <div className="grid grid-cols-4 gap-2.5 mb-8">
      {[
        { label: 'Wins',         value: wins,          color: 'text-green-400' },
        { label: 'Losses',       value: losses,        color: 'text-red-400' },
        { label: 'Win %',        value: `${pct}%`,     color: 'text-orange-400' },
        { label: streakSubLabel, value: streakLabel,   color: streakColor },
      ].map((s, i) => (
        <div
          key={s.label}
          className="card-surface rounded-xl py-4 text-center animate-fade-up"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div className={`font-display text-3xl leading-none ${s.color}`}>{s.value}</div>
          <div className="text-label mt-1.5">{s.label}</div>
        </div>
      ))}
    </div>
  )
}

export default function HistoryPage() {
  const [records, setRecords] = useState<GameRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
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
        setNextCursor(d?.nextCursor ?? null)
        setHasMore(d?.hasMore ?? false)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [router])

  async function loadMore() {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await fetch(`/api/games/history?cursor=${encodeURIComponent(nextCursor)}`)
      if (!res.ok) return
      const d = await res.json()
      if (d?.records) setRecords(prev => [...prev, ...d.records])
      setNextCursor(d?.nextCursor ?? null)
      setHasMore(d?.hasMore ?? false)
    } catch {
      // silently ignore — user can retry
    } finally {
      setLoadingMore(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen py-10 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="h-10 w-40 rounded-xl skeleton mb-2" />
          <div className="h-3 w-24 rounded skeleton mb-8" />
          <div className="grid grid-cols-4 gap-2.5 mb-8">
            {[0,1,2,3].map(i => <div key={i} className="h-[72px] rounded-xl skeleton" />)}
          </div>
          <div className="space-y-2">
            {[0,1,2,3,4,5].map(i => (
              <div key={i} className="h-[72px] rounded-xl skeleton border-l-2 border-l-white/[0.04]" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen py-10 px-4">
      <div className="max-w-2xl mx-auto">

        {/* ── Header ───────────────────────────────────────────────── */}
        <div className="flex items-end justify-between mb-8 animate-fade-up">
          <div>
            <p className="text-label mb-2">Your Record</p>
            <h1 className="font-display text-5xl md:text-6xl text-white leading-none tracking-wide">
              GAME <span className="text-orange-500">HISTORY</span>
            </h1>
            <p className="text-white/35 text-xs font-bold mt-2">
              <span className="font-display text-orange-400 text-lg">{records.length}</span>
              <span className="ml-1.5">game{records.length !== 1 ? 's' : ''}{hasMore ? ' loaded' : ''}</span>
            </p>
          </div>
          <Link
            href="/lobby"
            className="inline-flex items-center gap-1.5 text-white/40 hover:text-white/80 transition-colors text-sm group shrink-0"
          >
            <svg className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Lobby
          </Link>
        </div>

        {/* ── Empty State ──────────────────────────────────────────── */}
        {records.length === 0 ? (
          <div className="card-accent animate-fade-up-1">
            <div className="empty-state py-16">
              <div className="empty-state-icon text-5xl">🏀</div>
              <p className="empty-state-title text-base">No games yet</p>
              <p className="empty-state-body mt-1">Play online to start building your record</p>
              <Link href="/lobby" className="btn-primary mt-6 text-sm">
                Play Now
              </Link>
            </div>
          </div>
        ) : (
          <>
            <QuickStats records={records} />

            {/* ── Game Rows ────────────────────────────────────────── */}
            <div className="space-y-2">
              {records.map((r, idx) => {
                const cfg       = RESULT_CONFIG[r.result]
                const ago       = timeAgo(r.createdAt)
                const modeLabel = MODE_LABEL[r.teamMode] || r.teamMode

                return (
                  <div
                    key={r.id}
                    className={`card-surface rounded-xl px-4 py-3.5 flex items-center gap-3 ${cfg.leftBorder} ${cfg.hoverBg} transition-colors animate-fade-up`}
                    style={{ animationDelay: `${Math.min(idx * 30, 300)}ms`, animationFillMode: 'both' }}
                  >
                    {/* W / L / D badge */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-display text-2xl shrink-0 ${cfg.badge}`}>
                      {cfg.label}
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white/50 text-sm font-bold">{cfg.verb}</span>
                        <span className={`font-black text-sm ${cfg.nameColor}`}>{r.opponentName}</span>
                        {r.source === 'online' && (
                          <span className="text-[9px] font-black text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">
                            Online
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-white/30 text-xs">{modeLabel}</span>
                        {r.series > 1 && (
                          <>
                            <span className="text-white/15 text-xs">·</span>
                            <span className="text-white/30 text-xs">Bo{r.series}</span>
                          </>
                        )}
                        {r.statCategory && (
                          <>
                            <span className="text-white/15 text-xs">·</span>
                            <span className="text-white/30 text-xs">{r.statCategory}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Score + timestamp */}
                    <div className="text-right shrink-0">
                      {r.series > 1 ? (
                        <>
                          <div className={`font-display text-2xl leading-none tabular-nums ${cfg.scoreColor}`}>
                            {r.mySeriesScore}–{r.oppSeriesScore}
                          </div>
                          <div className="text-label mt-1">Series</div>
                        </>
                      ) : (r.myScore !== undefined && r.myScore !== null) ? (
                        <>
                          <div className="leading-none tabular-nums">
                            <span className={`font-display text-xl ${cfg.scoreColor}`}>{r.myScore?.toFixed(1)}</span>
                            <span className="text-white/20 font-display text-lg mx-1">vs</span>
                            <span className="font-display text-xl text-white/30">{r.oppScore?.toFixed(1)}</span>
                          </div>
                          <div className="text-label mt-1">EBK Score</div>
                        </>
                      ) : null}
                      <div className="text-white/25 text-[10px] font-bold mt-1.5 tabular-nums">{ago}</div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* ── Footer ───────────────────────────────────────────── */}
            <div className="mt-8 space-y-3">
              {hasMore && (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="btn-secondary w-full disabled:opacity-50"
                >
                  {loadingMore ? (
                    <span className="flex items-center gap-2 justify-center">
                      <span className="w-3 h-3 border border-white/40 border-t-white/80 rounded-full animate-spin" />
                      Loading…
                    </span>
                  ) : 'Load More Games'}
                </button>
              )}
              <Link
                href="/profile"
                className="block text-center text-white/35 text-sm hover:text-orange-400 transition-colors font-bold"
              >
                View full stats on profile →
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
