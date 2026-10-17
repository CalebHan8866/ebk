'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BADGES, EMOTES, MILESTONES } from '@/lib/accessories'
import { useAuth } from '@/context/AuthContext'

type ProfileTab = 'overview' | 'stats' | 'badges' | 'milestones' | 'settings'

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
  const [activeTab, setActiveTab] = useState<ProfileTab>('overview')
  const router = useRouter()
  const { setUser: setAuthUser, user: authUser } = useAuth()

  // Settings tab state
  const [newUsername, setNewUsername] = useState('')
  const [usernameMsg, setUsernameMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [usernameLoading, setUsernameLoading] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [passwordLoading, setPasswordLoading] = useState(false)

  const [deletePassword, setDeletePassword] = useState('')
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteMsg, setDeleteMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [showDeleteForm, setShowDeleteForm] = useState(false)

  async function handleUsernameChange(e: React.FormEvent) {
    e.preventDefault()
    if (!newUsername.trim()) return
    setUsernameLoading(true)
    setUsernameMsg(null)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setUsernameMsg({ ok: false, text: data.error || 'Failed to update username' })
      } else {
        setUsernameMsg({ ok: true, text: 'Username updated!' })
        setUser(u => u ? { ...u, username: data.user.username } : u)
        if (authUser) setAuthUser({ ...authUser, username: data.user.username })
        setNewUsername('')
      }
    } catch {
      setUsernameMsg({ ok: false, text: 'Something went wrong' })
    } finally {
      setUsernameLoading(false)
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ ok: false, text: 'New passwords do not match' })
      return
    }
    setPasswordLoading(true)
    setPasswordMsg(null)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPasswordMsg({ ok: false, text: data.error || 'Failed to change password' })
      } else {
        setPasswordMsg({ ok: true, text: 'Password changed successfully.' })
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      }
    } catch {
      setPasswordMsg({ ok: false, text: 'Something went wrong' })
    } finally {
      setPasswordLoading(false)
    }
  }

  async function handleDeleteAccount(e: React.FormEvent) {
    e.preventDefault()
    if (deleteConfirmText !== 'DELETE') {
      setDeleteMsg({ ok: false, text: 'Type DELETE to confirm' })
      return
    }
    setDeleteLoading(true)
    setDeleteMsg(null)
    try {
      const res = await fetch('/api/profile', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword }),
      })
      if (res.status === 204) {
        setAuthUser(null)
        router.push('/register')
      } else {
        const data = await res.json()
        setDeleteMsg({ ok: false, text: data.error || 'Failed to delete account' })
      }
    } catch {
      setDeleteMsg({ ok: false, text: 'Something went wrong' })
    } finally {
      setDeleteLoading(false)
    }
  }

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
      <div className="min-h-screen py-10 px-4 animate-fade-in">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="flex items-center justify-between mb-8">
            <div className="space-y-2">
              <div className="h-10 w-40 rounded-xl bg-white/[0.07] animate-pulse" />
              <div className="h-3 w-28 rounded bg-white/[0.04] animate-pulse" />
            </div>
            <div className="h-9 w-20 rounded-xl bg-white/[0.06] animate-pulse" />
          </div>
          <div className="profile-hero p-8">
            <div className="flex items-center gap-6">
              <div className="w-24 h-24 rounded-full bg-white/[0.08] animate-pulse shrink-0" />
              <div className="flex-1 space-y-3">
                <div className="h-8 w-48 rounded-xl bg-white/[0.08] animate-pulse" />
                <div className="h-3 w-32 rounded bg-white/[0.05] animate-pulse" />
              </div>
              <div className="text-center space-y-2 shrink-0">
                <div className="h-10 w-20 rounded-xl bg-white/[0.08] animate-pulse" />
                <div className="h-3 w-12 rounded bg-white/[0.04] animate-pulse" />
              </div>
            </div>
          </div>
          <div className="card-stat p-6 space-y-4">
            <div className="h-3 w-32 rounded bg-white/[0.05] animate-pulse" />
            <div className="grid grid-cols-3 gap-3">
              {[0,1,2].map(i => <div key={i} className="rounded-xl h-20 bg-white/[0.04] animate-pulse" />)}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[0,1,2].map(i => <div key={i} className="rounded-xl h-16 bg-white/[0.03] animate-pulse" />)}
            </div>
            <div className="h-4 w-full rounded-full bg-white/[0.04] animate-pulse" />
          </div>
          <div className="card-surface p-6 space-y-4">
            <div className="h-6 w-24 rounded bg-white/[0.07] animate-pulse" />
            <div className="flex gap-3">
              {[0,1,2].map(i => <div key={i} className="flex-1 h-20 rounded-xl bg-white/[0.04] animate-pulse" />)}
            </div>
          </div>
        </div>
      </div>
    )
  }
  if (!user) { router.push('/login'); return null }

  const total = user.wins + user.losses + user.draws
  const winPct = total > 0 ? ((user.wins / total) * 100).toFixed(1) : '0.0'
  const winPctNum = total > 0 ? (user.wins / total) * 100 : 0

  let unlockedBadgeIds: string[] = []
  let unlockedEmoteIds: string[] = []
  let unlockedMilestoneIds: string[] = []
  try { unlockedBadgeIds = JSON.parse(user.unlockedBadges) } catch { unlockedBadgeIds = [] }
  try { unlockedEmoteIds = JSON.parse(user.unlockedEmotes) } catch { unlockedEmoteIds = [] }
  try { unlockedMilestoneIds = JSON.parse(user.unlockedMilestones) } catch { unlockedMilestoneIds = [] }

  return (
    <div className="min-h-screen py-10 px-4 animate-fade-in">
      <div className="max-w-3xl mx-auto">

        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-5xl text-orange-500 leading-none tracking-wide">PROFILE</h1>
            <p className="text-gray-400 text-[11px] tracking-[0.18em] uppercase mt-1.5">
              Since {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            </p>
          </div>
          <Link href="/lobby" className="btn-secondary py-2 px-4 text-xs">← Lobby</Link>
        </div>

        {/* Tab nav */}
        <div className="flex gap-1 mb-7 bg-white/[0.03] border border-white/[0.06] rounded-xl p-1">
          {([
            ['overview',   'Overview'],
            ['stats',      'Stats'],
            ['badges',     'Badges'],
            ['milestones', 'Milestones'],
            ['settings',   'Settings'],
          ] as [ProfileTab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                activeTab === key
                  ? 'bg-orange-600 text-white shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-6">

          {/* ── Always-visible identity hero ── */}
          <div className="profile-hero p-5 sm:p-8">
            {/* Mobile: avatar centered on top, info below. sm+: row layout */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
              {/* Avatar + win rate — side by side on mobile */}
              <div className="flex items-center gap-4 sm:contents">
                <div className={`w-20 h-20 sm:w-24 sm:h-24 bg-orange-600 rounded-full flex items-center justify-center shrink-0 shadow-xl shadow-orange-900/50 ${
                  user.winStreak >= 5 ? 'avatar-hot' : user.winStreak >= 2 ? 'avatar-win' : ''
                }`}>
                  <span className="font-display text-4xl sm:text-5xl text-white leading-none">
                    {user.username[0].toUpperCase()}
                  </span>
                </div>
                {/* Win% — visible beside avatar on mobile, far right on sm+ */}
                <div className="text-center sm:hidden shrink-0 ml-auto">
                  <div className="font-display text-4xl text-orange-400 leading-none">{winPct}%</div>
                  <div className="text-label mt-1">Win Rate</div>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-display text-3xl sm:text-4xl text-white leading-none tracking-wider truncate">{user.username.toUpperCase()}</h2>
                <p className="text-label mt-2 truncate">{user.email}</p>
                {user.winStreak >= 2 && (
                  <div className="inline-flex items-center gap-1.5 mt-3 bg-orange-950/50 border border-orange-800/40 rounded-full px-3 py-1">
                    <span className="text-orange-400 text-[11px] font-black tracking-wider uppercase">{user.winStreak} Win Streak</span>
                  </div>
                )}
              </div>
              {/* Win% — hidden on mobile (shown above), visible on sm+ */}
              <div className="hidden sm:block text-center shrink-0">
                <div className="font-display text-4xl text-orange-400 leading-none">{winPct}%</div>
                <div className="text-label mt-1">Win Rate</div>
              </div>
            </div>
          </div>

          {/* ── Overview tab ── */}
          {activeTab === 'overview' && <>

          {/* Career stats — card-stat for maximum number contrast */}
          <div className="card-stat p-6">
            <h3 className="text-label mb-5 tracking-[0.18em]">Career Overview</h3>

            {/* Primary W-L-D trio — big and bold */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="stat-highlight rounded-xl py-4 text-center">
                <div className="font-display text-5xl text-green-400 leading-none">{user.wins}</div>
                <div className="text-label mt-1.5">Wins</div>
              </div>
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl py-4 text-center">
                <div className="font-display text-5xl text-red-400 leading-none">{user.losses}</div>
                <div className="text-label mt-1.5">Losses</div>
              </div>
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl py-4 text-center">
                <div className="font-display text-5xl text-yellow-400 leading-none">{user.draws}</div>
                <div className="text-label mt-1.5">Draws</div>
              </div>
            </div>

            {/* Secondary stats row */}
            <div className="grid grid-cols-3 gap-2 mb-5">
              <div className="text-center py-3 bg-white/[0.02] rounded-xl border border-white/[0.04]">
                <div className="font-display text-3xl text-gray-300 leading-none">{user.gamesPlayed}</div>
                <div className="text-label mt-1">Played</div>
              </div>
              <div className="text-center py-3 bg-white/[0.02] rounded-xl border border-white/[0.04]">
                <div className="font-display text-3xl text-orange-400 leading-none">{user.winStreak}</div>
                <div className="text-label mt-1">Streak</div>
              </div>
              <div className="text-center py-3 bg-white/[0.02] rounded-xl border border-white/[0.04]">
                <div className="font-display text-3xl text-orange-300 leading-none">{user.maxWinStreak}</div>
                <div className="text-label mt-1">Best Streak</div>
              </div>
            </div>

            {/* Win rate progress bar */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-label tracking-[0.14em]">Win Rate</span>
                <span className="text-white text-sm font-black">{winPct}%</span>
              </div>
              <div className="budget-bar">
                <div
                  className="budget-bar-fill"
                  style={{ width: `${winPctNum}%` }}
                />
              </div>
            </div>

            {/* First pick advantage — only if data exists */}
            {user.firstPickGames > 0 && (
              <div className="border-t border-white/[0.06] pt-4 mt-4 flex items-center justify-between">
                <span className="text-label">First Pick Win%</span>
                <div className="text-right">
                  <span className="text-white font-black text-sm">{user.firstPickWins}W / {user.firstPickGames}G</span>
                  <span className="text-gray-400 text-xs ml-2">
                    ({user.firstPickGames > 0 ? ((user.firstPickWins / user.firstPickGames) * 100).toFixed(0) : 0}%)
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* History quick-link */}
          <div className="card-surface p-4 flex items-center justify-between rounded-xl">
            <div>
              <div className="font-black text-white text-sm">Game History</div>
              <div className="text-gray-400 text-xs mt-0.5">See every match result</div>
            </div>
            <Link href="/history" className="text-orange-400 text-sm font-black hover:text-orange-300 transition-colors">View →</Link>
          </div>

          </>}

          {/* ── Stats tab ── */}
          {activeTab === 'stats' && <>
          <div className="card-stat p-6">
            <h3 className="text-label mb-5 tracking-[0.18em]">Performance Breakdown</h3>

            {/* Win / Loss / Draw trio */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="stat-highlight rounded-xl py-4 text-center">
                <div className="font-display text-5xl text-green-400 leading-none">{user.wins}</div>
                <div className="text-label mt-1.5">Wins</div>
              </div>
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl py-4 text-center">
                <div className="font-display text-5xl text-red-400 leading-none">{user.losses}</div>
                <div className="text-label mt-1.5">Losses</div>
              </div>
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl py-4 text-center">
                <div className="font-display text-5xl text-yellow-400 leading-none">{user.draws}</div>
                <div className="text-label mt-1.5">Draws</div>
              </div>
            </div>

            {/* Win rate bar */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-label tracking-[0.14em]">Win Rate</span>
                <span className="text-white text-sm font-black">{winPct}%</span>
              </div>
              <div className="budget-bar">
                <div className="budget-bar-fill" style={{ width: `${winPctNum}%` }} />
              </div>
            </div>

            {/* Advanced grid */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-4 text-center">
                <div className="font-display text-3xl text-orange-400 leading-none">{user.gamesPlayed}</div>
                <div className="text-label mt-1">Games Played</div>
              </div>
              <div className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-4 text-center">
                <div className="font-display text-3xl text-orange-300 leading-none">{user.maxWinStreak}</div>
                <div className="text-label mt-1">Best Streak</div>
              </div>
              <div className={`bg-white/[0.03] border border-white/[0.05] rounded-xl p-4 text-center ${user.winStreak >= 3 ? 'border-orange-700/30 bg-orange-950/20' : ''}`}>
                <div className={`font-display text-3xl leading-none ${user.winStreak >= 3 ? 'text-orange-400' : 'text-gray-400'}`}>
                  {user.winStreak >= 3 ? `🔥 ${user.winStreak}` : user.winStreak}
                </div>
                <div className="text-label mt-1">Current Streak</div>
              </div>
              {user.firstPickGames > 0 ? (
                <div className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-4 text-center">
                  <div className="font-display text-3xl text-blue-400 leading-none">
                    {((user.firstPickWins / user.firstPickGames) * 100).toFixed(0)}%
                  </div>
                  <div className="text-label mt-1">1st Pick Win%</div>
                </div>
              ) : (
                <div className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-4 text-center">
                  <div className="font-display text-3xl text-gray-400 leading-none">—</div>
                  <div className="text-label mt-1">1st Pick Win%</div>
                </div>
              )}
            </div>
          </div>

          {/* Performance insights */}
          <div className="card-surface p-6">
            <h3 className="font-display text-xl text-white tracking-wider leading-none mb-4">Insights</h3>
            <div className="space-y-3">
              {/* Games to win ratio */}
              <div className="flex items-center justify-between py-2.5 border-b border-white/[0.05]">
                <span className="text-gray-400 text-sm">Win percentage</span>
                <span className={`font-black text-sm tabular-nums ${winPctNum >= 60 ? 'text-green-400' : winPctNum >= 45 ? 'text-white' : 'text-red-400'}`}>
                  {total >= 5 ? `${winPct}%` : 'Need 5+ games'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5 border-b border-white/[0.05]">
                <span className="text-gray-400 text-sm">Losses per 10 games</span>
                <span className="font-black text-sm tabular-nums text-white">
                  {total > 0 ? ((user.losses / total) * 10).toFixed(1) : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5 border-b border-white/[0.05]">
                <span className="text-gray-400 text-sm">Draw rate</span>
                <span className="font-black text-sm tabular-nums text-yellow-400">
                  {total > 0 ? `${((user.draws / total) * 100).toFixed(1)}%` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-gray-400 text-sm">Best streak ever</span>
                <span className="font-black text-sm tabular-nums text-orange-400">
                  {user.maxWinStreak > 0 ? `${user.maxWinStreak} wins` : '—'}
                </span>
              </div>
            </div>

            {/* Tier badge */}
            <div className="mt-5 pt-4 border-t border-white/[0.06]">
              <div className="text-label mb-2">Tier</div>
              {(() => {
                const w = user.wins
                if (w >= 100) return <div className="inline-flex items-center gap-2 bg-yellow-950 border border-yellow-700/50 rounded-full px-4 py-1.5"><span className="text-yellow-400 text-sm font-black">👑 Legend · {w}W</span></div>
                if (w >= 50)  return <div className="inline-flex items-center gap-2 bg-purple-950 border border-purple-700/50 rounded-full px-4 py-1.5"><span className="text-purple-400 text-sm font-black">💎 Elite · {w}W</span></div>
                if (w >= 25)  return <div className="inline-flex items-center gap-2 bg-blue-950 border border-blue-700/50 rounded-full px-4 py-1.5"><span className="text-blue-400 text-sm font-black">⚡ Veteran · {w}W</span></div>
                if (w >= 10)  return <div className="inline-flex items-center gap-2 bg-green-950 border border-green-800/50 rounded-full px-4 py-1.5"><span className="text-green-400 text-sm font-black">🏀 Baller · {w}W</span></div>
                return <div className="inline-flex items-center gap-2 bg-white/[0.04] border border-white/10 rounded-full px-4 py-1.5"><span className="text-gray-400 text-sm font-black">🌱 Rookie · {w}W</span></div>
              })()}
            </div>
          </div>

          <div className="text-center pb-2">
            <Link href="/history" className="text-gray-400 text-sm hover:text-orange-400 transition-colors">View game history →</Link>
          </div>
          </>}

          {/* ── Badges tab ── */}
          {activeTab === 'badges' && <>
          {/* Badges */}
          <div className="card-surface p-6">
            <h2 className="font-display text-2xl text-white tracking-wider leading-none mb-1">Badges</h2>
            <p className="text-gray-400 text-xs mb-5">Badges are a mystery — keep playing to discover them. Tap to equip up to 3.</p>

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
                        <img src={badge.icon} alt={badge.name} className="w-8 h-8" loading="lazy" />
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
              <div className="empty-state">
                <div className="empty-state-icon">🏅</div>
                <div className="empty-state-title">No badges unlocked yet</div>
                <div className="empty-state-body">Win games to discover hidden badges</div>
                <Link href="/lobby" className="btn-primary py-2.5 px-6 text-xs mt-4">Play to Unlock</Link>
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

          {/* Emotes — still in badges tab */}
          <div className="card-surface p-6">
            <h2 className="font-display text-2xl text-white tracking-wider leading-none mb-1">Emotes</h2>
            <p className="text-gray-400 text-xs mb-5">Send a quick message after a game. Equip one to use in matches.</p>
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
                      <span className="absolute top-2 right-2 text-[10px] text-gray-400">
                        locked
                      </span>
                    )}
                    <div className="text-orange-400 font-black text-lg mb-1">{emote.label}</div>
                    <div className={`text-sm font-semibold ${unlocked ? 'text-white' : 'text-gray-400'}`}>
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

          </>}

          {/* ── Milestones tab ── */}
          {activeTab === 'milestones' && <>
          {/* Milestones */}
          <div className="card-surface p-6">
            <h2 className="font-display text-2xl text-white tracking-wider leading-none mb-1">Milestones</h2>
            <p className="text-gray-400 text-xs mb-5">Track your progress across key achievements.</p>
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
                    className={`milestone-row ${unlocked ? 'unlocked' : 'locked'}`}
                  >
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black border flex-shrink-0 transition-all ${
                      unlocked
                        ? 'bg-green-500/20 border-green-500/60 text-green-400'
                        : 'bg-white/[0.03] border-white/10 text-gray-700'
                    }`}>
                      {unlocked ? '✓' : ''}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-bold ${unlocked ? 'text-white' : 'text-gray-400'}`}>
                        {milestone.name}
                      </div>
                      <div className="text-xs text-gray-400 truncate">{milestone.description}</div>
                    </div>
                    {!unlocked && req && (
                      <div className="text-label whitespace-nowrap shrink-0">
                        {req}
                      </div>
                    )}
                    {unlocked && (
                      <div className="text-[10px] font-black text-green-400/60 uppercase tracking-wider shrink-0">Done</div>
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
          </>}

          {/* ── Settings tab ── */}
          {activeTab === 'settings' && <>

          {/* Change username */}
          <div className="card-surface p-6">
            <h2 className="font-display text-2xl text-white tracking-wider leading-none mb-1">Change Username</h2>
            <p className="text-gray-400 text-xs mb-5">Letters, numbers, and underscores only · 3–20 characters</p>
            <form onSubmit={handleUsernameChange} className="space-y-4">
              <div>
                <label htmlFor="new-username" className="block text-gray-400 text-xs font-semibold tracking-wide uppercase mb-2">
                  New Username
                </label>
                <input
                  id="new-username"
                  type="text"
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  minLength={3}
                  maxLength={20}
                  placeholder={user?.username}
                  className="input-field"
                />
              </div>
              {usernameMsg && (
                <div className={`rounded-xl px-4 py-3 text-sm ${usernameMsg.ok ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>
                  {usernameMsg.text}
                </div>
              )}
              <button
                type="submit"
                disabled={usernameLoading || !newUsername.trim()}
                className="btn-primary w-full text-sm uppercase disabled:opacity-50"
              >
                {usernameLoading ? 'Saving…' : 'Update Username'}
              </button>
            </form>
          </div>

          {/* Change password */}
          <div className="card-surface p-6">
            <h2 className="font-display text-2xl text-white tracking-wider leading-none mb-1">Change Password</h2>
            <p className="text-gray-400 text-xs mb-5">Minimum 6 characters</p>
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label htmlFor="current-password" className="block text-gray-400 text-xs font-semibold tracking-wide uppercase mb-2">Current Password</label>
                <input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  required
                  className="input-field"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label htmlFor="new-password" className="block text-gray-400 text-xs font-semibold tracking-wide uppercase mb-2">New Password</label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  className="input-field"
                  placeholder="Min 6 characters"
                />
              </div>
              <div>
                <label htmlFor="confirm-password" className="block text-gray-400 text-xs font-semibold tracking-wide uppercase mb-2">Confirm New Password</label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="input-field"
                  placeholder="Repeat new password"
                />
              </div>
              {passwordMsg && (
                <div className={`rounded-xl px-4 py-3 text-sm ${passwordMsg.ok ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>
                  {passwordMsg.text}
                </div>
              )}
              <button
                type="submit"
                disabled={passwordLoading || !currentPassword || !newPassword || !confirmPassword}
                className="btn-primary w-full text-sm uppercase disabled:opacity-50"
              >
                {passwordLoading ? 'Saving…' : 'Change Password'}
              </button>
            </form>
          </div>

          {/* Delete account */}
          <div className="card-surface p-6 border border-red-900/30">
            <h2 className="font-display text-2xl text-red-400 tracking-wider leading-none mb-1">Danger Zone</h2>
            <p className="text-gray-400 text-xs mb-5">Permanently delete your account and all game history. This cannot be undone.</p>
            {!showDeleteForm ? (
              <button
                onClick={() => setShowDeleteForm(true)}
                className="w-full py-3 rounded-xl border border-red-800/50 text-red-400 text-sm font-black uppercase tracking-wider hover:bg-red-950/30 transition-colors"
              >
                Delete My Account
              </button>
            ) : (
              <form onSubmit={handleDeleteAccount} className="space-y-4">
                <div>
                  <label htmlFor="delete-password" className="block text-gray-400 text-xs font-semibold tracking-wide uppercase mb-2">Confirm Password</label>
                  <input
                    id="delete-password"
                    type="password"
                    value={deletePassword}
                    onChange={e => setDeletePassword(e.target.value)}
                    required
                    className="input-field border-red-900/40 focus:border-red-700/60"
                    placeholder="Your current password"
                  />
                </div>
                <div>
                  <label htmlFor="delete-confirm-text" className="block text-gray-400 text-xs font-semibold tracking-wide uppercase mb-2">
                    Type <span className="text-red-400 font-black">DELETE</span> to confirm
                  </label>
                  <input
                    id="delete-confirm-text"
                    type="text"
                    value={deleteConfirmText}
                    onChange={e => setDeleteConfirmText(e.target.value)}
                    className="input-field border-red-900/40 focus:border-red-700/60"
                    placeholder="DELETE"
                  />
                </div>
                {deleteMsg && (
                  <div className={`rounded-xl px-4 py-3 text-sm ${deleteMsg.ok ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>
                    {deleteMsg.text}
                  </div>
                )}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setShowDeleteForm(false); setDeletePassword(''); setDeleteConfirmText(''); setDeleteMsg(null) }}
                    className="btn-secondary flex-1 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={deleteLoading || deleteConfirmText !== 'DELETE' || !deletePassword}
                    className="flex-1 py-3 rounded-xl bg-red-700 hover:bg-red-600 text-white text-sm font-black uppercase tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {deleteLoading ? 'Deleting…' : 'Permanently Delete'}
                  </button>
                </div>
              </form>
            )}
          </div>

          </>}

        </div>
      </div>
    </div>
  )
}
