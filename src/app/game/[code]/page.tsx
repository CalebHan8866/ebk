'use client'
import { useEffect, useState, useRef, useMemo, Suspense } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { getSocket } from '@/lib/socket'
import { CURRENT_TEAMS, getCurrentTeam } from '@/lib/teams'
import { EMOTES } from '@/lib/accessories'
import { useAuth } from '@/context/AuthContext'
import { type TeamMode, type GameResult, type Room, type Player, TEAM_SIZES, getRequiredPositions, getStatModeForGame } from '@/types/game'

const STAT_LABELS: Record<string, string> = {
  games_played: 'Games Played',
  ppg: 'Points Per Game',
  rpg: 'Rebounds Per Game',
  apg: 'Assists Per Game',
}

function getStatValue(player: Player, mode: string): number {
  switch (mode) {
    case 'games_played': return player.careerGames
    case 'ppg': return player.careerPPG
    case 'rpg': return player.careerRPG
    case 'apg': return player.careerAPG
    default: return 0
  }
}

function formatStat(val: number, statMode: string): string {
  if (statMode === 'games_played') return Math.round(val).toString()
  return val.toFixed(1)
}

function getStatUnit(statMode: string): string {
  switch (statMode) {
    case 'games_played': return 'total games played'
    case 'ppg': return 'pts / game (career avg)'
    case 'rpg': return 'reb / game (career avg)'
    case 'apg': return 'ast / game (career avg)'
    default: return ''
  }
}

// Map a flat list of picked player IDs to their correct position slots for display.
// Must match the server's getPickerUsedPositions algorithm exactly (uses all positions, not just primary).
function assignToSlots(pickedIds: number[], allPlayers: Map<number, Player>, requiredSlots: string[]): (Player | null)[] {
  const slots: (Player | null)[] = requiredSlots.map(() => null)
  const usedSlots = new Set<number>()
  for (const id of pickedIds) {
    const player = allPlayers.get(id)
    if (!player) continue
    const playerPositions = player.positions.split(',')
    let placed = false
    for (const pos of playerPositions) {
      const idx = requiredSlots.findIndex((s, i) => i < 5 && s === pos && !usedSlots.has(i))
      if (idx !== -1) { slots[idx] = player; usedSlots.add(idx); placed = true; break }
    }
    if (!placed) {
      const benchIdx = requiredSlots.findIndex((s, i) => s === 'BENCH' && !usedSlots.has(i))
      if (benchIdx !== -1) { slots[benchIdx] = player; usedSlots.add(benchIdx) }
    }
  }
  return slots
}

// Slot-aware version: uses the stored pickSlots arrays from server to place players exactly where chosen.
function buildSlotsFromPickSlots(
  pickedIds: number[],
  pickSlots: string[],
  allPlayers: Map<number, Player>,
  requiredSlots: string[]
): (Player | null)[] {
  const slots: (Player | null)[] = requiredSlots.map(() => null)
  const slotUsage: Record<string, number> = {}
  pickedIds.forEach((id, i) => {
    const player = allPlayers.get(id)
    if (!player) return
    const slotPos = pickSlots[i]
    if (!slotPos) return
    const usedCount = slotUsage[slotPos] || 0
    let found = 0
    for (let j = 0; j < requiredSlots.length; j++) {
      if (requiredSlots[j] === slotPos) {
        if (found === usedCount) {
          slots[j] = player
          slotUsage[slotPos] = usedCount + 1
          break
        }
        found++
      }
    }
  })
  return slots
}

function GameContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { refreshUser } = useAuth()
  const code = (params.code as string).toUpperCase()
  const role = (searchParams.get('role') as 'host' | 'guest') || 'host'
  const myName = searchParams.get('name') || 'You'

  const [room, setRoom] = useState<Room | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const playerById = useMemo(() => new Map(players.map(p => [p.id, p])), [players])
  const [seriesWinner, setSeriesWinner] = useState<'host' | 'guest' | 'draw' | null>(null)
  const [filterPos, setFilterPos] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null)
  const [lastResult, setLastResult] = useState<GameResult | null>(null)
  const [showConfetti, setShowConfetti] = useState(false)
  const [disconnected, setDisconnected] = useState(false)
  const [disconnectReason, setDisconnectReason] = useState<string | null>(null)
  // Emotes & accessories
  const [opponentEmote, setOpponentEmote] = useState<string | null>(null)
  const [unlockedToast, setUnlockedToast] = useState<{ type: string; name: string }[] | null>(null)
  const [myEmotes, setMyEmotes] = useState<string[]>([])
  const emoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pickErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Pick timer state
  const [pickTimeLeft, setPickTimeLeft] = useState(30)
  const pickTimerDurationRef = useRef(30) // tracks the initial duration for the progress bar
  const [currentPickerInTimer, setCurrentPickerInTimer] = useState<'host' | 'guest' | null>(null)
  const [timeoutWarning, setTimeoutWarning] = useState<string | null>(null)
  const pickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const playersRef = useRef<Player[]>([])
  const playerByIdRef = useRef<Map<number, Player>>(new Map())

  // Spinner state
  const [spunTeam, setSpunTeam] = useState<string | null>(null)
  const [isSpinning, setIsSpinning] = useState(false)
  const [spinDisplay, setSpinDisplay] = useState<string>('?')
  const [pickError, setPickError] = useState<string | null>(null)
  const spinIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null) // kept for compat
  const spinRefs = useRef<ReturnType<typeof setTimeout>[]>([])
  // Stable shuffle order — set once per spin, never re-sorted mid-turn
  const [shuffledIds, setShuffledIds] = useState<number[]>([])

  useEffect(() => {
    const socket = getSocket()

    const handleRoomState = ({ room, players }: { room: Room; players: Player[] }) => {
      playersRef.current = players
      playerByIdRef.current = new Map(players.map(p => [p.id, p]))
      setRoom(room); setPlayers(players)
      if (room.status === 'complete') {
        const winner = room.hostSeriesScore > room.guestSeriesScore ? 'host'
          : room.guestSeriesScore > room.hostSeriesScore ? 'guest' : 'draw'
        setSeriesWinner(winner)
      }
    }
    const handleDraftStarted = ({ room, players }: { room: Room; players: Player[] }) => {
      playersRef.current = players
      playerByIdRef.current = new Map(players.map(p => [p.id, p]))
      setRoom(room); setPlayers(players); setLastResult(null); setSearchQuery('')
      // Reset spinner/pick state from previous game in series
      setIsSpinning(false)
      setSpunTeam(null)
      setShuffledIds([])
      setSelectedPlayerId(null)
      setPickError(null)
      setCurrentPickerInTimer(null)
      if (pickTimerRef.current) { clearInterval(pickTimerRef.current); pickTimerRef.current = null }
      spinRefs.current.forEach(id => { clearInterval(id); clearTimeout(id) })
      spinRefs.current = []
      spinIntervalRef.current = null
    }
    const handleRoomUpdated = ({ room }: { room: Room }) => { setRoom(room); setSelectedPlayerId(null) }
    const handleGameResult = ({ room, result }: { room: Room; result: GameResult }) => {
      setRoom(room); setLastResult(result); setCurrentPickerInTimer(null); refreshUser()
    }
    const handleSeriesComplete = ({ room, seriesWinner }: { room: Room; seriesWinner: 'host' | 'guest' | 'draw' }) => {
      setRoom(room); setSeriesWinner(seriesWinner); setCurrentPickerInTimer(null); refreshUser()
      // Trigger confetti if this player won
      if (seriesWinner === role) { setShowConfetti(true); setTimeout(() => setShowConfetti(false), 4000) }
    }
    const handlePartnerDisconnected = () => { setDisconnected(true); setDisconnectReason(null) }
    const handleRoomError = ({ message }: { message: string }) => {
      setDisconnected(true)
      setDisconnectReason(message)
      console.error('Room error:', message)
    }

    const handlePickTimerStart = ({ picker, duration, spunTeam: team }: { picker: 'host' | 'guest'; duration: number; spunTeam: string }) => {
      if (pickTimerRef.current) clearInterval(pickTimerRef.current)
      setPickTimeLeft(duration)
      pickTimerDurationRef.current = duration
      setCurrentPickerInTimer(picker)
      setPickError(null)
      setSearchQuery('')
      setFilterPos('ALL')
      setShuffledIds([]) // clear old team's pool immediately — refilled after spin animation

      // Cancel ALL pending spin timers from any previous turn
      spinRefs.current.forEach(id => { clearInterval(id); clearTimeout(id) })
      spinRefs.current = []
      spinIntervalRef.current = null

      // On reconnect (duration < 30) skip the animation — show team immediately so the
      // player can pick before the server timer fires.
      if (duration < 30) {
        setSpunTeam(team)
        setIsSpinning(false)
        setSpinDisplay(team)
        const pool = playersRef.current.filter(p => getCurrentTeam(p.team) === team)
        setShuffledIds([...pool].sort(() => Math.random() - 0.5).map(p => p.id))
      } else {
        // Spinner animation: 3 phases (fast → medium → slow → stop)
        setSpunTeam(null)
        setIsSpinning(true)
        setSpinDisplay('?')
        const allAbbrs = CURRENT_TEAMS.map(t => t.abbr)
        const rnd = () => allAbbrs[Math.floor(Math.random() * allAbbrs.length)]

        const p1 = setInterval(() => setSpinDisplay(rnd()), 80)
        spinRefs.current.push(p1)
        const t1 = setTimeout(() => {
          clearInterval(p1)
          const p2 = setInterval(() => setSpinDisplay(rnd()), 160)
          spinRefs.current.push(p2)
          const t2 = setTimeout(() => {
            clearInterval(p2)
            const p3 = setInterval(() => setSpinDisplay(rnd()), 320)
            spinRefs.current.push(p3)
            const t3 = setTimeout(() => {
              clearInterval(p3)
              setSpunTeam(team)
              setIsSpinning(false)
              setSpinDisplay(team)
              // Shuffle the team's players once, stable for this entire pick turn
              const pool = playersRef.current.filter(p => getCurrentTeam(p.team) === team)
              setShuffledIds([...pool].sort(() => Math.random() - 0.5).map(p => p.id))
              spinRefs.current = []
            }, 640)
            spinRefs.current.push(t3)
          }, 800)
          spinRefs.current.push(t2)
        }, 1200)
        spinRefs.current.push(t1)
      }

      pickTimerRef.current = setInterval(() => {
        setPickTimeLeft(t => {
          if (t <= 1) { clearInterval(pickTimerRef.current!); return 0 }
          return t - 1
        })
      }, 1000)
    }

    const handlePickError = ({ message }: { message: string }) => {
      setPickError(message)
      if (pickErrorTimerRef.current) clearTimeout(pickErrorTimerRef.current)
      pickErrorTimerRef.current = setTimeout(() => setPickError(null), 3000)
    }

    const handleOpponentEmote = ({ emoteText }: { emoteText: string }) => {
      setOpponentEmote(emoteText)
      if (emoteTimerRef.current) clearTimeout(emoteTimerRef.current)
      emoteTimerRef.current = setTimeout(() => setOpponentEmote(null), 3000)
    }

    const handleAccessoriesUnlocked = ({ items }: { items: { type: string; name: string }[] }) => {
      setUnlockedToast(items)
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      toastTimerRef.current = setTimeout(() => setUnlockedToast(null), 6000)
    }

    const handlePickTimeout = ({ picker, pickedId, consecutive }: { picker: 'host' | 'guest'; pickedId: number; consecutive: number }) => {
      if (pickTimerRef.current) { clearInterval(pickTimerRef.current); pickTimerRef.current = null }
      // Stop any in-progress spin animation — the next pick-timer-start will start a fresh spin
      spinRefs.current.forEach(id => { clearInterval(id); clearTimeout(id) })
      spinRefs.current = []
      spinIntervalRef.current = null
      setIsSpinning(false)
      const p = playerByIdRef.current.get(pickedId)
      const name = p ? `${p.firstName} ${p.lastName}` : 'a player'
      setTimeoutWarning(`⏱ ${picker === role ? 'You' : 'Opponent'} timed out — auto-picked ${name}${consecutive >= 2 ? ' (2nd timeout!)' : ''}`)
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current)
      warningTimerRef.current = setTimeout(() => setTimeoutWarning(null), 4000)
    }

    const handlePlayerDisqualified = ({ disqualifiedRole, winner, room: r }: { disqualifiedRole: 'host' | 'guest'; winner: 'host' | 'guest'; room: Room }) => {
      if (pickTimerRef.current) { clearInterval(pickTimerRef.current); pickTimerRef.current = null }
      spinRefs.current.forEach(id => { clearInterval(id); clearTimeout(id) }); spinRefs.current = []; spinIntervalRef.current = null
      setIsSpinning(false); setSpunTeam(null)
      setCurrentPickerInTimer(null)
      setRoom(r)
      setSeriesWinner(winner)
      setTimeoutWarning(disqualifiedRole === role ? 'You were disqualified for 2 consecutive timeouts' : 'Opponent disqualified for 2 consecutive timeouts')
    }

    socket.on('room-state', handleRoomState)
    socket.on('draft-started', handleDraftStarted)
    socket.on('room-updated', handleRoomUpdated)
    socket.on('game-result', handleGameResult)
    socket.on('series-complete', handleSeriesComplete)
    socket.on('partner-disconnected', handlePartnerDisconnected)
    socket.on('room-error', handleRoomError)
    socket.on('pick-timer-start', handlePickTimerStart)
    socket.on('pick-timeout', handlePickTimeout)
    socket.on('player-disqualified', handlePlayerDisqualified)
    socket.on('pick-error', handlePickError)
    socket.on('opponent-emote', handleOpponentEmote)
    socket.on('accessories-unlocked', handleAccessoriesUnlocked)

    // Request current room state from server
    socket.emit('get-room', { code, role })

    return () => {
      socket.off('room-state', handleRoomState)
      socket.off('draft-started', handleDraftStarted)
      socket.off('room-updated', handleRoomUpdated)
      socket.off('game-result', handleGameResult)
      socket.off('series-complete', handleSeriesComplete)
      socket.off('partner-disconnected', handlePartnerDisconnected)
      socket.off('room-error', handleRoomError)
      socket.off('pick-timer-start', handlePickTimerStart)
      socket.off('pick-timeout', handlePickTimeout)
      socket.off('player-disqualified', handlePlayerDisqualified)
      socket.off('pick-error', handlePickError)
      socket.off('opponent-emote', handleOpponentEmote)
      socket.off('accessories-unlocked', handleAccessoriesUnlocked)
      if (pickTimerRef.current) clearInterval(pickTimerRef.current)
      if (spinIntervalRef.current) clearInterval(spinIntervalRef.current)
      if (emoteTimerRef.current) clearTimeout(emoteTimerRef.current)
      if (pickErrorTimerRef.current) clearTimeout(pickErrorTimerRef.current)
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current)
      spinRefs.current.forEach(id => { clearTimeout(id); clearInterval(id) })
      spinRefs.current = []
    }
  }, [code, role])

  // Load user's unlocked emotes
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (d.user?.unlockedEmotes) {
        try {
          const arr = JSON.parse(d.user.unlockedEmotes)
          setMyEmotes(Array.isArray(arr) ? arr : [])
        } catch { setMyEmotes([]) }
      }
    }).catch(() => {})
  }, [])

  function pickPlayer(playerId: number, slotPos: string) {
    const socket = getSocket()
    socket.emit('pick-player', { code, playerId, slotPos })
  }

  function startNextGame() {
    const socket = getSocket()
    socket.emit('next-game', { code })
  }

  if (disconnected) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-4">
        <div className="card-surface p-10 max-w-sm w-full animate-slide-up">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
            <span className="text-red-400 text-xl font-black">!</span>
          </div>
          <h2 className="font-display text-3xl text-white mb-2">
            {disconnectReason ? 'ROOM ERROR' : 'DISCONNECTED'}
          </h2>
          <p className="text-gray-400 text-sm mb-6 leading-relaxed">{disconnectReason ?? 'Your opponent disconnected.'}</p>
          <button onClick={() => router.push('/lobby')} className="btn-primary w-full">Back to Lobby</button>
        </div>
      </div>
    )
  }

  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 rounded-full border-2 border-orange-500 border-t-transparent animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400 text-sm tracking-widest uppercase">Connecting...</p>
        </div>
      </div>
    )
  }

  // Waiting for opponent
  if (room.status === 'waiting') {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-4">
        <div className="max-w-sm w-full animate-slide-up">
          <div className="live-banner mb-6 mx-auto w-fit">
            <span className="live-dot" />
            Waiting for opponent
          </div>
          <div className="card-accent p-8 mb-4">
            <p className="text-label tracking-[0.2em] mb-4">Room Code</p>
            <div className="font-display text-7xl text-orange-400 tracking-[0.35em] leading-none mb-3">{room.code}</div>
            <p className="text-gray-400 text-xs">Share this code with your opponent</p>
          </div>
          <div className="flex items-center justify-center gap-2 text-gray-400 text-sm">
            <span className="bg-white/[0.04] border border-white/[0.07] rounded-lg px-3 py-1.5 text-xs font-black text-gray-300">
              {room.teamMode === 'starter5' ? 'Starter 5' : room.teamMode === 'bench8' ? 'Bench 8' : 'Full Roster'}
            </span>
            <span className="text-gray-700">·</span>
            <span className="text-xs text-gray-400">{room.series === 1 ? '1 Game' : `Best of ${room.series}`}</span>
          </div>
        </div>
      </div>
    )
  }

  const myPicks = role === 'host' ? room.hostPicks : room.guestPicks
  const oppPicks = role === 'host' ? room.guestPicks : room.hostPicks
  const myName2 = role === 'host' ? room.hostName : (room.guestName || 'Opponent')
  const oppName = role === 'host' ? (room.guestName || 'Opponent') : room.hostName
  const currentPicker = room.draftOrder[room.currentPickIndex]
  const isMyTurn = currentPicker === role
  const statMode = getStatModeForGame(room.currentGame)
  const teamSize = TEAM_SIZES[room.teamMode]
  const requiredSlots = getRequiredPositions(room.teamMode)
  const takenIds = new Set([...room.hostPicks, ...room.guestPicks])

  // Series complete
  if (room.status === 'complete' && seriesWinner !== null) {
    const iWon = seriesWinner === role
    const isDraw = seriesWinner === 'draw'

    // Generate confetti pieces deterministically for SSR safety
    const confettiPieces = iWon ? Array.from({ length: 60 }, (_, i) => ({
      id: i,
      left: `${(i * 17 + 5) % 100}%`,
      delay: `${(i * 0.07) % 2}s`,
      duration: `${2.5 + (i * 0.05) % 1.5}s`,
      color: ['#f97316','#fbbf24','#4ade80','#60a5fa','#f472b6','#a78bfa'][i % 6],
      size: `${8 + (i % 5) * 2}px`,
      shape: i % 3 === 0 ? '50%' : '2px',
    })) : []

    return (
      <div className="min-h-screen px-4 py-8 overflow-y-auto">
        {/* Confetti overlay */}
        {showConfetti && iWon && (
          <div className="confetti-container">
            {confettiPieces.map(p => (
              <div key={p.id} className="confetti-piece" style={{
                left: p.left,
                width: p.size,
                height: p.size,
                backgroundColor: p.color,
                borderRadius: p.shape,
                animationDuration: p.duration,
                animationDelay: p.delay,
              }} />
            ))}
          </div>
        )}

        <div className="max-w-4xl w-full mx-auto">
          <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
          {/* LEFT col: header + game-by-game */}
          <div>
          {/* Result header */}
          <div className="text-center mb-6">
            <div
              className={`font-display leading-none mb-2 ${iWon ? 'animate-win-pop win-shimmer-text' : isDraw ? 'text-gray-400 animate-scale-in' : 'text-gray-400 animate-loss-drop'}`}
              style={iWon ? { fontSize: 'clamp(5rem, 22vw, 9rem)' } : { fontSize: 'clamp(4rem, 18vw, 7rem)' }}>
              {iWon ? 'W' : isDraw ? 'DRAW' : 'L'}
            </div>
            <div className={`font-black text-lg mb-1 ${iWon ? 'text-white' : isDraw ? 'text-gray-400' : 'text-gray-400'}`}>
              {iWon ? 'Series Win' : isDraw ? 'Series Draw' : 'Series Loss'}
            </div>
            <div className="text-orange-400 font-display text-3xl leading-none tracking-wide">
              {room.hostSeriesScore} <span className="text-gray-400">–</span> {room.guestSeriesScore}
            </div>
            <div className="text-gray-400 text-xs mt-1 truncate">{room.hostName} vs {room.guestName}</div>
            {iWon && (
              <div className="mt-3 inline-flex items-center gap-2 bg-orange-950/40 border border-orange-700/40 rounded-full px-4 py-1.5">
                <span className="text-orange-300 text-xs font-black tracking-widest uppercase">Elite Ball Knowledge Confirmed</span>
              </div>
            )}
            {!iWon && !isDraw && (
              <div className="mt-3 inline-flex items-center gap-2 bg-white/[0.03] border border-white/[0.08] rounded-full px-4 py-1.5">
                <span className="text-gray-400 text-xs font-semibold">Study the player pool and run it back</span>
              </div>
            )}
          </div>

          {timeoutWarning && (
            <div className="bg-yellow-900/40 border border-yellow-700 text-yellow-400 rounded-2xl px-4 py-3 text-sm text-center mb-4">
              {timeoutWarning}
            </div>
          )}

          {/* Unlock toast */}
          {unlockedToast && unlockedToast.length > 0 && (
            <div className="bg-orange-900/30 border border-orange-500 rounded-2xl px-4 py-3 mb-4">
              <div className="text-orange-400 font-black text-xs mb-2 uppercase tracking-widest">Unlocked!</div>
              <div className="space-y-1">
                {unlockedToast.map((item, i) => (
                  <div key={i} className="text-white text-sm font-semibold">
                    <span className="text-orange-400 mr-2">{item.type === 'badge' ? '🏅' : item.type === 'emote' ? '💬' : '🏆'}</span>
                    {item.name}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Game-by-game breakdown */}
          {room.gameResults.length > 0 && (
            <div className="card-surface rounded-3xl p-4 mb-4">
              <div className="text-gray-400 text-xs uppercase tracking-widest mb-3 font-bold">Game by Game</div>
              <div className="space-y-2">
                {room.gameResults.map(r => {
                  const myTotal = role === 'host' ? r.hostTotal : r.guestTotal
                  const oppTotal = role === 'host' ? r.guestTotal : r.hostTotal
                  const gameWon = r.winner === role
                  const gameDraw = r.winner === 'draw'
                  return (
                    <div key={r.game} className={`flex items-center rounded-2xl px-3 py-2.5 gap-2 border ${
                      gameWon ? 'bg-green-950/20 border-green-900/30' : gameDraw ? 'bg-[#0d0d0d] border-white/[0.07]' : 'bg-[#0d0d0d] border-white/[0.07]'
                    }`}>
                      <div className="w-10 shrink-0 text-gray-400 text-xs font-black">G{r.game}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-display text-lg leading-none">
                          {formatStat(myTotal, r.statMode)} <span className="text-gray-400">–</span> {formatStat(oppTotal, r.statMode)}
                        </div>
                        <div className="text-gray-400 text-xs truncate">{STAT_LABELS[r.statMode]}</div>
                      </div>
                      <div className={`font-display text-base leading-none shrink-0 ${gameWon ? 'text-green-400' : gameDraw ? 'text-yellow-400' : 'text-red-500'}`}>
                        {gameWon ? 'W' : gameDraw ? 'D' : 'L'}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          </div>{/* end LEFT col */}

          {/* RIGHT col: Draft Recap (last game) */}
          <div>
          {myPicks.length > 0 && (() => {
            const lastGame = room.gameResults[room.gameResults.length - 1]
            if (!lastGame) return null
            const lastIWon = lastGame.winner === role
            const lastDraw = lastGame.winner === 'draw'
            const myPickSlotsComplete = role === 'host' ? (room.hostPickSlots || []) : (room.guestPickSlots || [])
            const mySlotsComplete = myPickSlotsComplete.length > 0
              ? buildSlotsFromPickSlots(myPicks, myPickSlotsComplete, playerById, requiredSlots)
              : assignToSlots(myPicks, playerById, requiredSlots)
            const oppPickSlotsComplete = role === 'host' ? (room.guestPickSlots || []) : (room.hostPickSlots || [])
            const oppSlotsComplete = oppPickSlotsComplete.length > 0
              ? buildSlotsFromPickSlots(oppPicks, oppPickSlotsComplete, playerById, requiredSlots)
              : assignToSlots(oppPicks, playerById, requiredSlots)
            const myLastTotal = role === 'host' ? lastGame.hostTotal : lastGame.guestTotal
            const oppLastTotal = role === 'host' ? lastGame.guestTotal : lastGame.hostTotal
            return (
              <div className="card-surface rounded-2xl p-4 mb-4">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-gray-400 text-xs uppercase tracking-wide font-bold">Draft Recap — Game {lastGame.game}</h2>
                  <span className="text-gray-400 text-xs">{STAT_LABELS[lastGame.statMode]}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {/* My team */}
                  <div>
                    <div className={`text-xs font-black mb-2 text-center truncate ${lastIWon ? 'text-green-400' : lastDraw ? 'text-gray-400' : 'text-gray-400'}`}>
                      {myName2} {lastIWon ? '✓' : lastDraw ? '—' : ''}
                    </div>
                    <div className="space-y-1">
                      {requiredSlots.map((slotPos, i) => {
                        const p = mySlotsComplete[i]
                        if (!p) return null
                        const val = getStatValue(p, lastGame.statMode)
                        return (
                          <div key={i} className="bg-[#0A0A0A] rounded px-2 py-1.5 flex items-center justify-between gap-1">
                            <div className="min-w-0">
                              <span className={`text-[10px] font-bold mr-1 ${slotPos === 'BENCH' ? 'text-gray-400' : 'text-orange-400'}`}>{slotPos === 'BENCH' ? 'BN' : slotPos}</span>
                              <span className="text-white text-xs font-semibold truncate" title={`${p.firstName} ${p.lastName}`}>{p.lastName}</span>
                            </div>
                            <span className={`text-xs font-black shrink-0 ${lastIWon ? 'text-green-400' : 'text-gray-300'}`}>{formatStat(val, lastGame.statMode)}</span>
                          </div>
                        )
                      })}
                    </div>
                    <div className={`mt-2 text-center text-sm font-black border-t border-gray-800 pt-2 ${lastIWon ? 'text-green-400' : lastDraw ? 'text-gray-400' : 'text-white'}`}>{formatStat(myLastTotal, lastGame.statMode)}</div>
                  </div>
                  {/* Opponent team */}
                  <div>
                    <div className={`text-xs font-black mb-2 text-center truncate ${!lastIWon && !lastDraw ? 'text-green-400' : lastDraw ? 'text-gray-400' : 'text-gray-400'}`}>
                      {oppName} {!lastIWon && !lastDraw ? '✓' : lastDraw ? '—' : ''}
                    </div>
                    <div className="space-y-1">
                      {requiredSlots.map((slotPos, i) => {
                        const p = oppSlotsComplete[i]
                        if (!p) return null
                        const val = getStatValue(p, lastGame.statMode)
                        return (
                          <div key={i} className="bg-[#0A0A0A] rounded px-2 py-1.5 flex items-center justify-between gap-1">
                            <div className="min-w-0">
                              <span className={`text-[10px] font-bold mr-1 ${slotPos === 'BENCH' ? 'text-gray-400' : 'text-orange-400'}`}>{slotPos === 'BENCH' ? 'BN' : slotPos}</span>
                              <span className="text-white text-xs font-semibold truncate" title={`${p.firstName} ${p.lastName}`}>{p.lastName}</span>
                            </div>
                            <span className={`text-xs font-black shrink-0 ${!lastIWon && !lastDraw ? 'text-green-400' : 'text-gray-300'}`}>{formatStat(val, lastGame.statMode)}</span>
                          </div>
                        )
                      })}
                    </div>
                    <div className={`mt-2 text-center text-sm font-black border-t border-gray-800 pt-2 ${!lastIWon && !lastDraw ? 'text-green-400' : lastDraw ? 'text-gray-400' : 'text-white'}`}>{formatStat(oppLastTotal, lastGame.statMode)}</div>
                  </div>
                </div>
              </div>
            )
          })()}
          </div>{/* end RIGHT col */}
          </div>{/* end lg:grid */}

          {/* CTA — differentiate win vs loss */}
          {iWon ? (
            <div className="flex flex-col sm:flex-row gap-3 mt-4">
              <button onClick={() => router.push('/lobby')} className="btn-primary flex-1 py-4 text-base font-display tracking-widest">
                Play Again
              </button>
              <button onClick={() => router.push('/lobby')} className="btn-secondary flex-1 py-4 text-sm font-black uppercase tracking-widest">
                Find New Opponent
              </button>
            </div>
          ) : isDraw ? (
            <button onClick={() => router.push('/lobby')} className="btn-primary w-full mt-4 py-4 text-base font-display tracking-widest">
              Rematch
            </button>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3 mt-4">
              <button onClick={() => router.push('/lobby')} className="btn-primary flex-1 py-4 text-base font-display tracking-widest">
                Rematch
              </button>
              <button onClick={() => router.push('/practice')} className="btn-secondary flex-1 py-4 text-sm font-black uppercase tracking-widest">
                Practice Draft
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Game result (between games in series)
  // On reconnect lastResult is null — derive it from room.gameResults
  const effectiveLastResult = lastResult ?? (room.gameResults.length > 0 ? room.gameResults[room.gameResults.length - 1] : null)
  if (room.status === 'result' && effectiveLastResult) {
    const myTotal = role === 'host' ? effectiveLastResult.hostTotal : effectiveLastResult.guestTotal
    const oppTotal = role === 'host' ? effectiveLastResult.guestTotal : effectiveLastResult.hostTotal
    const iWon = effectiveLastResult.winner === role
    const isDraw = effectiveLastResult.winner === 'draw'

    const myPickSlotsResult = role === 'host' ? (room.hostPickSlots || []) : (room.guestPickSlots || [])
    const mySlotsResult = myPickSlotsResult.length > 0
      ? buildSlotsFromPickSlots(myPicks, myPickSlotsResult, playerById, requiredSlots)
      : assignToSlots(myPicks, playerById, requiredSlots)
    const oppPickSlotsResult = role === 'host' ? (room.guestPickSlots || []) : (room.hostPickSlots || [])
    const oppSlotsResult = oppPickSlotsResult.length > 0
      ? buildSlotsFromPickSlots(oppPicks, oppPickSlotsResult, playerById, requiredSlots)
      : assignToSlots(oppPicks, playerById, requiredSlots)

    return (
      <div className="min-h-screen px-4 py-8 overflow-y-auto">
        <div className="max-w-4xl w-full mx-auto">
          <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
          {/* LEFT: header + scores + series */}
          <div>
          {/* Result header */}
          <div className="text-center mb-4">
            <div
              className={`font-display leading-none mb-2 ${iWon ? 'animate-win-pop win-shimmer-text' : isDraw ? 'text-gray-400 animate-scale-in' : 'text-gray-400 animate-loss-drop'}`}
              style={iWon ? { fontSize: 'clamp(5rem, 20vw, 8rem)' } : { fontSize: 'clamp(4rem, 18vw, 7rem)' }}>
              {iWon ? 'W' : isDraw ? 'D' : 'L'}
            </div>
            <div className={`font-black text-lg ${iWon ? 'text-white' : isDraw ? 'text-gray-400' : 'text-gray-400'}`}>
              {iWon ? `Game ${effectiveLastResult.game} — You Win` : isDraw ? `Game ${effectiveLastResult.game} — Draw` : `Game ${effectiveLastResult.game} — You Lose`}
            </div>
          </div>

          {/* Stat explanation */}
          <div className="card-surface rounded-xl px-4 py-2.5 mb-4 text-center">
            <div className="text-gray-300 text-sm">Lower total <span className="text-orange-400 font-black">{STAT_LABELS[effectiveLastResult.statMode]}</span> wins</div>
            <div className="text-gray-400 text-xs mt-0.5">Add up every player&apos;s career {effectiveLastResult.statMode === 'games_played' ? 'games played' : effectiveLastResult.statMode.toUpperCase()} — lowest team total takes the game</div>
          </div>

          {/* Score cards */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            {([{ name: myName2, total: myTotal, isMe: true }, { name: oppName, total: oppTotal, isMe: false }] as const).map(side => {
              const isWinner = (side.isMe && iWon) || (!side.isMe && !iWon && !isDraw)
              return (
                <div key={side.name} className={`rounded-2xl p-4 text-center transition-all ${
                  isWinner ? 'bg-green-900/20 border-2 border-green-500'
                  : isDraw ? 'bg-[#111] border-2 border-gray-700'
                  : 'bg-[#0D0D0D] border-2 border-[#1a1a1a]'
                }`}>
                  <div className="text-gray-400 text-xs uppercase tracking-widest mb-2 truncate">{side.name}</div>
                  <div className={`font-display leading-none mb-1 ${isWinner ? 'text-green-400' : 'text-white'}`}
                    style={{ fontSize: 'clamp(2rem, 10vw, 3rem)' }}>
                    {formatStat(side.total, effectiveLastResult.statMode)}
                  </div>
                  <div className="text-gray-400 text-xs leading-tight">{getStatUnit(effectiveLastResult.statMode)}</div>
                  {isWinner && !isDraw && <div className="text-green-400 text-xs font-black mt-1">LOWER ✓</div>}
                </div>
              )
            })}
          </div>

          {/* Series score */}
          {room.series > 1 && (
            <div className="card-surface rounded-2xl px-4 py-3 mb-4 text-center">
              <div className="text-gray-400 text-xs uppercase tracking-widest mb-2 font-bold">Series</div>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <span className="text-gray-300 font-black text-base truncate max-w-[100px]">{room.hostName}</span>
                <span className="text-orange-400 font-display text-3xl leading-none tracking-tight">{room.hostSeriesScore}</span>
                <span className="text-gray-400 text-base font-bold">–</span>
                <span className="text-orange-400 font-display text-3xl leading-none tracking-tight">{room.guestSeriesScore}</span>
                <span className="text-gray-300 font-black text-base truncate max-w-[100px]">{room.guestName}</span>
              </div>
            </div>
          )}
          </div>{/* end LEFT col */}

          {/* RIGHT col: Draft Recap */}
          <div>
          <div className="card-surface rounded-2xl p-4 mb-4">
            <h2 className="text-gray-400 text-xs uppercase tracking-wide mb-3 font-bold">Draft Recap — Game {effectiveLastResult.game}</h2>
            <div className="grid grid-cols-2 gap-2">
              {/* My team */}
              <div>
                <div className={`text-xs font-black mb-2 text-center truncate ${iWon ? 'text-green-400' : isDraw ? 'text-gray-400' : 'text-gray-400'}`}>
                  {myName2} {iWon ? '✓' : isDraw ? '—' : ''}
                </div>
                <div className="space-y-1">
                  {requiredSlots.map((slotPos, i) => {
                    const p = mySlotsResult[i]
                    if (!p) return null
                    const val = getStatValue(p, effectiveLastResult.statMode)
                    return (
                      <div key={i} className="bg-[#0A0A0A] rounded px-2 py-1.5 flex items-center justify-between gap-1">
                        <div className="min-w-0">
                          <span className={`text-[10px] font-bold mr-1 ${slotPos === 'BENCH' ? 'text-gray-400' : 'text-orange-400'}`}>{slotPos === 'BENCH' ? 'BN' : slotPos}</span>
                          <span className="text-white text-xs font-semibold truncate" title={`${p.firstName} ${p.lastName}`}>{p.lastName}</span>
                        </div>
                        <span className={`text-xs font-black shrink-0 ${iWon ? 'text-green-400' : 'text-gray-300'}`}>{formatStat(val, effectiveLastResult.statMode)}</span>
                      </div>
                    )
                  })}
                </div>
                <div className={`mt-2 text-center text-sm font-black border-t border-gray-800 pt-2 ${iWon ? 'text-green-400' : isDraw ? 'text-gray-400' : 'text-white'}`}>{formatStat(myTotal, effectiveLastResult.statMode)}</div>
              </div>
              {/* Opponent team */}
              <div>
                <div className={`text-xs font-black mb-2 text-center truncate ${!iWon && !isDraw ? 'text-green-400' : isDraw ? 'text-gray-400' : 'text-gray-400'}`}>
                  {oppName} {!iWon && !isDraw ? '✓' : isDraw ? '—' : ''}
                </div>
                <div className="space-y-1">
                  {requiredSlots.map((slotPos, i) => {
                    const p = oppSlotsResult[i]
                    if (!p) return null
                    const val = getStatValue(p, effectiveLastResult.statMode)
                    return (
                      <div key={i} className="bg-[#0A0A0A] rounded px-2 py-1.5 flex items-center justify-between gap-1">
                        <div className="min-w-0">
                          <span className={`text-[10px] font-bold mr-1 ${slotPos === 'BENCH' ? 'text-gray-400' : 'text-orange-400'}`}>{slotPos === 'BENCH' ? 'BN' : slotPos}</span>
                          <span className="text-white text-xs font-semibold truncate" title={`${p.firstName} ${p.lastName}`}>{p.lastName}</span>
                        </div>
                        <span className={`text-xs font-black shrink-0 ${!iWon && !isDraw ? 'text-green-400' : 'text-gray-300'}`}>{formatStat(val, effectiveLastResult.statMode)}</span>
                      </div>
                    )
                  })}
                </div>
                <div className={`mt-2 text-center text-sm font-black border-t border-gray-800 pt-2 ${!iWon && !isDraw ? 'text-green-400' : isDraw ? 'text-gray-400' : 'text-white'}`}>{formatStat(oppTotal, effectiveLastResult.statMode)}</div>
              </div>
            </div>
          </div>
          </div>{/* end RIGHT col */}
          </div>{/* end lg:grid */}

          {/* CTA */}
          {role === 'host' ? (
            <button onClick={startNextGame} className="btn-primary w-full mt-2 py-4 text-base font-display tracking-widest">
              Start Game {room.currentGame + 1}
            </button>
          ) : (
            <div className="card-surface rounded-2xl py-4 px-6 text-center mt-2 flex items-center justify-center gap-3">
              <span className="w-4 h-4 rounded-full border-2 border-orange-500 border-t-transparent animate-spin shrink-0"></span>
              <span className="text-gray-400 text-sm">Waiting for <span className="text-white font-bold">{room.hostName}</span>...</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  // DRAFTING PHASE
  const spunTeamInfo = spunTeam ? CURRENT_TEAMS.find(t => t.abbr === spunTeam) : null

  // Slot-based display for both teams
  const myPickSlots = role === 'host' ? (room.hostPickSlots || []) : (room.guestPickSlots || [])
  const oppPickSlots = role === 'host' ? (room.guestPickSlots || []) : (room.hostPickSlots || [])
  const mySlots = myPickSlots.length > 0
    ? buildSlotsFromPickSlots(myPicks, myPickSlots, playerById, requiredSlots)
    : assignToSlots(myPicks, playerById, requiredSlots)
  const oppSlots = oppPickSlots.length > 0
    ? buildSlotsFromPickSlots(oppPicks, oppPickSlots, playerById, requiredSlots)
    : assignToSlots(oppPicks, playerById, requiredSlots)

  // Track consumed slot positions by slot label (not player's primary position)
  const usedStarterPositions = new Set(
    requiredSlots.slice(0, 5).filter((_, i) => mySlots[i] !== null)
  )
  const isStarterSlot = usedStarterPositions.size < 5
  const remainingStarterPositions = ['PG', 'SG', 'SF', 'PF', 'C'].filter(p => !usedStarterPositions.has(p))

  const selectedPlayer = selectedPlayerId !== null ? playerById.get(selectedPlayerId) ?? null : null

  function getValidSlots(player: Player): Set<number> {
    const valid = new Set<number>()
    const playerPositions = player.positions.split(',')
    requiredSlots.forEach((s, i) => {
      if (mySlots[i] !== null) return
      if (playerPositions.includes(s)) valid.add(i) // any of the player's listed positions
      if (s === 'BENCH') valid.add(i)               // any bench slot
    })
    return valid
  }

  function selectAndPick(playerId: number) {
    const player = playerById.get(playerId)
    if (!player) return
    const validSlots = getValidSlots(player)
    // If only one valid slot (or no bench available), pick immediately
    if (validSlots.size === 1) {
      const slotIdx = Array.from(validSlots)[0]
      const slotPos = requiredSlots[slotIdx]
      pickPlayer(playerId, slotPos)
      setSelectedPlayerId(null)
    } else if (validSlots.size === 0) {
      return
    } else {
      // Multiple choices — select the player, let user tap a slot
      setSelectedPlayerId(prev => prev === playerId ? null : playerId)
    }
  }

  function pickIntoSlot(slotIndex: number) {
    if (!selectedPlayer || !isMyTurn) return
    const validSlots = getValidSlots(selectedPlayer)
    if (!validSlots.has(slotIndex)) return
    const slotPos = requiredSlots[slotIndex]
    pickPlayer(selectedPlayer.id, slotPos)
    setSelectedPlayerId(null)
  }

  // Build display list from shuffled order; apply search/pos filter on top
  const filteredPlayers = shuffledIds
    .map(id => playerById.get(id))
    .filter((p): p is Player => {
      if (!p) return false
      if (room?.difficulty === 'ebk' && searchQuery.length < 3) return false
      if (takenIds.has(p.id)) return false
      // Starter slots: hide only if ALL of the player's positions are used
      if (isStarterSlot && p.positions.split(',').every(pos => usedStarterPositions.has(pos))) return false
      if (filterPos !== 'ALL' && !p.positions.split(',').includes(filterPos)) return false
      if (searchQuery) {
        const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        const q = norm(searchQuery)
        const currentAbbr = getCurrentTeam(p.team)
        const teamEntry = CURRENT_TEAMS.find(t => t.abbr === currentAbbr)
        const teamSearchStr = norm([p.team, currentAbbr, teamEntry?.name ?? '', teamEntry?.city ?? ''].join(' '))
        if (!norm(`${p.firstName} ${p.lastName}`).includes(q) && !teamSearchStr.includes(q)) return false
      }
      return true
    })

  return (
    <div className="min-h-screen py-4 px-4 relative">
      {/* Opponent emote popup */}
      {opponentEmote && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-slide-up">
          <div className="card-glass border border-orange-500/60 text-white px-5 py-3 rounded-2xl shadow-2xl shadow-orange-900/30">
            <span className="text-label text-center block mb-1.5">{oppName}</span>
            <div className="text-white font-semibold text-center">{opponentEmote}</div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto">
        {/* ── Command Header ─────────────────────────────────────────────── */}
        {/* Single unified bar: game info + series score + turn state + timer */}
        <div className={`rounded-2xl mb-4 overflow-hidden transition-all ${
          isMyTurn
            ? 'shadow-[0_0_32px_rgba(234,88,12,0.3)]'
            : ''
        }`}>
          {/* Top strip: game label + series score */}
          <div className="bg-[#111118] border border-white/[0.07] rounded-t-2xl px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <span className="font-display text-orange-500 text-base leading-none tracking-wider shrink-0">
                GAME {room.currentGame}{room.series > 1 ? ` / ${room.series}` : ''}
              </span>
              <span className="text-gray-700 text-xs font-bold hidden sm:inline">|</span>
              <span className="text-gray-400 text-xs truncate hidden sm:inline">
                {STAT_LABELS[statMode]} · lower wins
              </span>
              {room.difficulty === 'ebk' && (
                <span className="text-[10px] font-black tracking-widest text-yellow-500 bg-yellow-900/20 border border-yellow-800/40 rounded px-2 py-0.5 shrink-0">EBK</span>
              )}
            </div>
            {room.series > 1 ? (
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-gray-400 text-xs font-bold truncate max-w-[70px]">{room.hostName}</span>
                <div className="flex items-center gap-1.5 bg-[#0d0d14] rounded-lg px-3 py-1 border border-white/[0.06]">
                  <span className="font-display text-orange-400 text-xl leading-none">{room.hostSeriesScore}</span>
                  <span className="text-gray-400 text-xs">–</span>
                  <span className="font-display text-orange-400 text-xl leading-none">{room.guestSeriesScore}</span>
                </div>
                <span className="text-gray-400 text-xs font-bold truncate max-w-[70px]">{room.guestName}</span>
              </div>
            ) : (
              <span className="text-gray-400 text-xs font-mono">{room.code}</span>
            )}
          </div>

          {/* Turn state + integrated timer */}
          <div className={`relative px-4 py-3 transition-all ${
            isMyTurn
              ? 'bg-gradient-to-r from-orange-950/60 via-orange-900/40 to-orange-950/60 border-x-2 border-b-2 border-orange-500/80 rounded-b-2xl'
              : 'bg-[#0d0d14] border-x border-b border-white/[0.05] rounded-b-2xl'
          }`}>
            <div className="flex items-center justify-between gap-3">
              {isMyTurn ? (
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse shrink-0" />
                  <div>
                    <div className="font-display text-orange-400 leading-none tracking-widest" style={{ fontSize: 'clamp(1.25rem, 5vw, 1.75rem)' }}>
                      YOUR PICK
                    </div>
                    <div className="text-orange-300/50 text-[11px] tracking-wider uppercase mt-0.5">
                      {isSpinning ? 'Waiting for team spin…' : spunTeam ? `Pick from ${spunTeam}` : 'Select a player'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-gray-600 animate-pulse shrink-0" />
                  <div>
                    <div className="text-gray-300 font-black text-base">
                      {currentPicker === 'host' ? room.hostName : room.guestName}
                    </div>
                    <div className="text-gray-400 text-[11px] tracking-wider uppercase">is picking…</div>
                  </div>
                </div>
              )}

              {/* Timer — always in the header, never buried */}
              {room.status === 'drafting' && currentPickerInTimer && (
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <div className={`font-display text-2xl leading-none tabular-nums ${
                    pickTimeLeft <= 5 ? 'text-red-400' : pickTimeLeft <= 10 ? 'text-yellow-400' : 'text-gray-300'
                  }`}>
                    {pickTimeLeft}
                    <span className="text-sm font-sans ml-0.5">s</span>
                  </div>
                  <div className="w-20 bg-gray-800/80 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-1000 ${
                        pickTimeLeft <= 5 ? 'bg-red-500' : pickTimeLeft <= 10 ? 'bg-yellow-400' : 'bg-green-500'
                      }`}
                      style={{ width: `${(pickTimeLeft / pickTimerDurationRef.current) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile: teams side by side on top. Desktop: 4-col grid */}

        {/* Teams row — always visible, compact on mobile */}
        <div className="grid grid-cols-2 gap-2 mb-4 lg:hidden">
          {/* My Team (mobile) */}
          <div className="bg-orange-950/20 border border-orange-900/30 rounded-2xl p-3">
            <div className="text-orange-400 font-black text-xs mb-2 truncate">
              {myName2} <span className="text-gray-400 font-normal">({myPicks.length}/{teamSize})</span>
            </div>
            <div className="space-y-1">
              {requiredSlots.map((slotPos, i) => {
                const pickedPlayer = mySlots[i]
                const isBench = slotPos === 'BENCH'
                const displayLabel = isBench ? 'BN' : slotPos
                const validSlots = selectedPlayer ? getValidSlots(selectedPlayer) : new Set<number>()
                const isValidTarget = isMyTurn && selectedPlayer !== null && validSlots.has(i) && pickedPlayer === null
                const isBlocked = isMyTurn && selectedPlayer !== null && !validSlots.has(i) && pickedPlayer === null
                const slotLabel = pickedPlayer
                  ? `${displayLabel} slot: ${pickedPlayer.lastName}`
                  : isValidTarget
                  ? `Place ${selectedPlayer?.lastName ?? 'player'} in ${displayLabel} slot`
                  : `${displayLabel} slot: empty`
                const Elem = isValidTarget ? 'button' : 'div'
                return (
                  <Elem
                    key={i}
                    onClick={isValidTarget ? () => pickIntoSlot(i) : undefined}
                    aria-label={isValidTarget ? slotLabel : undefined}
                    className={`rounded px-2 py-1 text-xs flex items-center gap-1.5 transition-all ${
                      isValidTarget
                        ? 'bg-orange-600/20 border border-orange-500 cursor-pointer'
                        : isBlocked
                        ? 'bg-[#0A0A0A] border border-dashed border-gray-800 opacity-30'
                        : pickedPlayer
                        ? 'bg-[#0A0A0A]'
                        : 'bg-[#0A0A0A] border border-dashed border-gray-700'
                    }`}
                  >
                    <span className={`font-bold w-6 shrink-0 text-[10px] ${isBench ? 'text-gray-400' : 'text-orange-400'}`}>{displayLabel}</span>
                    <span className={`truncate ${pickedPlayer ? 'text-white' : isValidTarget ? 'text-orange-300' : 'text-gray-400'}`} title={pickedPlayer ? `${pickedPlayer.firstName} ${pickedPlayer.lastName}` : undefined}>
                      {pickedPlayer ? pickedPlayer.lastName : isValidTarget ? 'tap' : '—'}
                    </span>
                  </Elem>
                )
              })}
            </div>
          </div>

          {/* Opponent Team (mobile) */}
          <div className="bg-blue-950/10 border border-blue-900/20 rounded-2xl p-3">
            <div className="text-blue-400 font-black text-xs mb-2 truncate">
              {oppName} <span className="text-gray-400 font-normal">({oppPicks.length}/{teamSize})</span>
            </div>
            <div className="space-y-1">
              {requiredSlots.map((slotPos, i) => {
                const pickedPlayer = oppSlots[i]
                const isBench = slotPos === 'BENCH'
                const displayLabel = isBench ? 'BN' : slotPos
                return (
                  <div key={i} className={`rounded px-2 py-1 text-xs flex items-center gap-1.5 bg-[#0A0A0A] ${!pickedPlayer ? 'border border-dashed border-gray-700' : ''}`}>
                    <span className={`font-bold w-6 shrink-0 text-[10px] ${isBench ? 'text-gray-400' : 'text-blue-400'}`}>{displayLabel}</span>
                    <span className={`truncate ${pickedPlayer ? 'text-white' : 'text-gray-400'}`} title={pickedPlayer ? `${pickedPlayer.firstName} ${pickedPlayer.lastName}` : undefined}>
                      {pickedPlayer ? pickedPlayer.lastName : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Player pool (mobile: full width, desktop: inside 4-col grid) */}
        <div className="lg:grid lg:grid-cols-4 lg:gap-4">
          {/* My Team (desktop only) */}
          <div className="hidden lg:block bg-orange-950/20 border border-orange-900/30 rounded-2xl p-4">
            <h3 className="text-white font-black text-sm mb-3">
              {myName2} <span className="text-gray-400 font-normal">({myPicks.length}/{teamSize})</span>
            </h3>
            <div className="space-y-1.5">
              {requiredSlots.map((slotPos, i) => {
                const pickedPlayer = mySlots[i]
                const isBench = slotPos === 'BENCH'
                const displayLabel = isBench ? 'BN' : slotPos
                const validSlots = selectedPlayer ? getValidSlots(selectedPlayer) : new Set<number>()
                const isValidTarget = isMyTurn && selectedPlayer !== null && validSlots.has(i) && pickedPlayer === null
                const isBlocked = isMyTurn && selectedPlayer !== null && !validSlots.has(i) && pickedPlayer === null
                const slotLabelDesktop = pickedPlayer
                  ? `${displayLabel} slot: ${pickedPlayer.firstName} ${pickedPlayer.lastName}`
                  : isValidTarget
                  ? `Place ${selectedPlayer?.lastName ?? 'player'} in ${displayLabel} slot`
                  : `${displayLabel} slot: empty`
                const DeskElem = isValidTarget ? 'button' : 'div'
                return (
                  <DeskElem
                    key={i}
                    onClick={isValidTarget ? () => pickIntoSlot(i) : undefined}
                    aria-label={isValidTarget ? slotLabelDesktop : undefined}
                    className={`rounded-lg px-3 py-2 text-xs flex items-center gap-2 transition-all ${
                      isValidTarget
                        ? 'bg-orange-600/20 border border-orange-500 cursor-pointer hover:bg-orange-600/40'
                        : isBlocked
                        ? 'bg-[#0A0A0A] border border-dashed border-gray-800 opacity-30'
                        : pickedPlayer
                        ? 'bg-[#0A0A0A]'
                        : 'bg-[#0A0A0A] border border-dashed border-gray-700'
                    }`}
                  >
                    <span className={`font-bold w-8 shrink-0 ${isBench ? 'text-gray-400' : 'text-orange-400'}`}>{displayLabel}</span>
                    {pickedPlayer ? (
                      <span className="text-white truncate" title={`${pickedPlayer.firstName} ${pickedPlayer.lastName}`}>{pickedPlayer.firstName} {pickedPlayer.lastName} <span className="text-gray-400">({pickedPlayer.team})</span></span>
                    ) : (
                      <span className={isValidTarget ? 'text-orange-300' : 'text-gray-400'}>
                        {isValidTarget ? 'tap to place' : 'empty'}
                      </span>
                    )}
                  </DeskElem>
                )
              })}
            </div>
          </div>

          {/* Player Pool */}
          <div className="lg:col-span-2">
            {/* Team Spinner */}
            <div className={`rounded-xl p-3 mb-3 flex items-center gap-3 border-2 transition-all ${
              isSpinning ? 'border-yellow-500 bg-yellow-900/20' :
              spunTeam ? 'border-orange-500 bg-orange-900/20' : 'border-gray-700 bg-[#111827]'
            }`}>
              <div className={`text-3xl font-black w-16 text-center shrink-0 transition-all ${
                isSpinning ? 'text-yellow-400 animate-pulse' : 'text-orange-400'
              }`}>
                {spinDisplay}
              </div>
              <div className="flex-1 min-w-0">
                {isSpinning ? (
                  <div>
                    <div className="text-yellow-400 font-black text-sm">Spinning...</div>
                    <div className="text-gray-400 text-xs">Wait for your team assignment</div>
                  </div>
                ) : spunTeam && spunTeamInfo ? (
                  <div>
                    <div className="text-white font-black text-sm truncate">{spunTeamInfo.city} {spunTeamInfo.name}</div>
                    <div className="text-gray-400 text-xs">{filteredPlayers.length} available</div>
                  </div>
                ) : (
                  <div className="text-gray-400 text-sm">Waiting for spin...</div>
                )}
              </div>
            </div>

            {/* Pick error */}
            {pickError && (
              <div role="alert" aria-live="assertive" className="bg-red-900/60 border border-red-500 text-red-300 rounded-lg px-4 py-2 text-sm mb-3 text-center">
                {pickError}
              </div>
            )}

            {/* Search */}
            <div className="relative mb-2">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search player or team..."
                className="w-full bg-[#0d0d0d] border border-white/[0.07] rounded-lg pl-8 pr-8 py-2 text-white text-sm focus:outline-none focus:border-orange-500 placeholder-gray-600"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs">✕</button>
              )}
            </div>

            {/* Position availability banner */}
            <div className="flex items-center gap-2 mb-2 card-surface rounded-lg px-3 py-2 flex-wrap">
              {isStarterSlot ? (
                <>
                  <span className="text-gray-400 text-xs shrink-0">Still need:</span>
                  {remainingStarterPositions.map(pos => (
                    <span key={pos} className="text-xs font-black px-2 py-0.5 rounded bg-orange-600 text-white">{pos}</span>
                  ))}
                </>
              ) : (
                <span className="text-gray-400 text-xs">Bench slot — any player</span>
              )}
            </div>

            {/* Position filter — hidden in EBK mode */}
            <div className="flex gap-1.5 mb-3 flex-wrap">
              {room.difficulty !== 'ebk' && ['ALL', 'PG', 'SG', 'SF', 'PF', 'C'].map(pos => (
                <button key={pos} onClick={() => setFilterPos(pos)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${filterPos === pos ? 'bg-orange-600 text-white' : 'bg-[#0d0d0d] border border-white/[0.07] text-gray-400 hover:text-white'}`}
                >
                  {pos}
                </button>
              ))}
              <span className="ml-auto text-xs text-gray-400 self-center">
                {room.difficulty === 'ebk' && searchQuery.length < 3 ? 'type 3+ letters to search' : `${filteredPlayers.length} players`}
              </span>
            </div>

            {/* Timeout warning toast */}
            {timeoutWarning && (
              <div role="alert" aria-live="assertive" className="bg-yellow-900/60 border border-yellow-500 text-yellow-300 rounded-lg px-4 py-2 text-sm mb-3 text-center">
                {timeoutWarning}
              </div>
            )}

            {!isMyTurn ? (
              <div className="flex flex-col items-center justify-center h-64 rounded-2xl card-surface border border-white/[0.05]">
                {/* Pulsing ring instead of a janky spinner */}
                <div className="relative w-14 h-14 mb-5">
                  <div className="absolute inset-0 rounded-full border-2 border-gray-700" />
                  <div className="absolute inset-0 rounded-full border-2 border-gray-500 border-t-transparent animate-spin" />
                  <div className="absolute inset-2 rounded-full bg-[#111118] flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-gray-500 animate-pulse" />
                  </div>
                </div>
                <div className="text-white font-black text-base tracking-wide">{oppName}</div>
                <div className="text-gray-400 text-xs mt-1 tracking-widest uppercase">Making their pick</div>
                <div className="text-gray-700 text-xs mt-3">Your team is locked in above</div>
              </div>
            ) : (
              <>
                {isSpinning && (
                  <div className="flex items-center justify-center h-16 rounded-xl bg-yellow-900/10 border border-yellow-600/30 mb-3">
                    <p className="text-yellow-400 font-bold text-sm animate-pulse">Locked — waiting for spin...</p>
                  </div>
                )}


                {/* Emote bar */}
                {myEmotes.length > 0 && (
                  <div className="flex gap-2 mb-3 flex-wrap">
                    {myEmotes.map(emoteId => {
                      const emote = EMOTES.find(e => e.id === emoteId)
                      if (!emote) return null
                      return (
                        <button
                          key={emoteId}
                          onClick={() => {
                            const socket = getSocket()
                            socket.emit('use-emote', { code, emoteText: emote.text })
                          }}
                          className="bg-[#1a1a2e] hover:bg-[#252540] border border-gray-700 hover:border-orange-500 text-white text-sm px-3 py-1.5 rounded-xl transition-all font-medium"
                          title={emote.label}
                        >
                          {emote.text}
                        </button>
                      )
                    })}
                  </div>
                )}

                <div className="space-y-1 max-h-[50vh] overflow-y-auto pr-1">
                  {filteredPlayers.map((player, idx) => {
                    const playerPositions = player.positions.split(',')
                    const canPick = !isSpinning && spunTeam !== null && !takenIds.has(player.id)
                    const isSelected = selectedPlayerId === player.id
                    const statVal = getStatValue(player, statMode)
                    const validSlots = canPick ? getValidSlots(player) : new Set<number>()
                    const hasMultipleSlots = isSelected && validSlots.size > 1

                    // Map positions to design-system badge classes
                    const posBadgeClass = (pos: string) => {
                      switch (pos) {
                        case 'PG': return 'pos-badge pos-pg'
                        case 'SG': return 'pos-badge pos-sg'
                        case 'SF': return 'pos-badge pos-sf'
                        case 'PF': return 'pos-badge pos-pf'
                        case 'C':  return 'pos-badge pos-c'
                        default:   return 'pos-badge pos-pg'
                      }
                    }

                    return (
                      <div
                        key={player.id}
                        className={`w-full rounded-xl text-left transition-all ${
                          isSelected
                            ? 'bg-orange-600/20 border-2 border-orange-500 shadow-[0_0_18px_rgba(234,88,12,0.22)]'
                            : canPick
                            ? 'bg-[#111118] border border-white/[0.06] hover:bg-orange-950/25 hover:border-orange-600/40 cursor-pointer shadow-[0_1px_4px_rgba(0,0,0,0.4)]'
                            : 'bg-[#0d0d0d] border border-transparent opacity-35'
                        }`}
                      >
                        <button
                          className="w-full flex items-center gap-3 px-3 py-2.5"
                          onClick={() => canPick && selectAndPick(player.id)}
                          disabled={!canPick}
                        >
                          {/* Rank number — muted circle, Yahoo-style */}
                          <div className="w-6 text-center shrink-0">
                            <span className="font-display text-gray-700 text-sm leading-none tabular-nums">{idx + 1}</span>
                          </div>

                          {/* Name + meta */}
                          <div className="flex-1 min-w-0">
                            <div className="text-white font-bold text-sm leading-tight truncate">
                              {player.firstName} {player.lastName}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              {playerPositions.map((pos: string) => (
                                <span key={pos} className={posBadgeClass(pos)}>{pos}</span>
                              ))}
                              <span className="text-gray-400 text-[11px]">{player.team}</span>
                              <span className="text-gray-700 text-[11px]">{player.yearFrom}–{player.yearTo}</span>
                            </div>
                          </div>

                          {/* Stat value — tabular, right-aligned, prominent */}
                          {room.difficulty === 'casual' && (
                            <div className="text-right shrink-0 min-w-[52px]">
                              <div className={`font-display text-xl leading-none tabular-nums ${
                                isSelected ? 'text-orange-400' : 'text-white'
                              }`}>
                                {statMode === 'games_played' ? Math.round(statVal) : statVal.toFixed(1)}
                              </div>
                              <div className="text-gray-400 text-[10px] tracking-wider uppercase mt-0.5">
                                {statMode === 'games_played' ? 'GP' : statMode.toUpperCase()}
                              </div>
                            </div>
                          )}

                          {/* Pick CTA — only when this card is active and pickable */}
                          {isSelected && !hasMultipleSlots && (
                            <div className="shrink-0">
                              <div className="bg-orange-600 text-white text-xs font-black px-3 py-1.5 rounded-lg">
                                PICK
                              </div>
                            </div>
                          )}
                        </button>

                        {/* Multi-slot chooser — expanded inline, no nested click confusion */}
                        {hasMultipleSlots && (
                          <div className="flex items-center gap-2 px-3 pb-2.5 flex-wrap border-t border-orange-500/20 pt-2 mt-0">
                            <span className="text-orange-300/70 text-xs">Place at:</span>
                            {Array.from(validSlots).map(slotIdx => (
                              <button
                                key={slotIdx}
                                onClick={e => { e.stopPropagation(); pickIntoSlot(slotIdx) }}
                                className="bg-orange-600 hover:bg-orange-500 text-white text-xs font-black px-3 py-1.5 rounded-lg transition-colors"
                              >
                                {requiredSlots[slotIdx] === 'BENCH' ? 'BENCH' : requiredSlots[slotIdx]}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          {/* Opponent Team (desktop only) */}
          <div className="hidden lg:block bg-blue-950/10 border border-blue-900/20 rounded-2xl p-4">
            <h3 className="text-white font-black text-sm mb-3">
              {oppName} <span className="text-gray-400 font-normal">({oppPicks.length}/{teamSize})</span>
            </h3>
            <div className="space-y-1.5">
              {requiredSlots.map((slotPos, i) => {
                const pickedPlayer = oppSlots[i]
                const isBench = slotPos === 'BENCH'
                const displayLabel = isBench ? 'BN' : slotPos
                return (
                  <div key={i} className={`rounded-lg px-3 py-2 text-xs flex items-center gap-2 bg-[#0A0A0A] ${!pickedPlayer ? 'border border-dashed border-gray-700' : ''}`}>
                    <span className={`font-bold w-8 shrink-0 ${isBench ? 'text-gray-400' : 'text-blue-400'}`}>{displayLabel}</span>
                    {pickedPlayer ? (
                      <span className="text-white truncate" title={`${pickedPlayer.firstName} ${pickedPlayer.lastName}`}>{pickedPlayer.firstName} {pickedPlayer.lastName} <span className="text-gray-400">({pickedPlayer.team})</span></span>
                    ) : (
                      <span className="text-gray-400">empty</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function GamePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    }>
      <GameContent />
    </Suspense>
  )
}
