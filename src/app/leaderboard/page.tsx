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

const REFRESH_MS = 30_000 // auto-refresh every 30 s

function BadgeIcons({ equippedBadges }: { equippedBadges: string }) {
  let ids: string[] = []
  try { ids = JSON.parse(equippedBadges) } catch { ids = [] }
  if (!Array.isArray(ids)) ids = []
  const badges = ids.map(id => BADGES.find(b => b.id === id)).filter(Boolean) as typeof BADGES
  if (!badges.length) return null
  return (
    <div className="flex gap-1">
      {badges.map(b => (
        <div key={b.id} className="relative group">
          <img src={b.icon} alt={b.name} className="w-4 h-4" />
          <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-max max-w-[140px] rounded-lg bg-gray-900 border border-gray-700 px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-50">
            <div className="text-white text-[11px] font-black">{b.name}</div>
            <div className="text-gray-400 text-[10px] leading-snug">{b.description}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

const rankColors = ['text-yellow-400', 'text-gray-300', 'text-orange-600']
const rankBg    = ['border-yellow-900/40', 'border-gray-700/40', 'border-orange-900/40']

function rankLabel(i: number) {
  if (i === 0) return '🥇'
  if (i === 1) return '🥈'
  if (i === 2) return '🥉'
  return String(i + 1)
}

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
    const pctA = a.gamesPlayed > 0 ? a.wins / a.gamesPlayed : 0
    const pctB = b.gamesPlayed > 0 ? b.wins / b.gamesPlayed : 0
    return pctB - pctA
  })

  // Find me in the sorted list (for rank when sorting changes)
  const meInList = me ? sorted.findIndex(u => u.id === me.id) : -1

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
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="font-display text-4xl text-orange-500 leading-none">Leaderboard</h1>
            <p className="text-gray-500 text-sm mt-1">{totalPlayers} players ranked</p>
          </div>
          <Link href="/lobby" className="text-gray-500 hover:text-white text-sm transition-colors">← Lobby</Link>
        </div>

        {/* Last updated + live indicator */}
        <div className="flex items-center gap-2 mb-5 text-xs text-gray-600">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
          <span>Live · updates every 30s{lastUpdated ? ` · last at ${lastUpdated.toLocaleTimeString()}` : ''}</span>
        </div>

        {/* My rank banner (if logged in) */}
        {me && (
          <div className="bg-orange-950/40 border border-orange-700/50 rounded-xl px-4 py-3 mb-5 flex items-center justify-between">
            <div>
              <span className="text-orange-400 font-black text-sm">Your rank</span>
              <div className="text-white font-black text-2xl leading-none mt-0.5">
                #{me.rank}
                <span className="text-gray-500 text-sm font-normal ml-1">/ {totalPlayers}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-white font-black">{me.wins}W · {me.losses}L</div>
              <div className="text-gray-500 text-xs">
                {me.gamesPlayed > 0 ? ((me.wins / me.gamesPlayed) * 100).toFixed(1) : '0.0'}% · streak {me.winStreak}
              </div>
            </div>
          </div>
        )}

        {/* Sort tabs */}
        <div className="flex gap-2 mb-5">
          {([['wins', 'Most Wins'], ['winPct', 'Win %'], ['winStreak', 'Hot Streak']] as [SortKey, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setSort(key)}
              className={`px-4 py-2 rounded-xl text-sm font-black transition-colors ${sort === key ? 'bg-orange-600 text-white' : 'bg-[#111] text-gray-400 hover:text-white border border-white/5'}`}>
              {label}
            </button>
          ))}
        </div>

        {sorted.length === 0 ? (
          <div className="bg-[#111] border border-white/5 rounded-2xl p-12 text-center">
            <p className="text-gray-500 font-bold">No players yet</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {sorted.map((u, i) => {
              const isMe = me?.id === u.id
              const winPct = u.gamesPlayed > 0 ? ((u.wins / u.gamesPlayed) * 100).toFixed(1) : '0.0'
              const isTop3 = i < 3

              return (
                <div
                  key={u.id}
                  ref={isMe ? meRowRef : undefined}
                  className={[
                    'rounded-xl px-4 py-3 flex items-center gap-3 border transition-all',
                    isMe
                      ? 'bg-orange-950/30 border-orange-600/50 ring-1 ring-orange-600/30'
                      : isTop3
                        ? `bg-[#111] ${rankBg[i]}`
                        : 'bg-[#111] border-white/5',
                  ].join(' ')}
                >
                  {/* Rank */}
                  <div className={`w-8 text-center font-black text-base shrink-0 ${isTop3 ? rankColors[i] : 'text-gray-600'}`}>
                    {rankLabel(i)}
                  </div>

                  {/* Avatar */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-white text-xs shrink-0 ${isMe ? 'bg-orange-500' : 'bg-orange-800/70'}`}>
                    {u.username[0].toUpperCase()}
                  </div>

                  {/* Name + badges */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-black text-sm truncate ${isMe ? 'text-orange-300' : 'text-white'}`}>
                        {u.username}
                      </span>
                      {isMe && <span className="text-[9px] font-bold text-orange-500 bg-orange-950 border border-orange-700/50 rounded px-1 py-0.5 shrink-0">YOU</span>}
                    </div>
                    <BadgeIcons equippedBadges={u.equippedBadges} />
                  </div>

                  {/* Stats */}
                  <div className="text-right shrink-0">
                    {sort === 'wins' && (
                      <>
                        <div className="text-white font-black text-sm leading-none">{u.wins}W</div>
                        <div className="text-gray-500 text-xs">{u.losses}L · {winPct}%</div>
                      </>
                    )}
                    {sort === 'winPct' && (
                      <>
                        <div className="text-orange-400 font-black text-sm leading-none">{winPct}%</div>
                        <div className="text-gray-500 text-xs">{u.wins}W {u.losses}L</div>
                      </>
                    )}
                    {sort === 'winStreak' && (
                      <>
                        <div className="text-orange-400 font-black text-sm leading-none">
                          {u.winStreak >= 3 ? `🔥 ${u.winStreak}` : u.winStreak}
                        </div>
                        <div className="text-gray-500 text-xs">best: {u.maxWinStreak}</div>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* If I'm outside top 100, show my row pinned at the bottom */}
        {me && meInList === -1 && (
          <div className="mt-4 border-t border-white/5 pt-4">
            <div className="text-gray-600 text-xs mb-2 text-center">· · · you are outside the top 100 · · ·</div>
            <div className="bg-orange-950/30 border border-orange-600/50 ring-1 ring-orange-600/30 rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-8 text-center font-black text-base shrink-0 text-gray-500">#{me.rank}</div>
              <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center font-black text-white text-xs shrink-0">
                {me.username[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-black text-sm text-orange-300 truncate">{me.username}</span>
                  <span className="text-[9px] font-bold text-orange-500 bg-orange-950 border border-orange-700/50 rounded px-1 py-0.5 shrink-0">YOU</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-white font-black text-sm leading-none">{me.wins}W</div>
                <div className="text-gray-500 text-xs">{me.losses}L · {me.gamesPlayed > 0 ? ((me.wins / me.gamesPlayed) * 100).toFixed(1) : '0.0'}%</div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
