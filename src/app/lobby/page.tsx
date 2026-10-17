'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getSocket } from '@/lib/socket'
import { useAuth } from '@/context/AuthContext'
import { BADGES } from '@/lib/accessories'

type TeamMode = 'starter5' | 'bench8' | 'full12'
type SeriesLength = 1 | 3 | 5
type Difficulty = 'casual' | 'ebk'
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
function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const palette = ['bg-orange-600', 'bg-blue-600', 'bg-emerald-600', 'bg-violet-600', 'bg-rose-600']
  const color = palette[name.charCodeAt(0) % palette.length]
  const sz = size === 'lg' ? 'w-14 h-14 text-base' : size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 text-xs'
  return (
    <div className={`${sz} ${color} rounded-full flex items-center justify-center font-black text-white shrink-0 select-none`}>
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
  const [mainTab, setMainTab] = useState<'online' | 'friends'>('online')
  const { user, loading: authLoading } = useAuth()

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

  // Play with friends state
  const [friendsTab, setFriendsTab] = useState<'create' | 'join'>('create')
  const [teamMode, setTeamMode] = useState<TeamMode>('starter5')
  const [series, setSeries] = useState<SeriesLength>(1)
  const [difficulty, setDifficulty] = useState<Difficulty>('casual')
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
      setListingError('Your game listing expired after 10 minutes')
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
    socket.emit('create-room', { teamMode, series, difficulty, userName: userName.trim() })
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
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md animate-slide-up">

          {matchInfo.grudgeMatch && (
            <div className="mb-4 rounded-xl py-2.5 px-4 text-center border border-red-500/30 bg-red-900/20">
              <span className="text-red-400 font-black text-sm tracking-widest uppercase">Grudge Match</span>
              <span className="text-gray-500 text-xs ml-2">You&apos;ve played before</span>
            </div>
          )}

          <div className="card-accent rounded-2xl overflow-hidden">
            {/* Header strip */}
            <div className="px-6 py-5 text-center border-b border-white/5">
              <div className="text-label mb-2 tracking-[0.2em]">Game Found</div>
              <div className="font-display text-6xl text-white leading-none tracking-wider">MATCH UP</div>
              {/* Countdown bar */}
              <div className="mt-4 mx-auto max-w-[200px]">
                <div className="budget-bar">
                  <div
                    className={`budget-bar-fill transition-all duration-1000 ${
                      countdown <= 10 ? '!bg-red-500' : countdown <= 20 ? '!bg-yellow-500' : ''
                    }`}
                    style={{ width: `${(countdown / 60) * 100}%` }}
                  />
                </div>
                <div className={`text-xs font-black mt-1.5 tabular-nums ${
                  countdown <= 10 ? 'text-red-400' : countdown <= 20 ? 'text-yellow-400' : 'text-gray-500'
                }`}>
                  {countdown > 0 ? `${countdown}s to accept` : 'Processing...'}
                </div>
              </div>
            </div>

            {/* VS layout */}
            <div className="grid grid-cols-[1fr_48px_1fr] items-center gap-0 px-5 py-5">
              {/* You */}
              <div className={`rounded-2xl p-4 text-center transition-all ${
                myReady ? 'bg-green-500/10 border border-green-500/20' : 'bg-white/[0.03] border border-white/5'
              }`}>
                <div className="flex justify-center mb-2">
                  <Avatar name={displayName} size="lg" />
                </div>
                <div className="text-white font-black text-sm truncate leading-tight">{displayName}</div>
                {user && (
                  <div className="flex items-center justify-center gap-1.5 mt-1 flex-wrap">
                    <BadgeChip badgeId={matchInfo.myBadge} />
                  </div>
                )}
                {user && (
                  <div className="text-gray-500 text-xs mt-1">
                    {user.wins}W {user.losses}L
                    <span className="text-gray-700 ml-1">· {winPct(user.wins, user.losses)}</span>
                  </div>
                )}
                {matchInfo.myStreak >= 3 && (
                  <div className="text-orange-400 text-xs font-black mt-1">🔥 {matchInfo.myStreak} streak</div>
                )}
                {myReady && (
                  <div className="mt-2 text-green-400 text-[10px] font-black uppercase tracking-wide">Ready</div>
                )}
              </div>

              {/* VS divider */}
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-px flex-1 bg-gradient-to-b from-transparent via-white/10 to-transparent" />
                <div className="font-display text-2xl text-orange-500/80 leading-none drop-shadow-[0_0_12px_rgba(234,88,12,0.4)]">VS</div>
                <div className="w-px flex-1 bg-gradient-to-b from-transparent via-white/10 to-transparent" />
              </div>

              {/* Opponent */}
              <div className={`rounded-2xl p-4 text-center transition-all ${
                oppReady ? 'bg-green-500/10 border border-green-500/20' : 'bg-white/[0.03] border border-white/5'
              }`}>
                <div className="flex justify-center mb-2">
                  <Avatar name={matchInfo.opponentName} size="lg" />
                </div>
                <div className="text-white font-black text-sm truncate leading-tight">{matchInfo.opponentName}</div>
                <div className="flex items-center justify-center gap-1.5 mt-1 flex-wrap">
                  <BadgeChip badgeId={matchInfo.opponentBadge} />
                </div>
                <div className="text-gray-500 text-xs mt-1">
                  {matchInfo.opponentRecord.wins}W {matchInfo.opponentRecord.losses}L
                  <span className="text-gray-700 ml-1">· {winPct(matchInfo.opponentRecord.wins, matchInfo.opponentRecord.losses)}</span>
                </div>
                {matchInfo.opponentStreak >= 3 && (
                  <div className="text-orange-400 text-xs font-black mt-1">🔥 {matchInfo.opponentStreak} streak</div>
                )}
                {oppReady && (
                  <div className="mt-2 text-green-400 text-[10px] font-black uppercase tracking-wide">Ready</div>
                )}
              </div>
            </div>

            {/* Game details */}
            <div className="mx-5 mb-5 bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-label">Format</span>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-white font-black">{MODE_LABEL[matchInfo.proposedTeamMode]}</span>
                <span className="text-gray-700">·</span>
                <span className="text-gray-400">{seriesLabel(matchInfo.proposedSeries)}</span>
                <span className="text-gray-700">·</span>
                <span className="text-yellow-400 font-black">EBK</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="px-5 pb-5 grid grid-cols-2 gap-3">
              <button onClick={handleDecline} className="btn-secondary py-3 text-sm">
                Decline
              </button>
              <button
                onClick={handleAccept}
                disabled={myReady}
                className={`py-3 rounded-xl font-black text-sm uppercase tracking-wider transition-all ${
                  myReady
                    ? 'bg-green-600/30 text-green-400 border border-green-500/20 cursor-default'
                    : 'btn-primary'
                }`}
              >
                {myReady ? 'Accepted ✓' : 'Accept'}
              </button>
            </div>

            {(myReady || oppReady) && !(myReady && oppReady) && (
              <p className="text-center text-gray-600 text-xs pb-4">
                Waiting for {myReady ? matchInfo.opponentName : displayName} to accept...
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

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-6xl text-orange-500 leading-none tracking-wide">LOBBY</h1>
            <p className="text-gray-600 text-[11px] tracking-[0.18em] uppercase mt-1.5">Elite Ball Knowledge</p>
          </div>

          {/* User identity chip */}
          {!authLoading && user && (
            <Link href="/profile" className="flex items-center gap-3 group">
              <div className="text-right">
                <div className="text-white font-black text-sm group-hover:text-orange-400 transition-colors leading-tight">
                  {user.username}
                </div>
                <div className="text-gray-500 text-xs mt-0.5">
                  {user.wins}W {user.losses}L
                  {(user.wins + user.losses) > 0 && (
                    <span className="text-gray-700 ml-1.5">{winPct(user.wins, user.losses)}</span>
                  )}
                </div>
              </div>
              <div className="relative">
                <Avatar name={user.username} />
                {user.winStreak >= 3 && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-orange-500 rounded-full flex items-center justify-center text-[7px] font-black text-white">
                    {user.winStreak}
                  </span>
                )}
              </div>
            </Link>
          )}
          {!authLoading && !user && (
            <div className="flex gap-2">
              <Link href="/login" className="btn-secondary py-2 px-5 text-xs">Sign In</Link>
              <Link href="/register" className="btn-primary py-2 px-5 text-xs">Sign Up</Link>
            </div>
          )}
        </div>

        {/* Global error banner */}
        {error && (
          <div className="bg-red-900/30 border border-red-500/40 text-red-300 rounded-xl px-4 py-3 mb-5 text-sm flex items-center justify-between animate-slide-up">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-red-500 hover:text-red-300 ml-3 shrink-0">✕</button>
          </div>
        )}

        {/* ── Main tab bar ────────────────────────────────────────────────── */}
        <div className="tab-pill mb-6">
          <button
            onClick={() => { setMainTab('online'); setError('') }}
            className={`tab-pill-item${mainTab === 'online' ? ' active' : ''}`}
          >
            Online Play
          </button>
          <button
            onClick={() => { setMainTab('friends'); setError('') }}
            className={`tab-pill-item${mainTab === 'friends' ? ' active' : ''}`}
          >
            Play with Friends
          </button>
        </div>

        {/* ── ONLINE MODE ─────────────────────────────────────────────────── */}
        {mainTab === 'online' && (
          <>
            {/* First-time user onboarding hint */}
            {!authLoading && user && user.wins === 0 && user.losses === 0 && (
              <div className="card-surface border border-orange-900/40 rounded-2xl px-5 py-4 mb-5 flex items-start gap-4 animate-slide-up">
                <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-orange-400 text-base">★</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-black text-sm mb-0.5">Welcome to the Lobby</p>
                  <p className="text-gray-500 text-xs leading-relaxed">
                    Post a game to get matched with an opponent, or join an open game from the browser on the right.
                    Draft obscure NBA players — lower EBK score wins.
                  </p>
                </div>
              </div>
            )}

            {/* Login gate */}
            {!authLoading && !user && (
              <div className="card-surface rounded-2xl px-8 py-14 text-center max-w-md mx-auto">
                <div className="font-display text-4xl text-white leading-none mb-3">SIGN IN TO PLAY</div>
                <p className="text-gray-500 text-sm mb-7 leading-relaxed">
                  Create a free account to track your record,<br />earn badges, and compete on the leaderboard.
                </p>
                <div className="flex gap-3 justify-center">
                  <Link href="/login" className="btn-primary px-8">Sign In</Link>
                  <Link href="/register" className="btn-secondary px-8">Sign Up</Link>
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
                              <div className="text-gray-600 text-xs">{MODE_DESC[val]}</div>
                            </div>
                            <div className={`w-4 h-4 rounded-full border-2 transition-all shrink-0 ${
                              createTeamMode === val ? 'border-orange-500 bg-orange-500' : 'border-gray-700'
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
                        <div className="text-gray-500 text-xs">{user.wins}W {user.losses}L · {winPct(user.wins, user.losses)}</div>
                      </div>
                    </div>

                    {/* Game details */}
                    <div className="bg-white/[0.03] border border-white/[0.05] rounded-xl divide-y divide-white/[0.04]">
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-gray-600 text-xs">Format</span>
                        <span className="text-white font-black text-sm">{MODE_LABEL[createTeamMode]}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-gray-600 text-xs">Series</span>
                        <span className="text-gray-300 text-sm">{seriesLabel(createSeries)}</span>
                      </div>
                    </div>

                    <p className="text-gray-600 text-xs text-center leading-relaxed">
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
                      <div className="text-gray-600 text-xs mt-0.5">
                        {listings.length > 0
                          ? `${listings.length} game${listings.length !== 1 ? 's' : ''} waiting`
                          : 'No open games right now'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="live-dot" />
                      <span className="text-gray-600 text-xs">Live</span>
                    </div>
                  </div>

                  {/* Listings */}
                  <div className="flex-1 overflow-y-auto">
                    {!listingsLoaded ? (
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
                        <div className="empty-state-title">No open games</div>
                        <div className="empty-state-body">Post a game on the left to be the first</div>
                      </div>
                    ) : (
                      <div className="divide-y divide-white/[0.04] max-h-[400px] overflow-y-auto">
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
                              <div className="text-gray-500 text-xs">
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
                              <span className="text-gray-600 text-[11px]">{seriesLabel(l.series)}</span>
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
                    <span className="text-gray-600 text-xs">
                      Playing as <span className="text-gray-400 font-bold">{user.username}</span>
                    </span>
                    <Link href="/history" className="text-orange-500 hover:text-orange-400 text-xs font-bold transition-colors">
                      My History →
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── PLAY WITH FRIENDS ────────────────────────────────────────────── */}
        {mainTab === 'friends' && (
          <div className="max-w-md mx-auto">
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
                            <div className="text-gray-600 text-xs">{MODE_DESC[val]}</div>
                          </div>
                          <div className={`w-4 h-4 rounded-full border-2 transition-all shrink-0 ${
                            teamMode === val ? 'border-orange-500 bg-orange-500' : 'border-gray-700'
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
                        <div className="text-gray-600 text-xs mt-0.5">Stats shown</div>
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
                        <div className="text-gray-600 text-xs mt-0.5">Blind picks</div>
                      </button>
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

        {/* ── Other game modes ────────────────────────────────────────────── */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link href="/higher-lower"
            className="card-surface rounded-xl px-5 py-4 flex items-center justify-between group transition-all hover:border-white/[0.12]">
            <div>
              <div className="text-white font-black text-sm group-hover:text-orange-400 transition-colors">Higher / Lower</div>
              <div className="text-gray-600 text-xs mt-0.5">Solo — beat your streak</div>
            </div>
            <div className="text-gray-600 group-hover:text-gray-300 transition-colors text-sm">→</div>
          </Link>
          <Link href="/auction"
            className="rounded-xl px-5 py-4 flex items-center justify-between border border-orange-900/40 bg-orange-950/20 hover:border-orange-700/50 hover:bg-orange-950/30 transition-all group">
            <div>
              <div className="text-orange-300 font-black text-sm">War Room</div>
              <div className="text-gray-600 text-xs mt-0.5">Multiplayer salary auction</div>
            </div>
            <span className="text-[10px] font-black text-orange-600 bg-orange-900/40 border border-orange-800/50 px-2 py-0.5 rounded">NEW</span>
          </Link>
          <Link href="/practice"
            className="card-surface rounded-xl px-5 py-4 flex items-center justify-between group transition-all hover:border-white/[0.12]">
            <div>
              <div className="text-white font-black text-sm group-hover:text-orange-400 transition-colors">Practice</div>
              <div className="text-gray-600 text-xs mt-0.5">Solo draft, no pressure</div>
            </div>
            <div className="text-gray-600 group-hover:text-gray-300 transition-colors text-sm">→</div>
          </Link>
        </div>

      </div>
    </div>
  )
}
