'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BADGES, EMOTES, MILESTONES } from '@/lib/accessories'
import { useAuth } from '@/context/AuthContext'

interface UserProfile {
  id: string
  username: string
  email: string
  wins: number
  losses: number
  draws: number
  gamesPlayed: number
  winStreak: number
  maxWinStreak: number
  firstPickWins: number
  firstPickGames: number
  unlockedBadges: string
  unlockedEmotes: string
  unlockedMilestones: string
  equippedBadge: string
  equippedBadges: string
  equippedEmote: string
  createdAt: string
}

export default function ProfilePage() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [equippedBadges, setEquippedBadges] = useState<string[]>([])
  const [equippedEmote, setEquippedEmote] = useState('')
  const router = useRouter()
  const { setUser: setAuthUser, user: authUser } = useAuth()

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => {
        if (!r.ok) { router.push('/login'); return null }
        return r.json()
      })
      .then(d => {
        if (d?.user) {
          setUser(d.user)
          try { setEquippedBadges(JSON.parse(d.user.equippedBadges || '[]')) } catch { setEquippedBadges([]) }
          setEquippedEmote(d.user.equippedEmote ?? '')
        } else {
          router.push('/login')
        }
        setLoading(false)
      })
      .catch(() => { setLoading(false); router.push('/login') })
  }, [router])

  async function equipItem(type: 'badge' | 'emote', id: string) {
    if (type === 'badge') {
      // Optimistic toggle
      setEquippedBadges(prev => {
        if (prev.includes(id)) return prev.filter(b => b !== id)
        if (prev.length < 3) return [...prev, id]
        return [...prev.slice(1), id]
      })
    } else {
      setEquippedEmote(id)
    }

    const res = await fetch('/api/accessories/equip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, id }),
    })
    if (res.ok) {
      // Sync user state so subsequent reverts have the correct baseline.
      // Must recompute from user.equippedBadges (server baseline) not the stale closure.
      if (type === 'badge') {
        setUser(u => {
          if (!u) return u
          let ids: string[] = []
          try { ids = JSON.parse(u.equippedBadges || '[]') } catch { ids = [] }
          const updated = ids.includes(id) ? ids.filter(b => b !== id)
            : ids.length < 3 ? [...ids, id] : [...ids.slice(1), id]
          const newEquippedBadges = JSON.stringify(updated)
          // Sync to AuthContext so Navbar badge display updates immediately
          if (authUser) setAuthUser({ ...authUser, equippedBadges: newEquippedBadges })
          return { ...u, equippedBadges: newEquippedBadges }
        })
      } else {
        setUser(u => u ? { ...u, equippedEmote: id } : u)
      }
    } else {
      // Revert on failure
      if (type === 'badge') {
        try { setEquippedBadges(JSON.parse(user?.equippedBadges || '[]')) } catch { setEquippedBadges([]) }
      } else {
        setEquippedEmote(user?.equippedEmote ?? '')
      }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
      </div>
    )
  }
  if (!user) { router.push('/login'); return null }

  const total = user.wins + user.losses + user.draws
  const winPct = total > 0 ? ((user.wins / total) * 100).toFixed(1) : '0.0'

  let unlockedBadgeIds: string[] = []
  let unlockedEmoteIds: string[] = []
  let unlockedMilestoneIds: string[] = []
  try { unlockedBadgeIds = JSON.parse(user.unlockedBadges) } catch { unlockedBadgeIds = [] }
  try { unlockedEmoteIds = JSON.parse(user.unlockedEmotes) } catch { unlockedEmoteIds = [] }
  try { unlockedMilestoneIds = JSON.parse(user.unlockedMilestones) } catch { unlockedMilestoneIds = [] }

  return (
    <div className="min-h-screen py-10 px-4">
      <div className="max-w-3xl mx-auto">

        {/* Page header — matches lobby / leaderboard pattern */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-4xl text-orange-500 leading-none">Profile</h1>
            <p className="text-gray-500 text-sm mt-1">
              Member since {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </p>
          </div>
          <Link href="/lobby" className="text-gray-500 hover:text-white text-sm transition-colors">← Lobby</Link>
        </div>

        <div className="space-y-6">

          {/* Player identity card — card-accent for premium top-border treatment */}
          <div className="card-accent p-8">
            <div className="flex items-center gap-5">
              {/* Avatar */}
              <div className="w-20 h-20 bg-orange-600 rounded-full flex items-center justify-center shrink-0 shadow-lg shadow-orange-900/40">
                <span className="font-display text-4xl text-white leading-none pt-1">
                  {user.username[0].toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-display text-3xl text-white leading-none tracking-wide">{user.username}</h2>
                <p className="text-label mt-2">{user.email}</p>
              </div>
            </div>
          </div>

          {/* Career stats — card-stat for maximum number contrast */}
          <div className="card-stat p-6">
            <h3 className="text-label mb-5">Career Overview</h3>

            {/* Primary stats grid */}
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 text-center mb-6">
              <div className="space-y-1">
                <div className="font-display text-4xl text-green-400 leading-none">{user.wins}</div>
                <div className="text-label">W</div>
              </div>
              <div className="space-y-1">
                <div className="font-display text-4xl text-red-400 leading-none">{user.losses}</div>
                <div className="text-label">L</div>
              </div>
              <div className="space-y-1">
                <div className="font-display text-4xl text-yellow-400 leading-none">{user.draws}</div>
                <div className="text-label">D</div>
              </div>
              <div className="space-y-1">
                <div className="font-display text-4xl text-gray-300 leading-none">{user.gamesPlayed}</div>
                <div className="text-label">GP</div>
              </div>
              <div className="space-y-1">
                <div className="font-display text-4xl text-orange-400 leading-none">{user.winStreak}</div>
                <div className="text-label">Streak</div>
              </div>
              <div className="space-y-1">
                <div className="font-display text-4xl text-orange-300 leading-none">{user.maxWinStreak}</div>
                <div className="text-label">Best</div>
              </div>
              <div className="space-y-1">
                <div className="font-display text-4xl text-blue-400 leading-none">{winPct}%</div>
                <div className="text-label">Win%</div>
              </div>
            </div>

            {/* Win rate progress bar */}
            <div className="mb-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-label">Win Rate</span>
                <span className="text-white text-sm font-black">{winPct}%</span>
              </div>
              <div className="budget-bar">
                <div
                  className="budget-bar-fill"
                  style={{ width: `${winPct}%` }}
                />
              </div>
            </div>

            {/* First pick advantage — only if data exists */}
            {user.firstPickGames > 0 && (
              <div className="border-t border-white/5 pt-4 mt-4 flex items-center justify-between">
                <span className="text-label">First Pick Advantage</span>
                <div className="text-right">
                  <span className="text-white font-black text-sm">{user.firstPickWins}W / {user.firstPickGames}G</span>
                  <span className="text-gray-500 text-xs ml-2">
                    ({user.firstPickGames > 0 ? ((user.firstPickWins / user.firstPickGames) * 100).toFixed(0) : 0}% when first)
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Badges */}
          <div className="card-surface p-6">
            <h2 className="font-display text-2xl text-white tracking-wider leading-none mb-1">Badges</h2>
            <p className="text-gray-500 text-xs mb-5">Badges are a mystery — keep playing to discover them. Tap to equip up to 3.</p>

            {/* Equipped badge slots */}
            <div className="flex gap-3 mb-5">
              {[0, 1, 2].map(slot => {
                const badgeId = equippedBadges[slot]
                const badge = badgeId ? BADGES.find(b => b.id === badgeId) : null
                return (
                  <div key={slot} className={[
                    'flex-1 rounded-xl border-2 border-dashed h-20 flex flex-col items-center justify-center transition-all',
                    badge ? `${badge.bgClass} ${badge.borderClass} border-solid` : 'border-white/10 bg-white/[0.02]',
                  ].join(' ')}>
                    {badge ? (
                      <div className="relative group flex flex-col items-center">
                        <img src={badge.icon} alt={badge.name} className="w-8 h-8" />
                        <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[160px] rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-left opacity-0 group-hover:opacity-100 transition-opacity z-50">
                          <div className="text-white text-xs font-black mb-0.5">{badge.name}</div>
                          <div className="text-gray-400 text-[11px] leading-snug">{badge.description}</div>
                        </div>
                      </div>
                    ) : (
                      <span className="text-label">slot {slot + 1}</span>
                    )}
                  </div>
                )
              })}
            </div>

            {unlockedBadgeIds.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-2">🔒</div>
                <p className="text-gray-600 text-sm">No badges yet — keep playing</p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {BADGES.filter(badge => unlockedBadgeIds.includes(badge.id)).map(badge => {
                  const isEquipped = equippedBadges.includes(badge.id)
                  return (
                    <button
                      key={badge.id}
                      onClick={() => equipItem('badge', badge.id)}
                      className={[
                        'relative group rounded-xl p-2.5 border transition-all cursor-pointer hover:brightness-110',
                        isEquipped ? 'ring-2 ring-orange-500 ring-offset-2 ring-offset-black' : '',
                        badge.bgClass,
                        badge.borderClass,
                      ].join(' ')}
                    >
                      <img src={badge.icon} alt={badge.name} className="w-8 h-8" />
                      {/* Tooltip */}
                      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[180px] rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-left opacity-0 group-hover:opacity-100 transition-opacity z-50">
                        <div className="text-white text-xs font-black mb-0.5">{badge.name}</div>
                        <div className="text-gray-400 text-[11px] leading-snug">{badge.description}</div>
                        {isEquipped && <div className="text-orange-400 text-[10px] font-bold mt-1">✓ equipped</div>}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Emotes */}
          <div className="card-surface p-6">
            <h2 className="font-display text-2xl text-white tracking-wider leading-none mb-1">Emotes</h2>
            <p className="text-gray-500 text-xs mb-5">Send a quick message after a game. Equip one to use in matches.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {EMOTES.map(emote => {
                const unlocked = unlockedEmoteIds.includes(emote.id)
                const isEquipped = equippedEmote === emote.id

                return (
                  <button
                    key={emote.id}
                    disabled={!unlocked}
                    onClick={() => unlocked && equipItem('emote', emote.id)}
                    className={[
                      'relative rounded-xl p-4 text-left border transition-all',
                      unlocked
                        ? 'card-surface cursor-pointer hover:border-orange-500/50'
                        : 'bg-white/[0.02] border-white/5 cursor-default opacity-40',
                      isEquipped
                        ? 'ring-2 ring-orange-500 ring-offset-2 ring-offset-black border-orange-500/50'
                        : '',
                    ].join(' ')}
                  >
                    {isEquipped && (
                      <span className="absolute top-2 right-2 text-[9px] font-bold text-orange-400 uppercase tracking-wider">
                        Equipped
                      </span>
                    )}
                    {!unlocked && (
                      <span className="absolute top-2 right-2 text-[10px] text-gray-600">
                        locked
                      </span>
                    )}
                    <div className="text-orange-400 font-black text-lg mb-1">{emote.label}</div>
                    <div className={`text-sm font-semibold ${unlocked ? 'text-white' : 'text-gray-500'}`}>
                      {emote.text}
                    </div>
                    {!unlocked && (
                      <div className="text-label mt-1">
                        {emote.winsRequired} wins required
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Milestones */}
          <div className="card-surface p-6">
            <h2 className="font-display text-2xl text-white tracking-wider leading-none mb-1">Milestones</h2>
            <p className="text-gray-500 text-xs mb-5">Track your progress across key achievements.</p>
            <div className="space-y-2">
              {MILESTONES.map(milestone => {
                const unlocked = unlockedMilestoneIds.includes(milestone.id)

                let req = ''
                if (milestone.winsRequired) req = `${milestone.winsRequired} win${milestone.winsRequired > 1 ? 's' : ''}`
                else if (milestone.gamesRequired) req = `${milestone.gamesRequired} game${milestone.gamesRequired > 1 ? 's' : ''} played`
                else if (milestone.streakRequired) req = `${milestone.streakRequired}-win streak`

                return (
                  <div
                    key={milestone.id}
                    className={[
                      'flex items-center justify-between rounded-xl px-4 py-3 border transition-all',
                      unlocked
                        ? 'bg-white/[0.04] border-white/10'
                        : 'bg-white/[0.02] border-white/5 opacity-50',
                    ].join(' ')}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold border flex-shrink-0 ${
                        unlocked
                          ? 'bg-green-500/20 border-green-500 text-green-400'
                          : 'bg-white/5 border-white/10 text-gray-600'
                      }`}>
                        {unlocked ? '✓' : '✗'}
                      </span>
                      <div>
                        <div className={`text-sm font-bold ${unlocked ? 'text-white' : 'text-gray-500'}`}>
                          {milestone.name}
                        </div>
                        <div className="text-xs text-gray-500">{milestone.description}</div>
                      </div>
                    </div>
                    {!unlocked && req && (
                      <div className="text-label whitespace-nowrap ml-4 shrink-0">
                        {req}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* CTA */}
          <div className="text-center pb-6">
            <Link href="/lobby" className="btn-primary">
              Play Now
            </Link>
          </div>

        </div>
      </div>
    </div>
  )
}
