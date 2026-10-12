'use client'
import { useEffect, useState } from 'react'
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

type SortKey = 'wins' | 'winPct' | 'winStreak'

function BadgeChips({ equippedBadges }: { equippedBadges: string }) {
  let ids: string[] = []
  try { ids = JSON.parse(equippedBadges) } catch { ids = [] }
  const badges = ids.map(id => BADGES.find(b => b.id === id)).filter(Boolean) as typeof BADGES
  if (!badges.length) return null
  return (
    <div className="flex gap-1 flex-wrap">
      {badges.map(b => (
        <span key={b.id} className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${b.bgClass} ${b.textClass} ${b.borderClass}`}>
          {b.label}
        </span>
      ))}
    </div>
  )
}

export default function LeaderboardPage() {
  const [users, setUsers] = useState<LeaderboardUser[]>([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState<SortKey>('wins')

  useEffect(() => {
    fetch('/api/leaderboard')
      .then(r => r.json())
      .then(d => { if (d?.users) setUsers(d.users); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const sorted = [...users].sort((a, b) => {
    if (sort === 'wins') return b.wins - a.wins
    if (sort === 'winStreak') return b.winStreak - a.winStreak
    // winPct
    const pctA = a.gamesPlayed > 0 ? a.wins / a.gamesPlayed : 0
    const pctB = b.gamesPlayed > 0 ? b.wins / b.gamesPlayed : 0
    return pctB - pctA
  })

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
            <h1 className="font-display text-4xl text-orange-500 leading-none">Leaderboard</h1>
            <p className="text-gray-500 text-sm mt-1">Top {sorted.length} players</p>
          </div>
          <Link href="/lobby" className="text-gray-500 hover:text-white text-sm transition-colors">← Lobby</Link>
        </div>

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
          <div className="space-y-2">
            {sorted.map((u, i) => {
              const winPct = u.gamesPlayed > 0 ? ((u.wins / u.gamesPlayed) * 100).toFixed(1) : '0.0'
              const isTop3 = i < 3
              const rankColors = ['text-yellow-400', 'text-gray-300', 'text-orange-600']

              return (
                <div key={u.id} className={`bg-[#111] border rounded-xl px-4 py-3 flex items-center gap-4 ${isTop3 ? 'border-orange-900/40' : 'border-white/5'}`}>
                  {/* Rank */}
                  <div className={`w-8 text-center font-black text-lg shrink-0 ${isTop3 ? rankColors[i] : 'text-gray-600'}`}>
                    {i + 1}
                  </div>

                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-orange-600 flex items-center justify-center font-black text-white text-sm shrink-0">
                    {u.username[0].toUpperCase()}
                  </div>

                  {/* Name + badges */}
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-black text-sm truncate">{u.username}</div>
                    <BadgeChips equippedBadges={u.equippedBadges} />
                  </div>

                  {/* Stats */}
                  <div className="text-right shrink-0">
                    {sort === 'wins' && (
                      <>
                        <div className="text-white font-black text-base leading-none">{u.wins}W</div>
                        <div className="text-gray-500 text-xs">{u.losses}L · {winPct}%</div>
                      </>
                    )}
                    {sort === 'winPct' && (
                      <>
                        <div className="text-orange-400 font-black text-base leading-none">{winPct}%</div>
                        <div className="text-gray-500 text-xs">{u.wins}W {u.losses}L</div>
                      </>
                    )}
                    {sort === 'winStreak' && (
                      <>
                        <div className="text-orange-400 font-black text-base leading-none">
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
      </div>
    </div>
  )
}
