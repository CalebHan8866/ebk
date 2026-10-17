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

function BadgeChip({ badgeId }: { badgeId: string }) {
  const badge = BADGES.find(b => b.id === badgeId)
  if (!badge) return null
  return (
    <span className={`text-xs font-black px-1.5 py-0.5 rounded border ${badge.bgClass} ${badge.textClass} ${badge.borderClass}`}>
      {badge.label}
    </span>
  )
}

const MODE_LABEL: Record<TeamMode, string> = { starter5: 'Starter 5', bench8: 'Bench 8', full12: 'Full 12' }
const MODE_SUB: Record<TeamMode, string> = { starter5: '5 players', bench8: '8 players', full12: '12 players' }
function seriesLabel(s: SeriesLength) { return s === 1 ? '1 Game' : `Best of ${s}` }

export default function LobbyPage() {
  const [mainTab, setMainTab] = useState<'online' | 'friends'>('online')
  const { user, loading: authLoading } = useAuth()

  // ── Online state ──────────────────────────────────────────────────────────
  const [onlineState, setOnlineState] = useState<OnlineState>('idle')
  const [listings, setListings] = useState<GameListing[]>([])
  const [myListingCode, setMyListingCode] = useState<string | null>(null)
  const [matchInfo, setMatchInfo] = useState<MatchInfo | null>(null)
  const [matchCode, setMatchCode] = useState('')
  const [hostReady, setHostReady] = useState(false)
  const [guestReady, setGuestReady] = useState(false)
  const [countdown, setCountdown] = useState(60)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const selfDeclinedRef = useRef(false)
  const listingErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // create form
  const [showCreate, setShowCreate] = useState(false)
  const [createTeamMode, setCreateTeamMode] = useState<TeamMode>('starter5')
  const [createSeries, setCreateSeries] = useState<SeriesLength>(1)

  // ── Friends state ─────────────────────────────────────────────────────────
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

  // ── Socket listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket()

    const handleListingsUpdated = ({ listings: l }: { listings: GameListing[] }) => setListings(l)

    const handleListingCreated = ({ code }: { code: string }) => {
      setMyListingCode(code)
      setOnlineState('listing')
      setShowCreate(false)
    }

    const handleListingExpired = () => {
      setOnlineState('idle')
      setMyListingCode(null)
      setListingError('Your game listing expired after 10 minutes')
    }

    const handleListingError = ({ message }: { message: string }) => {
      setListingError(message)
      if (listingErrorTimerRef.current) clearTimeout(listingErrorTimerRef.current)
      listingErrorTimerRef.current = setTimeout(() => setListingError(''), 3000)
    }

    const handleMatchFound = (info: MatchInfo & { opponentTeamMode: TeamMode; opponentSeries: SeriesLength; myTeamMode: TeamMode; mySeries: SeriesLength }) => {
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
      // Don't show an error if this player was the one who declined
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

    // Fetch current listings on mount
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

  function handlePostGame() {
    if (!user) return
    setListingError('')
    const socket = getSocket()
    socket.emit('create-listing', {
      userName: user.username,
      teamMode: createTeamMode,
      series: createSeries,
    })
  }

  function handleCancelListing() {
    if (!myListingCode) return
    const socket = getSocket()
    socket.emit('cancel-listing', { code: myListingCode })
    setMyListingCode(null)
    setOnlineState('idle')
  }

  function handleJoinListing(code: string) {
    if (!user) return
    setListingError('')
    const socket = getSocket()
    socket.emit('join-listing', { code, userName: user.username })
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
      setError(message); setLoading(false)
    }
    const onJoinSuccess = () => {
      clearTimeout(timeout)
      socket.off('room-error', onError)
      // handleDraftStarted in the useEffect will handle navigation;
      // we just need to clean up these one-shot listeners.
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

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="font-display text-6xl text-orange-500 leading-none">EBK</h1>
          <p className="text-gray-600 text-xs tracking-widest uppercase mt-1">Elite Ball Knowledge</p>
          <div className="flex items-center justify-center gap-4 mt-3">
            <Link href="/leaderboard" className="text-gray-500 hover:text-orange-400 text-xs font-bold transition-colors">Leaderboard</Link>
            <span className="text-gray-700 text-xs">·</span>
            <Link href="/history" className="text-gray-500 hover:text-orange-400 text-xs font-bold transition-colors">My History</Link>
            <span className="text-gray-700 text-xs">·</span>
            <Link href="/fun-facts" className="text-gray-500 hover:text-orange-400 text-xs font-bold transition-colors">Fun Facts</Link>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/40 border border-red-500/50 text-red-300 rounded-lg p-3 mb-4 text-sm text-center">
            {error}
            <button onClick={() => setError('')} className="ml-2 text-red-400 hover:text-red-200">✕</button>
          </div>
        )}

        {/* Main Mode Tabs */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <button
            onClick={() => { setMainTab('online'); setError('') }}
            className={`rounded-xl p-5 text-left border transition-all ${mainTab === 'online' ? 'border-orange-500 bg-orange-600/10' : 'border-white/5 bg-[#101010] hover:border-white/15'}`}
          >
            <div className="font-display text-xs text-orange-500/60 tracking-widest mb-2">01</div>
            <div className="font-black text-white">Online</div>
            <div className="text-gray-500 text-xs mt-1">Browse or post open games</div>
          </button>
          <button
            onClick={() => { setMainTab('friends'); setError('') }}
            className={`rounded-xl p-5 text-left border transition-all ${mainTab === 'friends' ? 'border-orange-500 bg-orange-600/10' : 'border-white/5 bg-[#101010] hover:border-white/15'}`}
          >
            <div className="font-display text-xs text-orange-500/60 tracking-widest mb-2">02</div>
            <div className="font-black text-white">Friends</div>
            <div className="text-gray-500 text-xs mt-1">Create or join a private room</div>
          </button>
          <button
            onClick={() => router.push('/practice')}
            className="rounded-xl p-5 text-left border border-white/5 bg-[#101010] hover:border-white/15 transition-all"
          >
            <div className="font-display text-xs text-orange-500/60 tracking-widest mb-2">03</div>
            <div className="font-black text-white">Practice</div>
            <div className="text-gray-500 text-xs mt-1">Solo draft, no timer</div>
          </button>
        </div>

        {/* Higher/Lower solo mode */}
        <button
          onClick={() => router.push('/higher-lower')}
          className="w-full rounded-xl px-5 py-4 text-left border border-white/5 bg-[#101010] hover:border-white/15 transition-all flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <div className="font-display text-xs text-orange-500/60 tracking-widest">04</div>
            <div>
              <div className="font-black text-white">Higher / Lower</div>
              <div className="text-gray-500 text-xs mt-0.5">Guess EBK scores solo — beat your streak</div>
            </div>
          </div>
          <div className="text-gray-600 text-sm">→</div>
        </button>

        {/* War Room auction mode */}
        <button
          onClick={() => router.push('/auction')}
          className="w-full rounded-xl px-5 py-4 text-left border border-orange-900/30 bg-orange-950/20 hover:border-orange-700/50 hover:bg-orange-950/30 transition-all flex items-center justify-between mb-6"
        >
          <div className="flex items-center gap-4">
            <div className="font-display text-xs text-orange-500/60 tracking-widest">05</div>
            <div>
              <div className="font-black text-orange-300">⚡ War Room</div>
              <div className="text-gray-500 text-xs mt-0.5">Multiplayer salary cap auction · bid, steal, trade</div>
            </div>
          </div>
          <div className="text-orange-600 text-sm font-bold">NEW</div>
        </button>

        {/* ── ONLINE MODE ─────────────────────────────────────────────────── */}
        {mainTab === 'online' && (
          <div className="bg-[#101010] border border-white/5 rounded-xl overflow-hidden">

            {/* Login gate */}
            {!authLoading && !user && (
              <div className="p-6 text-center py-8">
                <div className="text-white font-black text-lg mb-2">Sign in to play online</div>
                <p className="text-gray-600 text-sm mb-6">An account is required to track your record and join games.</p>
                <div className="flex gap-3 justify-center">
                  <Link href="/login" className="bg-orange-600 hover:bg-orange-700 text-white font-black px-6 py-3 rounded-xl transition-colors">Sign In</Link>
                  <Link href="/register" className="bg-[#1a1a1a] hover:bg-[#222] border border-white/10 text-white font-black px-6 py-3 rounded-xl transition-colors">Sign Up</Link>
                </div>
              </div>
            )}

            {/* Game browser */}
            {user && onlineState === 'idle' && !showCreate && (
              <div>
                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/5">
                  <div>
                    <div className="text-white font-black text-sm">Open Games</div>
                    <div className="text-gray-600 text-xs mt-0.5">{listings.length} available · EBK mode</div>
                  </div>
                  <button
                    onClick={() => setShowCreate(true)}
                    className="bg-orange-600 hover:bg-orange-700 text-white font-black text-sm px-4 py-2 rounded-lg transition-colors"
                  >
                    + Create
                  </button>
                </div>

                {listingError && (
                  <div className="mx-4 mt-3 bg-red-900/40 border border-red-500/40 text-red-300 rounded-lg px-3 py-2 text-xs text-center">
                    {listingError}
                  </div>
                )}

                {/* Listings */}
                <div className="divide-y divide-white/5 max-h-[360px] overflow-y-auto">
                  {listings.length === 0 ? (
                    <div className="text-center py-12 px-6">
                      <div className="text-gray-600 font-black text-sm mb-2">No open games</div>
                      <div className="text-gray-700 text-xs">Be the first — create a game above</div>
                    </div>
                  ) : (
                    listings.map(l => (
                      <div key={l.code} className="flex items-center gap-3 px-5 py-4 hover:bg-white/[0.02] transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-black text-sm truncate">{l.hostName}</span>
                            <BadgeChip badgeId={l.hostBadge} />
                            {l.hostStreak >= 3 && <span className="text-xs font-black text-orange-400" title={`${l.hostStreak}-game win streak`}>🔥{l.hostStreak}</span>}
                          </div>
                          <div className="text-gray-500 text-xs mt-0.5">
                            {l.hostRecord.wins}W {l.hostRecord.losses}L
                            <span className="text-gray-700 mx-1.5">·</span>
                            {MODE_LABEL[l.teamMode]}
                            <span className="text-gray-700 mx-1.5">·</span>
                            {seriesLabel(l.series)}
                          </div>
                        </div>
                        <button
                          onClick={() => handleJoinListing(l.code)}
                          className="bg-orange-600 hover:bg-orange-700 text-white font-black text-xs px-4 py-2 rounded-lg transition-colors shrink-0"
                        >
                          Join
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* Your record */}
                <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
                  <div className="text-gray-600 text-xs">{user.username} · {user.wins}W {user.losses}L</div>
                  <div className="text-orange-500 text-xs font-bold">EBK</div>
                </div>
              </div>
            )}

            {/* Create game form */}
            {user && onlineState === 'idle' && showCreate && (
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-white font-black">Create Game</div>
                  <button onClick={() => setShowCreate(false)} className="text-gray-500 hover:text-white text-xs">✕ Cancel</button>
                </div>

                <div>
                  <label className="block text-gray-500 text-xs mb-2 uppercase tracking-wide">Team Mode</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['starter5', 'bench8', 'full12'] as TeamMode[]).map(val => (
                      <button key={val} onClick={() => setCreateTeamMode(val)}
                        className={`rounded-lg p-2.5 text-center border transition-all ${createTeamMode === val ? 'border-orange-500 bg-orange-600/20 text-orange-400' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                        <div className="font-black text-sm">{MODE_LABEL[val]}</div>
                        <div className="text-xs opacity-60 mt-0.5">{MODE_SUB[val]}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-gray-500 text-xs mb-2 uppercase tracking-wide">Series</label>
                  <div className="grid grid-cols-3 gap-2">
                    {([1, 3, 5] as SeriesLength[]).map(s => (
                      <button key={s} onClick={() => setCreateSeries(s)}
                        className={`rounded-lg p-2.5 text-center text-sm font-black border transition-all ${createSeries === s ? 'border-orange-500 bg-orange-600/20 text-orange-400' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                        {seriesLabel(s)}
                      </button>
                    ))}
                  </div>
                </div>

                <button onClick={handlePostGame} className="w-full bg-orange-600 hover:bg-orange-700 text-white font-black py-3 rounded-xl transition-colors">
                  Post Game
                </button>
              </div>
            )}

            {/* Your listing is live */}
            {user && onlineState === 'listing' && (
              <div className="p-6">
                <div className="text-center mb-5">
                  <div className="font-display text-2xl text-orange-500 leading-none mb-1">Game Posted</div>
                  <div className="text-gray-500 text-xs">Waiting for an opponent to join</div>
                </div>

                <div className="bg-[#0A0A0A] rounded-2xl p-4 mb-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-white font-black">{user.username}</div>
                      <div className="text-gray-500 text-xs mt-0.5">{user.wins}W {user.losses}L</div>
                    </div>
                    <div className="text-right">
                      <div className="text-orange-400 font-black text-sm">{MODE_LABEL[createTeamMode]}</div>
                      <div className="text-gray-500 text-xs">{seriesLabel(createSeries)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></div>
                    <span className="text-green-400 text-xs font-bold">Visible to all players</span>
                  </div>
                </div>

                <button onClick={handleCancelListing} className="w-full bg-[#1a1a1a] hover:bg-[#222] border border-white/10 text-gray-400 hover:text-white font-black py-3 rounded-xl transition-colors">
                  Cancel
                </button>
              </div>
            )}

            {/* Match found — pre-game lobby */}
            {user && onlineState === 'found' && matchInfo && (
              <div className="p-5 space-y-4">
                {matchInfo.grudgeMatch && (
                  <div className="bg-red-900/30 border border-red-500/40 rounded-xl py-2 px-4 text-center">
                    <span className="text-red-400 font-black text-sm tracking-widest uppercase">Grudge Match</span>
                    <span className="text-gray-500 text-xs ml-2">You&apos;ve played before</span>
                  </div>
                )}
                <div className="text-center">
                  <div className="font-display text-3xl text-orange-500 leading-none mb-1">Match Found</div>
                  <div className={`text-xs font-bold tabular-nums ${countdown <= 10 ? 'text-red-400' : countdown <= 20 ? 'text-yellow-400' : 'text-gray-500'}`}>
                    {countdown > 0 ? `Auto-starts in ${countdown}s` : 'Starting...'}
                  </div>
                </div>

                {/* Players */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'You', name: displayName, record: `${user.wins}W ${user.losses}L`, badge: matchInfo.myBadge, streak: matchInfo.myStreak, ready: matchInfo.isHost ? hostReady : guestReady, accent: 'text-orange-400' },
                    { label: 'Opponent', name: matchInfo.opponentName, record: `${matchInfo.opponentRecord.wins}W ${matchInfo.opponentRecord.losses}L`, badge: matchInfo.opponentBadge, streak: matchInfo.opponentStreak, ready: matchInfo.isHost ? guestReady : hostReady, accent: 'text-blue-400' },
                  ].map(side => (
                    <div key={side.label} className="bg-[#0A0A0A] rounded-2xl p-4 text-center">
                      <div className={`${side.accent} text-xs uppercase tracking-widest mb-2 font-bold`}>{side.label}</div>
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <span className="text-white font-black text-sm truncate">{side.name}</span>
                        <BadgeChip badgeId={side.badge} />
                      </div>
                      <div className="text-gray-500 text-xs">{side.record}</div>
                      {side.streak >= 3 && <div className="mt-1 text-orange-400 text-xs font-black">🔥 {side.streak}-game streak</div>}
                      {side.ready && <div className="mt-1 text-green-400 text-xs font-bold">Ready</div>}
                    </div>
                  ))}
                </div>

                {/* Game settings */}
                <div className="bg-[#0A0A0A] rounded-2xl px-4 py-3 flex items-center justify-between">
                  <div className="text-gray-500 text-xs">Game</div>
                  <div className="text-white font-black text-sm">
                    {MODE_LABEL[matchInfo.proposedTeamMode]}
                    <span className="text-gray-600 mx-1.5">·</span>
                    {seriesLabel(matchInfo.proposedSeries)}
                    <span className="text-gray-600 mx-1.5">·</span>
                    <span className="text-yellow-400">EBK</span>
                  </div>
                </div>

                {/* Accept / Decline */}
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={handleDecline} className="bg-[#1a1a1a] hover:bg-[#222] border border-white/10 text-gray-400 hover:text-white font-black py-3 rounded-xl transition-colors">
                    Decline
                  </button>
                  <button onClick={handleAccept} className="bg-orange-600 hover:bg-orange-700 text-white font-black py-3 rounded-xl transition-colors">
                    Accept
                  </button>
                </div>

                {(hostReady || guestReady) && !(hostReady && guestReady) && (
                  <p className="text-center text-gray-600 text-xs">
                    Waiting for {(matchInfo.isHost ? guestReady : hostReady) ? displayName : matchInfo.opponentName} to accept...
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── PLAY WITH FRIENDS MODE ──────────────────────────────────────── */}
        {mainTab === 'friends' && (
          <div className="bg-[#101010] border border-white/5 rounded-xl overflow-hidden">
            <div className="flex">
              <button onClick={() => setFriendsTab('create')} className={`flex-1 py-3 font-bold text-sm transition-colors ${friendsTab === 'create' ? 'bg-orange-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                Create Room
              </button>
              <button onClick={() => setFriendsTab('join')} className={`flex-1 py-3 font-bold text-sm transition-colors ${friendsTab === 'join' ? 'bg-orange-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                Join Room
              </button>
            </div>

            <div className="p-6 space-y-4">
              {!user && (
                <div>
                  <label className="block text-gray-400 text-xs mb-1 uppercase tracking-wide">Your Name</label>
                  <input value={userName} onChange={e => setUserName(e.target.value)} placeholder="Enter your name"
                    className="w-full bg-[#0A0A0A] border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500" />
                </div>
              )}

              {friendsTab === 'create' && (
                <>
                  <div>
                    <label className="block text-gray-400 text-xs mb-2 uppercase tracking-wide">Team Mode</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['starter5', 'bench8', 'full12'] as TeamMode[]).map(val => (
                        <button key={val} onClick={() => setTeamMode(val)}
                          className={`rounded-lg p-2.5 text-center text-xs border transition-all ${teamMode === val ? 'border-orange-500 bg-orange-600/20 text-orange-400' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                          <div className="font-black text-sm">{MODE_LABEL[val]}</div>
                          <div className="text-gray-500">{MODE_SUB[val]}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-gray-400 text-xs mb-2 uppercase tracking-wide">Series</label>
                    <div className="grid grid-cols-3 gap-2">
                      {([1, 3, 5] as SeriesLength[]).map(s => (
                        <button key={s} onClick={() => setSeries(s)}
                          className={`rounded-lg p-2.5 text-center text-sm font-black border transition-all ${series === s ? 'border-orange-500 bg-orange-600/20 text-orange-400' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                          {seriesLabel(s)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-gray-400 text-xs mb-2 uppercase tracking-wide">Mode</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => setDifficulty('casual')}
                        className={`rounded-lg p-3 text-center border transition-all ${difficulty === 'casual' ? 'border-orange-500 bg-orange-600/20 text-orange-400' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                        <div className="font-black text-sm">Casual</div>
                        <div className="text-xs opacity-70 mt-0.5">Stats shown</div>
                      </button>
                      <button onClick={() => setDifficulty('ebk')}
                        className={`rounded-lg p-3 text-center border transition-all ${difficulty === 'ebk' ? 'border-yellow-500 bg-yellow-600/10 text-yellow-400' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                        <div className="font-black text-sm">EBK</div>
                        <div className="text-xs opacity-70 mt-0.5">Blind picks</div>
                      </button>
                    </div>
                  </div>
                  <button onClick={handleCreate} disabled={loading}
                    className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-black py-3 rounded-xl transition-colors">
                    {loading ? 'Creating...' : 'Create Room'}
                  </button>
                </>
              )}

              {friendsTab === 'join' && (
                <>
                  <div>
                    <label className="block text-gray-400 text-xs mb-1 uppercase tracking-wide">Room Code</label>
                    <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="6-letter code" maxLength={6}
                      className="w-full bg-[#0A0A0A] border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm font-mono uppercase tracking-widest focus:outline-none focus:border-orange-500" />
                  </div>
                  <button onClick={handleJoin} disabled={loading}
                    className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-black py-3 rounded-xl transition-colors">
                    {loading ? 'Joining...' : 'Join Room'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
