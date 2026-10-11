'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getSocket } from '@/lib/socket'
import { useAuth } from '@/context/AuthContext'

type TeamMode = 'starter5' | 'bench8' | 'full12'
type SeriesLength = 1 | 3 | 5
type Difficulty = 'casual' | 'ebk'
type OnlineState = 'idle' | 'searching' | 'found'

export default function LobbyPage() {
  const [mainTab, setMainTab] = useState<'online' | 'friends' | 'practice'>('online')
  const { user } = useAuth()

  // ── Online state ──────────────────────────────────────────────────────────
  const [onlineState, setOnlineState] = useState<OnlineState>('idle')
  const [matchCode, setMatchCode] = useState('')
  const [opponentName, setOpponentName] = useState('')
  const [hostReady, setHostReady] = useState(false)
  const [guestReady, setGuestReady] = useState(false)
  const [countdown, setCountdown] = useState(60)
  const [onlineTeamMode, setOnlineTeamMode] = useState<TeamMode>('starter5')
  const [onlineSeries, setOnlineSeries] = useState<SeriesLength>(1)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Friends state ─────────────────────────────────────────────────────────
  const [friendsTab, setFriendsTab] = useState<'create' | 'join'>('create')
  const [teamMode, setTeamMode] = useState<TeamMode>('starter5')
  const [series, setSeries] = useState<SeriesLength>(1)
  const [difficulty, setDifficulty] = useState<Difficulty>('casual')
  const [joinCode, setJoinCode] = useState('')
  const [userName, setUserName] = useState(user?.username || '')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const router = useRouter()

  useEffect(() => {
    if (user?.username) setUserName(user.username)
  }, [user])

  // ── Socket listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket()

    const handleQueueJoined = () => setOnlineState('searching')
    const handleQueueLeft = () => setOnlineState('idle')

    const handleMatchFound = ({ code, opponentName: oppName }: {
      code: string; opponentName: string; teamMode: TeamMode; series: SeriesLength
    }) => {
      setMatchCode(code)
      setOpponentName(oppName)
      setOnlineState('found')
      setCountdown(60)
      setHostReady(false)
      setGuestReady(false)
      if (countdownRef.current) clearInterval(countdownRef.current)
      countdownRef.current = setInterval(() => {
        setCountdown(c => {
          if (c <= 1) {
            clearInterval(countdownRef.current!)
            return 0
          }
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
      const name = user?.username || userName || 'Player'
      router.push(`/game/${room.code}?role=${role}&name=${encodeURIComponent(name)}`)
    }

    const handleMatchCancelled = ({ reason }: { reason: string }) => {
      if (countdownRef.current) clearInterval(countdownRef.current)
      setOnlineState('idle')
      setError(reason)
    }

    socket.on('queue-joined', handleQueueJoined)
    socket.on('queue-left', handleQueueLeft)
    socket.on('match-found', handleMatchFound)
    socket.on('ready-update', handleReadyUpdate)
    socket.on('draft-started', handleDraftStarted)
    socket.on('match-cancelled', handleMatchCancelled)

    return () => {
      socket.off('queue-joined', handleQueueJoined)
      socket.off('queue-left', handleQueueLeft)
      socket.off('match-found', handleMatchFound)
      socket.off('ready-update', handleReadyUpdate)
      socket.off('draft-started', handleDraftStarted)
      socket.off('match-cancelled', handleMatchCancelled)
    }
  }, [router, user, userName])

  function handleFindMatch() {
    const name = user?.username || userName.trim()
    if (!name) { setError('Enter your name first'); return }
    setError('')
    const socket = getSocket()
    socket.emit('join-queue', {
      userName: name,
      userId: user?.id || null,
      teamMode: onlineTeamMode,
      series: onlineSeries,
    })
  }

  function handleCancelSearch() {
    const socket = getSocket()
    socket.emit('leave-queue')
    setOnlineState('idle')
  }

  function handleConfirmReady() {
    const socket = getSocket()
    socket.emit('confirm-ready', { code: matchCode })
  }

  function handleCreate() {
    if (!userName.trim()) { setError('Enter your name first'); return }
    setError('')
    setLoading(true)
    const socket = getSocket()
    const timeout = setTimeout(() => { setError('No response from server — try refreshing'); setLoading(false) }, 8000)
    socket.once('room-created', ({ room }: { room: { code: string } }) => {
      clearTimeout(timeout)
      router.push(`/game/${room.code}?role=host&name=${encodeURIComponent(userName.trim())}`)
    })
    socket.emit('create-room', { teamMode, series, difficulty, userName: userName.trim(), userId: user?.id || null })
  }

  function handleJoin() {
    if (!joinCode.trim()) { setError('Enter a room code'); return }
    if (!userName.trim()) { setError('Enter your name first'); return }
    setError('')
    setLoading(true)
    const socket = getSocket()
    const timeout = setTimeout(() => { setError('No response from server — try refreshing'); setLoading(false) }, 8000)
    socket.once('room-error', ({ message }: { message: string }) => { clearTimeout(timeout); setError(message); setLoading(false) })
    socket.once('draft-started', ({ room }: { room: { code: string } }) => {
      clearTimeout(timeout)
      router.push(`/game/${room.code}?role=guest&name=${encodeURIComponent(userName.trim())}`)
    })
    socket.emit('join-room', { code: joinCode.trim().toUpperCase(), userName: userName.trim(), userId: user?.id || null })
  }

  const displayName = user?.username || userName

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="font-display text-6xl text-orange-500 leading-none">EBK</h1>
          <p className="text-gray-600 text-xs tracking-widest uppercase mt-1">Elite Ball Knowledge</p>
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
            <div className="text-gray-500 text-xs mt-1">Auto-match with a random opponent</div>
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

        {/* ── ONLINE MODE ─────────────────────────────────────────────────── */}
        {mainTab === 'online' && (
          <div className="bg-[#101010] border border-white/5 rounded-xl p-6">
            {onlineState === 'idle' && (
              <div className="space-y-4">
                {!user && (
                  <div>
                    <label className="block text-gray-400 text-xs mb-1 uppercase tracking-wide">Your Name</label>
                    <input value={userName} onChange={e => setUserName(e.target.value)}
                      placeholder="Enter your name"
                      className="w-full bg-[#0A0A0A] border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500" />
                  </div>
                )}
                <div>
                  <label className="block text-gray-400 text-xs mb-2 uppercase tracking-wide">Team Mode</label>
                  <div className="grid grid-cols-3 gap-2">
                    {([['starter5', 'Starter 5', '5 players'], ['bench8', 'Bench 8', '8 players'], ['full12', 'Full 12', '12 players']] as const).map(([val, label, sub]) => (
                      <button key={val} onClick={() => setOnlineTeamMode(val)}
                        className={`rounded-lg p-2.5 text-center text-xs border transition-all ${onlineTeamMode === val ? 'border-orange-500 bg-orange-600/20 text-orange-400' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                        <div className="font-black text-sm">{label}</div>
                        <div className="text-gray-500">{sub}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-gray-400 text-xs mb-2 uppercase tracking-wide">Series</label>
                  <div className="grid grid-cols-3 gap-2">
                    {([1, 3, 5] as SeriesLength[]).map(s => (
                      <button key={s} onClick={() => setOnlineSeries(s)}
                        className={`rounded-lg p-2.5 text-center text-sm font-black border transition-all ${onlineSeries === s ? 'border-orange-500 bg-orange-600/20 text-orange-400' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                        {s === 1 ? '1 Game' : `Best of ${s}`}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bg-yellow-900/20 border border-yellow-600/40 rounded-lg px-4 py-2.5 text-xs text-yellow-400 text-center">
                  Online always plays in EBK mode — no scores shown
                </div>
                <button onClick={handleFindMatch} className="w-full bg-orange-600 hover:bg-orange-700 text-white font-black py-3 rounded-xl transition-colors text-lg">
                  Find Match
                </button>
              </div>
            )}

            {onlineState === 'searching' && (
              <div className="text-center py-6">
                <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin mx-auto mb-4"></div>
                <h3 className="text-xl font-black text-white mb-2">Searching for opponent...</h3>
                <p className="text-gray-400 text-sm mb-6">Waiting for another player to join</p>
                <button onClick={handleCancelSearch} className="text-gray-400 hover:text-white text-sm underline">Cancel</button>
              </div>
            )}

            {onlineState === 'found' && (
              <div className="text-center py-4">
                <div className="font-display text-4xl text-orange-500 mb-3 leading-none">VS</div>
                <h3 className="text-xl font-black text-white mb-1">Match Found!</h3>
                <p className="text-gray-400 mb-4">vs <span className="text-orange-400 font-bold">{opponentName}</span></p>

                {/* Countdown */}
                <div className={`text-5xl font-black mb-4 ${countdown <= 10 ? 'text-red-400 animate-pulse' : countdown <= 30 ? 'text-yellow-400' : 'text-green-400'}`}>
                  {countdown}s
                </div>

                {/* Ready status */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div className={`rounded-lg p-3 text-center text-sm font-bold border ${hostReady ? 'border-green-500 bg-green-900/30 text-green-400' : 'border-gray-700 text-gray-500'}`}>
                    {displayName || 'You'} {hostReady ? '✓ Ready' : '...'}
                  </div>
                  <div className={`rounded-lg p-3 text-center text-sm font-bold border ${guestReady ? 'border-green-500 bg-green-900/30 text-green-400' : 'border-gray-700 text-gray-500'}`}>
                    {opponentName} {guestReady ? '✓ Ready' : '...'}
                  </div>
                </div>

                <button onClick={handleConfirmReady}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-black py-4 rounded-xl text-lg transition-all hover:scale-105 mb-3">
                  Start Game
                </button>
                <p className="text-gray-500 text-xs">Both players must press Start Game to begin</p>
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
                      {([['starter5', 'Starter 5', '1 per pos'], ['bench8', 'Bench 8', '5+3'], ['full12', 'Full 12', '5+7']] as const).map(([val, label, sub]) => (
                        <button key={val} onClick={() => setTeamMode(val)}
                          className={`rounded-lg p-2.5 text-center text-xs border transition-all ${teamMode === val ? 'border-orange-500 bg-orange-600/20 text-orange-400' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                          <div className="font-black text-sm">{label}</div>
                          <div className="text-gray-500">{sub}</div>
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
                          {s === 1 ? '1 Game' : `Best of ${s}`}
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
                        <div className="text-xs opacity-70 mt-0.5">EBK scores shown</div>
                      </button>
                      <button onClick={() => setDifficulty('ebk')}
                        className={`rounded-lg p-3 text-center border transition-all ${difficulty === 'ebk' ? 'border-yellow-500 bg-yellow-600/10 text-yellow-400' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                        <div className="font-black text-sm">EBK</div>
                        <div className="text-xs opacity-70 mt-0.5">No scores — blind picks</div>
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
