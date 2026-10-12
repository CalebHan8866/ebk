'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BADGES, EMOTES, MILESTONES } from '@/lib/accessories'

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
    if (!res.ok) {
      // revert on failure
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
  if (!user) return null

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
            <div className="grid grid-cols-3 sm:grid-cols-7 gap-3 text-center">
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
          </div>
        </div>

        {/* Badges */}
        <div className="bg-[#101010] rounded-2xl p-6">
          <div className="flex items-baseline justify-between mb-1">
            <h2 className="font-display text-xl text-white tracking-wider">Badges</h2>
            <span className="text-gray-600 text-xs">{unlockedBadgeIds.length} / {BADGES.length} unlocked</span>
          </div>
          <p className="text-gray-500 text-xs mb-4">Unlock badges by hitting milestones. Tap to equip up to 3.</p>

          {/* Equipped badge slots */}
          <div className="flex gap-2 mb-5">
            {[0, 1, 2].map(slot => {
              const badgeId = equippedBadges[slot]
              const badge = badgeId ? BADGES.find(b => b.id === badgeId) : null
              return (
                <div key={slot} className={[
                  'flex-1 rounded-xl border-2 border-dashed h-16 flex flex-col items-center justify-center transition-all',
                  badge ? `${badge.bgClass} ${badge.borderClass} border-solid` : 'border-gray-800 bg-[#0A0A0A]',
                ].join(' ')}>
                  {badge ? (
                    <>
                      <span className="text-xl leading-none">{badge.icon}</span>
                      <span className={`text-[10px] font-black mt-1 ${badge.textClass}`}>{badge.label}</span>
                    </>
                  ) : (
                    <span className="text-gray-700 text-xs">slot {slot + 1}</span>
                  )}
                </div>
              )
            })}
          </div>

          {unlockedBadgeIds.length === 0 ? (
            <p className="text-gray-600 text-sm text-center py-4">Play games to unlock badges</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {BADGES.filter(badge => unlockedBadgeIds.includes(badge.id)).map(badge => {
                const isEquipped = equippedBadges.includes(badge.id)
                return (
                  <button
                    key={badge.id}
                    onClick={() => equipItem('badge', badge.id)}
                    className={[
                      'relative rounded-xl p-3 text-left border transition-all cursor-pointer hover:brightness-110',
                      isEquipped ? 'ring-2 ring-orange-500 ring-offset-2 ring-offset-[#101010]' : '',
                      badge.bgClass,
                      badge.borderClass,
                    ].join(' ')}
                  >
                    {isEquipped && (
                      <span className="absolute top-1.5 right-2 text-[9px] font-bold text-orange-400 uppercase tracking-wider">
                        ✓ on
                      </span>
                    )}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl leading-none">{badge.icon}</span>
                      <span className={[
                        'text-[11px] font-black tracking-wider px-1.5 py-0.5 rounded border',
                        badge.bgClass, badge.textClass, badge.borderClass,
                      ].join(' ')}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-white">{badge.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{badge.description}</div>
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
                      {unlocked ? 'V' : 'X'}
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
