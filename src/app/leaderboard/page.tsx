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
        <div className="flex items-center justify-between mb-6">
          <div className="space-y-2">
            <div className="h-9 w-48 rounded bg-white/10 animate-pulse" />
            <div className="h-3 w-28 rounded bg-white/[0.07] animate-pulse" />
          </div>
          <div className="h-4 w-16 rounded bg-white/[0.07] animate-pulse" />
        </div>
        <div className="flex gap-2 mb-5">
          {[80, 64, 88].map(w => (
            <div key={w} className={`h-9 w-[${w}px] rounded-xl bg-white/[0.06] animate-pulse`} />
          ))}
        </div>
        <div className="h-6 w-full rounded bg-white/[0.04] animate-pulse mb-1" />
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
          <img src={b.icon} alt={b.name} className="w-3.5 h-3.5" loading="lazy" />
          <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-max max-w-[140px] rounded-lg bg-gray-900 border border-gray-700 px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-50">
            <div className="text-white text-[11px] font-black">{b.name}</div>
            <div className="text-gray-400 text-[10px] leading-snug">{b.description}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Rank badge chips ──────────────────────────────────────────────────────────
function RankChip({ user, rank, totalPlayers }: { user: LeaderboardUser; rank: number; totalPlayers: number }) {
  const chips: { label: string; cls: string }[] = []

  if (user.winStreak >= 5) chips.push({ label: '🔥 Hot Streak', cls: 'bg-orange-950 border-orange-700/50 text-orange-400' })
  else if (user.winStreak >= 3) chips.push({ label: '🔥 On Fire', cls: 'bg-orange-950/70 border-orange-800/50 text-orange-500' })

  if (rank <= 10) chips.push({ label: '👑 Top 10', cls: 'bg-yellow-950 border-yellow-700/50 text-yellow-400' })

  const winPct = user.gamesPlayed >= 10 ? (user.wins / user.gamesPlayed) * 100 : 0
  if (winPct >= 70 && user.gamesPlayed >= 10) chips.push({ label: '⚡ Rising', cls: 'bg-blue-950 border-blue-700/50 text-blue-400' })

  if (!chips.length) return null
  return (
    <div className="flex gap-1 mt-0.5 flex-wrap">
      {chips.slice(0, 2).map(c => (
        <span key={c.label} className={`text-[9px] font-black px-1.5 py-[2px] rounded border leading-none ${c.cls}`}>{c.label}</span>
      ))}
    </div>
  )
}

// ── Podium card for top 3 ─────────────────────────────────────────────────────
const PODIUM_CONFIG = [
  {
    order: 1,
    height: 'h-32',
    avatarSize: 'w-16 h-16',
    avatarText: 'text-3xl',
    nameSize: 'text-base',
    scoreSize: 'text-3xl',
    medalLabel: '🥇',
    borderGlow: 'border-yellow-500/50 shadow-[0_0_24px_rgba(234,179,8,0.25)]',
    bg: 'bg-gradient-to-b from-yellow-950/60 to-yellow-950/20',
    rankColor: 'text-yellow-400',
    scoreColor: 'text-yellow-300',
    crown: true,
  },
  {
    order: 2,
    height: 'h-24',
    avatarSize: 'w-12 h-12',
    avatarText: 'text-2xl',
    nameSize: 'text-sm',
    scoreSize: 'text-2xl',
    medalLabel: '🥈',
    borderGlow: 'border-slate-500/40 shadow-[0_0_16px_rgba(148,163,184,0.15)]',
    bg: 'bg-gradient-to-b from-slate-800/40 to-slate-900/20',
    rankColor: 'text-slate-300',
    scoreColor: 'text-slate-200',
    crown: false,
  },
  {
    order: 3,
    height: 'h-20',
    avatarSize: 'w-11 h-11',
    avatarText: 'text-xl',
    nameSize: 'text-sm',
    scoreSize: 'text-2xl',
    medalLabel: '🥉',
    borderGlow: 'border-orange-700/40 shadow-[0_0_14px_rgba(194,65,12,0.15)]',
    bg: 'bg-gradient-to-b from-orange-950/50 to-orange-950/10',
    rankColor: 'text-orange-400',
    scoreColor: 'text-orange-300',
    crown: false,
  },
]

function PodiumCard({ user, rank, isMe, totalPlayers }: { user: LeaderboardUser; rank: number; isMe: boolean; totalPlayers: number }) {
  const cfg = PODIUM_CONFIG[rank - 1]
  const winPct = user.gamesPlayed > 0 ? ((user.wins / user.gamesPlayed) * 100).toFixed(1) : '0.0'

  return (
    <div className={`flex flex-col items-center gap-0 ${rank === 1 ? 'order-2' : rank === 2 ? 'order-1' : 'order-3'}`}>
      {/* Avatar + badge hover */}
      <div className="relative group mb-2">
        {cfg.crown && (
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-2xl pointer-events-none select-none">👑</div>
        )}
        <div className={`${cfg.avatarSize} rounded-full flex items-center justify-center font-black text-white shrink-0 ${
          isMe ? 'bg-orange-500 ring-2 ring-orange-300' : rank === 1 ? 'bg-gradient-to-br from-yellow-600 to-yellow-800' : rank === 2 ? 'bg-gradient-to-br from-slate-500 to-slate-700' : 'bg-gradient-to-br from-orange-700 to-orange-900'
        }`}>
          <span className={cfg.avatarText}>{user.username[0].toUpperCase()}</span>
        </div>
      </div>

      {/* Name + YOU tag */}
      <div className="text-center mb-1">
        <div className="flex items-center justify-center gap-1">
          <span className={`font-black truncate max-w-[80px] ${cfg.nameSize} ${cfg.rankColor}`}>{user.username}</span>
          {isMe && <span className="text-[8px] font-black text-orange-500 bg-orange-950 border border-orange-700/50 rounded px-1 py-[1px] leading-none">YOU</span>}
        </div>
        <div className="text-[10px] text-gray-400 tabular-nums">{user.wins}W–{user.losses}L · {winPct}%</div>
        {user.winStreak >= 3 && (
          <div className="text-[9px] font-black text-orange-400 mt-0.5">🔥{user.winStreak}</div>
        )}
      </div>

      {/* Podium platform */}
      <div className={`w-full ${cfg.height} ${cfg.bg} border ${cfg.borderGlow} rounded-t-xl flex items-center justify-center`}>
        <div className="text-center">
          <div className={`font-display ${cfg.scoreSize} ${cfg.scoreColor} leading-none`}>{cfg.medalLabel}</div>
          <div className={`font-display text-xl ${cfg.rankColor} leading-none mt-0.5`}>#{rank}</div>
        </div>
      </div>
    </div>
  )
}

// ── Win-loss record ───────────────────────────────────────────────────────────
function WinPctBadge({ pct, gamesPlayed }: { pct: string; gamesPlayed: number }) {
  const n = parseFloat(pct)
  const color = gamesPlayed < 5
    ? 'text-gray-400'
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
      <div className="w-9 shrink-0" />
      <div className="w-8 shrink-0" />
      <div className="flex-1 min-w-0 text-label">Player</div>
      <div className={`w-10 text-right text-label shrink-0 ${sort === 'wins' ? 'text-orange-500' : ''}`}>W</div>
      <div className="w-10 text-right text-label shrink-0">L</div>
      <div className={`w-14 text-right text-label shrink-0 ${sort === 'winPct' ? 'text-orange-500' : ''}`}>WIN%</div>
      <div className={`w-12 text-right text-label shrink-0 ${sort === 'winStreak' ? 'text-orange-500' : ''}`}>STK</div>
    </div>
  )
}

// ── Leaderboard row (rank 4+) ─────────────────────────────────────────────────
interface RowProps {
  user: LeaderboardUser
  rank: number
  isMe: boolean
  sort: SortKey
  totalPlayers: number
  rowRef?: React.RefObject<HTMLDivElement>
}

function LeaderboardRow({ user: u, rank, isMe, sort, totalPlayers, rowRef }: RowProps) {
  const winPct = u.gamesPlayed > 0 ? ((u.wins / u.gamesPlayed) * 100).toFixed(1) : '0.0'

  const rowClass = [
    'table-row gap-3 rounded-xl border min-h-[44px]',
    isMe
      ? 'bg-orange-950/30 border-orange-600/50 ring-1 ring-orange-600/30'
      : 'border-white/[0.06]',
  ].join(' ')

  return (
    <div ref={rowRef} className={rowClass}>
      {/* Rank */}
      <div className="w-9 text-center shrink-0">
        <span className="font-black text-sm tabular-nums text-gray-400">{rank}</span>
      </div>

      {/* Avatar */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-white text-xs shrink-0 ${isMe ? 'bg-orange-500' : 'bg-orange-900/60'}`}>
        {u.username[0].toUpperCase()}
      </div>

      {/* Player name + chips */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`font-black text-sm truncate ${isMe ? 'text-orange-300' : 'text-white'}`}>
            {u.username}
          </span>
          {isMe && (
            <span className="shrink-0 text-[9px] font-black text-orange-500 bg-orange-950 border border-orange-700/50 rounded px-1.5 py-[2px] leading-none tracking-wider uppercase">
              YOU
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <BadgeIcons equippedBadges={u.equippedBadges} />
          <RankChip user={u} rank={rank} totalPlayers={totalPlayers} />
        </div>
      </div>

      {/* W */}
      <div className="w-10 text-right shrink-0">
        <span className={`tabular-nums font-black text-sm ${sort === 'wins' ? 'text-white' : 'text-gray-300'}`}>
          {u.wins}
        </span>
      </div>

      {/* L */}
      <div className="w-10 text-right shrink-0">
        <span className="tabular-nums font-bold text-sm text-gray-400">{u.losses}</span>
      </div>

      {/* WIN% */}
      <div className="w-14 text-right shrink-0">
        <WinPctBadge pct={winPct} gamesPlayed={u.gamesPlayed} />
      </div>

      {/* Streak */}
      <div className="w-12 text-right shrink-0">
        {u.winStreak >= 3 ? (
          <span className={`tabular-nums font-black text-xs ${sort === 'winStreak' ? 'text-orange-400' : 'text-orange-500/70'}`}>
            🔥{u.winStreak}
          </span>
        ) : (
          <span className={`tabular-nums font-bold text-xs ${sort === 'winStreak' ? 'text-white' : 'text-gray-400'}`}>
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
          <span className="text-gray-400 text-lg font-normal ml-1.5">/ {totalPlayers}</span>
        </div>
      </div>

      <div className="w-px self-stretch bg-white/[0.07] shrink-0 hidden xs:block" />

      <div className="text-center shrink-0 hidden xs:block">
        <div className="text-label mb-1">Record</div>
        <div className="flex items-baseline gap-1 tabular-nums">
          <span className="font-display text-xl sm:text-2xl text-green-400 leading-none">{me.wins}</span>
          <span className="text-gray-400 text-xs font-bold">W</span>
          <span className="font-display text-xl sm:text-2xl text-red-400 leading-none">{me.losses}</span>
          <span className="text-gray-400 text-xs font-bold">L</span>
        </div>
      </div>

      <div className="w-px self-stretch bg-white/[0.07] shrink-0 mx-0.5 sm:mx-1" />

      <div className="text-center shrink-0">
        <div className="text-label mb-1">Win%</div>
        <div className={`font-display text-xl sm:text-2xl leading-none tabular-nums ${
          me.gamesPlayed < 5 ? 'text-gray-400' : pctNum >= 60 ? 'text-green-400' : pctNum >= 45 ? 'text-white' : 'text-red-400'
        }`}>
          {me.gamesPlayed >= 5 ? `${winPct}%` : '—'}
        </div>
      </div>

      <div className="w-px self-stretch bg-white/[0.07] shrink-0 mx-1 hidden sm:block" />

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
        <p className="text-gray-400 text-sm mt-1">Be the first on the board</p>
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
  const top3 = sorted.slice(0, 3)
  const rest = sorted.slice(3)

  if (loading) return <SkeletonScreen />

  return (
    <div className="min-h-screen py-10 px-4 animate-fade-in">
      <div className="max-w-2xl mx-auto">

        {/* ── Page header ── */}
        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="text-label mb-2">EBK Rankings</p>
            <h1 className="font-display text-6xl sm:text-7xl text-white leading-none tracking-wide">
              LEADER<span className="text-orange-500">BOARD</span>
            </h1>
            <p className="text-gray-400 text-xs mt-2 tabular-nums font-bold">
              <span className="font-display text-orange-400 text-lg">{totalPlayers}</span>
              <span className="ml-1.5">players ranked</span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Link href="/lobby" className="btn-secondary py-2 px-4 text-xs">← Lobby</Link>
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <span className="live-dot" />
              <span className="tabular-nums text-[10px] font-bold">
                Live{lastUpdated ? ` · ${lastUpdated.toLocaleTimeString()}` : ''}
              </span>
            </div>
          </div>
        </div>

        {/* ── My rank banner ── */}
        {me && <MyRankBanner me={me} totalPlayers={totalPlayers} />}

        {/* ── Sort tabs ── */}
        <div className="tab-pill mb-6">
          {([
            ['wins',      'Most Wins'],
            ['winPct',    'Win %'],
            ['winStreak', 'Hot Streak'],
          ] as [SortKey, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={`tab-pill-item${sort === key ? ' active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>

        {sorted.length === 0 ? <EmptyState /> : (
          <>
            {/* ── Podium — top 3 ── */}
            {top3.length >= 2 && (
              <div className="mb-8">
                <div className="section-divider mb-4">
                  <p className="text-label">Top Performers</p>
                </div>
                <div className="grid grid-cols-3 gap-2 items-end px-2">
                  {top3.map((u, i) => (
                    <PodiumCard
                      key={u.id}
                      user={u}
                      rank={i + 1}
                      isMe={me?.id === u.id}
                      totalPlayers={totalPlayers}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── Ranks 4+ table ── */}
            {rest.length > 0 && (
              <div className="card-surface rounded-2xl overflow-hidden">
                <ColumnHeaders sort={sort} />
                <div className="mx-4 h-px bg-white/[0.06]" />
                <div className="px-2 py-1.5 space-y-0.5">
                  {rest.map((u, i) => (
                    <div
                      key={u.id}
                      className="animate-slide-up"
                      style={{ animationDelay: `${Math.min(i * 30, 300)}ms`, animationFillMode: 'both' }}
                    >
                      <LeaderboardRow
                        user={u}
                        rank={i + 4}
                        isMe={me?.id === u.id}
                        sort={sort}
                        totalPlayers={totalPlayers}
                        rowRef={me?.id === u.id ? meRowRef : undefined}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Pinned "you" row if outside top 100 ── */}
        {me && meInList === -1 && (
          <div className="mt-4 pt-4 border-t border-white/[0.05]">
            <div className="text-label text-center mb-2">
              {sort === 'wins'
                ? 'You are outside the top 100'
                : 'Your stats (rank shown by wins)'}
            </div>
            {/* Highlighted pinned "You" row */}
            <div className="rounded-xl border border-orange-500/40 bg-orange-950/20 ring-1 ring-orange-600/20 px-3 py-3 flex items-center gap-3">
              <div className="w-9 text-center shrink-0">
                <span className="font-black text-sm tabular-nums text-orange-400">#{me.rank}</span>
              </div>
              <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center font-black text-white text-xs shrink-0">
                {me.username[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-black text-sm text-orange-300 truncate">{me.username}</span>
                  <span className="text-[9px] font-black text-orange-500 bg-orange-950 border border-orange-700/50 rounded px-1.5 py-[2px] leading-none uppercase">YOU</span>
                </div>
                <RankChip user={me} rank={me.rank} totalPlayers={totalPlayers} />
              </div>
              <div className="text-right shrink-0 space-y-0.5">
                <div className="text-xs font-black text-green-400 tabular-nums">{me.wins}W <span className="text-gray-400">·</span> <span className="text-red-400">{me.losses}L</span></div>
                <WinPctBadge pct={me.gamesPlayed > 0 ? ((me.wins / me.gamesPlayed) * 100).toFixed(1) : '0.0'} gamesPlayed={me.gamesPlayed} />
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
