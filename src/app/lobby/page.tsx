'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getSocket } from '@/lib/socket'
import { useAuth } from '@/context/AuthContext'
import { BADGES } from '@/lib/accessories'
import { type TeamMode, type SeriesLength, type Difficulty, type StatCategory, STAT_CATEGORY_LABELS, STAT_CATEGORY_DESC, ALL_STAT_CATEGORIES } from '@/types/game'

type OnlineState = 'idle' | 'listing' | 'found'

interface UserRecord { wins: number; losses: number; draws: number }

interface GameListing {
  code: string
  hostName: string
  hostRecord: UserRecord
  hostBadge: string
  hostStreak: number
  teamMode: TeamMode
  series: SeriesLength
  statCategory: StatCategory
}

interface MatchInfo {
  code: string
  opponentName: string
  opponentRecord: UserRecord
  opponentBadge: string
  myBadge: string
  myStreak: number
  opponentStreak: number
  grudgeMatch: boolean
  proposedTeamMode: TeamMode
  proposedSeries: SeriesLength
  proposedStatCategory?: StatCategory
  isHost: boolean
}

// ── Small reusable components ────────────────────────────────────────────────

function BadgeChip({ badgeId }: { badgeId: string }) {
  const badge = BADGES.find(b => b.id === badgeId)
  if (!badge) return null
  return (
    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${badge.bgClass} ${badge.textClass} ${badge.borderClass}`}>
      {badge.label}
    </span>
  )
}

/** Colored circle with initials — deterministic color per username */
function Avatar({ name, size = 'md', glow = false }: { name: string; size?: 'sm' | 'md' | 'lg' | 'xl'; glow?: boolean }) {
  const palette = ['bg-orange-600', 'bg-blue-600', 'bg-emerald-600', 'bg-violet-600', 'bg-rose-600']
  const glowPalette = [
    'shadow-[0_0_24px_rgba(234,88,12,0.5)]',
    'shadow-[0_0_24px_rgba(37,99,235,0.5)]',
    'shadow-[0_0_24px_rgba(5,150,105,0.5)]',
    'shadow-[0_0_24px_rgba(124,58,237,0.5)]',
    'shadow-[0_0_24px_rgba(225,29,72,0.5)]',
  ]
  const idx = name.charCodeAt(0) % palette.length
  const color = palette[idx]
  const glowClass = glow ? glowPalette[idx] : ''
  const sz = size === 'xl' ? 'w-20 h-20 text-2xl' : size === 'lg' ? 'w-16 h-16 text-lg' : size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 text-xs'
  return (
    <div className={`${sz} ${color} rounded-full flex items-center justify-center font-black text-white shrink-0 select-none transition-shadow ${glowClass}`}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  )
}

// ── Constants ────────────────────────────────────────────────────────────────

const MODE_LABEL: Record<TeamMode, string> = {
  starter5: 'Starter 5',
  bench8: 'Bench 8',
  full12: 'Full 12',
}
const MODE_DESC: Record<TeamMode, string> = {
  starter5: 'Draft 5 players',
  bench8: 'Draft 8 players',
  full12: 'Draft 12 players',
}
function seriesLabel(s: SeriesLength) {
  return s === 1 ? '1 Game' : `Best of ${s}`
}
function winPct(wins: number, losses: number) {
  const total = wins + losses
  return total > 0 ? `${Math.round((wins / total) * 100)}%` : '—'
}

// ── Main component ───────────────────────────────────────────────────────────

export default function LobbyPage() {
  const [mainTab, setMainTab] = useState<'online' | 'friends' | null>(null)
  const { user, loading: authLoading } = useAuth()

  // Socket connection state
  const [socketFailed, setSocketFailed] = useState(false)
  const [socketDisconnected, setSocketDisconnected] = useState(false)

  // Online matchmaking state
  const [onlineState, setOnlineState] = useState<OnlineState>('idle')
  const [listings, setListings] = useState<GameListing[]>([])
  const [listingsLoaded, setListingsLoaded] = useState(false)
  const [myListingCode, setMyListingCode] = useState<string | null>(null)
  const [matchInfo, setMatchInfo] = useState<MatchInfo | null>(null)
  const [matchCode, setMatchCode] = useState('')
  const [hostReady, setHostReady] = useState(false)
  const [guestReady, setGuestReady] = useState(false)
  const [countdown, setCountdown] = useState(60)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const selfDeclinedRef = useRef(false)
  const listingErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Create game options
  const [createTeamMode, setCreateTeamMode] = useState<TeamMode>('starter5')
  const [createSeries, setCreateSeries] = useState<SeriesLength>(1)
  const [createStatCategory, setCreateStatCategory] = useState<StatCategory>('games_played')

  // Play with friends state
  const [friendsTab, setFriendsTab] = useState<'create' | 'join'>('create')
  const [teamMode, setTeamMode] = useState<TeamMode>('starter5')
  const [series, setSeries] = useState<SeriesLength>(1)
  const [difficulty, setDifficulty] = useState<Difficulty>('casual')
  const [statCategory, setStatCategory] = useState<StatCategory>('games_played')
  const [joinCode, setJoinCode] = useState('')
  const [userName, setUserName] = useState(user?.username || '')

  const [error, setError] = useState('')
  const [listingError, setListingError] = useState('')
  const [loading, setLoading] = useState(false)
  const userNameRef = useRef(userName)
  useEffect(() => { userNameRef.current = userName }, [userName])

  const router = useRouter()

  useEffect(() => {
    if (user?.username) setUserName(user.username)
  }, [user])

  // ── Socket lifecycle ───────────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket()

    const handleListingsUpdated = ({ listings: l }: { listings: GameListing[] }) => {
      setListings(l)
      setListingsLoaded(true)
    }

    const handleListingCreated = ({ code }: { code: string }) => {
      setMyListingCode(code)
      setOnlineState('listing')
    }

    const handleListingExpired = () => {
      setOnlineState('idle')
      setMyListingCode(null)
      setListingError('Your game listing expired — no one joined in 10 minutes. Post again to keep looking.')
    }

    const handleListingError = ({ message }: { message: string }) => {
      setListingError(message)
      if (listingErrorTimerRef.current) clearTimeout(listingErrorTimerRef.current)
      listingErrorTimerRef.current = setTimeout(() => setListingError(''), 4000)
    }

    const handleMatchFound = (info: MatchInfo) => {
      setMatchInfo(info)
      setMatchCode(info.code)
      setMyListingCode(null)
      setOnlineState('found')
      setCountdown(60)
      setHostReady(false)
      setGuestReady(false)
      if (countdownRef.current) clearInterval(countdownRef.current)
      countdownRef.current = setInterval(() => {
        setCountdown(c => {
          if (c <= 1) { clearInterval(countdownRef.current!); return 0 }
          return c - 1
        })
      }, 1000)
    }

    const handleReadyUpdate = ({ hostReady: hr, guestReady: gr }: { hostReady: boolean; guestReady: boolean }) => {
      setHostReady(hr)
      setGuestReady(gr)
    }

    const handleDraftStarted = ({ room }: { room: { code: string; hostSocketId: string } }) => {
      if (countdownRef.current) clearInterval(countdownRef.current)
      const s = getSocket()
      const role = room.hostSocketId === s.id ? 'host' : 'guest'
      const name = user?.username || userNameRef.current || 'Player'
      router.push(`/game/${room.code}?role=${role}&name=${encodeURIComponent(name)}`)
    }

    const handleMatchCancelled = ({ reason }: { reason: string }) => {
      if (countdownRef.current) clearInterval(countdownRef.current)
      setOnlineState('idle')
      setMatchInfo(null)
      setMyListingCode(null)
      if (!selfDeclinedRef.current) setError(reason)
      selfDeclinedRef.current = false
    }

    const handleConnectError = () => {
      setSocketFailed(true)
    }
    const handleDisconnect = () => {
      setSocketDisconnected(true)
    }
    const handleReconnect = () => {
      setSocketFailed(false)
      setSocketDisconnected(false)
      socket.emit('get-listings')
    }

    socket.on('connect', handleReconnect)
    socket.on('disconnect', handleDisconnect)
    socket.on('connect_error', handleConnectError)
    socket.on('listings-updated', handleListingsUpdated)
    socket.on('listing-created', handleListingCreated)
    socket.on('listing-expired', handleListingExpired)
    socket.on('listing-error', handleListingError)
    socket.on('match-found', handleMatchFound)
    socket.on('ready-update', handleReadyUpdate)
    socket.on('draft-started', handleDraftStarted)
    socket.on('match-cancelled', handleMatchCancelled)
    socket.emit('get-listings')

    return () => {
      socket.off('connect', handleReconnect)
      socket.off('disconnect', handleDisconnect)
      socket.off('connect_error', handleConnectError)
      socket.off('listings-updated', handleListingsUpdated)
      socket.off('listing-created', handleListingCreated)
      socket.off('listing-expired', handleListingExpired)
      socket.off('listing-error', handleListingError)
      socket.off('match-found', handleMatchFound)
      socket.off('ready-update', handleReadyUpdate)
      socket.off('draft-started', handleDraftStarted)
      socket.off('match-cancelled', handleMatchCancelled)
      if (countdownRef.current) clearInterval(countdownRef.current)
      if (listingErrorTimerRef.current) clearTimeout(listingErrorTimerRef.current)
    }
  }, [router, user])

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handlePostGame() {
    if (!user) return
    setListingError('')
    getSocket().emit('create-listing', {
      userName: user.username,
      teamMode: createTeamMode,
      series: createSeries,
      statCategory: createStatCategory,
    })
  }

  function handleCancelListing() {
    if (!myListingCode) return
    getSocket().emit('cancel-listing', { code: myListingCode })
    setMyListingCode(null)
    setOnlineState('idle')
  }

  function handleJoinListing(code: string) {
    if (!user) return
    setListingError('')
    getSocket().emit('join-listing', { code, userName: user.username })
  }

  function handleAccept() {
    getSocket().emit('confirm-ready', { code: matchCode })
  }

  function handleDecline() {
    selfDeclinedRef.current = true
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null }
    getSocket().emit('decline-match', { code: matchCode })
    setOnlineState('idle')
    setMatchInfo(null)
  }

  function handleCreate() {
    if (!userName.trim()) { setError('Enter your name first'); return }
    setError('')
    setLoading(true)
    const socket = getSocket()
    const onCreated = ({ room }: { room: { code: string } }) => {
      clearTimeout(timeout)
      socket.off('room-error', onCreateError)
      router.push(`/game/${room.code}?role=host&name=${encodeURIComponent(userName.trim())}`)
    }
    const onCreateError = ({ message }: { message: string }) => {
      clearTimeout(timeout)
      socket.off('room-created', onCreated)
      setError(message)
      setLoading(false)
    }
    const timeout = setTimeout(() => {
      socket.off('room-created', onCreated)
      socket.off('room-error', onCreateError)
      setError('No response from server — try refreshing')
      setLoading(false)
    }, 8000)
    socket.once('room-created', onCreated)
    socket.once('room-error', onCreateError)
    socket.emit('create-room', { teamMode, series, difficulty, statCategory, userName: userName.trim() })
  }

  function handleJoin() {
    if (!joinCode.trim()) { setError('Enter a room code'); return }
    if (!userName.trim()) { setError('Enter your name first'); return }
    setError('')
    setLoading(true)
    const socket = getSocket()
    const onError = ({ message }: { message: string }) => {
      clearTimeout(timeout)
      socket.off('room-error', onError)
      socket.off('draft-started', onJoinSuccess)
      setError(message)
      setLoading(false)
    }
    const onJoinSuccess = () => {
      clearTimeout(timeout)
      socket.off('room-error', onError)
    }
    const timeout = setTimeout(() => {
      socket.off('room-error', onError)
      socket.off('draft-started', onJoinSuccess)
      setError('No response from server — try refreshing')
      setLoading(false)
    }, 8000)
    socket.once('room-error', onError)
    socket.once('draft-started', onJoinSuccess)
    socket.emit('join-room', { code: joinCode.trim().toUpperCase(), userName: userName.trim() })
  }

  const displayName = user?.username || userName
  const myReady = matchInfo ? (matchInfo.isHost ? hostReady : guestReady) : false
  const oppReady = matchInfo ? (matchInfo.isHost ? guestReady : hostReady) : false

  // ── MATCH FOUND — full-page takeover ──────────────────────────────────────
  if (onlineState === 'found' && matchInfo) {
    const countdownUrgent = countdown <= 10
    const countdownWarn = countdown > 10 && countdown <= 20
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-10" aria-live="polite" aria-atomic="true">
        <div className="w-full max-w-lg animate-fade-up">

          {matchInfo.grudgeMatch && (
            <div className="mb-4 rounded-xl py-2.5 px-4 text-center border border-red-500/40 bg-red-900/20 shadow-[0_0_20px_rgba(239,68,68,0.1)] animate-scale-in">
              <span className="text-red-400 font-black text-sm tracking-widest uppercase">Grudge Match</span>
              <span className="text-gray-400 text-xs ml-2">You&apos;ve played before</span>
            </div>
          )}

          <div className="card-accent rounded-3xl overflow-hidden shadow-[0_0_60px_rgba(249,115,22,0.08)]">
            {/* Header strip */}
            <div className="px-6 pt-7 pb-5 text-center border-b border-white/[0.06] relative">
              <div className="text-label mb-2 tracking-[0.3em]">Opponent Found</div>
              <div className="font-display leading-none tracking-[0.08em] text-white"
                style={{ fontSize: 'clamp(3.5rem, 14vw, 5rem)' }}>
                MATCH<span className="text-orange-500"> UP</span>
              </div>

              {/* Countdown — prominent ring */}
              <div className="mt-5 flex flex-col items-center gap-2">
                <div className={`relative w-full max-w-[260px] h-2 rounded-full overflow-hidden ${
                  countdownUrgent ? 'bg-red-900/40' : 'bg-white/[0.06]'
                }`}>
                  <div
                    className={`absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ${
                      countdownUrgent ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'
                      : countdownWarn ? 'bg-yellow-500'
                      : 'bg-gradient-to-r from-orange-600 to-orange-400'
                    }`}
                    style={{ width: `${(countdown / 60) * 100}%` }}
                  />
                </div>
                <div className={`font-display text-4xl leading-none tabular-nums ${
                  countdownUrgent ? 'text-red-400 animate-win-glow' : countdownWarn ? 'text-yellow-400' : 'text-white/60'
                }`}>
                  {countdown > 0 ? countdown : '—'}
                </div>
                <div className={`text-[10px] font-black tracking-[0.2em] uppercase ${
                  countdownUrgent ? 'text-red-400/70' : 'text-white/25'
                }`}>
                  {countdown > 0 ? (countdownUrgent ? 'Accept now!' : 'Seconds to accept') : 'Starting…'}
                </div>
              </div>
            </div>

            {/* VS layout — larger avatars + glow */}
            <div className="grid grid-cols-[1fr_56px_1fr] items-center gap-0 px-5 py-7">
              {/* You */}
              <div className={`rounded-2xl px-3 py-5 text-center transition-all duration-300 ${
                myReady
                  ? 'bg-green-500/10 border border-green-500/30 shadow-[0_0_24px_rgba(34,197,94,0.08)]'
                  : 'bg-white/[0.025] border border-white/[0.06]'
              }`}>
                <div className="flex justify-center mb-3">
                  <Avatar name={displayName} size="xl" glow={myReady} />
                </div>
                <div className="text-white font-black text-sm truncate leading-tight mb-1">{displayName}</div>
                {user && (
                  <div className="flex items-center justify-center gap-1.5 mb-1 flex-wrap">
                    <BadgeChip badgeId={matchInfo.myBadge} />
                  </div>
                )}
                {user && (
                  <div className="text-gray-500 text-xs">
                    {user.wins}W–{user.losses}L
                    <span className="text-gray-600 ml-1">{winPct(user.wins, user.losses)}</span>
                  </div>
                )}
                {matchInfo.myStreak >= 3 && (
                  <div className="text-orange-400 text-xs font-black mt-1.5">🔥 {matchInfo.myStreak} streak</div>
                )}
                {myReady ? (
                  <div className="mt-2.5 inline-flex items-center gap-1 bg-green-500/15 border border-green-500/25 rounded-full px-3 py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                    <span className="text-green-400 text-[10px] font-black uppercase tracking-wide">Ready</span>
                  </div>
                ) : (
                  <div className="mt-2.5 h-[26px]" /> /* spacer to keep height consistent */
                )}
              </div>

              {/* VS divider — large glow */}
              <div className="flex flex-col items-center gap-2 h-full py-2">
                <div className="w-px flex-1 bg-gradient-to-b from-transparent via-white/[0.08] to-transparent" />
                <div className="relative">
                  <div className="font-display text-3xl text-orange-500 leading-none drop-shadow-[0_0_20px_rgba(249,115,22,0.7)]">VS</div>
                  <div className="absolute inset-0 font-display text-3xl text-orange-400/20 leading-none blur-lg">VS</div>
                </div>
                <div className="w-px flex-1 bg-gradient-to-b from-transparent via-white/[0.08] to-transparent" />
              </div>

              {/* Opponent */}
              <div className={`rounded-2xl px-3 py-5 text-center transition-all duration-300 ${
                oppReady
                  ? 'bg-green-500/10 border border-green-500/30 shadow-[0_0_24px_rgba(34,197,94,0.08)]'
                  : 'bg-white/[0.025] border border-white/[0.06]'
              }`}>
                <div className="flex justify-center mb-3">
                  <Avatar name={matchInfo.opponentName} size="xl" glow={oppReady} />
                </div>
                <div className="text-white font-black text-sm truncate leading-tight mb-1">{matchInfo.opponentName}</div>
                <div className="flex items-center justify-center gap-1.5 mb-1 flex-wrap">
                  <BadgeChip badgeId={matchInfo.opponentBadge} />
                </div>
                <div className="text-gray-500 text-xs">
                  {matchInfo.opponentRecord.wins}W–{matchInfo.opponentRecord.losses}L
                  <span className="text-gray-600 ml-1">{winPct(matchInfo.opponentRecord.wins, matchInfo.opponentRecord.losses)}</span>
                </div>
                {matchInfo.opponentStreak >= 3 && (
                  <div className="text-orange-400 text-xs font-black mt-1.5">🔥 {matchInfo.opponentStreak} streak</div>
                )}
                {oppReady ? (
                  <div className="mt-2.5 inline-flex items-center gap-1 bg-green-500/15 border border-green-500/25 rounded-full px-3 py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                    <span className="text-green-400 text-[10px] font-black uppercase tracking-wide">Ready</span>
                  </div>
                ) : (
                  <div className="mt-2.5 h-[26px]" />
                )}
              </div>
            </div>

            {/* Game details */}
            <div className="mx-5 mb-5 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-label">Format</span>
                <span className="text-white font-black text-xs">{MODE_LABEL[matchInfo.proposedTeamMode]}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-xs">{seriesLabel(matchInfo.proposedSeries)}</span>
                {matchInfo.proposedStatCategory ? (
                  <span className="text-orange-400 font-black text-xs">{STAT_CATEGORY_LABELS[matchInfo.proposedStatCategory]}</span>
                ) : (
                  <span className="text-yellow-400 font-black text-xs">EBK Score</span>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="px-5 pb-5 grid grid-cols-2 gap-3">
              <button onClick={handleDecline} className="btn-secondary py-4 text-sm">
                Decline
              </button>
              <button
                onClick={handleAccept}
                disabled={myReady}
                className={`py-4 rounded-xl font-black text-sm uppercase tracking-wider transition-all ${
                  myReady
                    ? 'bg-green-600/30 text-green-400 border border-green-500/30 cursor-default'
                    : 'btn-primary'
                }`}
              >
                {myReady ? 'Accepted ✓' : 'Accept Match'}
              </button>
            </div>

            {(myReady || oppReady) && !(myReady && oppReady) && (
              <p className="text-center text-gray-500 text-xs pb-5">
                Waiting for <span className="text-white/70 font-bold">{myReady ? matchInfo.opponentName : displayName}</span> to accept…
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── MAIN LOBBY ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen py-8 px-4 animate-fade-in">
      <div className="max-w-5xl mx-auto">

        {/* ── Back button (own row, only when inside a mode) ──────────────── */}
        {mainTab && (
          <button onClick={() => { setMainTab(null); setError('') }}
            className="text-gray-500 hover:text-white transition-colors text-sm mb-4 flex items-center gap-1">
            ← Back
          </button>
        )}

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-8">
          <div className="min-w-0">
            <p className="text-label mb-1">Head-to-Head Draft</p>
            <h1 className="font-display text-4xl sm:text-7xl text-white leading-none tracking-wide truncate">
              <span className="text-orange-500">
                {mainTab === 'online' ? 'O' : mainTab === 'friends' ? 'F' : 'L'}
              </span>
              {mainTab === 'online' ? 'NLINE' : mainTab === 'friends' ? 'RIENDS' : 'OBBY'}
            </h1>
          </div>

          {/* User identity chip — hide on mobile */}
          {!authLoading && user && (
            <Link href="/profile"
              className="hidden sm:flex items-center gap-2.5 px-3 py-2 rounded-xl card-surface border border-white/[0.07] hover:border-orange-700/40 hover:bg-orange-950/20 transition-all group shrink-0">
              <div className="relative shrink-0">
                <Avatar name={user.username} />
                {user.winStreak >= 3 && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-orange-500 rounded-full flex items-center justify-center text-[7px] font-black text-white">
                    {user.winStreak}
                  </span>
                )}
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-xs font-black text-gray-200 group-hover:text-white transition-colors leading-tight tracking-wide">
                  {user.username}
                </div>
                <div className="text-label tabular-nums" style={{ fontSize: '9px' }}>
                  {user.wins}W–{user.losses}L
                  {(user.wins + user.losses) > 0 && (
                    <span className="ml-1 text-orange-500">{winPct(user.wins, user.losses)}</span>
                  )}
                </div>
              </div>
            </Link>
          )}
        </div>

        {/* Network disconnect banner */}
        {socketDisconnected && !socketFailed && (
          <div className="bg-yellow-900/30 border border-yellow-600/40 text-yellow-300 rounded-xl px-4 py-3 mb-5 text-sm flex items-center gap-3 animate-slide-up">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-yellow-400/60 border-t-yellow-300 animate-spin shrink-0" />
            <span>Connection lost — reconnecting…</span>
          </div>
        )}

        {/* Global error banner */}
        {error && (
          <div className="bg-red-900/30 border border-red-500/40 text-red-300 rounded-xl px-4 py-3 mb-5 text-sm flex items-center justify-between animate-slide-up">
            <span>{error}</span>
            <button onClick={() => setError('')} aria-label="Dismiss error" className="text-red-500 hover:text-red-300 ml-3 shrink-0">✕</button>
          </div>
        )}

        {/* ── Mode selector (shown when no mode selected) ─────────────────── */}
        {!mainTab && (
          <div className="mb-6 space-y-3">

            {/* Hero: Online Play */}
            <button
              onClick={() => { setMainTab('online'); setError('') }}
              className="animate-fade-up-1 group w-full card-surface border border-white/[0.06] hover:border-orange-700/50 hover:bg-orange-950/10 rounded-2xl p-7 text-left transition-all hover:scale-[1.01] active:scale-[0.99]"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-label">Live</span>
                <div className="live-banner py-0.5 px-2" style={{ fontSize: 9 }}>
                  <span className="live-dot" style={{ width: 5, height: 5 }} />
                  ONLINE
                </div>
              </div>
              <div className="font-display text-4xl sm:text-5xl text-white leading-none mb-2 group-hover:text-orange-400 transition-colors">Online Play</div>
              <div className="text-gray-500 text-xs font-black uppercase tracking-wide">Random opponent. Real-time. Win.</div>
            </button>

            {/* Row: War Room + Play Friends */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Link href="/auction"
                className="animate-fade-up-2 group card-surface border border-orange-900/30 hover:border-orange-500/40 hover:bg-orange-950/10 rounded-2xl p-6 text-left transition-all hover:scale-[1.01] active:scale-[0.99] block">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-label">Multiplayer</span>
                  <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-orange-600 text-white tracking-widest">NEW</span>
                </div>
                <div className="font-display text-3xl text-white leading-none mb-2 group-hover:text-orange-400 transition-colors">War Room</div>
                <div className="text-gray-500 text-xs font-black uppercase tracking-wide">Bid. Steal. Outmaneuver.</div>
              </Link>

              <button
                onClick={() => { setMainTab('friends'); setError('') }}
                className="animate-fade-up-3 group card-surface border border-white/[0.06] hover:border-orange-700/50 hover:bg-orange-950/10 rounded-2xl p-6 text-left transition-all hover:scale-[1.01] active:scale-[0.99] w-full"
              >
                <div className="mb-3">
                  <span className="text-label">Private</span>
                </div>
                <div className="font-display text-3xl text-white leading-none mb-2 group-hover:text-orange-400 transition-colors">Play Friends</div>
                <div className="text-gray-500 text-xs font-black uppercase tracking-wide">Private room. Share the code.</div>
              </button>
            </div>

            {/* Row: Higher/Lower + Practice (compact) */}
            <div className="grid grid-cols-2 gap-3">
              <Link href="/higher-lower"
                className="animate-fade-up-4 group card-surface border border-white/[0.04] hover:border-white/[0.12] rounded-2xl px-5 py-4 text-left transition-all hover:scale-[1.01] active:scale-[0.99] block">
                <div className="text-label mb-2">Solo</div>
                <div className="font-display text-2xl text-white leading-none mb-1 group-hover:text-orange-400 transition-colors">Higher / Lower</div>
                <div className="text-gray-600 text-[11px] font-black uppercase tracking-wide">Guess. Streak. Win.</div>
              </Link>
              <Link href="/practice"
                className="animate-fade-up-5 group card-surface border border-white/[0.04] hover:border-white/[0.12] rounded-2xl px-5 py-4 text-left transition-all hover:scale-[1.01] active:scale-[0.99] block">
                <div className="text-label mb-2">Solo</div>
                <div className="font-display text-2xl text-white leading-none mb-1 group-hover:text-orange-400 transition-colors">Practice</div>
                <div className="text-gray-600 text-[11px] font-black uppercase tracking-wide">Draft. No timer. Learn.</div>
              </Link>
            </div>

          </div>
        )}

        {/* ── ONLINE MODE ─────────────────────────────────────────────────── */}
        {mainTab === 'online' && (
          <div className="animate-fade-up">
            {/* First-time user onboarding hint */}
            {!authLoading && user && user.wins === 0 && user.losses === 0 && (
              <div className="card-surface border border-orange-900/40 rounded-2xl px-5 py-4 mb-5 flex items-start gap-4 animate-slide-up">
                <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-orange-400 text-base">★</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-black text-sm mb-0.5">Welcome to the Lobby</p>
                  <p className="text-gray-400 text-xs leading-relaxed">
                    Post a game to get matched with an opponent, or join an open game from the browser on the right.
                    Draft obscure NBA players — lower EBK score wins.
                  </p>
                </div>
              </div>
            )}

            {/* Sign-in prompt for guests */}
            {!authLoading && !user && (
              <div className="mb-5 card-surface rounded-2xl px-5 py-4 border border-orange-900/30">
                <p className="font-display text-2xl text-white leading-none mb-1">One rule.</p>
                <p className="text-gray-400 text-sm mb-4">Online Play requires an account — it's free, takes 30 seconds, and you'll never lose your record.</p>
                <div className="flex gap-2">
                  <Link href="/register" className="btn-primary py-2 px-5 text-xs">Create Free Account</Link>
                  <Link href="/login" className="btn-secondary py-2 px-5 text-xs">Sign In</Link>
                </div>
              </div>
            )}

            {/* Two-column layout (post game + browser) */}
            {user && (onlineState === 'idle' || onlineState === 'listing') && (
              <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5">

                {/* Left column: post / listing status */}
                {onlineState === 'idle' && (
                  <div className="card-surface rounded-2xl p-5 flex flex-col gap-4">
                    <div className="text-label">Post a Game</div>

                    {/* Team mode selector */}
                    <div>
                      <div className="text-label mb-2">Team Size</div>
                      <div className="space-y-2">
                        {(['starter5', 'bench8', 'full12'] as TeamMode[]).map(val => (
                          <button
                            key={val}
                            onClick={() => setCreateTeamMode(val)}
                            className={`w-full flex items-center justify-between rounded-xl px-4 py-3 border transition-all ${
                              createTeamMode === val
                                ? 'border-orange-500/60 bg-orange-600/10'
                                : 'border-white/[0.05] bg-white/[0.02] hover:border-white/[0.12]'
                            }`}
                          >
                            <div className="text-left">
                              <div className={`font-black text-sm ${createTeamMode === val ? 'text-orange-400' : 'text-white'}`}>
                                {MODE_LABEL[val]}
                              </div>
                              <div className="text-gray-400 text-xs">{MODE_DESC[val]}</div>
                            </div>
                            <div className={`w-4 h-4 rounded-full border-2 transition-all shrink-0 ${
                              createTeamMode === val ? 'border-orange-500 bg-orange-500' : 'border-white/[0.2]'
                            }`} />
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Series selector */}
                    <div>
                      <div className="text-label mb-2">Series</div>
                      <div className="grid grid-cols-3 gap-2">
                        {([1, 3, 5] as SeriesLength[]).map(s => (
                          <button
                            key={s}
                            onClick={() => setCreateSeries(s)}
                            className={`rounded-xl py-2.5 text-center font-black text-sm border transition-all ${
                              createSeries === s
                                ? 'border-orange-500/60 bg-orange-600/10 text-orange-400'
                                : 'border-white/[0.05] text-gray-400 hover:border-white/[0.12]'
                            }`}
                          >
                            {seriesLabel(s)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Stat category selector */}
                    <div>
                      <div className="text-label mb-2">Stat Category</div>
                      <div className="grid grid-cols-2 gap-2">
                        {ALL_STAT_CATEGORIES.map(cat => (
                          <button
                            key={cat}
                            onClick={() => setCreateStatCategory(cat)}
                            className={`rounded-xl px-3 py-2.5 text-left border transition-all ${
                              createStatCategory === cat
                                ? 'border-orange-500/60 bg-orange-600/10'
                                : 'border-white/[0.05] bg-white/[0.02] hover:border-white/[0.12]'
                            }`}
                          >
                            <div className={`font-black text-sm ${createStatCategory === cat ? 'text-orange-400' : 'text-white'}`}>
                              {STAT_CATEGORY_LABELS[cat]}
                            </div>
                            <div className="text-gray-400 text-[10px] mt-0.5 leading-tight">{STAT_CATEGORY_DESC[cat]}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Error */}
                    {listingError && (
                      <div className="bg-red-900/20 border border-red-500/30 text-red-400 rounded-xl px-3 py-2 text-xs text-center">
                        {listingError}
                      </div>
                    )}

                    <button onClick={handlePostGame} className="btn-primary w-full mt-auto">
                      Post Game
                    </button>
                  </div>
                )}

                {onlineState === 'listing' && (
                  <div className="card-accent rounded-2xl p-5 flex flex-col gap-4">
                    {/* Live indicator */}
                    <div className="flex items-center gap-2">
                      <div className="live-dot" />
                      <span className="text-green-400 text-xs font-black uppercase tracking-widest">Game Live</span>
                    </div>

                    {/* Host row */}
                    <div className="flex items-center gap-3">
                      <Avatar name={user.username} />
                      <div>
                        <div className="text-white font-black">{user.username}</div>
                        <div className="text-gray-400 text-xs">{user.wins}W {user.losses}L · {winPct(user.wins, user.losses)}</div>
                      </div>
                    </div>

                    {/* Game details */}
                    <div className="bg-white/[0.03] border border-white/[0.05] rounded-xl divide-y divide-white/[0.04]">
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-gray-400 text-xs">Format</span>
                        <span className="text-white font-black text-sm">{MODE_LABEL[createTeamMode]}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-gray-400 text-xs">Series</span>
                        <span className="text-gray-300 text-sm">{seriesLabel(createSeries)}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-gray-400 text-xs">Stat</span>
                        <span className="text-orange-400 font-black text-sm">{STAT_CATEGORY_LABELS[createStatCategory]}</span>
                      </div>
                    </div>

                    <p className="text-gray-400 text-xs text-center leading-relaxed">
                      Your game is visible to all players.<br />Waiting for someone to join...
                    </p>

                    {listingError && (
                      <div className="bg-red-900/20 border border-red-500/30 text-red-400 rounded-xl px-3 py-2 text-xs text-center">
                        {listingError}
                      </div>
                    )}

                    <button onClick={handleCancelListing} className="btn-secondary w-full mt-auto">
                      Cancel Game
                    </button>
                  </div>
                )}

                {/* Right column: game browser */}
                <div className="card-surface rounded-2xl overflow-hidden flex flex-col">
                  {/* Browser header */}
                  <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.05] shrink-0">
                    <div>
                      <div className="text-white font-black text-sm">Open Games</div>
                      <div className="text-gray-400 text-xs mt-0.5">
                        {listings.length > 0
                          ? `${listings.length} game${listings.length !== 1 ? 's' : ''} waiting`
                          : 'No open games right now'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="live-dot" />
                      <span className="text-gray-400 text-xs">Live</span>
                    </div>
                  </div>

                  {/* Listings */}
                  <div className="flex-1 overflow-y-auto">
                    {socketFailed && !listingsLoaded ? (
                      /* Socket failed to connect — show a clear error instead of infinite shimmer */
                      <div className="empty-state">
                        <div className="empty-state-icon">⚡</div>
                        <div className="empty-state-title">Can&apos;t reach server</div>
                        <div className="empty-state-body">Check your connection and refresh the page</div>
                        <button
                          onClick={() => window.location.reload()}
                          className="btn-secondary py-2 px-5 text-xs mt-4"
                        >
                          Refresh
                        </button>
                      </div>
                    ) : !listingsLoaded ? (
                      /* Skeleton shimmer while waiting for first socket event */
                      <div className="divide-y divide-white/[0.04] px-5">
                        {[0,1,2].map(i => (
                          <div key={i} className="flex items-center gap-4 py-4 animate-pulse">
                            <div className="w-9 h-9 rounded-full bg-white/[0.08] shrink-0" />
                            <div className="flex-1 space-y-1.5">
                              <div className="h-3.5 w-28 rounded bg-white/[0.08]" />
                              <div className="h-2.5 w-16 rounded bg-white/[0.05]" />
                            </div>
                            <div className="h-8 w-14 rounded-xl bg-white/[0.06] shrink-0" />
                          </div>
                        ))}
                      </div>
                    ) : listings.length === 0 ? (
                      <div className="empty-state">
                        <div className="empty-state-icon">🏀</div>
                        <div className="empty-state-title">No games open right now</div>
                        <div className="empty-state-body">
                          Post one to get started — your game will appear here for others to join.
                        </div>
                        {/* Arrow pointing left toward Post Game form (hidden on mobile where form is above) */}
                        <div className="hidden lg:flex items-center gap-2 mt-4 text-orange-500/50 text-xs font-black uppercase tracking-widest animate-pulse">
                          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                            <path d="M12 4L6 10L12 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Post Game
                        </div>
                        {/* On mobile (form is above), show a downward-pointing hint */}
                        <div className="lg:hidden flex flex-col items-center gap-1 mt-4 text-orange-500/50">
                          <span className="text-xs font-black uppercase tracking-widest">Post a game above</span>
                          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="animate-bounce">
                            <path d="M10 4V16M10 16L4 10M10 16L16 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      </div>
                    ) : (
                      <div className="divide-y divide-white/[0.04]">
                        {listings.map((l, idx) => (
                          <div
                            key={l.code}
                            className="flex items-center gap-4 px-5 py-4 hover:bg-white/[0.025] transition-colors group animate-slide-up"
                            style={{ animationDelay: `${idx * 40}ms`, animationFillMode: 'both' }}
                          >
                            <div className={l.hostStreak >= 3 ? 'avatar-hot rounded-full' : ''}>
                              <Avatar name={l.hostName} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-white font-black text-sm truncate">{l.hostName}</span>
                                <BadgeChip badgeId={l.hostBadge} />
                                {l.hostStreak >= 3 && (
                                  <span className="text-orange-400 text-[11px] font-black bg-orange-950/40 border border-orange-800/50 rounded px-1.5 py-0.5">
                                    {l.hostStreak} streak
                                  </span>
                                )}
                              </div>
                              <div className="text-gray-400 text-xs">
                                {l.hostRecord.wins}W {l.hostRecord.losses}L
                                <span className="text-gray-700 mx-1">·</span>
                                <span className="text-gray-400">{winPct(l.hostRecord.wins, l.hostRecord.losses)}</span>
                              </div>
                            </div>
                            {/* Format chip */}
                            <div className="hidden sm:flex flex-col items-end gap-0.5 shrink-0">
                              <span className="text-xs font-black text-gray-200 bg-white/[0.05] border border-white/[0.08] rounded-lg px-2.5 py-1 leading-none">
                                {MODE_LABEL[l.teamMode]}
                              </span>
                              <span className="text-gray-400 text-[11px]">{seriesLabel(l.series)}</span>
                              <span className="text-orange-400 text-[10px] font-black">{STAT_CATEGORY_LABELS[l.statCategory] ?? 'Games Played'}</span>
                            </div>
                            <button
                              onClick={() => handleJoinListing(l.code)}
                              disabled={onlineState === 'listing'}
                              className="btn-primary py-2 px-5 text-xs disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:transform-none disabled:hover:shadow-none shrink-0"
                            >
                              Join
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Footer row */}
                  <div className="px-5 py-3 border-t border-white/[0.05] flex items-center justify-between shrink-0">
                    <span className="text-gray-400 text-xs">
                      Playing as <span className="text-gray-400 font-bold">{user.username}</span>
                    </span>
                    <Link href="/history" className="text-orange-500 hover:text-orange-400 text-xs font-bold transition-colors">
                      My History →
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── PLAY WITH FRIENDS ────────────────────────────────────────────── */}
        {mainTab === 'friends' && (
          <div className="max-w-md mx-auto animate-fade-up">
            {/* Sub-tab toggle */}
            <div className="tab-pill mb-5">
              <button
                onClick={() => setFriendsTab('create')}
                className={`tab-pill-item${friendsTab === 'create' ? ' active' : ''}`}
              >
                Create Room
              </button>
              <button
                onClick={() => setFriendsTab('join')}
                className={`tab-pill-item${friendsTab === 'join' ? ' active' : ''}`}
              >
                Join Room
              </button>
            </div>

            <div className="card-surface rounded-2xl p-6">
              {/* Name input for guests */}
              {!user && (
                <div className="mb-5">
                  <label className="text-label block mb-2">Your Name</label>
                  <input
                    value={userName}
                    onChange={e => setUserName(e.target.value)}
                    placeholder="Enter your name"
                    className="input-field"
                  />
                </div>
              )}

              {friendsTab === 'create' && (
                <div className="space-y-5">
                  {/* Team mode */}
                  <div>
                    <div className="text-label mb-2">Team Size</div>
                    <div className="space-y-2">
                      {(['starter5', 'bench8', 'full12'] as TeamMode[]).map(val => (
                        <button
                          key={val}
                          onClick={() => setTeamMode(val)}
                          className={`w-full flex items-center justify-between rounded-xl px-4 py-3 border transition-all ${
                            teamMode === val
                              ? 'border-orange-500/60 bg-orange-600/10'
                              : 'border-white/[0.05] bg-white/[0.02] hover:border-white/[0.12]'
                          }`}
                        >
                          <div className="text-left">
                            <div className={`font-black text-sm ${teamMode === val ? 'text-orange-400' : 'text-white'}`}>
                              {MODE_LABEL[val]}
                            </div>
                            <div className="text-gray-400 text-xs">{MODE_DESC[val]}</div>
                          </div>
                          <div className={`w-4 h-4 rounded-full border-2 transition-all shrink-0 ${
                            teamMode === val ? 'border-orange-500 bg-orange-500' : 'border-white/[0.2]'
                          }`} />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Series */}
                  <div>
                    <div className="text-label mb-2">Series</div>
                    <div className="grid grid-cols-3 gap-2">
                      {([1, 3, 5] as SeriesLength[]).map(s => (
                        <button
                          key={s}
                          onClick={() => setSeries(s)}
                          className={`rounded-xl py-2.5 text-center font-black text-sm border transition-all ${
                            series === s
                              ? 'border-orange-500/60 bg-orange-600/10 text-orange-400'
                              : 'border-white/[0.05] text-gray-400 hover:border-white/[0.12]'
                          }`}
                        >
                          {seriesLabel(s)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Difficulty */}
                  <div>
                    <div className="text-label mb-2">Mode</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setDifficulty('casual')}
                        className={`rounded-xl p-3.5 text-center border transition-all ${
                          difficulty === 'casual'
                            ? 'border-orange-500/60 bg-orange-600/10'
                            : 'border-white/[0.05] bg-white/[0.02] hover:border-white/[0.12]'
                        }`}
                      >
                        <div className={`font-black text-sm ${difficulty === 'casual' ? 'text-orange-400' : 'text-white'}`}>
                          Casual
                        </div>
                        <div className="text-gray-400 text-xs mt-0.5">Stats shown</div>
                      </button>
                      <button
                        onClick={() => setDifficulty('ebk')}
                        className={`rounded-xl p-3.5 text-center border transition-all ${
                          difficulty === 'ebk'
                            ? 'border-yellow-500/60 bg-yellow-600/10'
                            : 'border-white/[0.05] bg-white/[0.02] hover:border-white/[0.12]'
                        }`}
                      >
                        <div className={`font-black text-sm ${difficulty === 'ebk' ? 'text-yellow-400' : 'text-white'}`}>
                          EBK Mode
                        </div>
                        <div className="text-gray-400 text-xs mt-0.5">Blind picks</div>
                      </button>
                    </div>
                  </div>

                  {/* Stat category selector */}
                  <div>
                    <div className="text-label mb-2">Stat Category</div>
                    <div className="grid grid-cols-2 gap-2">
                      {ALL_STAT_CATEGORIES.map(cat => (
                        <button
                          key={cat}
                          onClick={() => setStatCategory(cat)}
                          className={`rounded-xl px-3 py-2.5 text-left border transition-all ${
                            statCategory === cat
                              ? 'border-orange-500/60 bg-orange-600/10'
                              : 'border-white/[0.05] bg-white/[0.02] hover:border-white/[0.12]'
                          }`}
                        >
                          <div className={`font-black text-sm ${statCategory === cat ? 'text-orange-400' : 'text-white'}`}>
                            {STAT_CATEGORY_LABELS[cat]}
                          </div>
                          <div className="text-gray-400 text-[10px] mt-0.5 leading-tight">{STAT_CATEGORY_DESC[cat]}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <button onClick={handleCreate} disabled={loading} className="btn-primary w-full">
                    {loading ? 'Creating...' : 'Create Room'}
                  </button>
                </div>
              )}

              {friendsTab === 'join' && (
                <div className="space-y-5">
                  <div>
                    <div className="text-label mb-2">Room Code</div>
                    <input
                      value={joinCode}
                      onChange={e => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="XXXXXX"
                      maxLength={6}
                      className="input-field font-mono text-center text-xl tracking-[0.4em] uppercase"
                    />
                  </div>
                  <button onClick={handleJoin} disabled={loading} className="btn-primary w-full">
                    {loading ? 'Joining...' : 'Join Room'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}


      </div>
    </div>
  )
}
