'use client'
import { useEffect, useState, useRef, Suspense } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { getSocket } from '@/lib/socket'
import { CURRENT_TEAMS, getCurrentTeam } from '@/lib/teams'

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
  ebkScore: number
  ebkGpScore: number
  ebkPpgScore: number
  ebkRpgScore: number
  ebkApgScore: number
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

const TEAM_SIZES: Record<TeamMode, number> = { starter5: 5, bench8: 8, full12: 12 }

function getRequiredPositions(teamMode: TeamMode): string[] {
  const starters = ['PG', 'SG', 'SF', 'PF', 'C']
  const benchCount = TEAM_SIZES[teamMode] - 5
  const bench = Array(benchCount).fill('BENCH')
  return [...starters, ...bench]
}

function GameContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const code = (params.code as string).toUpperCase()
  const role = (searchParams.get('role') as 'host' | 'guest') || 'host'
  const myName = searchParams.get('name') || 'You'

  const [room, setRoom] = useState<Room | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [seriesWinner, setSeriesWinner] = useState<'host' | 'guest' | 'draw' | null>(null)
  const [filterPos, setFilterPos] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [lastResult, setLastResult] = useState<GameResult | null>(null)
  const [disconnected, setDisconnected] = useState(false)

  // Pick timer state
  const [pickTimeLeft, setPickTimeLeft] = useState(30)
  const [currentPickerInTimer, setCurrentPickerInTimer] = useState<'host' | 'guest' | null>(null)
  const [timeoutWarning, setTimeoutWarning] = useState<string | null>(null)
  const pickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const playersRef = useRef<Player[]>([])

  // Spinner state
  const [spunTeam, setSpunTeam] = useState<string | null>(null)
  const [isSpinning, setIsSpinning] = useState(false)
  const [spinDisplay, setSpinDisplay] = useState<string>('?')
  const [pickError, setPickError] = useState<string | null>(null)
  const spinIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Stable shuffle order — set once per spin, never re-sorted mid-turn
  const [shuffledIds, setShuffledIds] = useState<number[]>([])

  useEffect(() => {
    const socket = getSocket()

    const handleRoomState = ({ room, players }: { room: Room; players: Player[] }) => {
      playersRef.current = players
      setRoom(room); setPlayers(players)
    }
    const handleDraftStarted = ({ room, players }: { room: Room; players: Player[] }) => {
      playersRef.current = players
      setRoom(room); setPlayers(players); setLastResult(null); setSearchQuery('')
    }
    const handleRoomUpdated = ({ room }: { room: Room }) => { setRoom(room) }
    const handleGameResult = ({ room, result }: { room: Room; result: GameResult }) => {
      setRoom(room); setLastResult(result)
    }
    const handleSeriesComplete = ({ room, seriesWinner }: { room: Room; seriesWinner: 'host' | 'guest' | 'draw' }) => {
      setRoom(room); setSeriesWinner(seriesWinner)
    }
    const handlePartnerDisconnected = () => { setDisconnected(true) }
    const handleRoomError = ({ message }: { message: string }) => {
      setDisconnected(true)
      console.error('Room error:', message)
    }

    const handlePickTimerStart = ({ picker, duration, spunTeam: team }: { picker: 'host' | 'guest'; duration: number; spunTeam: string }) => {
      if (pickTimerRef.current) clearInterval(pickTimerRef.current)
      setPickTimeLeft(duration)
      setCurrentPickerInTimer(picker)
      setPickError(null)

      // Spinner animation: 3 phases (fast → medium → slow → stop)
      if (spinIntervalRef.current) clearInterval(spinIntervalRef.current)
      setSpunTeam(null)
      setIsSpinning(true)
      setSpinDisplay('?')
      const allAbbrs = CURRENT_TEAMS.map(t => t.abbr)
      const rnd = () => allAbbrs[Math.floor(Math.random() * allAbbrs.length)]

      const p1 = setInterval(() => setSpinDisplay(rnd()), 80)
      const t1 = setTimeout(() => {
        clearInterval(p1)
        const p2 = setInterval(() => setSpinDisplay(rnd()), 160)
        const t2 = setTimeout(() => {
          clearInterval(p2)
          const p3 = setInterval(() => setSpinDisplay(rnd()), 320)
          const t3 = setTimeout(() => {
            clearInterval(p3)
            setSpunTeam(team)
            setIsSpinning(false)
            setSpinDisplay(team)
            // Shuffle the team's players once, stable for this entire pick turn
            const pool = playersRef.current.filter(p => getCurrentTeam(p.team) === team)
            setShuffledIds([...pool].sort(() => Math.random() - 0.5).map(p => p.id))
          }, 640)
          spinIntervalRef.current = t3 as unknown as ReturnType<typeof setInterval>
        }, 800)
      }, 1200)

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

    const handlePickTimeout = ({ picker, pickedId, consecutive }: { picker: 'host' | 'guest'; pickedId: number; consecutive: number }) => {
      if (pickTimerRef.current) { clearInterval(pickTimerRef.current); pickTimerRef.current = null }
      const p = playersRef.current.find(pl => pl.id === pickedId)
      const name = p ? `${p.firstName} ${p.lastName}` : 'a player'
      setTimeoutWarning(`⏱ ${picker === role ? 'You' : 'Opponent'} timed out — auto-picked ${name}${consecutive >= 2 ? ' (2nd timeout!)' : ''}`)
      setTimeout(() => setTimeoutWarning(null), 4000)
    }

    const handlePlayerDisqualified = ({ disqualifiedRole, winner, room: r }: { disqualifiedRole: 'host' | 'guest'; winner: 'host' | 'guest'; room: Room }) => {
      if (pickTimerRef.current) { clearInterval(pickTimerRef.current); pickTimerRef.current = null }
      setRoom(r)
      setSeriesWinner(winner)
      setTimeoutWarning(disqualifiedRole === role ? '❌ You were disqualified for 2 consecutive timeouts' : '🏆 Opponent disqualified for 2 consecutive timeouts')
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
      if (pickTimerRef.current) clearInterval(pickTimerRef.current)
      if (spinIntervalRef.current) clearInterval(spinIntervalRef.current)
    }
  }, [code, role])

  function pickPlayer(playerId: number) {
    const socket = getSocket()
    socket.emit('pick-player', { code, playerId })
  }

  function startNextGame() {
    const socket = getSocket()
    socket.emit('next-game', { code })
  }

  if (disconnected) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center text-center px-4">
        <div>
          <div className="text-5xl mb-4">📡</div>
          <h2 className="text-2xl font-black text-white mb-2">Opponent Disconnected</h2>
          <p className="text-gray-400 mb-6">The connection was lost.</p>
          <button onClick={() => router.push('/lobby')} className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-6 py-3 rounded-xl">Back to Lobby</button>
        </div>
      </div>
    )
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl animate-bounce mb-4">🏀</div>
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
          <div className="text-5xl mb-4 animate-pulse">⏳</div>
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
      <div className="min-h-screen bg-[#0A0A0A] py-10 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <div className="text-6xl mb-4">{iWon ? '🏆' : isDraw ? '🤝' : '😤'}</div>
          <h1 className="text-4xl font-black text-white mb-2">
            {iWon ? 'You Win the Series!' : isDraw ? 'Series Draw!' : 'You Lost the Series'}
          </h1>
          {timeoutWarning && <p className="text-yellow-400 text-sm mb-2">{timeoutWarning}</p>}
          <div className="text-2xl font-bold text-orange-400 mb-8">
            {room.hostName} {room.hostSeriesScore} – {room.guestSeriesScore} {room.guestName}
          </div>

          <div className="bg-[#111827] rounded-2xl p-6 mb-6">
            <h2 className="text-gray-400 text-sm uppercase tracking-wide mb-4">Game Results</h2>
            <div className="space-y-2">
              {room.gameResults.map(r => (
                <div key={r.game} className="flex items-center justify-between bg-[#0A0A0A] rounded-lg px-4 py-3">
                  <span className="text-gray-400 text-sm">Game {r.game} · {STAT_LABELS[r.statMode]}</span>
                  <span className="text-white font-bold text-sm">
                    {r.statMode === 'games_played' ? Math.round(r.hostTotal) : r.hostTotal.toFixed(1)} – {r.statMode === 'games_played' ? Math.round(r.guestTotal) : r.guestTotal.toFixed(1)}
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${r.winner === role ? 'bg-green-900/50 text-green-400' : r.winner === 'draw' ? 'bg-yellow-900/50 text-yellow-400' : 'bg-red-900/50 text-red-400'}`}>
                      {r.winner === role ? 'W' : r.winner === 'draw' ? 'D' : 'L'}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <button onClick={() => router.push('/lobby')} className="bg-orange-600 hover:bg-orange-700 text-white font-black px-8 py-4 rounded-xl text-lg transition-colors">
            Play Again
          </button>
        </div>
      </div>
    )
  }

  // Game result (between games in series)
  if (room.status === 'result' && lastResult) {
    const myTotal = role === 'host' ? lastResult.hostTotal : lastResult.guestTotal
    const oppTotal = role === 'host' ? lastResult.guestTotal : lastResult.hostTotal
    const iWon = lastResult.winner === role
    const isDraw = lastResult.winner === 'draw'

    return (
      <div className="min-h-screen bg-[#0A0A0A] py-10 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <div className="text-5xl mb-4">{iWon ? '🎉' : isDraw ? '🤝' : '😤'}</div>
          <h1 className="text-3xl font-black text-white mb-1">
            {iWon ? 'You Won Game ' + lastResult.game : isDraw ? 'Draw!' : 'You Lost Game ' + lastResult.game}
          </h1>
          <p className="text-gray-400 mb-6">{STAT_LABELS[lastResult.statMode]}</p>

          <div className="grid grid-cols-2 gap-4 mb-6">
            {[{ name: myName2, total: myTotal, isMe: true }, { name: oppName, total: oppTotal, isMe: false }].map(side => (
              <div key={side.name} className={`bg-[#111827] rounded-2xl p-6 border-2 ${side.isMe && iWon ? 'border-green-500' : !side.isMe && !iWon && !isDraw ? 'border-green-500' : 'border-gray-700'}`}>
                <div className="text-gray-400 text-sm mb-1">{side.name}</div>
                <div className={`text-4xl font-black ${side.isMe && iWon ? 'text-green-400' : !side.isMe && !iWon && !isDraw ? 'text-green-400' : 'text-white'}`}>
                  {lastResult.statMode === 'games_played' ? Math.round(side.total) : side.total.toFixed(1)}
                </div>
                <div className="text-gray-500 text-xs mt-1">{lastResult.statMode === 'games_played' ? 'total games' : 'career avg total'}</div>
              </div>
            ))}
          </div>

          <div className="bg-[#111827] rounded-xl px-6 py-3 mb-8 inline-block">
            <span className="text-gray-400 text-sm">Series: </span>
            <span className="text-white font-black">{room.hostName} {room.hostSeriesScore} – {room.guestSeriesScore} {room.guestName}</span>
          </div>

          <div>
            {role === 'host' ? (
              <button onClick={startNextGame} className="bg-orange-600 hover:bg-orange-700 text-white font-black px-8 py-4 rounded-xl text-lg">
                Start Game {room.currentGame + 1} →
              </button>
            ) : (
              <div className="text-gray-400 animate-pulse">Waiting for {room.hostName} to start next game...</div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // DRAFTING PHASE
  const spunTeamInfo = spunTeam ? CURRENT_TEAMS.find(t => t.abbr === spunTeam) : null

  // Current slot the picker is filling
  const currentSlotPos = requiredSlots[myPicks.length] // 'PG','SG','SF','PF','C', or 'BENCH'

  // Build display list from shuffled order; apply search/pos filter on top
  const filteredPlayers = shuffledIds
    .map(id => players.find(p => p.id === id))
    .filter((p): p is Player => {
      if (!p) return false
      if (takenIds.has(p.id)) return false
      // Position lock: bench slots accept anyone, starter slots require matching position
      if (currentSlotPos !== 'BENCH' && !p.positions.split(',').includes(currentSlotPos)) return false
      if (filterPos !== 'ALL' && !p.positions.split(',').includes(filterPos)) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        if (!`${p.firstName} ${p.lastName}`.toLowerCase().includes(q) && !p.team.toLowerCase().includes(q)) return false
      }
      return true
    })

  return (
    <div className="min-h-screen bg-[#0A0A0A] py-6 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-orange-500 font-black text-lg">EBK · Game {room.currentGame}{room.series > 1 ? ` of ${room.series}` : ''}</div>
            <div className="text-gray-500 text-xs">
              {room.code} · {STAT_LABELS[statMode]} · Lower total wins
              {room.difficulty === 'ebk' && <span className="ml-2 text-yellow-500 font-bold">⚡ EBK Mode</span>}
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
          {isMyTurn ? '⚡ YOUR PICK' : `⏳ ${currentPicker === 'host' ? room.hostName : room.guestName}&apos;s pick...`}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* My Team */}
          <div className="bg-[#111827] rounded-2xl p-4">
            <h3 className="text-white font-black text-sm mb-3">
              {myName2} <span className="text-gray-500 font-normal">({myPicks.length}/{teamSize})</span>
            </h3>
            <div className="space-y-1.5">
              {requiredSlots.map((slotPos, i) => {
                const pickedId = myPicks[i]
                const pickedPlayer = pickedId ? players.find(p => p.id === pickedId) : null
                return (
                  <div key={i} className={`rounded-lg px-3 py-2 text-xs flex items-center gap-2 ${pickedPlayer ? 'bg-[#0A0A0A]' : 'bg-[#0A0A0A] border border-dashed border-gray-700'}`}>
                    <span className={`font-bold w-8 shrink-0 ${slotPos === 'BENCH' ? 'text-gray-600' : 'text-orange-400'}`}>
                      {slotPos === 'BENCH' ? 'BN' : slotPos}
                    </span>
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
              <div className="flex-1">
                {isSpinning ? (
                  <div>
                    <div className="text-yellow-400 font-black text-sm">Spinning...</div>
                    <div className="text-gray-500 text-xs">Wait for your team assignment</div>
                  </div>
                ) : spunTeam && spunTeamInfo ? (
                  <div>
                    <div className="text-white font-black text-sm">{spunTeamInfo.city} {spunTeamInfo.name}</div>
                    <div className="text-gray-400 text-xs">{filteredPlayers.length} available · Pick from this team only</div>
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

            {/* Position filter */}
            <div className="flex gap-1.5 mb-3 flex-wrap">
              {['ALL', 'PG', 'SG', 'SF', 'PF', 'C'].map(pos => (
                <button key={pos} onClick={() => setFilterPos(pos)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${filterPos === pos ? 'bg-orange-600 text-white' : 'bg-[#111827] text-gray-400 hover:text-white'}`}
                >
                  {pos}
                </button>
              ))}
              <span className="ml-auto text-xs text-gray-500 self-center">{filteredPlayers.length} players</span>
            </div>

            {/* Pick Timer Bar */}
            {room.status === 'drafting' && currentPickerInTimer && (
              <div className="mb-3">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>{currentPickerInTimer === role ? '⚡ Your pick' : `⏳ ${currentPickerInTimer === 'host' ? room.hostName : room.guestName}'s pick`}</span>
                  <span className={`font-black ${pickTimeLeft <= 5 ? 'text-red-400 animate-pulse' : pickTimeLeft <= 10 ? 'text-yellow-400' : 'text-green-400'}`}>
                    {pickTimeLeft}s
                  </span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${pickTimeLeft <= 5 ? 'bg-red-500' : pickTimeLeft <= 10 ? 'bg-yellow-400' : 'bg-green-500'}`}
                    style={{ width: `${(pickTimeLeft / 30) * 100}%` }}
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

            {isSpinning && (
              <div className="flex items-center justify-center h-24 rounded-xl bg-yellow-900/10 border border-yellow-600/30 mb-3">
                <p className="text-yellow-400 font-bold text-sm animate-pulse">🔒 Locked — waiting for spin to finish...</p>
              </div>
            )}

            <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
              {filteredPlayers.map(player => {
                const playerPositions = player.positions.split(',')
                const canPick = isMyTurn && !isSpinning && spunTeam !== null && !takenIds.has(player.id)
                const statVal = getStatValue(player, statMode)

                return (
                  <button
                    key={player.id}
                    onClick={() => canPick && pickPlayer(player.id)}
                    disabled={!canPick}
                    className={`w-full rounded-xl px-4 py-3 flex items-center gap-3 text-left transition-all ${
                      canPick
                        ? 'bg-[#111827] hover:bg-[#1e2d45] hover:border-orange-500 border-2 border-transparent cursor-pointer'
                        : 'bg-[#0D0D0D] border-2 border-transparent cursor-default opacity-50'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-white font-bold text-sm truncate">{player.firstName} {player.lastName}</div>
                      <div className="text-gray-500 text-xs">{player.team} · {player.yearFrom}–{player.yearTo}</div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {playerPositions.map((pos: string) => (
                        <span key={pos} className="text-xs bg-orange-600/20 text-orange-400 px-1.5 py-0.5 rounded font-bold">{pos}</span>
                      ))}
                    </div>
                    {room.difficulty === 'casual' && (
                      <div className="text-right shrink-0 min-w-[56px]">
                        <div className="text-white font-black text-sm">
                          {statMode === 'games_played' ? statVal : statVal.toFixed(1)}
                        </div>
                        <div className="text-gray-500 text-xs">
                          {statMode === 'games_played' ? 'GP' : statMode.toUpperCase()}
                        </div>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Opponent Team */}
          <div className="bg-[#111827] rounded-2xl p-4">
            <h3 className="text-white font-black text-sm mb-3">
              {oppName} <span className="text-gray-500 font-normal">({oppPicks.length}/{teamSize})</span>
            </h3>
            <div className="space-y-1.5">
              {requiredSlots.map((slotPos, i) => {
                const pickedId = oppPicks[i]
                const pickedPlayer = pickedId ? players.find(p => p.id === pickedId) : null
                return (
                  <div key={i} className={`rounded-lg px-3 py-2 text-xs flex items-center gap-2 bg-[#0A0A0A] ${!pickedPlayer ? 'border border-dashed border-gray-700' : ''}`}>
                    <span className={`font-bold w-8 shrink-0 ${slotPos === 'BENCH' ? 'text-gray-600' : 'text-blue-400'}`}>
                      {slotPos === 'BENCH' ? 'BN' : slotPos}
                    </span>
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
          <div className="text-4xl animate-bounce mb-4">🏀</div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    }>
      <GameContent />
    </Suspense>
  )
}
