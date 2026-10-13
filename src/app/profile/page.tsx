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
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
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
    <div className="min-h-screen bg-[#0A0A0A] py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="bg-[#111827] rounded-2xl p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-orange-600 rounded-full flex items-center justify-center text-2xl font-black text-white">
              {user.username[0].toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">{user.username}</h1>
              <p className="text-gray-400 text-sm">
                Member since {new Date(user.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Stats row */}
          <div className="bg-[#0A0A0A] rounded-xl p-5">
            <h2 className="text-gray-400 text-xs uppercase tracking-widest mb-4">Career Stats</h2>
            <div className="grid grid-cols-3 sm:grid-cols-7 gap-3 text-center mb-4">
              <div>
                <div className="text-3xl font-black text-green-400">{user.wins}</div>
                <div className="text-gray-500 text-xs mt-0.5">W</div>
              </div>
              <div>
                <div className="text-3xl font-black text-red-400">{user.losses}</div>
                <div className="text-gray-500 text-xs mt-0.5">L</div>
              </div>
              <div>
                <div className="text-3xl font-black text-yellow-400">{user.draws}</div>
                <div className="text-gray-500 text-xs mt-0.5">D</div>
              </div>
              <div>
                <div className="text-3xl font-black text-gray-300">{user.gamesPlayed}</div>
                <div className="text-gray-500 text-xs mt-0.5">Games</div>
              </div>
              <div>
                <div className="text-3xl font-black text-orange-400">{user.winStreak}</div>
                <div className="text-gray-500 text-xs mt-0.5">Streak</div>
              </div>
              <div>
                <div className="text-3xl font-black text-orange-300">{user.maxWinStreak}</div>
                <div className="text-gray-500 text-xs mt-0.5">Best</div>
              </div>
              <div>
                <div className="text-3xl font-black text-blue-400">{winPct}%</div>
                <div className="text-gray-500 text-xs mt-0.5">Win%</div>
              </div>
            </div>
            {user.firstPickGames > 0 && (
              <div className="border-t border-white/5 pt-3 mt-1">
                <div className="flex items-center justify-between">
                  <div className="text-gray-500 text-xs uppercase tracking-wide">First Pick Advantage</div>
                  <div className="text-right">
                    <span className="text-white font-black text-sm">{user.firstPickWins}W / {user.firstPickGames}G</span>
                    <span className="text-gray-400 text-xs ml-2">({user.firstPickGames > 0 ? ((user.firstPickWins / user.firstPickGames) * 100).toFixed(0) : 0}% win rate when picking first)</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Badges */}
        <div className="bg-[#101010] rounded-2xl p-6">
          <h2 className="font-display text-xl text-white tracking-wider mb-1">Badges</h2>
          <p className="text-gray-500 text-xs mb-4">Badges are a mystery — keep playing to discover them. Tap to equip up to 3.</p>

          {/* Equipped badge slots */}
          <div className="flex gap-2 mb-5">
            {[0, 1, 2].map(slot => {
              const badgeId = equippedBadges[slot]
              const badge = badgeId ? BADGES.find(b => b.id === badgeId) : null
              return (
                <div key={slot} className={[
                  'flex-1 rounded-xl border-2 border-dashed h-20 flex flex-col items-center justify-center transition-all',
                  badge ? `${badge.bgClass} ${badge.borderClass} border-solid` : 'border-gray-800 bg-[#0A0A0A]',
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
                    <span className="text-gray-700 text-xs">slot {slot + 1}</span>
                  )}
                </div>
              )
            })}
          </div>

          {unlockedBadgeIds.length === 0 ? (
            <div className="text-center py-6">
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
                      isEquipped ? 'ring-2 ring-orange-500 ring-offset-2 ring-offset-[#101010]' : '',
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
        <div className="bg-[#101010] rounded-2xl p-6">
          <h2 className="font-display text-xl text-white tracking-wider mb-1">Emotes</h2>
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
                      ? 'bg-[#1a1a1a] border-gray-700 cursor-pointer hover:border-orange-500/50'
                      : 'bg-[#111111] border-gray-800 cursor-default opacity-40',
                    isEquipped
                      ? 'ring-2 ring-orange-500 ring-offset-2 ring-offset-[#101010] border-orange-500/50'
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
                      [locked]
                    </span>
                  )}
                  <div className="text-orange-400 font-black text-lg mb-1">{emote.label}</div>
                  <div className={`text-sm font-semibold ${unlocked ? 'text-white' : 'text-gray-500'}`}>
                    {emote.text}
                  </div>
                  {!unlocked && (
                    <div className="text-[10px] text-gray-600 mt-1">
                      {emote.winsRequired} wins required
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Milestones */}
        <div className="bg-[#101010] rounded-2xl p-6">
          <h2 className="font-display text-xl text-white tracking-wider mb-1">Milestones</h2>
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
                    'flex items-center justify-between rounded-lg px-4 py-3 border',
                    unlocked
                      ? 'bg-[#1a1a1a] border-gray-700'
                      : 'bg-[#111111] border-gray-800 opacity-50',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold border flex-shrink-0 ${
                      unlocked
                        ? 'bg-green-500/20 border-green-500 text-green-400'
                        : 'bg-gray-800 border-gray-700 text-gray-600'
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
                    <div className="text-[10px] text-gray-600 whitespace-nowrap ml-4">
                      {req}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="text-center pb-4">
          <Link href="/lobby" className="bg-orange-600 hover:bg-orange-700 text-white font-black py-3 px-8 rounded-xl inline-block transition-colors">
            Play Now
          </Link>
        </div>

      </div>
    </div>
  )
}
