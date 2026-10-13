'use client'
import { useEffect, useState, useRef, Suspense } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { getSocket } from '@/lib/socket'
import { CURRENT_TEAMS, getCurrentTeam } from '@/lib/teams'
import { EMOTES } from '@/lib/accessories'
import { useAuth } from '@/context/AuthContext'

type TeamMode = 'starter5' | 'bench8' | 'full12'

interface Player {
  id: number
  firstName: string
  lastName: string
  team: string
  position: string
  positions: string
  careerGames: number
  careerPPG: number
  careerRPG: number
  careerAPG: number
  careerMPG: number
  ebkScore: number
  ebkGpScore: number
  ebkPpgScore: number
  ebkRpgScore: number
  ebkApgScore: number
  ebkMpgScore: number
  yearFrom: number
  yearTo: number
}

interface GameResult {
  game: number
  statMode: string
  hostTotal: number
  guestTotal: number
  winner: 'host' | 'guest' | 'draw'
}

interface Room {
  code: string
  hostSocketId: string
  guestSocketId: string | null
  hostName: string
  guestName: string | null
  teamMode: TeamMode
  series: number
  difficulty: 'casual' | 'ebk'
  status: 'waiting' | 'drafting' | 'result' | 'complete'
  draftOrder: ('host' | 'guest')[]
  currentPickIndex: number
  hostPicks: number[]
  guestPicks: number[]
  hostPickSlots: string[]
  guestPickSlots: string[]
  currentGame: number
  hostSeriesScore: number
  guestSeriesScore: number
  gameResults: GameResult[]
  currentSpunTeam: string | null
}

const STAT_LABELS: Record<string, string> = {
  games_played: 'Games Played',
  ppg: 'Points Per Game',
  rpg: 'Rebounds Per Game',
  apg: 'Assists Per Game',
}

const STAT_CYCLE = ['games_played', 'ppg', 'rpg', 'apg']

function getStatModeForGame(gameNum: number) {
  return STAT_CYCLE[(gameNum - 1) % STAT_CYCLE.length]
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

const TEAM_SIZES: Record<TeamMode, number> = { starter5: 5, bench8: 8, full12: 12 }

function getRequiredPositions(teamMode: TeamMode): string[] {
  const starters = ['PG', 'SG', 'SF', 'PF', 'C']
  const benchCount = TEAM_SIZES[teamMode] - 5
  const bench = Array(benchCount).fill('BENCH')
  return [...starters, ...bench]
}

// Map a flat list of picked player IDs to their correct position slots for display.
// Must match the server's getPickerUsedPositions algorithm exactly (uses all positions, not just primary).
function assignToSlots(pickedIds: number[], allPlayers: Player[], requiredSlots: string[]): (Player | null)[] {
  const slots: (Player | null)[] = requiredSlots.map(() => null)
  const usedSlots = new Set<number>()
  for (const id of pickedIds) {
    const player = allPlayers.find(p => p.id === id)
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
  allPlayers: Player[],
  requiredSlots: string[]
): (Player | null)[] {
  const slots: (Player | null)[] = requiredSlots.map(() => null)
  const slotUsage: Record<string, number> = {}
  pickedIds.forEach((id, i) => {
    const player = allPlayers.find(p => p.id === id)
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
  const [seriesWinner, setSeriesWinner] = useState<'host' | 'guest' | 'draw' | null>(null)
  const [filterPos, setFilterPos] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null)
  const [lastResult, setLastResult] = useState<GameResult | null>(null)
  const [disconnected, setDisconnected] = useState(false)
  const [disconnectReason, setDisconnectReason] = useState<string | null>(null)
  // Emotes & accessories
  const [opponentEmote, setOpponentEmote] = useState<string | null>(null)
  const [unlockedToast, setUnlockedToast] = useState<{ type: string; name: string }[] | null>(null)
  const [myEmotes, setMyEmotes] = useState<string[]>([])
  const emoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Pick timer state
  const [pickTimeLeft, setPickTimeLeft] = useState(30)
  const pickTimerDurationRef = useRef(30) // tracks the initial duration for the progress bar
  const [currentPickerInTimer, setCurrentPickerInTimer] = useState<'host' | 'guest' | null>(null)
  const [timeoutWarning, setTimeoutWarning] = useState<string | null>(null)
  const pickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const playersRef = useRef<Player[]>([])

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
      setRoom(room); setPlayers(players)
      if (room.status === 'complete') {
        const winner = room.hostSeriesScore > room.guestSeriesScore ? 'host'
          : room.guestSeriesScore > room.hostSeriesScore ? 'guest' : 'draw'
        setSeriesWinner(winner)
      }
    }
    const handleDraftStarted = ({ room, players }: { room: Room; players: Player[] }) => {
      playersRef.current = players
      setRoom(room); setPlayers(players); setLastResult(null); setSearchQuery('')
      // Reset spinner/pick state from previous game in series
      setIsSpinning(false)
      setSpunTeam(null)
      setShuffledIds([])
      setSelectedPlayerId(null)
      setPickError(null)
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
      setTimeout(() => setPickError(null), 3000)
    }

    const handleOpponentEmote = ({ emoteText }: { emoteText: string }) => {
      setOpponentEmote(emoteText)
      if (emoteTimerRef.current) clearTimeout(emoteTimerRef.current)
      emoteTimerRef.current = setTimeout(() => setOpponentEmote(null), 3000)
    }

    const handleAccessoriesUnlocked = ({ items }: { items: { type: string; name: string }[] }) => {
      setUnlockedToast(items)
      setTimeout(() => setUnlockedToast(null), 6000)
    }

    const handlePickTimeout = ({ picker, pickedId, consecutive }: { picker: 'host' | 'guest'; pickedId: number; consecutive: number }) => {
      if (pickTimerRef.current) { clearInterval(pickTimerRef.current); pickTimerRef.current = null }
      // Stop any in-progress spin animation — the next pick-timer-start will start a fresh spin
      spinRefs.current.forEach(id => { clearInterval(id); clearTimeout(id) })
      spinRefs.current = []
      spinIntervalRef.current = null
      setIsSpinning(false)
      const p = playersRef.current.find(pl => pl.id === pickedId)
      const name = p ? `${p.firstName} ${p.lastName}` : 'a player'
      setTimeoutWarning(`⏱ ${picker === role ? 'You' : 'Opponent'} timed out — auto-picked ${name}${consecutive >= 2 ? ' (2nd timeout!)' : ''}`)
      setTimeout(() => setTimeoutWarning(null), 4000)
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
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center text-center px-4">
        <div>
          <h2 className="text-2xl font-black text-white mb-2">
            {disconnectReason ? 'Room Error' : 'Opponent Disconnected'}
          </h2>
          <p className="text-gray-400 mb-6">{disconnectReason ?? 'The connection was lost.'}</p>
          <button onClick={() => router.push('/lobby')} className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-6 py-3 rounded-xl">Back to Lobby</button>
        </div>
      </div>
    )
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Connecting...</p>
        </div>
      </div>
    )
  }

  // Waiting for opponent
  if (room.status === 'waiting') {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center text-center px-4">
        <div>
          <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin mx-auto mb-4"></div>
          <h2 className="text-3xl font-black text-white mb-2">Waiting for opponent...</h2>
          <p className="text-gray-400 mb-6">Share this code with your opponent:</p>
          <div className="bg-[#111827] border-2 border-orange-500 rounded-2xl px-10 py-6 mb-6 inline-block">
            <div className="text-5xl font-black text-orange-400 tracking-[0.3em]">{room.code}</div>
          </div>
          <div className="text-gray-500 text-sm mt-2">
            {room.teamMode === 'starter5' ? 'Starter 5' : room.teamMode === 'bench8' ? 'Bench 8' : 'Full Roster'} ·{' '}
            {room.series === 1 ? '1 Game' : `Best of ${room.series}`}
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
    return (
      <div className="min-h-screen bg-[#0A0A0A] px-4 py-8 overflow-y-auto">
        <div className="max-w-4xl w-full mx-auto">
          <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
          {/* LEFT col: header + game-by-game */}
          <div>
          {/* Result header */}
          <div className="text-center mb-6">
            <div className={`font-display leading-none mb-2 ${iWon ? 'text-orange-500' : isDraw ? 'text-gray-400' : 'text-gray-600'}`}
              style={{ fontSize: 'clamp(4rem, 18vw, 7rem)' }}>
              {iWon ? 'W' : isDraw ? 'DRAW' : 'L'}
            </div>
            <div className="text-white font-black text-lg mb-1">
              {iWon ? 'Series Win' : isDraw ? 'Series Draw' : 'Series Loss'}
            </div>
            <div className="text-orange-400 font-black text-2xl tracking-tight">
              {room.hostSeriesScore} <span className="text-gray-600">–</span> {room.guestSeriesScore}
            </div>
            <div className="text-gray-500 text-xs mt-1 truncate">{room.hostName} vs {room.guestName}</div>
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
            <div className="bg-[#111] rounded-3xl p-4 mb-4">
              <div className="text-gray-600 text-xs uppercase tracking-widest mb-3">Game by Game</div>
              <div className="space-y-2">
                {room.gameResults.map(r => {
                  const myTotal = role === 'host' ? r.hostTotal : r.guestTotal
                  const oppTotal = role === 'host' ? r.guestTotal : r.hostTotal
                  const gameWon = r.winner === role
                  const gameDraw = r.winner === 'draw'
                  return (
                    <div key={r.game} className="flex items-center bg-[#0A0A0A] rounded-2xl px-3 py-2.5 gap-2">
                      <div className="w-10 shrink-0 text-gray-600 text-xs font-bold">G{r.game}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-black text-sm">
                          {formatStat(myTotal, r.statMode)} <span className="text-gray-600">–</span> {formatStat(oppTotal, r.statMode)}
                        </div>
                        <div className="text-gray-600 text-xs truncate">{STAT_LABELS[r.statMode]}</div>
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
              ? buildSlotsFromPickSlots(myPicks, myPickSlotsComplete, players, requiredSlots)
              : assignToSlots(myPicks, players, requiredSlots)
            const oppPickSlotsComplete = role === 'host' ? (room.guestPickSlots || []) : (room.hostPickSlots || [])
            const oppSlotsComplete = oppPickSlotsComplete.length > 0
              ? buildSlotsFromPickSlots(oppPicks, oppPickSlotsComplete, players, requiredSlots)
              : assignToSlots(oppPicks, players, requiredSlots)
            const myLastTotal = role === 'host' ? lastGame.hostTotal : lastGame.guestTotal
            const oppLastTotal = role === 'host' ? lastGame.guestTotal : lastGame.hostTotal
            return (
              <div className="bg-[#111827] rounded-2xl p-4 mb-4">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-gray-400 text-xs uppercase tracking-wide">Draft Recap — Game {lastGame.game}</h2>
                  <span className="text-gray-600 text-xs">{STAT_LABELS[lastGame.statMode]}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {/* My team */}
                  <div>
                    <div className={`text-xs font-black mb-2 text-center truncate ${lastIWon ? 'text-green-400' : lastDraw ? 'text-gray-400' : 'text-gray-500'}`}>
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
                              <span className={`text-[10px] font-bold mr-1 ${slotPos === 'BENCH' ? 'text-gray-600' : 'text-orange-400'}`}>{slotPos === 'BENCH' ? 'BN' : slotPos}</span>
                              <span className="text-white text-xs font-semibold truncate">{p.lastName}</span>
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
                    <div className={`text-xs font-black mb-2 text-center truncate ${!lastIWon && !lastDraw ? 'text-green-400' : lastDraw ? 'text-gray-400' : 'text-gray-500'}`}>
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
                              <span className={`text-[10px] font-bold mr-1 ${slotPos === 'BENCH' ? 'text-gray-600' : 'text-orange-400'}`}>{slotPos === 'BENCH' ? 'BN' : slotPos}</span>
                              <span className="text-white text-xs font-semibold truncate">{p.lastName}</span>
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

          <button onClick={() => router.push('/lobby')} className="bg-orange-600 hover:bg-orange-700 text-white font-black px-8 py-4 rounded-2xl text-lg transition-colors w-full mt-4">
            Play Again
          </button>
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
      ? buildSlotsFromPickSlots(myPicks, myPickSlotsResult, players, requiredSlots)
      : assignToSlots(myPicks, players, requiredSlots)
    const oppPickSlotsResult = role === 'host' ? (room.guestPickSlots || []) : (room.hostPickSlots || [])
    const oppSlotsResult = oppPickSlotsResult.length > 0
      ? buildSlotsFromPickSlots(oppPicks, oppPickSlotsResult, players, requiredSlots)
      : assignToSlots(oppPicks, players, requiredSlots)

    return (
      <div className="min-h-screen bg-[#0A0A0A] px-4 py-8 overflow-y-auto">
        <div className="max-w-4xl w-full mx-auto">
          <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
          {/* LEFT: header + scores + series */}
          <div>
          {/* Result header */}
          <div className="text-center mb-4">
            <div className={`font-display leading-none mb-2 ${iWon ? 'text-orange-500' : isDraw ? 'text-gray-400' : 'text-gray-600'}`}
              style={{ fontSize: 'clamp(4rem, 18vw, 7rem)' }}>
              {iWon ? 'W' : isDraw ? 'D' : 'L'}
            </div>
            <div className="text-white font-black text-lg">
              {iWon ? `Game ${effectiveLastResult.game} — You Win` : isDraw ? `Game ${effectiveLastResult.game} — Draw` : `Game ${effectiveLastResult.game} — You Lose`}
            </div>
          </div>

          {/* Stat explanation */}
          <div className="bg-[#111827] rounded-xl px-4 py-2.5 mb-4 text-center">
            <div className="text-gray-300 text-sm">Lower total <span className="text-orange-400 font-black">{STAT_LABELS[effectiveLastResult.statMode]}</span> wins</div>
            <div className="text-gray-600 text-xs mt-0.5">Add up every player&apos;s career {effectiveLastResult.statMode === 'games_played' ? 'games played' : effectiveLastResult.statMode.toUpperCase()} — lowest team total takes the game</div>
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
                  <div className="text-gray-500 text-xs uppercase tracking-widest mb-2 truncate">{side.name}</div>
                  <div className={`font-display leading-none mb-1 ${isWinner ? 'text-green-400' : 'text-white'}`}
                    style={{ fontSize: 'clamp(2rem, 10vw, 3rem)' }}>
                    {formatStat(side.total, effectiveLastResult.statMode)}
                  </div>
                  <div className="text-gray-600 text-xs leading-tight">{getStatUnit(effectiveLastResult.statMode)}</div>
                  {isWinner && !isDraw && <div className="text-green-400 text-xs font-black mt-1">LOWER ✓</div>}
                </div>
              )
            })}
          </div>

          {/* Series score */}
          {room.series > 1 && (
            <div className="bg-[#111] rounded-2xl px-4 py-3 mb-4 text-center">
              <div className="text-gray-600 text-xs uppercase tracking-widest mb-1">Series</div>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <span className="text-white font-black text-lg truncate max-w-[100px]">{room.hostName}</span>
                <span className="text-orange-400 font-black text-2xl">{room.hostSeriesScore}</span>
                <span className="text-gray-600 text-xl">–</span>
                <span className="text-orange-400 font-black text-2xl">{room.guestSeriesScore}</span>
                <span className="text-white font-black text-lg truncate max-w-[100px]">{room.guestName}</span>
              </div>
            </div>
          )}
          </div>{/* end LEFT col */}

          {/* RIGHT col: Draft Recap */}
          <div>
          <div className="bg-[#111827] rounded-2xl p-4 mb-4">
            <h2 className="text-gray-400 text-xs uppercase tracking-wide mb-3">Draft Recap — Game {effectiveLastResult.game}</h2>
            <div className="grid grid-cols-2 gap-2">
              {/* My team */}
              <div>
                <div className={`text-xs font-black mb-2 text-center truncate ${iWon ? 'text-green-400' : isDraw ? 'text-gray-400' : 'text-gray-500'}`}>
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
                          <span className={`text-[10px] font-bold mr-1 ${slotPos === 'BENCH' ? 'text-gray-600' : 'text-orange-400'}`}>{slotPos === 'BENCH' ? 'BN' : slotPos}</span>
                          <span className="text-white text-xs font-semibold truncate">{p.lastName}</span>
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
                <div className={`text-xs font-black mb-2 text-center truncate ${!iWon && !isDraw ? 'text-green-400' : isDraw ? 'text-gray-400' : 'text-gray-500'}`}>
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
                          <span className={`text-[10px] font-bold mr-1 ${slotPos === 'BENCH' ? 'text-gray-600' : 'text-orange-400'}`}>{slotPos === 'BENCH' ? 'BN' : slotPos}</span>
                          <span className="text-white text-xs font-semibold truncate">{p.lastName}</span>
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
            <button onClick={startNextGame} className="bg-orange-600 hover:bg-orange-700 text-white font-black px-8 py-4 rounded-2xl text-lg transition-colors w-full mt-2">
              Start Game {room.currentGame + 1}
            </button>
          ) : (
            <div className="bg-[#111] rounded-2xl py-4 text-center text-gray-500 text-sm mt-2">
              <span className="inline-block w-4 h-4 rounded-full border-2 border-gray-500 border-t-transparent animate-spin mr-2 align-middle"></span>
              Waiting for {room.hostName}...
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
    ? buildSlotsFromPickSlots(myPicks, myPickSlots, players, requiredSlots)
    : assignToSlots(myPicks, players, requiredSlots)
  const oppSlots = oppPickSlots.length > 0
    ? buildSlotsFromPickSlots(oppPicks, oppPickSlots, players, requiredSlots)
    : assignToSlots(oppPicks, players, requiredSlots)

  // Track consumed slot positions by slot label (not player's primary position)
  const usedStarterPositions = new Set(
    requiredSlots.slice(0, 5).filter((_, i) => mySlots[i] !== null)
  )
  const isStarterSlot = usedStarterPositions.size < 5
  const remainingStarterPositions = ['PG', 'SG', 'SF', 'PF', 'C'].filter(p => !usedStarterPositions.has(p))

  const selectedPlayer = selectedPlayerId !== null ? players.find(p => p.id === selectedPlayerId) ?? null : null

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
    const player = players.find(p => p.id === playerId)
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
    .map(id => players.find(p => p.id === id))
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
    <div className="min-h-screen bg-[#0A0A0A] py-6 px-4 relative">
      {/* Opponent emote popup */}
      {opponentEmote && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="bg-[#1a1a2e] border border-orange-500 text-white text-lg px-5 py-3 rounded-2xl shadow-2xl font-medium animate-bounce">
            <span className="text-gray-400 text-xs block text-center mb-0.5">{oppName}</span>
            {opponentEmote}
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-orange-500 font-black text-lg">EBK · Game {room.currentGame}{room.series > 1 ? ` of ${room.series}` : ''}</div>
            <div className="text-gray-500 text-xs">
              {room.code} · {STAT_LABELS[statMode]} · Lower total wins
              {room.difficulty === 'ebk' && <span className="ml-2 text-yellow-500 font-bold">EBK Mode</span>}
            </div>
          </div>
          {room.series > 1 && (
            <div className="bg-[#111827] rounded-xl px-4 py-2 text-sm">
              <span className="text-white font-black">{room.hostName} {room.hostSeriesScore}</span>
              <span className="text-gray-500 mx-2">–</span>
              <span className="text-white font-black">{room.guestSeriesScore} {room.guestName}</span>
            </div>
          )}
        </div>

        {/* Turn Banner */}
        <div className={`rounded-xl p-3 mb-4 text-center font-bold ${isMyTurn ? 'bg-orange-600/20 border border-orange-500 text-orange-400' : 'bg-gray-800/40 border border-gray-700 text-gray-400'}`}>
          {isMyTurn ? 'YOUR PICK' : `${currentPicker === 'host' ? room.hostName : room.guestName}'s pick...`}
        </div>

        {/* Mobile: teams side by side on top. Desktop: 4-col grid */}

        {/* Teams row — always visible, compact on mobile */}
        <div className="grid grid-cols-2 gap-2 mb-4 lg:hidden">
          {/* My Team (mobile) */}
          <div className="bg-[#111827] rounded-2xl p-3">
            <div className="text-orange-400 font-black text-xs mb-2 truncate">
              {myName2} <span className="text-gray-500 font-normal">({myPicks.length}/{teamSize})</span>
            </div>
            <div className="space-y-1">
              {requiredSlots.map((slotPos, i) => {
                const pickedPlayer = mySlots[i]
                const isBench = slotPos === 'BENCH'
                const displayLabel = isBench ? 'BN' : slotPos
                const validSlots = selectedPlayer ? getValidSlots(selectedPlayer) : new Set<number>()
                const isValidTarget = isMyTurn && selectedPlayer !== null && validSlots.has(i) && pickedPlayer === null
                const isBlocked = isMyTurn && selectedPlayer !== null && !validSlots.has(i) && pickedPlayer === null
                return (
                  <div
                    key={i}
                    onClick={() => isValidTarget ? pickIntoSlot(i) : undefined}
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
                    <span className={`font-bold w-6 shrink-0 text-[10px] ${isBench ? 'text-gray-600' : 'text-orange-400'}`}>{displayLabel}</span>
                    <span className={`truncate ${pickedPlayer ? 'text-white' : isValidTarget ? 'text-orange-300' : 'text-gray-600'}`}>
                      {pickedPlayer ? pickedPlayer.lastName : isValidTarget ? 'tap' : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Opponent Team (mobile) */}
          <div className="bg-[#111827] rounded-2xl p-3">
            <div className="text-blue-400 font-black text-xs mb-2 truncate">
              {oppName} <span className="text-gray-500 font-normal">({oppPicks.length}/{teamSize})</span>
            </div>
            <div className="space-y-1">
              {requiredSlots.map((slotPos, i) => {
                const pickedPlayer = oppSlots[i]
                const isBench = slotPos === 'BENCH'
                const displayLabel = isBench ? 'BN' : slotPos
                return (
                  <div key={i} className={`rounded px-2 py-1 text-xs flex items-center gap-1.5 bg-[#0A0A0A] ${!pickedPlayer ? 'border border-dashed border-gray-700' : ''}`}>
                    <span className={`font-bold w-6 shrink-0 text-[10px] ${isBench ? 'text-gray-600' : 'text-blue-400'}`}>{displayLabel}</span>
                    <span className={`truncate ${pickedPlayer ? 'text-white' : 'text-gray-600'}`}>
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
          <div className="hidden lg:block bg-[#111827] rounded-2xl p-4">
            <h3 className="text-white font-black text-sm mb-3">
              {myName2} <span className="text-gray-500 font-normal">({myPicks.length}/{teamSize})</span>
            </h3>
            <div className="space-y-1.5">
              {requiredSlots.map((slotPos, i) => {
                const pickedPlayer = mySlots[i]
                const isBench = slotPos === 'BENCH'
                const displayLabel = isBench ? 'BN' : slotPos
                const validSlots = selectedPlayer ? getValidSlots(selectedPlayer) : new Set<number>()
                const isValidTarget = isMyTurn && selectedPlayer !== null && validSlots.has(i) && pickedPlayer === null
                const isBlocked = isMyTurn && selectedPlayer !== null && !validSlots.has(i) && pickedPlayer === null
                return (
                  <div
                    key={i}
                    onClick={() => isValidTarget ? pickIntoSlot(i) : undefined}
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
                    <span className={`font-bold w-8 shrink-0 ${isBench ? 'text-gray-600' : 'text-orange-400'}`}>{displayLabel}</span>
                    {pickedPlayer ? (
                      <span className="text-white truncate">{pickedPlayer.firstName} {pickedPlayer.lastName} <span className="text-gray-500">({pickedPlayer.team})</span></span>
                    ) : (
                      <span className={isValidTarget ? 'text-orange-300' : 'text-gray-600'}>
                        {isValidTarget ? 'tap to place' : 'empty'}
                      </span>
                    )}
                  </div>
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
                    <div className="text-gray-500 text-xs">Wait for your team assignment</div>
                  </div>
                ) : spunTeam && spunTeamInfo ? (
                  <div>
                    <div className="text-white font-black text-sm truncate">{spunTeamInfo.city} {spunTeamInfo.name}</div>
                    <div className="text-gray-400 text-xs">{filteredPlayers.length} available</div>
                  </div>
                ) : (
                  <div className="text-gray-500 text-sm">Waiting for spin...</div>
                )}
              </div>
            </div>

            {/* Pick error */}
            {pickError && (
              <div className="bg-red-900/60 border border-red-500 text-red-300 rounded-lg px-4 py-2 text-sm mb-3 text-center">
                {pickError}
              </div>
            )}

            {/* Search */}
            <div className="relative mb-2">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search player or team..."
                className="w-full bg-[#111827] border border-gray-700 rounded-lg pl-8 pr-8 py-2 text-white text-sm focus:outline-none focus:border-orange-500 placeholder-gray-600"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-xs">✕</button>
              )}
            </div>

            {/* Position availability banner */}
            <div className="flex items-center gap-2 mb-2 bg-[#111827] rounded-lg px-3 py-2 flex-wrap">
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
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${filterPos === pos ? 'bg-orange-600 text-white' : 'bg-[#111827] text-gray-400 hover:text-white'}`}
                >
                  {pos}
                </button>
              ))}
              <span className="ml-auto text-xs text-gray-500 self-center">
                {room.difficulty === 'ebk' && searchQuery.length < 3 ? 'type 3+ letters to search' : `${filteredPlayers.length} players`}
              </span>
            </div>

            {/* Pick Timer Bar */}
            {room.status === 'drafting' && currentPickerInTimer && (
              <div className="mb-3">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>{currentPickerInTimer === role ? 'Your pick' : `${currentPickerInTimer === 'host' ? room.hostName : room.guestName}'s pick`}</span>
                  <span className={`font-black ${pickTimeLeft <= 5 ? 'text-red-400 animate-pulse' : pickTimeLeft <= 10 ? 'text-yellow-400' : 'text-green-400'}`}>
                    {pickTimeLeft}s
                  </span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${pickTimeLeft <= 5 ? 'bg-red-500' : pickTimeLeft <= 10 ? 'bg-yellow-400' : 'bg-green-500'}`}
                    style={{ width: `${(pickTimeLeft / pickTimerDurationRef.current) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Timeout warning toast */}
            {timeoutWarning && (
              <div className="bg-yellow-900/60 border border-yellow-500 text-yellow-300 rounded-lg px-4 py-2 text-sm mb-3 text-center">
                {timeoutWarning}
              </div>
            )}

            {!isMyTurn ? (
              <div className="flex flex-col items-center justify-center h-64 rounded-2xl bg-[#111827] border border-gray-700">
                <div className="w-8 h-8 rounded-full border-2 border-gray-500 border-t-transparent animate-spin mb-4"></div>
                <div className="text-white font-black text-lg">{oppName} is picking...</div>
                <div className="text-gray-500 text-sm mt-1">Hang tight</div>
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

                <div className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-1">
                  {filteredPlayers.map(player => {
                    const playerPositions = player.positions.split(',')
                    const canPick = !isSpinning && spunTeam !== null && !takenIds.has(player.id)
                    const isSelected = selectedPlayerId === player.id
                    const statVal = getStatValue(player, statMode)
                    const validSlots = canPick ? getValidSlots(player) : new Set<number>()
                    const hasMultipleSlots = isSelected && validSlots.size > 1

                    return (
                      <div
                        key={player.id}
                        className={`w-full rounded-xl px-3 py-2.5 text-left transition-all ${
                          isSelected
                            ? 'bg-orange-600/30 border-2 border-orange-500'
                            : canPick
                            ? 'bg-[#111827] hover:bg-[#1e2d45] hover:border-orange-500 border-2 border-transparent cursor-pointer'
                            : 'bg-[#0D0D0D] border-2 border-transparent opacity-50'
                        }`}
                      >
                        <button
                          className="w-full flex items-center gap-2"
                          onClick={() => canPick && selectAndPick(player.id)}
                          disabled={!canPick}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-white font-bold text-sm truncate">{player.firstName} {player.lastName}</div>
                            <div className="text-gray-500 text-xs truncate">{player.team} · {player.yearFrom}–{player.yearTo}</div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            {playerPositions.map((pos: string) => (
                              <span key={pos} className="text-xs bg-orange-600/20 text-orange-400 px-1.5 py-0.5 rounded font-bold">{pos}</span>
                            ))}
                          </div>
                          {room.difficulty === 'casual' && (
                            <div className="text-right shrink-0 min-w-[48px]">
                              <div className="text-white font-black text-sm">
                                {statMode === 'games_played' ? statVal : statVal.toFixed(1)}
                              </div>
                              <div className="text-gray-500 text-xs">
                                {statMode === 'games_played' ? 'GP' : statMode.toUpperCase()}
                              </div>
                            </div>
                          )}
                        </button>
                        {hasMultipleSlots && (
                          <div className="flex gap-2 mt-2 flex-wrap" onClick={e => e.stopPropagation()}>
                            <span className="text-orange-300 text-xs self-center">Pick slot:</span>
                            {Array.from(validSlots).map(slotIdx => (
                              <button
                                key={slotIdx}
                                onClick={() => pickIntoSlot(slotIdx)}
                                className="bg-orange-600 hover:bg-orange-500 text-white text-xs font-black px-3 py-1 rounded-lg transition-colors"
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
          <div className="hidden lg:block bg-[#111827] rounded-2xl p-4">
            <h3 className="text-white font-black text-sm mb-3">
              {oppName} <span className="text-gray-500 font-normal">({oppPicks.length}/{teamSize})</span>
            </h3>
            <div className="space-y-1.5">
              {requiredSlots.map((slotPos, i) => {
                const pickedPlayer = oppSlots[i]
                const isBench = slotPos === 'BENCH'
                const displayLabel = isBench ? 'BN' : slotPos
                return (
                  <div key={i} className={`rounded-lg px-3 py-2 text-xs flex items-center gap-2 bg-[#0A0A0A] ${!pickedPlayer ? 'border border-dashed border-gray-700' : ''}`}>
                    <span className={`font-bold w-8 shrink-0 ${isBench ? 'text-gray-600' : 'text-blue-400'}`}>{displayLabel}</span>
                    {pickedPlayer ? (
                      <span className="text-white truncate">{pickedPlayer.firstName} {pickedPlayer.lastName} <span className="text-gray-500">({pickedPlayer.team})</span></span>
                    ) : (
                      <span className="text-gray-600">empty</span>
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
