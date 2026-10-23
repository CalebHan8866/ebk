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
    badge:         'result-win',
    leftBorder:    'border-l-[3px] border-l-green-500/70',
    label:         'W',
    verb:          'Beat',
    nameColor:     'text-white',
    scoreColor:    'text-green-400',
    accentBg:      'bg-green-500/[0.04]',
    hoverBg:       'hover:bg-green-500/[0.05]',
    resultText:    'text-green-400',
    badgeBg:       'bg-green-500/15 border border-green-500/30 text-green-400',
  },
  loss: {
    badge:         'result-loss',
    leftBorder:    'border-l-[3px] border-l-red-500/60',
    label:         'L',
    verb:          'Lost to',
    nameColor:     'text-white',
    scoreColor:    'text-red-400',
    accentBg:      'bg-red-500/[0.03]',
    hoverBg:       'hover:bg-red-500/[0.04]',
    resultText:    'text-red-400',
    badgeBg:       'bg-red-500/10 border border-red-500/25 text-red-400',
  },
  draw: {
    badge:         'result-draw',
    leftBorder:    'border-l-[3px] border-l-yellow-500/50',
    label:         'D',
    verb:          'Drew with',
    nameColor:     'text-white',
    scoreColor:    'text-yellow-400',
    accentBg:      'bg-yellow-500/[0.02]',
    hoverBg:       'hover:bg-yellow-500/[0.03]',
    resultText:    'text-yellow-400',
    badgeBg:       'bg-yellow-500/10 border border-yellow-500/25 text-yellow-400',
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

function WinRateBar({ wins, losses, draws }: { wins: number; losses: number; draws: number }) {
  const total = wins + losses + draws
  if (total === 0) return null
  const winPct  = (wins  / total) * 100
  const drawPct = (draws / total) * 100
  return (
    <div className="h-1.5 rounded-full overflow-hidden flex bg-white/[0.05] mb-5">
      <div className="h-full bg-green-500/70 rounded-l-full transition-all duration-700" style={{ width: `${winPct}%` }} />
      <div className="h-full bg-yellow-500/50 transition-all duration-700"               style={{ width: `${drawPct}%` }} />
      <div className="h-full bg-red-500/50 rounded-r-full transition-all duration-700"   style={{ width: `${100 - winPct - drawPct}%` }} />
    </div>
  )
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
    <div className="mb-7 animate-fade-up-1">
      <WinRateBar wins={wins} losses={losses} draws={draws} />
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2.5">
        {[
          { label: 'Wins',         value: wins,          color: 'text-green-400',  bg: 'bg-green-950/30 border-green-800/25' },
          { label: 'Losses',       value: losses,        color: 'text-red-400',    bg: 'bg-red-950/20 border-red-900/20' },
          { label: 'Win %',        value: `${pct}%`,     color: 'text-orange-400', bg: 'bg-orange-950/20 border-orange-900/20' },
          { label: streakSubLabel, value: streakLabel,   color: streakColor,       bg: 'bg-white/[0.025] border-white/[0.06]' },
        ].map((s) => (
          <div
            key={s.label}
            className={`rounded-xl py-3 sm:py-4 text-center border ${s.bg}`}
          >
            <div className={`font-display text-2xl sm:text-3xl leading-none tabular-nums ${s.color}`}>{s.value}</div>
            <div className="text-label mt-1 text-[9px] sm:text-[10px]">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* Inline score vs display — my score on top, opp below */
function ScoreVs({
  myScore,
  oppScore,
  scoreColor,
}: {
  myScore: number
  oppScore: number
  scoreColor: string
}) {
  const diff = myScore - oppScore
  const diffStr = diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)
  return (
    <div className="text-right">
      <div className="leading-none tabular-nums flex items-baseline gap-1 justify-end">
        <span className={`font-display text-2xl ${scoreColor}`}>{myScore.toFixed(1)}</span>
        <span className="text-white/15 font-display text-base">–</span>
        <span className="font-display text-2xl text-white/25">{oppScore.toFixed(1)}</span>
      </div>
      <div className="text-label mt-0.5">EBK Score</div>
      <div className={`text-[10px] font-black mt-0.5 tabular-nums ${diff > 0 ? 'text-green-500/60' : 'text-red-500/60'}`}>
        {diffStr}
      </div>
    </div>
  )
}

export default function HistoryPage() {
  const [records, setRecords] = useState<GameRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  // Track the index at which newly-loaded items start — used to trigger enter animation
  const [newItemsStart, setNewItemsStart] = useState<number | null>(null)
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
      if (d?.records) {
        setRecords(prev => {
          setNewItemsStart(prev.length)
          return [...prev, ...d.records]
        })
      }
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
          <div className="h-1.5 rounded-full skeleton mb-5" />
          <div className="grid grid-cols-4 gap-2.5 mb-7">
            {[0,1,2,3].map(i => <div key={i} className="h-[72px] rounded-xl skeleton" />)}
          </div>
          <div className="space-y-2">
            {([
              'border-l-green-500/30',
              'border-l-red-500/25',
              'border-l-green-500/30',
              'border-l-red-500/25',
              'border-l-yellow-500/20',
              'border-l-green-500/30',
            ] as const).map((cls, i) => (
              <div key={i} className={`h-[76px] rounded-xl skeleton border-l-[3px] ${cls}`} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen py-10 px-4 animate-fade-in">
      <div className="max-w-2xl mx-auto">

        {/* ── Header ───────────────────────────────────────────────── */}
        <div className="flex items-end justify-between mb-7 animate-fade-up">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-500/70 mb-2">Your Record</p>
            <h1 className="font-display text-5xl sm:text-6xl text-white leading-none tracking-wide">
              GAME <span className="text-orange-500">HISTORY</span>
            </h1>
            <p className="mt-2 flex items-baseline gap-1.5">
              <span className="font-display text-2xl text-orange-400 leading-none tabular-nums">{records.length}</span>
              <span className="text-white/40 text-xs font-bold uppercase tracking-[0.1em]">game{records.length !== 1 ? 's' : ''}{hasMore ? ' loaded' : ''}</span>
            </p>
          </div>
          <Link
            href="/lobby"
            className="inline-flex items-center gap-1.5 text-white/60 hover:text-white/80 transition-colors text-sm group shrink-0"
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
              <div className="empty-state-icon">🏀</div>
              <p className="empty-state-title">Your legend starts here</p>
              <p className="empty-state-body mt-1">Every great player has a first game. Head to the lobby and start building your record.</p>
              <Link href="/lobby" className="btn-primary mt-6 text-sm px-8">
                Play Your First Game
              </Link>
            </div>
          </div>
        ) : (
          <>
            <QuickStats records={records} />

            {/* ── Game Timeline ─────────────────────────────────────── */}
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1 bg-white/[0.05]" />
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/30">Recent Games</span>
              <div className="h-px flex-1 bg-white/[0.05]" />
            </div>
            <div className="space-y-2">
              {records.map((r, idx) => {
                const cfg       = RESULT_CONFIG[r.result]
                const ago       = timeAgo(r.createdAt)
                const modeLabel = MODE_LABEL[r.teamMode] || r.teamMode
                const hasSeriesScore = r.series > 1
                const hasEbkScore    = !hasSeriesScore && r.myScore !== undefined && r.myScore !== null

                return (
                  <div
                    key={r.id}
                    className={`rounded-xl px-4 py-3.5 flex items-center gap-3 ${cfg.accentBg} ${cfg.leftBorder} ${cfg.hoverBg} border border-white/[0.06] transition-all animate-fade-up group`}
                    style={{
                      animationDelay: newItemsStart !== null && idx >= newItemsStart
                        ? `${(idx - newItemsStart) * 40}ms`
                        : `${Math.min(idx * 30, 300)}ms`,
                      animationFillMode: 'both',
                    }}
                  >
                    {/* W / L / D badge */}
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-display text-xl shrink-0 ${cfg.badge} transition-transform group-hover:scale-110`}>
                      {cfg.label}
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      {/* Opponent line */}
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <span className="text-white/40 text-[11px] font-bold shrink-0">{cfg.verb}</span>
                        <span className="font-black text-sm text-white truncate">{r.opponentName}</span>
                        {r.source === 'online' && (
                          <span className="text-[9px] font-black text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">
                            Online
                          </span>
                        )}
                      </div>

                      {/* Meta: mode · series · stat */}
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-white/30 text-[11px] font-semibold">{modeLabel}</span>
                        {r.series > 1 && (
                          <>
                            <span className="text-white/15 text-xs">·</span>
                            <span className="text-white/30 text-[11px]">Bo{r.series}</span>
                          </>
                        )}
                        {r.statCategory && (
                          <>
                            <span className="text-white/15 text-xs">·</span>
                            <span className="text-orange-500/50 text-[11px] font-semibold">{r.statCategory}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Score + timestamp */}
                    <div className="shrink-0 text-right">
                      {hasSeriesScore ? (
                        <div>
                          {/* Series score — me vs opp */}
                          <div className="flex items-baseline gap-1 justify-end">
                            <span className={`font-display text-2xl leading-none tabular-nums ${cfg.scoreColor}`}>
                              {r.mySeriesScore}
                            </span>
                            <span className="text-white/20 font-display text-lg leading-none">–</span>
                            <span className="font-display text-2xl leading-none tabular-nums text-white/25">
                              {r.oppSeriesScore}
                            </span>
                          </div>
                          <div className="text-label mt-0.5">Series</div>
                        </div>
                      ) : hasEbkScore ? (
                        <ScoreVs
                          myScore={r.myScore!}
                          oppScore={r.oppScore ?? 0}
                          scoreColor={cfg.scoreColor}
                        />
                      ) : null}
                      <div className="text-white/25 text-[10px] font-bold mt-1.5 tabular-nums tracking-wide">{ago}</div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* ── Footer ───────────────────────────────────────────── */}
            <div className="mt-8 space-y-3">
              {hasMore ? (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full flex items-center justify-center gap-2.5 rounded-xl px-5 py-4 font-black text-sm tracking-wide uppercase transition-all duration-200 border bg-orange-950/20 border-orange-700/30 text-orange-300 hover:bg-orange-950/40 hover:border-orange-600/50 hover:text-orange-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none shadow-[0_0_20px_rgba(234,88,12,0.06)] hover:shadow-[0_0_28px_rgba(234,88,12,0.12)]"
                >
                  {loadingMore ? (
                    <>
                      <span className="w-4 h-4 border-2 border-orange-500/40 border-t-orange-400 rounded-full animate-spin shrink-0" />
                      Loading games…
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                      Load More Games
                    </>
                  )}
                </button>
              ) : (
                records.length > 0 && (
                  <div className="flex items-center gap-3 py-2 animate-fade-up">
                    <div className="h-px flex-1 bg-white/[0.05]" />
                    <div className="flex items-center gap-2 text-white/25 text-[11px] font-bold uppercase tracking-[0.18em]">
                      <svg className="w-3 h-3 text-orange-500/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      You&apos;ve reached the end
                    </div>
                    <div className="h-px flex-1 bg-white/[0.05]" />
                  </div>
                )
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
