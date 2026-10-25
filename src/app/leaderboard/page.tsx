'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
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

// ── Skeleton loading row — matches actual table columns exactly ──────────────
function SkeletonRow({ wide }: { wide?: boolean }) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 rounded-xl border border-white/[0.05] bg-white/[0.015] animate-pulse min-h-[48px]">
      {/* rank */}
      <div className="w-8 sm:w-9 flex justify-center shrink-0">
        <div className="w-6 h-5 rounded bg-white/[0.08]" />
      </div>
      {/* avatar */}
      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/[0.08] shrink-0" />
      {/* name block */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className={`h-3.5 rounded bg-white/[0.08] ${wide ? 'w-36' : 'w-24'}`} />
        <div className="h-2.5 w-14 rounded bg-white/[0.05]" />
      </div>
      {/* W */}
      <div className="w-9 sm:w-10 shrink-0 flex justify-end">
        <div className="w-7 h-4 rounded bg-white/[0.08]" />
      </div>
      {/* L — hidden on mobile */}
      <div className="hidden sm:flex w-10 justify-end shrink-0">
        <div className="w-7 h-4 rounded bg-white/[0.06]" />
      </div>
      {/* WIN% */}
      <div className="w-12 sm:w-14 shrink-0 flex justify-end">
        <div className="w-10 h-4 rounded bg-white/[0.08]" />
      </div>
      {/* STK — hidden on mobile */}
      <div className="hidden sm:flex w-12 justify-end shrink-0">
        <div className="w-8 h-4 rounded bg-white/[0.06]" />
      </div>
    </div>
  )
}

function SkeletonScreen() {
  return (
    <div className="min-h-screen py-10 px-4 pb-24 sm:pb-10">
      <div className="max-w-2xl mx-auto">
        {/* header */}
        <div className="flex items-start justify-between mb-5 gap-4">
          <div className="space-y-2">
            <div className="h-3 w-24 rounded bg-white/[0.06] animate-pulse" />
            <div className="h-12 w-64 rounded bg-white/[0.1] animate-pulse" />
            <div className="h-4 w-32 rounded bg-white/[0.06] animate-pulse" />
          </div>
          <div className="flex flex-col items-end gap-2 pt-1">
            <div className="h-8 w-20 rounded-xl bg-white/[0.06] animate-pulse" />
            <div className="h-3 w-16 rounded bg-white/[0.04] animate-pulse" />
          </div>
        </div>
        {/* my rank banner skeleton */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-4 py-4 mb-5 flex items-center gap-4 animate-pulse">
          <div className="space-y-2">
            <div className="h-3 w-20 rounded bg-white/[0.07]" />
            <div className="h-9 w-16 rounded bg-white/[0.1]" />
          </div>
          <div className="w-px self-stretch bg-white/[0.05]" />
          <div className="space-y-2 text-center">
            <div className="h-3 w-12 rounded bg-white/[0.07] mx-auto" />
            <div className="h-6 w-20 rounded bg-white/[0.1] mx-auto" />
          </div>
          <div className="w-px self-stretch bg-white/[0.05]" />
          <div className="space-y-2 text-center">
            <div className="h-3 w-12 rounded bg-white/[0.07] mx-auto" />
            <div className="h-6 w-16 rounded bg-white/[0.1] mx-auto" />
          </div>
        </div>
        {/* sort tabs */}
        <div className="flex gap-1 bg-white/[0.03] border border-white/[0.05] rounded-xl p-1 mb-6 animate-pulse">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex-1 h-9 rounded-lg bg-white/[0.05]" />
          ))}
        </div>
        {/* podium skeleton */}
        <div className="grid grid-cols-3 gap-1.5 sm:gap-3 items-end px-1 sm:px-3 mb-8">
          {[2, 1, 3].map(r => (
            <div key={r} className="flex flex-col items-center animate-pulse" style={{ order: r === 1 ? 2 : r === 2 ? 1 : 3 }}>
              <div className="h-6" />
              <div className={`rounded-full bg-white/[0.08] mb-2 ${r === 1 ? 'w-16 h-16' : 'w-12 h-12'}`} />
              <div className="h-3.5 w-16 rounded bg-white/[0.08] mb-1 mx-auto" />
              <div className="h-2.5 w-12 rounded bg-white/[0.05] mb-2 mx-auto" />
              <div className={`w-full rounded-t-2xl bg-white/[0.04] ${r === 1 ? 'h-28' : r === 2 ? 'h-20' : 'h-14'}`} />
            </div>
          ))}
        </div>
        {/* table skeleton */}
        <div className="card-surface rounded-2xl overflow-hidden">
          <div className="px-4 pt-3.5 pb-0">
            <div className="h-3 w-20 rounded bg-white/[0.06] animate-pulse" />
          </div>
          {/* column headers */}
          <div className="flex items-center gap-2 sm:gap-3 px-4 py-2 mt-2">
            <div className="w-8 sm:w-9 shrink-0" />
            <div className="w-7 sm:w-8 shrink-0" />
            <div className="flex-1 h-2.5 w-10 rounded bg-white/[0.04] animate-pulse" />
            <div className="w-9 sm:w-10 h-2.5 rounded bg-white/[0.04] animate-pulse" />
            <div className="hidden sm:block w-10 h-2.5 rounded bg-white/[0.04] animate-pulse" />
            <div className="w-12 sm:w-14 h-2.5 rounded bg-white/[0.04] animate-pulse" />
            <div className="hidden sm:block w-12 h-2.5 rounded bg-white/[0.04] animate-pulse" />
          </div>
          <div className="mx-4 h-px bg-white/[0.04]" />
          <div className="px-2 py-2 space-y-0.5">
            {[true, false, true, false, false, false, false].map((w, i) => (
              <SkeletonRow key={i} wide={w} />
            ))}
          </div>
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
          <Image src={b.icon} alt={b.name} width={14} height={14} className="w-3.5 h-3.5" />
          <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-max max-w-[140px] rounded-lg bg-[#111118] border border-white/[0.1] px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-50">
            <div className="text-white text-[11px] font-black">{b.name}</div>
            <div className="text-white/60 text-[10px] leading-snug">{b.description}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Rank number display — gold/silver/bronze tiers ───────────────────────────
function RankNumber({ rank }: { rank: number }) {
  if (rank === 1) return (
    <span className="font-display text-xl tabular-nums text-yellow-400 drop-shadow-[0_0_8px_rgba(234,179,8,0.6)] tracking-wide">#1</span>
  )
  if (rank === 2) return (
    <span className="font-display text-xl tabular-nums text-slate-300 drop-shadow-[0_0_4px_rgba(148,163,184,0.3)] tracking-wide">#2</span>
  )
  if (rank === 3) return (
    <span className="font-display text-xl tabular-nums text-amber-600 drop-shadow-[0_0_4px_rgba(180,83,9,0.4)] tracking-wide">#3</span>
  )
  if (rank <= 10) return (
    <span className="font-display text-base tabular-nums text-white/60 tracking-wide">#{rank}</span>
  )
  return <span className="font-display text-sm tabular-nums text-white/30 tracking-wide">#{rank}</span>
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
    platformHeight: 'h-28',
    avatarSize: 'w-16 h-16',
    avatarText: 'text-3xl',
    nameSize: 'text-base',
    medalLabel: '🥇',
    // Richer gold treatment: full card glow + animated shimmer border
    borderGlow: 'border-yellow-500/70 shadow-[0_0_40px_rgba(234,179,8,0.35),0_0_12px_rgba(234,179,8,0.25),inset_0_1px_0_rgba(250,204,21,0.15)]',
    platformBg: 'bg-gradient-to-b from-yellow-900/60 via-yellow-950/45 to-yellow-950/10',
    rankLabel: 'text-yellow-400',
    winsColor: 'text-yellow-300',
    avatarBg: 'bg-gradient-to-br from-yellow-500 to-yellow-700',
    avatarRing: 'ring-2 ring-yellow-400/60 shadow-[0_0_24px_rgba(234,179,8,0.5)]',
    crown: true,
    rankNum: '#1',
    rankNumClass: 'font-display text-3xl text-yellow-400 tracking-wide drop-shadow-[0_0_12px_rgba(234,179,8,0.8)]',
    // Shimmer overlay for #1 only
    shimmer: true,
    cardBg: 'bg-gradient-to-b from-yellow-950/40 via-transparent to-transparent',
  },
  {
    order: 2,
    platformHeight: 'h-20',
    avatarSize: 'w-13 h-13',
    avatarText: 'text-2xl',
    nameSize: 'text-sm',
    medalLabel: '🥈',
    borderGlow: 'border-slate-500/50 shadow-[0_0_24px_rgba(148,163,184,0.18),inset_0_1px_0_rgba(203,213,225,0.08)]',
    platformBg: 'bg-gradient-to-b from-slate-700/35 via-slate-800/25 to-slate-900/10',
    rankLabel: 'text-slate-300',
    winsColor: 'text-slate-200',
    avatarBg: 'bg-gradient-to-br from-slate-400 to-slate-600',
    avatarRing: 'ring-2 ring-slate-400/40 shadow-[0_0_12px_rgba(148,163,184,0.25)]',
    crown: false,
    rankNum: '#2',
    rankNumClass: 'font-display text-2xl text-slate-300 tracking-wide',
    shimmer: false,
    cardBg: '',
  },
  {
    order: 3,
    platformHeight: 'h-14',
    avatarSize: 'w-12 h-12',
    avatarText: 'text-xl',
    nameSize: 'text-sm',
    medalLabel: '🥉',
    borderGlow: 'border-amber-700/60 shadow-[0_0_18px_rgba(120,53,15,0.25),inset_0_1px_0_rgba(217,119,6,0.08)]',
    platformBg: 'bg-gradient-to-b from-amber-900/40 via-amber-950/25 to-amber-950/5',
    rankLabel: 'text-amber-600',
    winsColor: 'text-amber-500',
    avatarBg: 'bg-gradient-to-br from-amber-700 to-amber-900',
    avatarRing: 'ring-2 ring-amber-700/40 shadow-[0_0_10px_rgba(120,53,15,0.3)]',
    crown: false,
    rankNum: '#3',
    rankNumClass: 'font-display text-2xl text-amber-600 tracking-wide',
    shimmer: false,
    cardBg: '',
  },
]

function PodiumCard({ user, rank, isMe, totalPlayers }: { user: LeaderboardUser; rank: number; isMe: boolean; totalPlayers: number }) {
  const cfg = PODIUM_CONFIG[rank - 1]
  const winPct = user.gamesPlayed > 0 ? ((user.wins / user.gamesPlayed) * 100).toFixed(1) : '0.0'

  return (
    <div className={`flex flex-col items-center ${rank === 1 ? 'order-2' : rank === 2 ? 'order-1' : 'order-3'}`}>
      {/* Crown spacer or crown icon */}
      {cfg.crown ? (
        <div className="text-xl mb-0.5 select-none animate-bounce" style={{ animationDuration: '2s' }}>👑</div>
      ) : (
        <div className="h-6" />
      )}

      {/* Avatar */}
      <div className="relative mb-2">
        <div className={`${cfg.avatarSize} rounded-full flex items-center justify-center font-black text-white shrink-0 ${
          isMe ? 'bg-orange-500 ring-2 ring-orange-300 shadow-[0_0_20px_rgba(249,115,22,0.5)]' : `${cfg.avatarBg} ${cfg.avatarRing}`
        }`}>
          <span className={cfg.avatarText}>{user.username[0].toUpperCase()}</span>
        </div>
        {isMe && (
          <div className="absolute -top-1.5 -right-1.5 text-[8px] font-black text-orange-400 bg-orange-950 border border-orange-500/80 rounded px-1.5 leading-[15px] shadow-[0_0_8px_rgba(249,115,22,0.4)] tracking-wide">
            YOU
          </div>
        )}
        {user.winStreak >= 3 && (
          <div className="absolute -bottom-1 -right-1 rounded-full bg-orange-500 border-2 border-[#0a0a0f] w-5 h-5 flex items-center justify-center">
            <span className="text-[8px] font-black text-white leading-none">{user.winStreak}</span>
          </div>
        )}
      </div>

      {/* Name — wider clamp so short usernames don't get cut, "you" gets orange tint */}
      <div className="text-center mb-2 px-1 w-full">
        <div className="flex items-center justify-center gap-1">
          <span className={`font-black truncate max-w-[90px] sm:max-w-[110px] ${cfg.nameSize} ${isMe ? 'text-orange-300' : cfg.rankLabel}`}>
            {user.username}
          </span>
        </div>
        <div className="text-[10px] text-white/40 tabular-nums mt-0.5">
          <span className="text-green-400/80">{user.wins}W</span>
          <span className="text-white/20 mx-0.5">·</span>
          <span className="text-red-400/70">{user.losses}L</span>
          <span className="text-white/20 mx-0.5">·</span>
          <WinPctInline pct={winPct} gamesPlayed={user.gamesPlayed} />
        </div>
      </div>

      {/* Podium platform — #1 gets a subtle shimmer sweep overlay */}
      <div className={`relative w-full overflow-hidden ${cfg.platformHeight} ${cfg.platformBg} border ${cfg.borderGlow} rounded-t-2xl flex flex-col items-center justify-center gap-0.5`}>
        {cfg.shimmer && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'linear-gradient(105deg, transparent 40%, rgba(250,204,21,0.12) 50%, transparent 60%)',
              animation: 'shimmer-sweep 3s ease-in-out infinite',
            }}
          />
        )}
        <div className={cfg.rankNumClass}>{cfg.rankNum}</div>
        <div className="text-base leading-none">{cfg.medalLabel}</div>
      </div>
    </div>
  )
}

// ── Win% inline (no badge wrapper, for podium use) ───────────────────────────
function WinPctInline({ pct, gamesPlayed }: { pct: string; gamesPlayed: number }) {
  const n = parseFloat(pct)
  const color = gamesPlayed < 5
    ? 'text-white/40'
    : n >= 60
      ? 'text-green-400/80'
      : n >= 45
        ? 'text-white/60'
        : 'text-red-400/70'
  return <span className={`tabular-nums ${color}`}>{gamesPlayed >= 5 ? `${pct}%` : '—'}</span>
}

// ── Win% badge in table rows — color coded green/yellow/red ──────────────────
function WinPctBadge({ pct, gamesPlayed }: { pct: string; gamesPlayed: number }) {
  const n = parseFloat(pct)
  if (gamesPlayed < 5) {
    return <span className="tabular-nums font-bold text-xs text-white/30">—</span>
  }
  // Color + subtle pill background
  const { text, bg, border } = n >= 60
    ? { text: 'text-green-400', bg: 'bg-green-950/60', border: 'border-green-700/40' }
    : n >= 45
      ? { text: 'text-yellow-400', bg: 'bg-yellow-950/50', border: 'border-yellow-700/30' }
      : { text: 'text-red-400', bg: 'bg-red-950/60', border: 'border-red-700/40' }

  return (
    <span className={`inline-block tabular-nums font-black text-[11px] px-1.5 py-0.5 rounded-md border leading-none ${text} ${bg} ${border}`}>
      {pct}%
    </span>
  )
}

// ── Column header row ─────────────────────────────────────────────────────────
function ColumnHeaders({ sort }: { sort: SortKey }) {
  const base = 'text-[10px] font-black uppercase tracking-[0.14em] text-white/30 transition-colors'
  const active = 'text-orange-500'
  return (
    <div className="flex items-center gap-2 sm:gap-3 px-4 pb-2 pt-1">
      <div className="w-8 sm:w-9 shrink-0" />
      <div className="w-7 sm:w-8 shrink-0" />
      <div className={`flex-1 min-w-0 ${base}`}>Player</div>
      <div className={`w-9 sm:w-10 text-right shrink-0 ${base} ${sort === 'wins' ? active : ''}`}>W</div>
      {/* L collapses on mobile */}
      <div className={`hidden sm:block w-10 text-right shrink-0 ${base}`}>L</div>
      <div className={`w-14 sm:w-16 text-right shrink-0 ${base} ${sort === 'winPct' ? active : ''}`}>WIN%</div>
      {/* Streak collapses on mobile */}
      <div className={`hidden sm:block w-12 text-right shrink-0 ${base} ${sort === 'winStreak' ? active : ''}`}>STK</div>
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
  rowRef?: React.RefObject<HTMLDivElement> | undefined
}

function LeaderboardRow({ user: u, rank, isMe, sort, totalPlayers, rowRef }: RowProps) {
  const winPct = u.gamesPlayed > 0 ? ((u.wins / u.gamesPlayed) * 100).toFixed(1) : '0.0'

  const rowClass = [
    'flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 rounded-xl border min-h-[48px] transition-colors',
    isMe
      // "You" row — orange gradient bg, thick left-bar inset, pulsing glow via CSS animation
      ? 'bg-gradient-to-r from-orange-950/70 via-orange-950/30 to-transparent border-orange-500/60 ring-1 ring-orange-500/25 you-row-pulse'
      : rank === 1
      ? 'bg-gradient-to-r from-yellow-950/40 to-transparent border-yellow-700/30 shadow-[0_0_12px_rgba(234,179,8,0.08)]'
      : rank === 2
      ? 'bg-gradient-to-r from-slate-800/30 to-transparent border-slate-600/25'
      : rank === 3
      ? 'bg-gradient-to-r from-amber-950/30 to-transparent border-amber-800/25'
      : 'border-white/[0.05] hover:bg-white/[0.02] hover:border-white/[0.08]',
  ].join(' ')

  return (
    <div ref={rowRef} className={rowClass}>
      {/* Rank */}
      <div className="w-8 sm:w-9 text-center shrink-0">
        <RankNumber rank={rank} />
      </div>

      {/* Avatar */}
      <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-black text-white text-xs shrink-0 ${
        isMe
          ? 'bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]'
          : 'bg-orange-900/60'
      }`}>
        {u.username[0].toUpperCase()}
      </div>

      {/* Player name + chips */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`font-black text-sm truncate ${isMe ? 'text-orange-200' : 'text-white'}`}>
            {u.username}
          </span>
          {isMe && (
            <span className="shrink-0 text-[8px] font-black text-orange-300 bg-orange-500/20 border border-orange-500/50 rounded px-1.5 py-[2px] leading-none tracking-[0.1em] uppercase shadow-[0_0_6px_rgba(249,115,22,0.2)]">
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
      <div className="w-9 sm:w-10 text-right shrink-0">
        <span className={`tabular-nums font-black text-sm ${sort === 'wins' ? 'text-white' : 'text-white/70'}`}>
          {u.wins}
        </span>
      </div>

      {/* L — hidden on mobile (graceful collapse) */}
      <div className="hidden sm:block w-10 text-right shrink-0">
        <span className="tabular-nums font-bold text-sm text-white/40">{u.losses}</span>
      </div>

      {/* WIN% — color-coded pill */}
      <div className="w-14 sm:w-16 text-right shrink-0">
        <WinPctBadge pct={winPct} gamesPlayed={u.gamesPlayed} />
      </div>

      {/* Streak — hidden on mobile (graceful collapse) */}
      <div className="hidden sm:block w-12 text-right shrink-0">
        {u.winStreak >= 3 ? (
          <span className={`tabular-nums font-black text-xs ${sort === 'winStreak' ? 'text-orange-400' : 'text-orange-500/70'}`}>
            🔥{u.winStreak}
          </span>
        ) : (
          <span className={`tabular-nums font-bold text-xs ${sort === 'winStreak' ? 'text-white' : 'text-white/40'}`}>
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
          <span className="text-white/60 text-lg font-normal ml-1.5">/ {totalPlayers}</span>
        </div>
      </div>

      <div className="w-px self-stretch bg-white/[0.07] shrink-0" />

      <div className="text-center shrink-0">
        <div className="text-label mb-1">Record</div>
        <div className="flex items-baseline gap-1 tabular-nums">
          <span className="font-display text-xl sm:text-2xl text-green-400 leading-none">{me.wins}</span>
          <span className="text-white/60 text-xs font-bold">W</span>
          <span className="font-display text-xl sm:text-2xl text-red-400 leading-none">{me.losses}</span>
          <span className="text-white/60 text-xs font-bold">L</span>
        </div>
      </div>

      <div className="w-px self-stretch bg-white/[0.07] shrink-0 mx-0.5 sm:mx-1" />

      <div className="text-center shrink-0">
        <div className="text-label mb-1">Win%</div>
        <div className={`font-display text-xl sm:text-2xl leading-none tabular-nums ${
          me.gamesPlayed < 5 ? 'text-white/60' : pctNum >= 60 ? 'text-green-400' : pctNum >= 45 ? 'text-yellow-400' : 'text-red-400'
        }`}>
          {me.gamesPlayed >= 5 ? `${winPct}%` : '—'}
        </div>
      </div>

      <div className="w-px self-stretch bg-white/[0.07] shrink-0 mx-1 hidden sm:block" />

      <div className="text-center shrink-0 hidden sm:block">
        <div className="text-label mb-1">Streak</div>
        <div className={`font-display text-2xl leading-none tabular-nums ${me.winStreak >= 3 ? 'text-orange-400' : 'text-white/60'}`}>
          {me.winStreak >= 3 ? `🔥${me.winStreak}` : me.winStreak}
        </div>
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.025] to-transparent p-16 text-center flex flex-col items-center gap-5 animate-fade-in">
      <div className="relative">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-yellow-900/40 to-yellow-950/20 border border-yellow-700/20 flex items-center justify-center shadow-[0_0_40px_rgba(234,179,8,0.06)]">
          <span className="text-4xl leading-none select-none">🏆</span>
        </div>
        <div className="absolute inset-0 rounded-full bg-yellow-400/5 blur-xl pointer-events-none" />
      </div>
      <div>
        <p className="font-display text-2xl text-white tracking-wider leading-none">No players ranked yet</p>
        <p className="text-white/40 text-sm mt-2">Play a game to claim your spot on the board</p>
      </div>
      <Link href="/lobby" className="btn-primary mt-1 text-sm px-8 py-3">Play Now</Link>
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
  const abortRef                        = useRef<AbortController | null>(null)

  async function load() {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const d = await fetch('/api/leaderboard', { signal: controller.signal }).then(r => r.json())
      if (d?.users) setUsers(d.users)
      if (d?.totalPlayers !== undefined) setTotalPlayers(d.totalPlayers)
      setMe(d?.me ?? null)
      setLastUpdated(new Date())
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    timerRef.current = setInterval(load, REFRESH_MS)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div className="min-h-screen py-10 px-4 pb-24 sm:pb-10 animate-fade-in">
      <div className="max-w-2xl mx-auto">

        {/* ── Page header ── */}
        <div className="flex items-start justify-between mb-5 gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-500/70 mb-2">EBK Rankings</p>
            <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl text-white leading-none tracking-wide">
              LEADER<span className="text-orange-500">BOARD</span>
            </h1>
            <p className="mt-2 flex items-baseline gap-1.5">
              <span className="font-display text-2xl text-orange-400 leading-none tabular-nums">{totalPlayers}</span>
              <span className="text-white/40 text-xs font-bold uppercase tracking-[0.1em]">players ranked</span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0 pt-1">
            <Link href="/lobby" className="btn-secondary py-2 px-4 text-xs">← Lobby</Link>
            <div className="flex items-center gap-1.5">
              <span className="live-dot" />
              <span className="tabular-nums text-[10px] font-bold text-white/40">
                {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Live'}
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
              <div className="mb-8 animate-fade-up">
                <div className="flex items-center gap-3 mb-5">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent to-yellow-700/20" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-600/70">🏆 Top Performers</span>
                  <div className="h-px flex-1 bg-gradient-to-l from-transparent to-yellow-700/20" />
                </div>
                <div className="grid grid-cols-3 gap-1.5 sm:gap-3 items-end px-1 sm:px-3">
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
              <div className="card-surface rounded-2xl overflow-hidden animate-fade-up-1">
                <div className="flex items-center justify-between px-4 pt-3.5 pb-0">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Rankings</span>
                  {me && meInList >= 3 && (
                    <button
                      onClick={() => meRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                      className="text-[10px] font-black text-orange-500 hover:text-orange-400 transition-colors uppercase tracking-[0.12em]"
                    >
                      Jump to me ↓
                    </button>
                  )}
                </div>
                <ColumnHeaders sort={sort} />
                <div className="mx-4 h-px bg-white/[0.05]" />
                <div className="px-2 py-2 space-y-0.5">
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
            <div className="rounded-xl border border-orange-500/50 bg-gradient-to-r from-orange-950/50 via-orange-950/25 to-transparent ring-1 ring-orange-500/20 shadow-[inset_3px_0_0_0_rgba(249,115,22,0.7),0_0_20px_rgba(249,115,22,0.1)] px-3 py-3 flex items-center gap-3">
              <div className="w-9 text-center shrink-0">
                <span className="font-black text-sm tabular-nums text-orange-400">#{me.rank}</span>
              </div>
              <div className="w-8 h-8 rounded-full bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)] flex items-center justify-center font-black text-white text-xs shrink-0">
                {me.username[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-black text-sm text-orange-200 truncate">{me.username}</span>
                  <span className="text-[8px] font-black text-orange-300 bg-orange-500/20 border border-orange-500/50 rounded px-1.5 py-[2px] leading-none uppercase">YOU</span>
                </div>
                <RankChip user={me} rank={me.rank} totalPlayers={totalPlayers} />
              </div>
              <div className="text-right shrink-0 space-y-1">
                <div className="text-xs font-black text-green-400 tabular-nums">{me.wins}W <span className="text-white/40">·</span> <span className="text-red-400">{me.losses}L</span></div>
                <WinPctBadge pct={me.gamesPlayed > 0 ? ((me.wins / me.gamesPlayed) * 100).toFixed(1) : '0.0'} gamesPlayed={me.gamesPlayed} />
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
