'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { BADGES } from '@/lib/accessories'

interface LeaderboardUser {
  id: string
  username: string
  wins: number
  losses: number
  draws: number
  gamesPlayed: number
  winStreak: number
  maxWinStreak: number
  equippedBadges: string
}

interface MeRow extends LeaderboardUser {
  rank: number
}

type SortKey = 'wins' | 'winPct' | 'winStreak'

const REFRESH_MS = 30_000

// ── Skeleton loading row ──────────────────────────────────────────────────────
function SkeletonRow({ wide }: { wide?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border border-white/[0.06] rounded-xl bg-white/[0.02] animate-pulse">
      <div className="w-8 h-5 rounded bg-white/10 shrink-0" />
      <div className="w-8 h-8 rounded-full bg-white/10 shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className={`h-3.5 rounded bg-white/10 ${wide ? 'w-32' : 'w-24'}`} />
        <div className="h-2.5 w-12 rounded bg-white/[0.07]" />
      </div>
      {/* stat columns */}
      <div className="w-10 h-4 rounded bg-white/10 shrink-0" />
      <div className="w-10 h-4 rounded bg-white/10 shrink-0" />
      <div className="w-12 h-4 rounded bg-white/10 shrink-0" />
    </div>
  )
}

function SkeletonScreen() {
  return (
    <div className="min-h-screen py-10 px-4">
      <div className="max-w-2xl mx-auto">
        {/* header skeleton */}
        <div className="flex items-center justify-between mb-6">
          <div className="space-y-2">
            <div className="h-9 w-48 rounded bg-white/10 animate-pulse" />
            <div className="h-3 w-28 rounded bg-white/[0.07] animate-pulse" />
          </div>
          <div className="h-4 w-16 rounded bg-white/[0.07] animate-pulse" />
        </div>
        {/* sort tabs skeleton */}
        <div className="flex gap-2 mb-5">
          {[80, 64, 88].map(w => (
            <div key={w} className={`h-9 w-[${w}px] rounded-xl bg-white/[0.06] animate-pulse`} />
          ))}
        </div>
        {/* column headers */}
        <div className="h-6 w-full rounded bg-white/[0.04] animate-pulse mb-1" />
        {/* rows */}
        <div className="space-y-1.5">
          {[true, false, false, false, false, false, false].map((w, i) => (
            <SkeletonRow key={i} wide={w} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Badge icons with tooltip ──────────────────────────────────────────────────
function BadgeIcons({ equippedBadges }: { equippedBadges: string }) {
  let ids: string[] = []
  try { ids = JSON.parse(equippedBadges) } catch { ids = [] }
  if (!Array.isArray(ids)) ids = []
  const badges = ids.map(id => BADGES.find(b => b.id === id)).filter(Boolean) as typeof BADGES
  if (!badges.length) return null
  return (
    <div className="flex gap-1 mt-0.5">
      {badges.map(b => (
        <div key={b.id} className="relative group">
          <img src={b.icon} alt={b.name} className="w-3.5 h-3.5" />
          <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-max max-w-[140px] rounded-lg bg-gray-900 border border-gray-700 px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-50">
            <div className="text-white text-[11px] font-black">{b.name}</div>
            <div className="text-gray-400 text-[10px] leading-snug">{b.description}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Rank display — number or medal ────────────────────────────────────────────
const TOP3_COLORS = ['text-yellow-400', 'text-slate-300', 'text-orange-400'] as const
const TOP3_BG     = [
  'bg-yellow-950/25 border-yellow-700/35',
  'bg-slate-900/50  border-slate-600/35',
  'bg-orange-950/20 border-orange-800/35',
] as const

function RankCell({ rank, isTop3 }: { rank: number; isTop3: boolean }) {
  if (rank === 1) return (
    <div className="w-9 text-center shrink-0">
      <span className="font-display text-2xl text-yellow-400 leading-none drop-shadow-[0_0_6px_rgba(250,204,21,0.5)]">1</span>
    </div>
  )
  if (rank === 2) return (
    <div className="w-9 text-center shrink-0">
      <span className="font-display text-xl text-slate-300 leading-none">2</span>
    </div>
  )
  if (rank === 3) return (
    <div className="w-9 text-center shrink-0">
      <span className="font-display text-xl text-orange-400 leading-none">3</span>
    </div>
  )
  return (
    <div className="w-9 text-center shrink-0">
      <span className="font-black text-sm tabular-nums text-gray-500">{rank}</span>
    </div>
  )
}

// ── Win-loss record ───────────────────────────────────────────────────────────
function WinPctBadge({ pct, gamesPlayed }: { pct: string; gamesPlayed: number }) {
  const n = parseFloat(pct)
  const color = gamesPlayed < 5
    ? 'text-gray-600'
    : n >= 60
      ? 'text-green-400'
      : n >= 45
        ? 'text-white'
        : 'text-red-400'
  return <span className={`tabular-nums font-black text-xs ${color}`}>{gamesPlayed >= 5 ? `${pct}%` : '—'}</span>
}

// ── Column header row ─────────────────────────────────────────────────────────
function ColumnHeaders({ sort }: { sort: SortKey }) {
  return (
    <div className="flex items-center gap-3 px-4 pb-1.5 pt-0.5">
      {/* rank col */}
      <div className="w-9 shrink-0" />
      {/* avatar col */}
      <div className="w-8 shrink-0" />
      {/* player col */}
      <div className="flex-1 min-w-0 text-label">Player</div>
      {/* stat columns — always visible, sorted col highlighted */}
      <div className={`w-10 text-right text-label shrink-0 ${sort === 'wins' ? 'text-orange-500' : ''}`}>W</div>
      <div className="w-10 text-right text-label shrink-0">L</div>
      <div className={`w-14 text-right text-label shrink-0 ${sort === 'winPct' ? 'text-orange-500' : ''}`}>WIN%</div>
      <div className={`w-12 text-right text-label shrink-0 ${sort === 'winStreak' ? 'text-orange-500' : ''}`}>STK</div>
    </div>
  )
}

// ── Leaderboard row ───────────────────────────────────────────────────────────
interface RowProps {
  user: LeaderboardUser
  rank: number
  isMe: boolean
  sort: SortKey
  rowRef?: React.RefObject<HTMLDivElement>
}

function LeaderboardRow({ user: u, rank, isMe, sort, rowRef }: RowProps) {
  const isTop3 = rank <= 3
  const winPct = u.gamesPlayed > 0 ? ((u.wins / u.gamesPlayed) * 100).toFixed(1) : '0.0'

  const rowClass = [
    'table-row gap-3 rounded-xl border min-h-[44px]',
    isMe
      ? 'bg-orange-950/30 border-orange-600/50 ring-1 ring-orange-600/30'
      : isTop3
        ? TOP3_BG[rank - 1]
        : 'border-white/[0.06]',
  ].join(' ')

  return (
    <div ref={rowRef} className={rowClass}>
      {/* Rank */}
      <RankCell rank={rank} isTop3={isTop3} />

      {/* Avatar */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-white text-xs shrink-0 ${isMe ? 'bg-orange-500' : isTop3 ? 'bg-orange-700/80' : 'bg-orange-900/60'}`}>
        {u.username[0].toUpperCase()}
      </div>

      {/* Player name + badges */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`font-black text-sm truncate ${isMe ? 'text-orange-300' : isTop3 ? TOP3_COLORS[rank - 1] : 'text-white'}`}>
            {u.username}
          </span>
          {isMe && (
            <span className="shrink-0 text-[9px] font-black text-orange-500 bg-orange-950 border border-orange-700/50 rounded px-1.5 py-[2px] leading-none tracking-wider uppercase">
              YOU
            </span>
          )}
        </div>
        <BadgeIcons equippedBadges={u.equippedBadges} />
      </div>

      {/* W — always visible, highlighted when sorting by wins */}
      <div className="w-10 text-right shrink-0">
        <span className={`tabular-nums font-black text-sm ${sort === 'wins' ? 'text-white' : 'text-gray-300'}`}>
          {u.wins}
        </span>
      </div>

      {/* L — always visible */}
      <div className="w-10 text-right shrink-0">
        <span className="tabular-nums font-bold text-sm text-gray-500">{u.losses}</span>
      </div>

      {/* WIN% — always visible, color-coded, highlighted when sorting by winPct */}
      <div className="w-14 text-right shrink-0">
        <WinPctBadge pct={winPct} gamesPlayed={u.gamesPlayed} />
      </div>

      {/* Streak — always visible, fire icon when hot, highlighted when sorting by streak */}
      <div className="w-12 text-right shrink-0">
        {u.winStreak >= 3 ? (
          <span className={`tabular-nums font-black text-xs ${sort === 'winStreak' ? 'text-orange-400' : 'text-orange-500/70'}`}>
            🔥{u.winStreak}
          </span>
        ) : (
          <span className={`tabular-nums font-bold text-xs ${sort === 'winStreak' ? 'text-white' : 'text-gray-600'}`}>
            {u.winStreak}
          </span>
        )}
      </div>
    </div>
  )
}

// ── My rank banner ────────────────────────────────────────────────────────────
function MyRankBanner({ me, totalPlayers }: { me: MeRow; totalPlayers: number }) {
  const winPct = me.gamesPlayed > 0 ? ((me.wins / me.gamesPlayed) * 100).toFixed(1) : '0.0'
  const pctNum  = parseFloat(winPct)

  return (
    <div className="card-accent rounded-xl px-3 sm:px-4 py-3 mb-5 flex items-center justify-between gap-2 sm:gap-4">
      <div>
        <div className="text-label text-orange-500 mb-1">Your Standing</div>
        <div className="font-display text-4xl text-white leading-none tabular-nums">
          #{me.rank}
          <span className="text-gray-600 text-lg font-normal ml-1.5">/ {totalPlayers}</span>
        </div>
      </div>

      {/* Divider */}
      <div className="w-px self-stretch bg-white/[0.07] shrink-0 hidden xs:block" />

      {/* W-L — hidden on very small screens to prevent overflow */}
      <div className="text-center shrink-0 hidden xs:block">
        <div className="text-label mb-1">Record</div>
        <div className="flex items-baseline gap-1 tabular-nums">
          <span className="font-display text-xl sm:text-2xl text-green-400 leading-none">{me.wins}</span>
          <span className="text-gray-600 text-xs font-bold">W</span>
          <span className="font-display text-xl sm:text-2xl text-red-400 leading-none">{me.losses}</span>
          <span className="text-gray-600 text-xs font-bold">L</span>
        </div>
      </div>

      {/* Divider */}
      <div className="w-px self-stretch bg-white/[0.07] shrink-0 mx-0.5 sm:mx-1" />

      {/* Win% */}
      <div className="text-center shrink-0">
        <div className="text-label mb-1">Win%</div>
        <div className={`font-display text-xl sm:text-2xl leading-none tabular-nums ${
          me.gamesPlayed < 5 ? 'text-gray-600' : pctNum >= 60 ? 'text-green-400' : pctNum >= 45 ? 'text-white' : 'text-red-400'
        }`}>
          {me.gamesPlayed >= 5 ? `${winPct}%` : '—'}
        </div>
      </div>

      {/* Divider */}
      <div className="w-px self-stretch bg-white/[0.07] shrink-0 mx-1 hidden sm:block" />

      {/* Streak */}
      <div className="text-center shrink-0 hidden sm:block">
        <div className="text-label mb-1">Streak</div>
        <div className={`font-display text-2xl leading-none tabular-nums ${me.winStreak >= 3 ? 'text-orange-400' : 'text-gray-400'}`}>
          {me.winStreak >= 3 ? `🔥${me.winStreak}` : me.winStreak}
        </div>
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="card-surface rounded-2xl p-14 text-center flex flex-col items-center gap-4">
      <div className="font-display text-5xl text-gray-800 leading-none">0</div>
      <div>
        <p className="font-black text-white text-base">No players ranked yet</p>
        <p className="text-gray-500 text-sm mt-1">Be the first on the board</p>
      </div>
      <Link href="/lobby" className="btn-primary mt-1 text-xs px-6 py-3">Play Now</Link>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LeaderboardPage() {
  const [users, setUsers]               = useState<LeaderboardUser[]>([])
  const [totalPlayers, setTotalPlayers] = useState(0)
  const [me, setMe]                     = useState<MeRow | null>(null)
  const [loading, setLoading]           = useState(true)
  const [lastUpdated, setLastUpdated]   = useState<Date | null>(null)
  const [sort, setSort]                 = useState<SortKey>('wins')
  const meRowRef                        = useRef<HTMLDivElement>(null)
  const timerRef                        = useRef<ReturnType<typeof setInterval> | null>(null)

  async function load() {
    try {
      const d = await fetch('/api/leaderboard').then(r => r.json())
      if (d?.users) setUsers(d.users)
      if (d?.totalPlayers !== undefined) setTotalPlayers(d.totalPlayers)
      setMe(d?.me ?? null)
      setLastUpdated(new Date())
    } catch {}
    setLoading(false)
  }

  useEffect(() => {
    load()
    timerRef.current = setInterval(load, REFRESH_MS)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  const sorted = [...users].sort((a, b) => {
    if (sort === 'wins') return b.wins - a.wins
    if (sort === 'winStreak') return b.winStreak - a.winStreak
    const pctA = a.gamesPlayed >= 5 ? a.wins / a.gamesPlayed : -1
    const pctB = b.gamesPlayed >= 5 ? b.wins / b.gamesPlayed : -1
    return pctB - pctA
  })

  const meInList = me ? sorted.findIndex(u => u.id === me.id) : -1

  if (loading) return <SkeletonScreen />

  return (
    <div className="min-h-screen py-10 px-4 animate-fade-in">
      <div className="max-w-2xl mx-auto">

        {/* ── Page header ── */}
        <div className="flex items-start justify-between mb-2">
          <div>
            <h1 className="font-display text-5xl text-orange-500 leading-none tracking-wide">Leaderboard</h1>
            <p className="text-gray-500 text-sm mt-1 tabular-nums">{totalPlayers} players ranked</p>
          </div>
          <Link href="/lobby" className="text-gray-500 hover:text-white text-sm transition-colors mt-1">← Lobby</Link>
        </div>

        {/* ── Live indicator ── */}
        <div className="flex items-center gap-2 mb-5 text-xs text-gray-600">
          <span className="live-dot" />
          <span className="tabular-nums">
            Live · updates every 30s{lastUpdated ? ` · ${lastUpdated.toLocaleTimeString()}` : ''}
          </span>
        </div>

        {/* ── My rank banner ── */}
        {me && <MyRankBanner me={me} totalPlayers={totalPlayers} />}

        {/* ── Sort tabs ── */}
        <div className="flex gap-2 mb-4">
          {([
            ['wins',      'Most Wins'],
            ['winPct',    'Win %'],
            ['winStreak', 'Hot Streak'],
          ] as [SortKey, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-colors uppercase tracking-widest ${
                sort === key ? 'bg-orange-600 text-white' : 'card-surface text-gray-500 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Table ── */}
        {sorted.length === 0 ? <EmptyState /> : (
          <div className="card-surface rounded-2xl overflow-hidden">
            {/* Column headers */}
            <ColumnHeaders sort={sort} />

            {/* Divider */}
            <div className="mx-4 h-px bg-white/[0.06]" />

            {/* Rows — rendered inside the card so last-child border-bottom fires */}
            <div className="px-2 py-1.5 space-y-0.5">
              {sorted.map((u, i) => (
                <div
                  key={u.id}
                  className="animate-slide-up"
                  style={{ animationDelay: `${Math.min(i * 30, 300)}ms`, animationFillMode: 'both' }}
                >
                  <LeaderboardRow
                    user={u}
                    rank={i + 1}
                    isMe={me?.id === u.id}
                    sort={sort}
                    rowRef={me?.id === u.id ? meRowRef : undefined}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Pinned "you" row if outside top 100 ── */}
        {me && meInList === -1 && (
          <div className="mt-4 pt-4 border-t border-white/[0.05]">
            <div className="text-label text-center mb-2">You are outside the top 100</div>
            <LeaderboardRow
              user={me}
              rank={me.rank}
              isMe
              sort={sort}
              rowRef={meRowRef}
            />
          </div>
        )}

      </div>
    </div>
  )
}
