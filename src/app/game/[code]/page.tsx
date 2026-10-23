'use client'
import { useEffect, useState, useRef, useMemo, Suspense } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { getSocket } from '@/lib/socket'
import { CURRENT_TEAMS, getCurrentTeam } from '@/lib/teams'
import { EMOTES } from '@/lib/accessories'
import { useAuth } from '@/context/AuthContext'
import { type TeamMode, type GameResult, type Room, type Player, TEAM_SIZES, getRequiredPositions, getStatModeForGame, STAT_CATEGORY_LABELS, STAT_CATEGORY_SHORT } from '@/types/game'

const STAT_LABELS: Record<string, string> = {
  ...STAT_CATEGORY_LABELS,
}

function getStatValue(player: Player, mode: string): number {
  switch (mode) {
    case 'games_played': return player.careerGames
    case 'ppg': return player.careerPPG
    case 'rpg': return player.careerRPG
    case 'apg': return player.careerAPG
    case 'earnings': return player.careerEarnings
    case 'ebk_score': return player.ebkScore
    default: return 0
  }
}

function formatStat(val: number, statMode: string): string {
  if (statMode === 'games_played') return Math.round(val).toString()
  if (statMode === 'earnings') {
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`
    if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`
    return val === 0 ? 'N/A' : `$${val}`
  }
  return val.toFixed(1)
}

function getStatUnit(statMode: string): string {
  switch (statMode) {
    case 'games_played': return 'total games played'
    case 'ppg': return 'pts / game (career avg)'
    case 'rpg': return 'reb / game (career avg)'
    case 'apg': return 'ast / game (career avg)'
    case 'earnings': return 'real career salary earned'
    case 'ebk_score': return 'EBK composite score'
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
  // Debounced search query — actual filter runs on this, not searchQuery directly
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null)
  const [lastResult, setLastResult] = useState<GameResult | null>(null)
  const [showConfetti, setShowConfetti] = useState(false)
  const [disconnected, setDisconnected] = useState(false)
  const [disconnectReason, setDisconnectReason] = useState<string | null>(null)
  // Network reconnect banner — 'reconnecting' shows the amber bar, 'reconnected' shows
  // a brief green flash then hides. null = no banner.
  const [socketStatus, setSocketStatus] = useState<'reconnecting' | 'reconnected' | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Opponent pick highlight — shows a flash animation on newly drafted opponent player
  const [recentOppPickId, setRecentOppPickId] = useState<number | null>(null)
  const recentOppPickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // My own most recently drafted player ID — for the enter animation in my roster
  const [recentMyPickId, setRecentMyPickId] = useState<number | null>(null)
  const recentMyPickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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
  const pickTimerDeadlineRef = useRef<number>(0) // absolute Date.now() when the timer expires
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
    // Reconnect token key — defined at the top of the effect so every handler
    // in this closure can reference it (e.g. handleSeriesComplete for cleanup).
    const tokenKey = `game-token-${code}`

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
      setRoom(room); setPlayers(players); setLastResult(null); setSearchQuery(''); setDebouncedSearch('')
      // Reset spinner/pick state from previous game in series
      setIsSpinning(false)
      setSpunTeam(null)
      setShuffledIds([])
      setSelectedPlayerId(null)
      setPickError(null)
      setCurrentPickerInTimer(null)
      setRecentOppPickId(null)
      setRecentMyPickId(null)
      if (pickTimerRef.current) { clearInterval(pickTimerRef.current); pickTimerRef.current = null }
      spinRefs.current.forEach(id => { clearInterval(id); clearTimeout(id) })
      spinRefs.current = []
      spinIntervalRef.current = null
    }
    const handleRoomUpdated = ({ room }: { room: Room }) => {
      // Detect newly added picks to flash-highlight them in the roster panels
      setRoom(prev => {
        if (prev) {
          const prevOppPicks = role === 'host' ? prev.guestPicks : prev.hostPicks
          const nextOppPicks = role === 'host' ? room.guestPicks : room.hostPicks
          if (nextOppPicks.length > prevOppPicks.length) {
            const newId = nextOppPicks[nextOppPicks.length - 1]
            if (newId !== undefined) {
              setRecentOppPickId(newId)
              if (recentOppPickTimerRef.current) clearTimeout(recentOppPickTimerRef.current)
              recentOppPickTimerRef.current = setTimeout(() => setRecentOppPickId(null), 2000)
            }
          }
          const prevMyPicks = role === 'host' ? prev.hostPicks : prev.guestPicks
          const nextMyPicks = role === 'host' ? room.hostPicks : room.guestPicks
          if (nextMyPicks.length > prevMyPicks.length) {
            const newMyId = nextMyPicks[nextMyPicks.length - 1]
            if (newMyId !== undefined) {
              setRecentMyPickId(newMyId)
              if (recentMyPickTimerRef.current) clearTimeout(recentMyPickTimerRef.current)
              recentMyPickTimerRef.current = setTimeout(() => setRecentMyPickId(null), 1500)
            }
          }
        }
        return room
      })
      setSelectedPlayerId(null)
    }
    const handleGameResult = ({ room, result }: { room: Room; result: GameResult }) => {
      setRoom(room); setLastResult(result); setCurrentPickerInTimer(null); refreshUser()
    }
    const handleSeriesComplete = ({ room, seriesWinner }: { room: Room; seriesWinner: 'host' | 'guest' | 'draw' }) => {
      setRoom(room); setSeriesWinner(seriesWinner); setCurrentPickerInTimer(null); refreshUser()
      // Trigger confetti if this player won
      if (seriesWinner === role) { setShowConfetti(true); setTimeout(() => setShowConfetti(false), 4000) }
      // The room is permanently over — drop the reconnect token so a stale token
      // from a previous game in the same room code cannot be replayed.
      try { sessionStorage.removeItem(tokenKey) } catch { /* ignore */ }
    }
    const handlePartnerDisconnected = () => { setDisconnected(true); setDisconnectReason(null) }
    const handleRoomError = ({ message }: { message: string }) => {
      setDisconnected(true)
      setDisconnectReason(message)
      console.error('Room error:', message)
    }

    const handlePickTimerStart = ({ picker, duration, spunTeam: team }: { picker: 'host' | 'guest'; duration: number; spunTeam: string }) => {
      if (pickTimerRef.current) clearInterval(pickTimerRef.current)
      // Anchor the deadline to wall-clock time so drift and reconnect skew don't accumulate.
      // Each interval tick recomputes from Date.now() rather than decrementing blindly.
      pickTimerDeadlineRef.current = Date.now() + duration * 1000
      setPickTimeLeft(duration)
      pickTimerDurationRef.current = duration
      setCurrentPickerInTimer(picker)
      setPickError(null)
      setSearchQuery('')
      setDebouncedSearch('')
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
        const remaining = Math.round((pickTimerDeadlineRef.current - Date.now()) / 1000)
        if (remaining <= 0) { clearInterval(pickTimerRef.current!); setPickTimeLeft(0); return }
        setPickTimeLeft(remaining)
      }, 500)
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

    // Reconnect token helpers — tokenKey is defined at the top of this effect.
    function getRoomToken(): string | undefined {
      try { return sessionStorage.getItem(tokenKey) ?? undefined } catch { return undefined }
    }

    // Named handler so socket.off() removes only this listener and not all 'connect'
    // listeners (e.g. those registered by the socket singleton itself).
    // On reconnect the socket gets a new ID — re-emit get-room so the server
    // re-seats this socket into the room channel and pushes fresh state.
    function handleConnect() {
      socket.emit('get-room', { code, role, token: getRoomToken() })
      // If we were showing a "reconnecting" banner, flip it to "reconnected" briefly
      setSocketStatus(prev => {
        if (prev === 'reconnecting') {
          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
          reconnectTimerRef.current = setTimeout(() => setSocketStatus(null), 2000)
          return 'reconnected'
        }
        return prev
      })
    }

    function handleDisconnect() {
      // Only show the banner for transient disconnects (not deliberate navigations).
      // The 'disconnected' state (partner left) takes precedence and is shown as a modal.
      setSocketStatus('reconnecting')
    }

    // Server emits 'session-expired' before force-disconnecting a socket whose
    // tokenVersion no longer matches the DB (logout or password change mid-game).
    // Redirect to login so the user gets clear feedback rather than a silent drop.
    const handleSessionExpired = () => {
      router.replace('/login?reason=session_expired')
    }

    // Store the server-issued reconnect token in sessionStorage when received.
    const handleRoomToken = ({ token: t }: { token: string }) => {
      try { sessionStorage.setItem(tokenKey, t) } catch { /* sessionStorage unavailable */ }
    }

    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
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
    socket.on('session-expired', handleSessionExpired)
    socket.on('room-token', handleRoomToken)

    // Request current room state from server
    socket.emit('get-room', { code, role, token: getRoomToken() })

    // If no room-state arrives within 8 seconds the code is invalid or expired.
    // Show the disconnected error screen instead of spinning forever.
    const loadTimeout = setTimeout(() => {
      setRoom(prev => {
        if (prev === null) {
          setDisconnected(true)
          setDisconnectReason('Room not found or has already ended.')
        }
        return prev
      })
    }, 8000)

    return () => {
      clearTimeout(loadTimeout)
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
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
      socket.off('session-expired', handleSessionExpired)
      socket.off('room-token', handleRoomToken)
      if (pickTimerRef.current) clearInterval(pickTimerRef.current)
      if (spinIntervalRef.current) clearInterval(spinIntervalRef.current)
      if (emoteTimerRef.current) clearTimeout(emoteTimerRef.current)
      if (pickErrorTimerRef.current) clearTimeout(pickErrorTimerRef.current)
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current)
      spinRefs.current.forEach(id => { clearTimeout(id); clearInterval(id) })
      spinRefs.current = []
      if (recentOppPickTimerRef.current) clearTimeout(recentOppPickTimerRef.current)
      if (recentMyPickTimerRef.current) clearTimeout(recentMyPickTimerRef.current)
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
    }
  }, [code, role])

  // Warn the player before they close the tab while a draft is in progress.
  // A navigating-away mid-draft counts as a disconnect for the opponent and can
  // corrupt the game state, so we prompt with the browser's native dialog.
  useEffect(() => {
    if (!room || room.status === 'complete' || seriesWinner !== null) return
    if (room.status !== 'drafting' && room.status !== 'waiting' && room.status !== 'result') return
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Modern browsers show their own generic message; setting returnValue
      // is required for the dialog to appear in all supported browsers.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [room?.status, seriesWinner])

  // Debounce search query by 120ms — prevents janky filtering on every keystroke
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 120)
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [searchQuery])

  // Keyboard shortcut: Escape cancels the current player selection during drafting
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelectedPlayerId(null)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // Load user's unlocked emotes
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/auth/me', { signal: controller.signal })
      .then(r => r.json())
      .then(d => {
        if (d.user?.unlockedEmotes) {
          try {
            const arr = JSON.parse(d.user.unlockedEmotes)
            setMyEmotes(Array.isArray(arr) ? arr : [])
          } catch { setMyEmotes([]) }
        }
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  function pickPlayer(playerId: number, slotPos: string) {
    const socket = getSocket()
    socket.emit('pick-player', { code, playerId, slotPos })
  }

  function startNextGame() {
    const socket = getSocket()
    socket.emit('next-game', { code })
  }

  function CopyCodeButton({ code: roomCode }: { code: string }) {
    const [copied, setCopied] = useState(false)
    function handleCopy() {
      const url = `${window.location.origin}/join?code=${roomCode}`
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }).catch(() => {
        navigator.clipboard.writeText(roomCode).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        })
      })
    }
    return (
      <div className="space-y-2">
        <button
          onClick={handleCopy}
          className={`w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-black text-xs tracking-[0.12em] uppercase transition-all duration-200 ${
            copied
              ? 'bg-green-500/20 border border-green-500/50 text-green-400'
              : 'bg-orange-600/15 border border-orange-500/40 text-orange-300 hover:bg-orange-600/25 hover:border-orange-500/60 active:scale-95'
          }`}
        >
          {copied ? (
            <>
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              Link Copied!
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              Copy Invite Link
            </>
          )}
        </button>
        <p className="text-white/25 text-[11px]">Or share the code above</p>
      </div>
    )
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
          <p className="text-white/40 text-sm mb-6 leading-relaxed">{disconnectReason ?? 'Your opponent disconnected.'}</p>
          <button onClick={() => router.push('/lobby')} className="btn-primary w-full">Back to Lobby</button>
        </div>
      </div>
    )
  }

  if (!room) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-2 border-white/[0.05]" />
          <div className="absolute inset-0 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
          <div className="absolute inset-3 rounded-full bg-orange-600/10 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
          </div>
        </div>
        <p className="text-label tracking-[0.3em]">CONNECTING TO DRAFT ROOM...</p>
      </div>
    )
  }

  // Waiting for opponent
  if (room.status === 'waiting') {
    const opponentPresent = role === 'host' ? !!room.guestName : !!room.hostName
    const opponentName = role === 'host' ? room.guestName : room.hostName
    const mySeriesScore = role === 'host' ? room.hostSeriesScore : room.guestSeriesScore
    const oppSeriesScore = role === 'host' ? room.guestSeriesScore : room.hostSeriesScore
    const inProgress = room.currentGame > 1 && room.series > 1

    return (
      <div className="min-h-screen flex items-center justify-center text-center px-4">
        {socketStatus && (
          <div className={`reconnect-banner ${socketStatus === 'reconnected' ? 'reconnect-banner-success' : 'reconnect-banner-warning'}`}>
            {socketStatus === 'reconnecting' ? (
              <><span className="reconnect-dot" /><span className="reconnect-dot" /><span className="reconnect-dot" /><span style={{ marginLeft: 4 }}>Reconnecting…</span></>
            ) : (
              <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg><span>Reconnected</span></>
            )}
          </div>
        )}
        <div className="max-w-sm w-full animate-slide-up">

          {/* Status banner */}
          {opponentPresent ? (
            <div className="live-banner mb-6 mx-auto w-fit">
              <span className="live-dot" />
              {role === 'host' ? 'Opponent connected' : 'In lobby'}
            </div>
          ) : (
            <div className="live-banner mb-6 mx-auto w-fit">
              <span className="live-dot" />
              Waiting for opponent
            </div>
          )}

          {/* Room code card */}
          <div className="card-accent p-8 mb-3">
            <p className="text-label tracking-[0.2em] mb-4">Room Code</p>
            <div className="font-display text-5xl sm:text-7xl text-orange-400 tracking-[0.2em] sm:tracking-[0.35em] leading-none mb-4">{room.code}</div>
            {opponentPresent ? (
              <div className="flex items-center justify-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <p className="text-green-400 text-xs font-black">{opponentName} joined</p>
              </div>
            ) : (
              <div className="space-y-2">
                <CopyCodeButton code={room.code} />
              </div>
            )}
          </div>

          {/* Series score — shown between games in a multi-game series */}
          {inProgress && (
            <div className="scoreboard mb-4 animate-fade-up">
              <div className="flex items-center justify-between mb-2">
                <span className="text-label tracking-[0.2em]">Series Score</span>
                <span className="text-label tracking-[0.2em]">Game {room.currentGame} of {room.series}</span>
              </div>
              <div className="flex items-center justify-center gap-4">
                <div className="text-center flex-1">
                  <div className="text-white/40 text-[10px] font-black uppercase tracking-[0.15em] truncate mb-1">{myName}</div>
                  <div className="font-display text-5xl text-orange-400 leading-none">{mySeriesScore}</div>
                </div>
                <div className="text-white/20 font-display text-3xl leading-none">–</div>
                <div className="text-center flex-1">
                  <div className="text-white/40 text-[10px] font-black uppercase tracking-[0.15em] truncate mb-1">{opponentName ?? 'Opponent'}</div>
                  <div className="font-display text-5xl text-white/70 leading-none">{oppSeriesScore}</div>
                </div>
              </div>
            </div>
          )}

          {/* Waiting indicator */}
          <div className="flex items-center justify-center gap-2.5 mb-5">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-orange-500/40 border-t-orange-400 animate-spin shrink-0" />
            <span className="text-white/40 text-sm">
              {role === 'host'
                ? (opponentPresent ? 'Tap "Start Game" when ready' : 'Waiting for opponent to join')
                : 'Waiting for host to start'}
              <span className="animate-ellipsis" />
            </span>
          </div>

          {/* Game format chips */}
          <div className="flex items-center justify-center gap-2 text-white/40 text-sm flex-wrap">
            <span className="bg-white/[0.04] border border-white/[0.07] rounded-lg px-3 py-1.5 text-xs font-black text-white/60">
              {room.teamMode === 'starter5' ? 'Starter 5' : room.teamMode === 'bench8' ? 'Bench 8' : 'Full Roster'}
            </span>
            <span className="text-white/15">·</span>
            <span className="text-xs text-white/40">{room.series === 1 ? '1 Game' : `Best of ${room.series}`}</span>
            <span className="text-white/15">·</span>
            <span className="text-orange-400 text-xs font-black">
              {STAT_CATEGORY_LABELS[room.statCategory] ?? 'Games Played'}
            </span>
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
  const statMode = getStatModeForGame(room.currentGame, room.statCategory)
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
      <div className="min-h-screen px-3 sm:px-4 py-6 sm:py-8 pb-32 lg:pb-8 overflow-y-auto animate-fade-in">
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

        <div className="max-w-4xl w-full mx-auto px-0 sm:px-0">
          <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
          {/* LEFT col: header + game-by-game */}
          <div>
          {/* Result header */}
          <div className="text-center mb-5 sm:mb-6 animate-fade-up">
            {iWon && (
              <div className="mb-4 inline-flex items-center gap-2.5 bg-orange-950/60 border border-orange-500/60 rounded-full px-4 py-2 shadow-[0_0_32px_rgba(249,115,22,0.35)]">
                {/* Crown icon */}
                <svg className="w-4 h-4 text-orange-300 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M2 19h20v2H2v-2zM2 6l5 7 5-9 5 9 5-7v11H2V6z" />
                </svg>
                <span className="text-orange-300 text-[11px] font-black tracking-[0.25em] uppercase">Series Champion</span>
                <svg className="w-4 h-4 text-orange-300 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M2 19h20v2H2v-2zM2 6l5 7 5-9 5 9 5-7v11H2V6z" />
                </svg>
              </div>
            )}
            {!iWon && !isDraw && (
              <div className="mb-4 inline-flex items-center gap-2 bg-red-950/30 border border-red-500/25 rounded-full px-4 py-1.5">
                <span className="text-red-400/60 text-[11px] font-black tracking-[0.25em] uppercase">Series Over</span>
              </div>
            )}
            <div
              className={`font-display leading-none mb-2 ${iWon ? 'animate-win-pop win-shimmer-text animate-win-glow' : isDraw ? 'text-yellow-400 animate-scale-in' : 'text-red-400/50 animate-score-reveal'}`}
              style={iWon ? { fontSize: 'clamp(5.5rem, 26vw, 13rem)' } : { fontSize: 'clamp(3.5rem, 15vw, 8rem)' }}>
              {iWon ? 'W' : isDraw ? 'DRAW' : 'L'}
            </div>
            <div className={`font-display tracking-[0.15em] text-lg sm:text-3xl mb-4 sm:mb-5 ${iWon ? 'text-white' : isDraw ? 'text-yellow-400' : 'text-red-400/50'}`}>
              {iWon ? 'SERIES WIN' : isDraw ? 'SERIES DRAW' : 'SERIES LOSS'}
            </div>

            {/* Championship scoreboard — winner gets orange glow, loser gets muted */}
            <div className={`relative rounded-2xl overflow-hidden mb-3 sm:mb-4 animate-fade-up-1 ${
              iWon
                ? 'bg-gradient-to-b from-orange-950/50 to-orange-950/10 border border-orange-500/35 shadow-[0_0_48px_rgba(249,115,22,0.14)]'
                : isDraw
                ? 'bg-white/[0.04] border border-yellow-700/25'
                : 'bg-white/[0.025] border border-white/[0.06]'
            }`}>
              {/* Top accent line — orange for win, red for loss */}
              <div className={`h-[2px] w-full ${iWon ? 'bg-gradient-to-r from-transparent via-orange-500 to-transparent' : isDraw ? 'bg-gradient-to-r from-transparent via-yellow-600/50 to-transparent' : 'bg-gradient-to-r from-transparent via-red-500/50 to-transparent'}`} />
              <div className="flex items-stretch">
                {/* Host side */}
                {(() => {
                  const hostIsWinner = seriesWinner === 'host'
                  return (
                    <div className={`flex-1 min-w-0 px-4 py-5 text-center ${hostIsWinner ? 'bg-orange-950/15' : ''}`}>
                      <div className={`text-[10px] font-black tracking-[0.15em] uppercase mb-1.5 truncate ${
                        hostIsWinner ? 'text-orange-300' : isDraw ? 'text-white/40' : 'text-white/35'
                      }`}>{room.hostName}</div>
                      <div className={`font-display leading-none tabular-nums ${
                        hostIsWinner ? (role === 'host' ? 'win-shimmer-text animate-win-pop' : 'text-orange-400')
                        : isDraw ? 'text-yellow-300' : 'text-white/45'
                      }`}
                        style={{ fontSize: hostIsWinner ? 'clamp(3.5rem, 15vw, 6.5rem)' : 'clamp(2.5rem, 10vw, 4.5rem)' }}>
                        {room.hostSeriesScore}
                      </div>
                      {hostIsWinner && !isDraw && (
                        <div className="mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 bg-orange-500/15 border border-orange-500/30">
                          <span className="text-orange-400 text-[9px] font-black tracking-widest uppercase">Winner</span>
                        </div>
                      )}
                    </div>
                  )
                })()}
                {/* Divider */}
                <div className="flex items-center justify-center px-2 shrink-0">
                  <div className="text-white/30 font-display text-2xl leading-none">–</div>
                </div>
                {/* Guest side */}
                {(() => {
                  const guestIsWinner = seriesWinner === 'guest'
                  return (
                    <div className={`flex-1 min-w-0 px-4 py-5 text-center ${guestIsWinner ? 'bg-orange-950/15' : ''}`}>
                      <div className={`text-[10px] font-black tracking-[0.15em] uppercase mb-1.5 truncate ${
                        guestIsWinner ? 'text-orange-300' : isDraw ? 'text-white/40' : 'text-white/35'
                      }`}>{room.guestName}</div>
                      <div className={`font-display leading-none tabular-nums ${
                        guestIsWinner ? (role === 'guest' ? 'win-shimmer-text animate-win-pop' : 'text-orange-400')
                        : isDraw ? 'text-yellow-300' : 'text-white/45'
                      }`}
                        style={{ fontSize: guestIsWinner ? 'clamp(3.5rem, 15vw, 6.5rem)' : 'clamp(2.5rem, 10vw, 4.5rem)' }}>
                        {room.guestSeriesScore}
                      </div>
                      {guestIsWinner && !isDraw && (
                        <div className="mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 bg-orange-500/15 border border-orange-500/30">
                          <span className="text-orange-400 text-[9px] font-black tracking-widest uppercase">Winner</span>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
              <div className="border-t border-white/[0.05] text-white/20 text-[9px] font-black tracking-[0.2em] uppercase text-center py-2.5">
                Lower {STAT_CATEGORY_LABELS[room.statCategory] ?? 'stat'} total wins each game
              </div>
            </div>

            {iWon && (
              <div className="animate-fade-up-2 inline-flex items-center gap-2 bg-orange-950/40 border border-orange-600/40 rounded-full px-5 py-2 shadow-[0_0_20px_rgba(234,88,12,0.2)]">
                <span className="text-orange-300 text-xs font-black tracking-[0.18em] uppercase">Elite Ball Knowledge Confirmed</span>
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
            <div className="card-surface rounded-2xl p-4 mb-4 animate-fade-up-3">
              <div className="flex items-center justify-between mb-3">
                <div className="text-label tracking-[0.18em]">Game by Game</div>
                <div className="text-label tabular-nums">
                  {room.gameResults.filter(r => r.winner === role).length}–{room.gameResults.filter(r => r.winner !== role && r.winner !== 'draw').length}
                  {room.gameResults.filter(r => r.winner === 'draw').length > 0 && (
                    <span className="text-yellow-600 ml-1">({room.gameResults.filter(r => r.winner === 'draw').length}D)</span>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                {room.gameResults.map((r, idx) => {
                  const myTotal = role === 'host' ? r.hostTotal : r.guestTotal
                  const oppTotal = role === 'host' ? r.guestTotal : r.hostTotal
                  const gameWon = r.winner === role
                  const gameDraw = r.winner === 'draw'
                  return (
                    <div key={r.game}
                      className={`rounded-xl border overflow-hidden animate-fade-up`}
                      style={{ animationDelay: `${0.15 + idx * 0.06}s` }}>
                      <div className={`flex items-center px-3 py-3 gap-3 ${
                        gameWon ? 'bg-green-950/20 border-green-800/35' : gameDraw ? 'bg-yellow-950/15 border-yellow-800/20' : 'bg-white/[0.02] border-white/[0.05]'
                      }`}>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-display text-sm leading-none ${
                          gameWon ? 'bg-green-500/15 text-green-400 border border-green-500/20' : gameDraw ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20' : 'bg-white/[0.04] text-white/30 border border-white/[0.06]'
                        }`}>G{r.game}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className={`font-display text-2xl leading-none tabular-nums ${gameWon ? 'text-green-400' : isDraw ? 'text-yellow-300' : 'text-white'}`}>{formatStat(myTotal, r.statMode)}</span>
                            <span className="text-white/15 text-sm">–</span>
                            <span className={`font-display text-xl leading-none tabular-nums ${!gameWon && !gameDraw ? 'text-green-400' : 'text-white/35'}`}>{formatStat(oppTotal, r.statMode)}</span>
                          </div>
                          <div className="text-white/20 text-[9px] tracking-wider uppercase mt-0.5 truncate">{STAT_LABELS[r.statMode]}</div>
                        </div>
                        <div className={`font-display text-2xl leading-none shrink-0 ${gameWon ? 'text-green-400' : gameDraw ? 'text-yellow-400' : 'text-red-400/60'}`}>
                          {gameWon ? 'W' : gameDraw ? 'D' : 'L'}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          </div>{/* end LEFT col */}

          {/* RIGHT col: Draft Recap (last game) + EBK Contribution Table */}
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

            // EBK contribution per player
            const myPlayersWithEbk = mySlotsComplete.filter(Boolean) as Player[]
            const myTotalEbk = myPlayersWithEbk.reduce((s, p) => s + p.ebkScore, 0)

            return (
              <>
              {/* EBK Contribution breakdown table — series complete highlight */}
              {myPlayersWithEbk.length > 0 && (
                <div className="card-accent rounded-2xl p-4 mb-4 animate-fade-up-2">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-label tracking-[0.18em]">Your EBK Breakdown</h2>
                      <p className="text-white/25 text-[10px] mt-0.5">Each player&apos;s contribution to your team total</p>
                    </div>
                    <div className="text-right">
                      <div className="font-display text-3xl leading-none text-orange-400 tabular-nums">{myTotalEbk.toFixed(1)}</div>
                      <div className="text-[9px] font-black tracking-widest text-white/25 uppercase mt-0.5">Total EBK</div>
                    </div>
                  </div>
                  {/* Table header */}
                  <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 px-2 mb-2">
                    <div className="text-label" style={{ width: 32 }}>Pos</div>
                    <div className="text-label">Player</div>
                    <div className="text-label text-right">EBK</div>
                    <div className="text-label text-right" style={{ width: 36 }}>Share</div>
                  </div>
                  <div className="space-y-1">
                    {myPlayersWithEbk.map((p, i) => {
                      const share = myTotalEbk > 0 ? (p.ebkScore / myTotalEbk) * 100 : 0
                      const slotPos = requiredSlots[mySlotsComplete.indexOf(p)]
                      return (
                        <div key={p.id} className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 items-center px-2 py-2 rounded-lg hover:bg-white/[0.03] transition-colors" style={{ animationDelay: `${i * 0.05}s` }}>
                          <div style={{ width: 32 }}>
                            <span className={`pos-badge ${slotPos === 'BENCH' ? 'bg-white/5 text-white/25 border-white/10' : 'pos-' + slotPos?.toLowerCase()}`}>{slotPos === 'BENCH' ? 'BN' : slotPos}</span>
                          </div>
                          <div className="min-w-0">
                            <div className="text-white text-xs font-bold truncate">{p.firstName} {p.lastName}</div>
                            <div className="w-full bg-white/[0.06] rounded-full h-1 mt-1 overflow-hidden">
                              <div className="h-full rounded-full bg-gradient-to-r from-orange-600 to-orange-400 transition-all" style={{ width: `${share}%` }} />
                            </div>
                          </div>
                          <div className="font-display text-base leading-none text-orange-400 tabular-nums text-right">{p.ebkScore.toFixed(1)}</div>
                          <div className="text-white/35 text-[10px] font-black tabular-nums text-right" style={{ width: 36 }}>{share.toFixed(0)}%</div>
                        </div>
                      )
                    })}
                  </div>
                  {/* Total bar */}
                  <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between px-2">
                    <span className="text-white/40 text-xs font-black uppercase tracking-widest">Team Total</span>
                    <span className="font-display text-2xl text-orange-400 tabular-nums leading-none">{myTotalEbk.toFixed(1)}</span>
                  </div>
                </div>
              )}

              <div className="card-stat rounded-2xl p-4 mb-4 animate-fade-up-4">
                <div className="flex flex-wrap items-center justify-between gap-1.5 mb-4">
                  <h2 className="text-label tracking-[0.18em]">Draft Recap — Game {lastGame.game}</h2>
                  <span className="text-orange-400/60 text-[10px] font-black uppercase tracking-wider shrink-0">{STAT_LABELS[lastGame.statMode]}</span>
                </div>
                {/* ESPN-style column headers */}
                <div className="grid grid-cols-[1fr_auto_1fr] gap-1 mb-3">
                  <div className={`text-xs font-black text-center truncate px-1 py-1.5 rounded-lg ${lastIWon ? 'bg-green-950/40 text-green-400' : lastDraw ? 'bg-yellow-950/30 text-yellow-400/70' : 'text-white/50'}`}>
                    {myName2} {lastIWon ? '✓' : lastDraw ? '—' : ''}
                  </div>
                  <div className="w-6" />
                  <div className={`text-xs font-black text-center truncate px-1 py-1.5 rounded-lg ${!lastIWon && !lastDraw ? 'bg-green-950/40 text-green-400' : lastDraw ? 'bg-yellow-950/30 text-yellow-400/70' : 'text-white/50'}`}>
                    {oppName} {!lastIWon && !lastDraw ? '✓' : lastDraw ? '—' : ''}
                  </div>
                </div>
                {/* Player rows */}
                {requiredSlots.map((slotPos, i) => {
                  const myP = mySlotsComplete[i]
                  const oppP = oppSlotsComplete[i]
                  if (!myP && !oppP) return null
                  const isBench = slotPos === 'BENCH'
                  const myVal = myP ? getStatValue(myP, lastGame.statMode) : null
                  const oppVal = oppP ? getStatValue(oppP, lastGame.statMode) : null
                  return (
                    <div key={i} className="grid grid-cols-[1fr_auto_1fr] gap-1 mb-1.5">
                      <div className={`rounded-lg px-2 py-2 flex flex-col gap-0.5 min-w-0 ${lastIWon ? 'bg-green-950/15' : 'bg-white/[0.03]'}`}>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[9px] font-black shrink-0 ${isBench ? 'text-white/30' : 'text-orange-400/70'}`}>{isBench ? 'BN' : slotPos}</span>
                          <span className="text-white/85 text-xs font-bold truncate flex-1" title={myP ? `${myP.firstName} ${myP.lastName}` : ''}>{myP ? `${myP.firstName[0]}. ${myP.lastName}` : '—'}</span>
                        </div>
                        {myVal !== null && <span className={`text-sm font-display leading-none tabular-nums ${lastIWon ? 'text-green-400' : 'text-white/50'}`}>{formatStat(myVal, lastGame.statMode)}</span>}
                      </div>
                      <div className="w-5 flex items-center justify-center">
                        <div className="w-px h-full bg-white/[0.06]" />
                      </div>
                      <div className={`rounded-lg px-2 py-2 flex flex-col gap-0.5 min-w-0 ${!lastIWon && !lastDraw ? 'bg-green-950/15' : 'bg-white/[0.03]'}`}>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[9px] font-black shrink-0 ${isBench ? 'text-white/30' : 'text-blue-400/60'}`}>{isBench ? 'BN' : slotPos}</span>
                          <span className="text-white/85 text-xs font-bold truncate flex-1" title={oppP ? `${oppP.firstName} ${oppP.lastName}` : ''}>{oppP ? `${oppP.firstName[0]}. ${oppP.lastName}` : '—'}</span>
                        </div>
                        {oppVal !== null && <span className={`text-sm font-display leading-none tabular-nums ${!lastIWon && !lastDraw ? 'text-green-400' : 'text-white/50'}`}>{formatStat(oppVal, lastGame.statMode)}</span>}
                      </div>
                    </div>
                  )
                })}
                {/* Totals row */}
                <div className="grid grid-cols-[1fr_auto_1fr] gap-1 mt-3 pt-3 border-t border-white/[0.06]">
                  <div className={`rounded-lg px-2 py-2 text-center font-display text-xl leading-none tabular-nums ${lastIWon ? 'text-green-400 bg-green-950/30' : lastDraw ? 'text-yellow-300/80' : 'text-white/60'}`}>
                    {formatStat(myLastTotal, lastGame.statMode)}
                  </div>
                  <div className="w-6 flex items-center justify-center text-white/20 text-xs font-bold">–</div>
                  <div className={`rounded-lg px-2 py-2 text-center font-display text-xl leading-none tabular-nums ${!lastIWon && !lastDraw ? 'text-green-400 bg-green-950/30' : lastDraw ? 'text-yellow-300/80' : 'text-white/60'}`}>
                    {formatStat(oppLastTotal, lastGame.statMode)}
                  </div>
                </div>
              </div>
              </>
            )
          })()}
          </div>{/* end RIGHT col */}
          </div>{/* end lg:grid */}

          {/* CTA — differentiate win vs loss */}
          {/* On mobile: sticky bottom bar so CTAs are always reachable. On lg+: normal flow. */}
          <div className="animate-fade-up-5 mt-5 lg:mt-5 sticky bottom-0 lg:static bg-[#0a0a0f]/90 lg:bg-transparent backdrop-blur-md lg:backdrop-blur-none border-t border-white/[0.05] lg:border-0 -mx-3 sm:-mx-4 lg:mx-0 px-3 sm:px-4 lg:px-0 pt-3 sticky-bar-safe lg:pb-0 lg:pt-0 z-10">
          {iWon ? (
            <div className="flex flex-col gap-2.5">
              <button onClick={() => router.push('/lobby')} className="btn-primary w-full py-4 text-base font-display tracking-widest animate-glow">
                Play Again
              </button>
              <div className="grid grid-cols-2 gap-2.5">
                <button onClick={() => router.push('/lobby')} className="btn-secondary w-full py-3.5 text-sm font-black uppercase tracking-widest">
                  Find New Opponent
                </button>
                <button onClick={() => router.push('/')} className="btn-secondary w-full py-3.5 text-sm font-black uppercase tracking-widest">
                  Home
                </button>
              </div>
            </div>
          ) : isDraw ? (
            <div className="flex flex-col gap-2.5">
              <button onClick={() => router.push('/lobby')} className="btn-primary w-full py-4 text-base font-display tracking-widest">
                Rematch
              </button>
              <button onClick={() => router.push('/')} className="btn-secondary w-full py-3.5 text-sm font-black uppercase tracking-widest">
                Home
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <button onClick={() => router.push('/lobby')} className="w-full py-4 text-base font-display tracking-widest rounded-xl border border-white/20 bg-white/[0.07] text-white/80 hover:bg-white/10 hover:border-white/30 transition-all uppercase">
                Rematch
              </button>
              <div className="grid grid-cols-2 gap-2.5">
                <button onClick={() => router.push('/practice')} className="btn-secondary w-full py-3.5 text-sm font-black uppercase tracking-widest">
                  Practice Draft
                </button>
                <button onClick={() => router.push('/')} className="btn-secondary w-full py-3.5 text-sm font-black uppercase tracking-widest">
                  Home
                </button>
              </div>
            </div>
          )}
          </div>
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
      <div className="min-h-screen px-3 sm:px-4 py-6 sm:py-8 pb-32 lg:pb-8 overflow-y-auto animate-fade-in">
        {socketStatus && (
          <div className={`reconnect-banner ${socketStatus === 'reconnected' ? 'reconnect-banner-success' : 'reconnect-banner-warning'}`}>
            {socketStatus === 'reconnecting' ? (
              <><span className="reconnect-dot" /><span className="reconnect-dot" /><span className="reconnect-dot" /><span style={{ marginLeft: 4 }}>Reconnecting…</span></>
            ) : (
              <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg><span>Reconnected</span></>
            )}
          </div>
        )}
        <div className="max-w-4xl w-full mx-auto">
          <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
          {/* LEFT: header + scores + series */}
          <div>
          {/* Result header */}
          <div className="text-center mb-4 animate-fade-up">
            {/* Game N of Y pill — prominent series progress label */}
            <div className="inline-flex items-center gap-2 bg-orange-950/40 border border-orange-500/30 rounded-full px-3 sm:px-4 py-1.5 mb-3">
              {iWon && (
                <svg className="w-3 h-3 text-orange-400 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M2 19h20v2H2v-2zM2 6l5 7 5-9 5 9 5-7v11H2V6z" />
                </svg>
              )}
              <span className="font-display text-orange-400 text-sm sm:text-base leading-none tracking-widest">
                GAME {effectiveLastResult.game}{room.series > 1 ? ` OF ${room.series}` : ''}
              </span>
            </div>
            <div
              className={`font-display leading-none mb-1.5 sm:mb-2 ${iWon ? 'animate-win-pop win-shimmer-text animate-win-glow' : isDraw ? 'text-yellow-400 animate-scale-in' : 'text-red-400/55 animate-score-reveal'}`}
              style={iWon ? { fontSize: 'clamp(5rem, 22vw, 9rem)' } : { fontSize: 'clamp(3.5rem, 18vw, 7rem)' }}>
              {iWon ? 'W' : isDraw ? 'D' : 'L'}
            </div>
            <div className={`font-display tracking-widest text-lg sm:text-2xl ${iWon ? 'text-white' : isDraw ? 'text-yellow-400/70' : 'text-red-400/50'}`}>
              {iWon ? 'YOU WIN' : isDraw ? 'DRAW' : 'YOU LOSE'}
            </div>
          </div>

          {/* Series scoreboard — hero display when series > 1 */}
          {room.series > 1 && (
            <div className="scoreboard mb-4 animate-fade-up">
              {/* Series label + progress pips */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-label tracking-[0.2em]">Series Score</span>
                <div className="flex items-center gap-1">
                  {Array.from({ length: room.series }, (_, i) => {
                    const hostWins = room.hostSeriesScore ?? 0
                    const guestWins = room.guestSeriesScore ?? 0
                    const myWins = role === 'host' ? hostWins : guestWins
                    const oppWins = role === 'host' ? guestWins : hostWins
                    const filled = i < myWins ? 'me' : i < myWins + oppWins ? 'opp' : 'empty'
                    return (
                      <div
                        key={i}
                        className={`w-2.5 h-2.5 rounded-full transition-all ${
                          filled === 'me'   ? 'bg-orange-400 shadow-[0_0_6px_rgba(249,115,22,0.6)]' :
                          filled === 'opp'  ? 'bg-white/30' :
                                             'bg-white/[0.07] border border-white/[0.12]'
                        }`}
                      />
                    )
                  })}
                </div>
              </div>
              {/* Big score display */}
              <div className="flex items-center justify-center gap-4">
                <div className="text-center flex-1 min-w-0">
                  <div className="text-white/40 text-[10px] font-black uppercase tracking-[0.15em] truncate mb-1">{room.hostName}</div>
                  <div className={`font-display leading-none ${role === 'host' ? 'text-orange-400' : 'text-white/70'}`}
                    style={{ fontSize: 'clamp(3rem, 12vw, 5rem)' }}>
                    {room.hostSeriesScore}
                  </div>
                </div>
                <div className="text-white/20 font-display text-4xl leading-none shrink-0">–</div>
                <div className="text-center flex-1 min-w-0">
                  <div className="text-white/40 text-[10px] font-black uppercase tracking-[0.15em] truncate mb-1">{room.guestName}</div>
                  <div className={`font-display leading-none ${role === 'guest' ? 'text-orange-400' : 'text-white/70'}`}
                    style={{ fontSize: 'clamp(3rem, 12vw, 5rem)' }}>
                    {room.guestSeriesScore}
                  </div>
                </div>
              </div>
              {/* Next game label */}
              {room.currentGame < room.series && (
                <div className="mt-3 pt-3 border-t border-white/[0.06] text-center">
                  <span className="text-label tracking-[0.15em]">
                    Next up: Game {room.currentGame + 1} of {room.series}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Stat explanation */}
          <div className="card-surface rounded-xl px-4 py-3 mb-4 text-center">
            <div className="text-white/60 text-sm leading-snug">Lower total <span className="text-orange-400 font-black">{STAT_LABELS[effectiveLastResult.statMode]}</span> wins</div>
            <div className="text-white/30 text-[11px] mt-1 leading-relaxed">Lowest team total takes the game</div>
          </div>

          {/* Score cards */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-4">
            {([{ name: myName2, total: myTotal, isMe: true }, { name: oppName, total: oppTotal, isMe: false }] as const).map(side => {
              const isWinner = (side.isMe && iWon) || (!side.isMe && !iWon && !isDraw)
              return (
                <div key={side.name} className={`rounded-2xl p-3 sm:p-4 text-center transition-all relative overflow-hidden ${
                  isWinner
                    ? 'bg-gradient-to-b from-green-950/60 to-green-950/20 border-2 border-green-500/70 shadow-[0_0_24px_rgba(34,197,94,0.15)]'
                    : isDraw
                    ? 'card-surface border-2 border-yellow-700/40'
                    : 'card-surface border-2 border-white/[0.05]'
                }`}>
                  {isWinner && !isDraw && (
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-green-400/80 to-transparent" />
                  )}
                  <div className={`text-[9px] sm:text-[10px] font-black uppercase tracking-[0.12em] mb-1.5 sm:mb-2 truncate ${isWinner ? 'text-green-400/70' : 'text-white/30'}`}>{side.name}</div>
                  <div className={`font-display leading-none mb-1 ${isWinner ? 'text-green-400' : isDraw ? 'text-yellow-300' : 'text-white/60'}`}
                    style={{ fontSize: isWinner ? 'clamp(2.25rem, 13vw, 4rem)' : 'clamp(1.75rem, 10vw, 3rem)' }}>
                    {formatStat(side.total, effectiveLastResult.statMode)}
                  </div>
                  <div className="text-white/25 text-[9px] sm:text-[10px] leading-tight tracking-wider">{getStatUnit(effectiveLastResult.statMode)}</div>
                  {isWinner && !isDraw && (
                    <div className="inline-flex items-center gap-1 mt-1.5 sm:mt-2 bg-green-500/15 border border-green-500/30 rounded-full px-2 sm:px-2.5 py-0.5">
                      <span className="text-green-400 text-[9px] sm:text-[10px] font-black tracking-widest uppercase">Lower ✓</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          </div>{/* end LEFT col */}

          {/* RIGHT col: Draft Recap */}
          <div>
          <div className="card-stat rounded-2xl p-4 mb-4">
            <div className="flex flex-wrap items-center justify-between gap-1.5 mb-4">
              <h2 className="text-label tracking-[0.18em]">Draft Recap — Game {effectiveLastResult.game}</h2>
              <span className="text-orange-400/60 text-[10px] font-black uppercase tracking-wider shrink-0">{STAT_LABELS[effectiveLastResult.statMode]}</span>
            </div>
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_auto_1fr] gap-1 mb-3">
              <div className={`text-xs font-black text-center truncate px-1 py-1.5 rounded-lg ${iWon ? 'bg-green-950/40 text-green-400' : isDraw ? 'bg-yellow-950/30 text-yellow-400/70' : 'text-white/50'}`}>
                {myName2} {iWon ? '✓' : isDraw ? '—' : ''}
              </div>
              <div className="w-6" />
              <div className={`text-xs font-black text-center truncate px-1 py-1.5 rounded-lg ${!iWon && !isDraw ? 'bg-green-950/40 text-green-400' : isDraw ? 'bg-yellow-950/30 text-yellow-400/70' : 'text-white/50'}`}>
                {oppName} {!iWon && !isDraw ? '✓' : isDraw ? '—' : ''}
              </div>
            </div>
            {/* Player rows */}
            {requiredSlots.map((slotPos, i) => {
              const myP = mySlotsResult[i]
              const oppP = oppSlotsResult[i]
              if (!myP && !oppP) return null
              const isBench = slotPos === 'BENCH'
              const myVal = myP ? getStatValue(myP, effectiveLastResult.statMode) : null
              const oppVal = oppP ? getStatValue(oppP, effectiveLastResult.statMode) : null
              return (
                <div key={i} className="grid grid-cols-[1fr_auto_1fr] gap-1 mb-1.5">
                  <div className={`rounded-lg px-2 py-2 flex flex-col gap-0.5 min-w-0 ${iWon ? 'bg-green-950/15' : 'bg-white/[0.03]'}`}>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[9px] font-black shrink-0 ${isBench ? 'text-white/30' : 'text-orange-400/70'}`}>{isBench ? 'BN' : slotPos}</span>
                      <span className="text-white/85 text-xs font-bold truncate flex-1" title={myP ? `${myP.firstName} ${myP.lastName}` : ''}>{myP ? `${myP.firstName[0]}. ${myP.lastName}` : '—'}</span>
                    </div>
                    {myVal !== null && <span className={`text-sm font-display leading-none tabular-nums ${iWon ? 'text-green-400' : 'text-white/50'}`}>{formatStat(myVal, effectiveLastResult.statMode)}</span>}
                  </div>
                  <div className="w-5 flex items-center justify-center">
                    <div className="w-px h-full bg-white/[0.06]" />
                  </div>
                  <div className={`rounded-lg px-2 py-2 flex flex-col gap-0.5 min-w-0 ${!iWon && !isDraw ? 'bg-green-950/15' : 'bg-white/[0.03]'}`}>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[9px] font-black shrink-0 ${isBench ? 'text-white/30' : 'text-blue-400/60'}`}>{isBench ? 'BN' : slotPos}</span>
                      <span className="text-white/85 text-xs font-bold truncate flex-1" title={oppP ? `${oppP.firstName} ${oppP.lastName}` : ''}>{oppP ? `${oppP.firstName[0]}. ${oppP.lastName}` : '—'}</span>
                    </div>
                    {oppVal !== null && <span className={`text-sm font-display leading-none tabular-nums ${!iWon && !isDraw ? 'text-green-400' : 'text-white/50'}`}>{formatStat(oppVal, effectiveLastResult.statMode)}</span>}
                  </div>
                </div>
              )
            })}
            {/* Totals row */}
            <div className="grid grid-cols-[1fr_auto_1fr] gap-1 mt-3 pt-3 border-t border-white/[0.06]">
              <div className={`rounded-lg px-2 py-2 text-center font-display text-xl leading-none tabular-nums ${iWon ? 'text-green-400 bg-green-950/30' : isDraw ? 'text-yellow-300/80' : 'text-white/60'}`}>
                {formatStat(myTotal, effectiveLastResult.statMode)}
              </div>
              <div className="w-6 flex items-center justify-center text-white/20 text-xs font-bold">–</div>
              <div className={`rounded-lg px-2 py-2 text-center font-display text-xl leading-none tabular-nums ${!iWon && !isDraw ? 'text-green-400 bg-green-950/30' : isDraw ? 'text-yellow-300/80' : 'text-white/60'}`}>
                {formatStat(oppTotal, effectiveLastResult.statMode)}
              </div>
            </div>
          </div>
          </div>{/* end RIGHT col */}
          </div>{/* end lg:grid */}

          {/* CTA */}
          {/* Sticky on mobile so the Start/Waiting button is always in reach */}
          <div className="flex flex-col gap-2.5 mt-2 sticky bottom-0 lg:static bg-[#0a0a0f]/90 lg:bg-transparent backdrop-blur-md lg:backdrop-blur-none border-t border-white/[0.05] lg:border-0 -mx-3 sm:-mx-4 lg:mx-0 px-3 sm:px-4 lg:px-0 pt-3 sticky-bar-safe lg:pb-0 lg:pt-0 z-10">
            {role === 'host' ? (
              <button onClick={startNextGame} className="btn-primary w-full py-4 text-base font-display tracking-widest animate-glow">
                Start Game {room.currentGame + 1}{room.series > 1 ? ` of ${room.series}` : ''}
              </button>
            ) : (
              <div className="rounded-2xl border border-orange-500/20 bg-orange-950/10 py-4 px-6 text-center flex items-center justify-center gap-3">
                <span className="w-4 h-4 rounded-full border-2 border-orange-500/50 border-t-orange-400 animate-spin shrink-0" />
                <span className="text-white/60 text-sm">Waiting for <span className="text-orange-300 font-bold">{room.hostName}</span> to start Game {room.currentGame + 1}{room.series > 1 ? ` of ${room.series}` : ''}…</span>
              </div>
            )}
            <button onClick={() => router.push('/')} className="btn-secondary w-full py-3 text-sm font-black uppercase tracking-widest">
              Home
            </button>
          </div>
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

  // Build display list from shuffled order; apply search/pos filter on top.
  // Uses debouncedSearch (120ms) so typing doesn't re-filter every single keystroke.
  const filteredPlayers = shuffledIds
    .map(id => playerById.get(id))
    .filter((p): p is Player => {
      if (!p) return false
      if (room?.difficulty === 'ebk' && debouncedSearch.length < 3) return false
      if (takenIds.has(p.id)) return false
      // Starter slots: hide only if ALL of the player's positions are used
      if (isStarterSlot && p.positions.split(',').every(pos => usedStarterPositions.has(pos))) return false
      if (filterPos !== 'ALL' && !p.positions.split(',').includes(filterPos)) return false
      if (debouncedSearch) {
        const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        const q = norm(debouncedSearch)
        const currentAbbr = getCurrentTeam(p.team)
        const teamEntry = CURRENT_TEAMS.find(t => t.abbr === currentAbbr)
        const teamSearchStr = norm([p.team, currentAbbr, teamEntry?.name ?? '', teamEntry?.city ?? ''].join(' '))
        if (!norm(`${p.firstName} ${p.lastName}`).includes(q) && !teamSearchStr.includes(q)) return false
      }
      return true
    })

  return (
    <div className="min-h-screen py-4 px-4 pb-24 sm:pb-4 relative animate-fade-in">
      {/* ── Reconnect banner ──────────────────────────────────────────────────── */}
      {socketStatus && (
        <div className={`reconnect-banner ${socketStatus === 'reconnected' ? 'reconnect-banner-success' : 'reconnect-banner-warning'}`}>
          {socketStatus === 'reconnecting' ? (
            <>
              <span className="reconnect-dot" />
              <span className="reconnect-dot" />
              <span className="reconnect-dot" />
              <span style={{ marginLeft: 4 }}>Reconnecting…</span>
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
              <span>Reconnected</span>
            </>
          )}
        </div>
      )}

      {/* ── Screen-reader live regions ─────────────────────────────────────────── */}
      {/* Whose turn it is — polite so it doesn't interrupt */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {isMyTurn
          ? `Your pick. ${spunTeam ? `Pick a player from ${spunTeam}.` : 'Select a player.'}`
          : `${currentPicker === 'host' ? room.hostName : room.guestName} is picking.`}
      </div>
      {/* Pick announcements — assertive so screen readers interrupt immediately */}
      <div aria-live="assertive" aria-atomic="true" className="sr-only">
        {recentMyPickId && playerById.get(recentMyPickId) && (
          `You drafted ${playerById.get(recentMyPickId)!.firstName} ${playerById.get(recentMyPickId)!.lastName}.`
        )}
        {recentOppPickId && playerById.get(recentOppPickId) && (
          `Opponent drafted ${playerById.get(recentOppPickId)!.firstName} ${playerById.get(recentOppPickId)!.lastName}.`
        )}
      </div>
      {/* Countdown — announce when under 10 seconds */}
      {pickTimeLeft > 0 && pickTimeLeft <= 10 && (
        <div aria-live="assertive" aria-atomic="true" className="sr-only">
          {`${pickTimeLeft} seconds remaining.`}
        </div>
      )}

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
              <span className="text-white/15 text-xs font-bold">|</span>
              <span className="text-orange-400 text-[10px] font-black tracking-widest bg-orange-950/40 border border-orange-900/50 rounded px-2 py-0.5 shrink-0 uppercase">
                {STAT_CATEGORY_SHORT[statMode as keyof typeof STAT_CATEGORY_SHORT] ?? statMode.toUpperCase()}
              </span>
              <span className="text-white/40 text-xs truncate hidden sm:inline">
                {STAT_LABELS[statMode]} · lower wins
              </span>
              {room.difficulty === 'ebk' && (
                <span className="text-[10px] font-black tracking-widest text-yellow-500 bg-yellow-900/20 border border-yellow-800/40 rounded px-2 py-0.5 shrink-0">EBK</span>
              )}
            </div>
            {room.series > 1 ? (
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <span className="hidden sm:block text-white/40 text-xs font-bold truncate max-w-[80px]">{room.hostName}</span>
                <div className="flex items-center gap-1.5 bg-[#0d0d14] rounded-lg px-3 py-1 border border-white/[0.06]">
                  <span className="font-display text-orange-400 text-xl leading-none">{room.hostSeriesScore}</span>
                  <span className="text-white/40 text-xs">–</span>
                  <span className="font-display text-orange-400 text-xl leading-none">{room.guestSeriesScore}</span>
                </div>
                <span className="hidden sm:block text-white/40 text-xs font-bold truncate max-w-[80px]">{room.guestName}</span>
              </div>
            ) : (
              <span className="text-white/40 text-xs font-mono">{room.code}</span>
            )}
          </div>

          {/* Turn state + integrated timer */}
          <div className={`relative px-4 py-3 transition-all duration-300 ${
            isMyTurn && pickTimeLeft <= 5
              ? 'bg-gradient-to-r from-red-950/60 via-red-900/40 to-red-950/60 border-x-2 border-b-2 border-red-500/70 rounded-b-2xl'
              : isMyTurn
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
                  {/* Animated thinking dots */}
                  <div className="flex gap-0.5 shrink-0">
                    {[0, 1, 2].map(i => (
                      <div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-white/[0.3]"
                        style={{ animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
                      />
                    ))}
                  </div>
                  <div>
                    <div className="text-white/60 font-black text-base">
                      {currentPicker === 'host' ? room.hostName : room.guestName}
                    </div>
                    <div className="text-white/40 text-[11px] tracking-wider uppercase">Thinking…</div>
                  </div>
                </div>
              )}

              {/* Timer — always in the header, never buried */}
              {room.status === 'drafting' && currentPickerInTimer && (() => {
                const pct = pickTimerDurationRef.current > 0 ? pickTimeLeft / pickTimerDurationRef.current : 0
                const r = 18
                const circ = 2 * Math.PI * r
                const timerColor = pickTimeLeft <= 5 ? '#ef4444' : pickTimeLeft <= 10 ? '#f97316' : '#22c55e'
                return (
                  <div className="flex items-center gap-2 shrink-0">
                    {/* SVG ring timer */}
                    <div className="relative w-12 h-12 flex items-center justify-center" role="timer" aria-label={`${pickTimeLeft} seconds`}>
                      <svg className="absolute inset-0 -rotate-90" width="48" height="48" aria-hidden="true">
                        <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                        <circle
                          cx="24" cy="24" r={r} fill="none"
                          stroke={timerColor} strokeWidth="3"
                          strokeDasharray={circ}
                          strokeDashoffset={circ * (1 - pct)}
                          strokeLinecap="round"
                          style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }}
                        />
                      </svg>
                      <span className={`font-display text-base leading-none tabular-nums relative z-10 ${
                        pickTimeLeft <= 5 ? 'text-red-400 animate-timer-throb' : pickTimeLeft <= 10 ? 'text-yellow-400' : 'text-white/80'
                      }`}>
                        {pickTimeLeft}
                      </span>
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        </div>

        {/* Snake draft order tracker */}
        {room.status === 'drafting' && (
          <div className="mb-3 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-label shrink-0">Draft:</span>
            {room.draftOrder.map((picker, idx) => {
              const isPast = idx < room.currentPickIndex
              const isCurrent = idx === room.currentPickIndex
              const isMe = picker === role
              return (
                <div
                  key={idx}
                  className={`shrink-0 w-6 h-6 rounded flex items-center justify-center text-[10px] font-black transition-all ${
                    isCurrent
                      ? isMe
                        ? 'bg-orange-500 text-white shadow-[0_0_8px_rgba(234,88,12,0.6)] scale-110'
                        : 'bg-white/70 text-black scale-110'
                      : isPast
                      ? 'bg-white/[0.04] text-white/20'
                      : isMe
                      ? 'bg-orange-950/40 border border-orange-800/40 text-orange-400/60'
                      : 'bg-white/[0.03] border border-white/[0.06] text-white/30'
                  }`}
                  title={`Pick ${idx + 1}: ${picker === 'host' ? room.hostName : room.guestName}`}
                >
                  {isPast ? '✓' : isMe ? 'Y' : 'O'}
                </div>
              )
            })}
            {/* Snake direction arrow */}
            {(() => {
              const pickIdx = room.currentPickIndex
              const prev = room.draftOrder[pickIdx - 1]
              const curr = room.draftOrder[pickIdx]
              const next = room.draftOrder[pickIdx + 1]
              if (!curr || !next) return null
              const goingRight = (prev === undefined) || (prev !== curr)
              return (
                <span className="text-white/20 text-xs ml-1 shrink-0 font-black">
                  {goingRight ? '→' : '←'}
                </span>
              )
            })()}
          </div>
        )}

        {/* Mobile: teams side by side on top. Desktop: 4-col grid */}

        {/* Teams row — always visible, compact on mobile */}
        <div className="grid grid-cols-2 gap-2 mb-4 lg:hidden">
          {/* My Team (mobile) */}
          <div className="bg-orange-950/20 border border-orange-900/30 rounded-2xl p-3">
            <div className="text-orange-400 font-black text-xs mb-2 truncate">
              {myName2} <span className="text-white/40 font-normal">({myPicks.length}/{teamSize})</span>
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
                const isNewMyPick = pickedPlayer !== null && pickedPlayer.id === recentMyPickId
                const Elem = isValidTarget ? 'button' : 'div'
                return (
                  <Elem
                    key={i}
                    onClick={isValidTarget ? () => pickIntoSlot(i) : undefined}
                    aria-label={isValidTarget ? slotLabel : undefined}
                    className={`rounded px-2 py-1.5 min-h-[32px] text-xs flex items-center gap-1.5 transition-all ${isValidTarget ? 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60' : ''} ${
                      isNewMyPick
                        ? 'bg-orange-500/20 border border-orange-400/60 animate-slide-up'
                        : isValidTarget
                        ? 'bg-orange-600/20 border border-orange-500 cursor-pointer'
                        : isBlocked
                        ? 'bg-white/[0.015] border border-dashed border-white/[0.08] opacity-30'
                        : pickedPlayer
                        ? 'bg-white/[0.03]'
                        : 'bg-white/[0.015] border border-dashed border-white/[0.12]'
                    }`}
                  >
                    <span className={`font-bold w-6 shrink-0 text-[10px] ${isBench ? 'text-white/30' : 'text-orange-400'}`}>{displayLabel}</span>
                    <span className={`truncate ${pickedPlayer ? (isNewMyPick ? 'text-orange-300' : 'text-white') : isValidTarget ? 'text-orange-300' : 'text-white/30'}`} title={pickedPlayer ? `${pickedPlayer.firstName} ${pickedPlayer.lastName}` : undefined}>
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
              {oppName} <span className="text-white/40 font-normal">({oppPicks.length}/{teamSize})</span>
            </div>
            <div className="space-y-1">
              {requiredSlots.map((slotPos, i) => {
                const pickedPlayer = oppSlots[i]
                const isBench = slotPos === 'BENCH'
                const displayLabel = isBench ? 'BN' : slotPos
                const isNewPick = pickedPlayer !== null && pickedPlayer.id === recentOppPickId
                return (
                  <div key={i} className={`rounded px-2 py-1 text-xs flex items-center gap-1.5 transition-all ${
                    isNewPick
                      ? 'bg-blue-500/15 border border-blue-400/50 animate-slide-up'
                      : pickedPlayer
                      ? 'bg-white/[0.03]'
                      : 'bg-white/[0.015] border border-dashed border-white/[0.12]'
                  }`}>
                    <span className={`font-bold w-6 shrink-0 text-[10px] ${isBench ? 'text-white/30' : 'text-blue-400'}`}>{displayLabel}</span>
                    <span className={`truncate ${pickedPlayer ? (isNewPick ? 'text-blue-300' : 'text-white') : 'text-white/30'}`} title={pickedPlayer ? `${pickedPlayer.firstName} ${pickedPlayer.lastName}` : undefined}>
                      {pickedPlayer ? pickedPlayer.lastName : '—'}
                    </span>
                    {isNewPick && <span className="text-blue-400 text-[9px] font-black ml-auto shrink-0">NEW</span>}
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
              {myName2} <span className="text-white/40 font-normal">({myPicks.length}/{teamSize})</span>
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
                const isNewMyPickDesk = pickedPlayer !== null && pickedPlayer.id === recentMyPickId
                const DeskElem = isValidTarget ? 'button' : 'div'
                return (
                  <DeskElem
                    key={i}
                    onClick={isValidTarget ? () => pickIntoSlot(i) : undefined}
                    aria-label={isValidTarget ? slotLabelDesktop : undefined}
                    className={`rounded-lg px-3 py-2 text-xs flex items-center gap-2 transition-all ${isValidTarget ? 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60' : ''} ${
                      isNewMyPickDesk
                        ? 'bg-orange-500/20 border border-orange-400/60 animate-slide-up'
                        : isValidTarget
                        ? 'bg-orange-600/20 border border-orange-500 cursor-pointer hover:bg-orange-600/40'
                        : isBlocked
                        ? 'bg-white/[0.015] border border-dashed border-white/[0.08] opacity-30'
                        : pickedPlayer
                        ? 'bg-white/[0.03]'
                        : 'bg-white/[0.015] border border-dashed border-white/[0.12]'
                    }`}
                  >
                    <span className={`font-bold w-8 shrink-0 ${isBench ? 'text-white/30' : 'text-orange-400'}`}>{displayLabel}</span>
                    {pickedPlayer ? (
                      <span className={`truncate ${isNewMyPickDesk ? 'text-orange-300' : 'text-white'}`} title={`${pickedPlayer.firstName} ${pickedPlayer.lastName}`}>
                        {pickedPlayer.firstName} {pickedPlayer.lastName} <span className="text-white/40">({pickedPlayer.team})</span>
                      </span>
                    ) : (
                      <span className={isValidTarget ? 'text-orange-300' : 'text-white/30'}>
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
            {/* YOUR PICK sticky banner — pulses when it's the user's turn so they can't miss it */}
            {isMyTurn && !isSpinning && spunTeam && (
              <div className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 mb-3 border-2 animate-slide-up ${
                pickTimeLeft <= 5
                  ? 'bg-red-950/60 border-red-500/80 shadow-[0_0_20px_rgba(239,68,68,0.35)]'
                  : 'bg-orange-950/50 border-orange-500/70 shadow-[0_0_16px_rgba(234,88,12,0.3)]'
              }`}>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${pickTimeLeft <= 5 ? 'bg-red-400' : 'bg-orange-400'} animate-pulse`} />
                  <span className={`font-display tracking-widest text-sm leading-none ${pickTimeLeft <= 5 ? 'text-red-300' : 'text-orange-300'}`}>
                    YOUR PICK
                  </span>
                  <span className={`text-[11px] font-black uppercase tracking-wider ${pickTimeLeft <= 5 ? 'text-red-400/70' : 'text-orange-400/60'}`}>
                    — tap a player below
                  </span>
                </div>
                {currentPickerInTimer && (
                  <span className={`font-display text-lg leading-none tabular-nums shrink-0 ${pickTimeLeft <= 5 ? 'text-red-400 animate-timer-throb' : pickTimeLeft <= 10 ? 'text-yellow-400' : 'text-orange-300/70'}`}>
                    {pickTimeLeft}s
                  </span>
                )}
              </div>
            )}

            {/* Team Spinner */}
            <div className={`rounded-xl p-3 mb-3 flex items-center gap-3 border-2 transition-all ${
              isSpinning ? 'border-yellow-500 bg-yellow-900/20' :
              spunTeam ? 'border-orange-500 bg-orange-900/20' : 'border-white/[0.12] bg-white/[0.025]'
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
                    <div className="text-white/40 text-xs">Wait for your team assignment</div>
                  </div>
                ) : spunTeam && spunTeamInfo ? (
                  <div>
                    <div className="text-white font-black text-sm truncate">{spunTeamInfo.city} {spunTeamInfo.name}</div>
                    <div className="text-white/40 text-xs">{filteredPlayers.length} available</div>
                  </div>
                ) : (
                  <div className="text-white/40 text-sm">Waiting for spin...</div>
                )}
              </div>
            </div>

            {/* Pick error */}
            {pickError && (
              <div role="alert" aria-live="assertive" className="bg-red-900/30 border border-red-500/60 text-red-300 rounded-xl px-4 py-2.5 text-sm mb-3 flex items-center gap-2.5 animate-slide-up">
                <div className="w-5 h-5 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center shrink-0">
                  <span className="text-red-400 text-xs font-black leading-none">!</span>
                </div>
                <span className="flex-1">{pickError}</span>
              </div>
            )}

            {/* Search */}
            <div className="relative mb-2">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm pointer-events-none">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search player or team..."
                className="input-field pl-9 pr-8 py-2.5 text-sm rounded-xl"
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(''); setDebouncedSearch('') }} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white/80 active:text-white transition-colors text-xs w-7 h-7 flex items-center justify-center rounded touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50">✕</button>
              )}
            </div>

            {/* Position availability banner */}
            <div className="flex items-center gap-2 mb-2 bg-white/[0.025] border border-white/[0.06] rounded-lg px-3 py-2 flex-wrap">
              {isStarterSlot ? (
                <>
                  <span className="text-label shrink-0">Need:</span>
                  {remainingStarterPositions.map(pos => (
                    <span key={pos} className="text-[10px] font-black px-2 py-0.5 rounded-md bg-orange-600/90 text-white shadow-sm">{pos}</span>
                  ))}
                </>
              ) : (
                <span className="text-label">Bench — any player eligible</span>
              )}
            </div>

            {/* Position filter — hidden in EBK mode */}
            {room.difficulty !== 'ebk' && (
              <div className="flex items-center gap-1 mb-3 flex-wrap">
                {['ALL', 'PG', 'SG', 'SF', 'PF', 'C'].map(pos => (
                  <button key={pos} onClick={() => setFilterPos(pos)}
                    className={`px-2.5 py-2 min-h-[36px] rounded-lg text-xs font-black tracking-wide transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 touch-manipulation ${
                      filterPos === pos
                        ? 'bg-orange-600 text-white shadow-[0_2px_8px_rgba(234,88,12,0.35)]'
                        : 'bg-white/[0.04] border border-white/[0.07] text-white/50 hover:text-white hover:border-white/20 hover:bg-white/[0.07]'
                    }`}
                  >
                    {pos}
                  </button>
                ))}
                <span className="ml-auto text-label self-center shrink-0">
                  {filteredPlayers.length} avail
                </span>
              </div>
            )}
            {room.difficulty === 'ebk' && (
              <div className="flex items-center justify-between mb-3">
                <span className="text-label">EBK mode — search by name</span>
                <span className="text-label">{debouncedSearch.length < 3 ? 'type 3+ letters' : `${filteredPlayers.length} avail`}</span>
              </div>
            )}

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
                  <div className="absolute inset-0 rounded-full border-2 border-white/[0.12]" />
                  <div className="absolute inset-0 rounded-full border-2 border-gray-500 border-t-transparent animate-spin" />
                  <div className="absolute inset-2 rounded-full bg-white/[0.04] flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-white/[0.25] animate-pulse" />
                  </div>
                </div>
                <div className="text-white font-black text-base tracking-wide">{oppName}</div>
                <div className="text-white/40 text-xs mt-1 tracking-widest uppercase">Making their pick</div>
                <div className="text-white/15 text-xs mt-3">Your team is locked in above</div>
              </div>
            ) : (
              <>
                {isSpinning && (
                  <div className="space-y-2 mb-3">
                    <div className="flex items-center justify-center gap-2 h-10 rounded-xl bg-yellow-900/10 border border-yellow-600/30 mb-1">
                      <span className="w-3 h-3 rounded-full border-2 border-yellow-500/50 border-t-yellow-400 animate-spin shrink-0" />
                      <p className="text-yellow-400 font-bold text-xs tracking-widest uppercase">Spinning team assignment…</p>
                    </div>
                    {[0, 1, 2, 3, 4].map(i => (
                      <div key={i} className="skeleton h-12 rounded-xl" style={{ animationDelay: `${i * 80}ms` }} />
                    ))}
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
                          className="bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.12] border border-white/[0.09] hover:border-orange-500/50 text-white text-sm px-3 py-2.5 min-h-[44px] rounded-xl transition-all font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 touch-manipulation"
                          title={emote.label}
                          aria-label={`Send emote: ${emote.label}`}
                        >
                          {emote.text}
                        </button>
                      )
                    })}
                  </div>
                )}

                {filteredPlayers.length === 0 && !isSpinning && spunTeam && (
                  <div className="empty-state">
                    <div className="empty-state-icon">🔍</div>
                    <div className="empty-state-title">No players found</div>
                    <div className="empty-state-body">
                      {searchQuery ? 'Try a different search term' : 'All eligible players have been picked'}
                    </div>
                  </div>
                )}
                <div className="space-y-1 max-h-[55vh] overflow-y-auto pr-1 -mx-1 px-1">
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

                    // EBK fill bar — relative to pool max for quick visual scanning
                    const poolMaxEbk = Math.max(...filteredPlayers.map(p => p.ebkScore), 1)
                    const ebkPct = Math.min(100, (player.ebkScore / poolMaxEbk) * 100)

                    return (
                      <div
                        key={player.id}
                        className={`w-full rounded-xl text-left transition-all duration-150 ${
                          isSelected
                            ? 'bg-orange-600/25 border-2 border-orange-500 shadow-[0_0_24px_rgba(234,88,12,0.3)] scale-[1.01]'
                            : canPick
                            ? 'card-surface border border-white/[0.06] hover:bg-orange-950/20 hover:border-orange-600/40 cursor-pointer'
                            : 'bg-white/[0.015] border border-transparent opacity-30'
                        }`}
                      >
                        <button
                          className="w-full flex items-center gap-3 px-3 py-3 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60 rounded-xl"
                          onClick={() => canPick && selectAndPick(player.id)}
                          disabled={!canPick}
                          aria-label={`${player.firstName} ${player.lastName}, ${playerPositions.join('/')}, EBK ${player.ebkScore.toFixed(1)}${room.difficulty === 'casual' ? `, ${formatStat(statVal, statMode)} ${STAT_CATEGORY_SHORT[statMode as keyof typeof STAT_CATEGORY_SHORT] ?? statMode}` : ''}`}
                        >
                          {/* Rank number */}
                          <div className="w-6 text-center shrink-0">
                            <span className="font-display text-white/15 text-sm leading-none tabular-nums">{idx + 1}</span>
                          </div>

                          {/* Name + meta */}
                          <div className="flex-1 min-w-0">
                            <div className={`font-bold text-sm leading-tight truncate ${isSelected ? 'text-orange-100' : 'text-white'}`}>
                              {player.firstName} {player.lastName}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              {playerPositions.map((pos: string) => (
                                <span key={pos} className={posBadgeClass(pos)}>{pos}</span>
                              ))}
                              <span className="text-white/40 text-[11px]">{player.team}</span>
                              <span className="text-white/15 text-[11px]">{player.yearFrom}–{player.yearTo}</span>
                            </div>
                            {/* Career stat pills — always visible so users can evaluate without tapping */}
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <span className={`text-xs font-black tabular-nums ${isSelected ? 'text-orange-200' : 'text-white/60'}`}>
                                {player.careerPPG.toFixed(1)}<span className={`font-normal ml-0.5 ${isSelected ? 'text-orange-300/60' : 'text-white/20'}`}>PPG</span>
                              </span>
                              <span className={`text-xs font-black tabular-nums ${isSelected ? 'text-orange-200' : 'text-white/60'}`}>
                                {player.careerRPG.toFixed(1)}<span className={`font-normal ml-0.5 ${isSelected ? 'text-orange-300/60' : 'text-white/20'}`}>RPG</span>
                              </span>
                              <span className={`text-xs font-black tabular-nums ${isSelected ? 'text-orange-200' : 'text-white/60'}`}>
                                {player.careerAPG.toFixed(1)}<span className={`font-normal ml-0.5 ${isSelected ? 'text-orange-300/60' : 'text-white/20'}`}>APG</span>
                              </span>
                            </div>
                            {/* EBK fill bar — visual tier indicator */}
                            <div className="w-full bg-white/[0.05] rounded-full h-0.5 mt-1.5 overflow-hidden">
                              <div
                                className={`h-0.5 rounded-full transition-all duration-300 ${isSelected ? 'bg-orange-400' : 'bg-orange-600/50'}`}
                                style={{ width: `${ebkPct}%` }}
                              />
                            </div>
                          </div>

                          {/* Stats right column — always show EBK; also show game stat in casual */}
                          <div className="flex items-center gap-2.5 shrink-0">
                            {/* Game-mode stat — only in casual (hidden in EBK mode) */}
                            {room.difficulty === 'casual' && (
                              <div className="text-right min-w-[44px]">
                                <div className={`font-display text-xl leading-none tabular-nums ${
                                  isSelected ? 'text-orange-400' : 'text-white'
                                }`}>
                                  {formatStat(statVal, statMode)}
                                </div>
                                <div className="text-white/30 text-[9px] tracking-wider uppercase mt-0.5">
                                  {STAT_CATEGORY_SHORT[statMode as keyof typeof STAT_CATEGORY_SHORT] ?? statMode.toUpperCase()}
                                </div>
                              </div>
                            )}

                            {/* EBK score — always visible, secondary metric */}
                            <div className={`text-right min-w-[38px] ${room.difficulty === 'casual' ? 'pl-2 border-l border-white/[0.07]' : ''}`}>
                              <div className={`font-display text-lg leading-none tabular-nums ${
                                isSelected ? 'text-orange-300' : 'text-orange-500/70'
                              }`}>
                                {player.ebkScore.toFixed(1)}
                              </div>
                              <div className="text-white/20 text-[9px] tracking-wider uppercase mt-0.5">EBK</div>
                            </div>
                          </div>

                          {/* Pick CTA — only when this card is active and pickable */}
                          {isSelected && !hasMultipleSlots && (
                            <div className="shrink-0">
                              <div className="bg-orange-500 text-white text-xs font-black px-3 py-1.5 rounded-lg shadow-[0_2px_8px_rgba(234,88,12,0.5)] animate-pulse">
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
                                className="bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white text-xs font-black px-3 py-1.5 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/70"
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
              {oppName} <span className="text-white/40 font-normal">({oppPicks.length}/{teamSize})</span>
            </h3>
            <div className="space-y-1.5">
              {requiredSlots.map((slotPos, i) => {
                const pickedPlayer = oppSlots[i]
                const isBench = slotPos === 'BENCH'
                const displayLabel = isBench ? 'BN' : slotPos
                const isNewPick = pickedPlayer !== null && pickedPlayer.id === recentOppPickId
                return (
                  <div key={i} className={`rounded-lg px-3 py-2 text-xs flex items-center gap-2 transition-all ${
                    isNewPick
                      ? 'bg-blue-500/15 border border-blue-400/50 animate-slide-up'
                      : pickedPlayer
                      ? 'bg-white/[0.03]'
                      : 'bg-white/[0.015] border border-dashed border-white/[0.12]'
                  }`}>
                    <span className={`font-bold w-8 shrink-0 ${isBench ? 'text-white/30' : 'text-blue-400'}`}>{displayLabel}</span>
                    {pickedPlayer ? (
                      <span className={`truncate ${isNewPick ? 'text-blue-200' : 'text-white'}`} title={`${pickedPlayer.firstName} ${pickedPlayer.lastName}`}>
                        {pickedPlayer.firstName} {pickedPlayer.lastName} <span className="text-white/40">({pickedPlayer.team})</span>
                        {isNewPick && <span className="ml-2 text-blue-400 font-black text-[9px]">NEW</span>}
                      </span>
                    ) : (
                      <span className="text-white/30">empty</span>
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin mx-auto mb-4"></div>
          <p className="text-white/40">Loading...</p>
        </div>
      </div>
    }>
      <GameContent />
    </Suspense>
  )
}
