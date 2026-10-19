'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getSocket } from '@/lib/socket'
import { useAuth } from '@/context/AuthContext'

type AuctionPhase = 'loading' | 'waiting' | 'bidding' | 'steal-window' | 'trading' | 'complete' | 'error'
type WarRoomPanel = 'bid' | 'rosters' | 'log'

interface RosterPlayer {
  id: number
  firstName: string
  lastName: string
  position: string
  ebkScore: number
  paidPrice: number
}

interface Participant {
  socketId: string
  name: string
  budget: number
  rosterCount: number
  roster: RosterPlayer[]
}

interface CurrentPlayer {
  id: number
  firstName: string
  lastName: string
  team: string
  position: string
  careerGames: number
  careerPPG: number
  careerRPG: number
  careerAPG: number
  ebkScore: number
  yearFrom: number
  yearTo: number
}

interface TradeOfferData {
  id: string
  fromSocketId: string
  fromName: string
  toSocketId: string
  toName: string
  offeredPlayerIds: number[]
  requestedPlayerIds: number[]
  createdAt: number
}

interface AuctionState {
  code: string
  status: string
  teamSize: number
  totalBudget: number
  maxPlayers: number
  hostSocketId: string
  participants: Participant[]
  currentPlayer: CurrentPlayer | null
  currentBid: number
  currentBidderSocketId: string | null
  currentBidderName: string | null
  lastWinnerSocketId: string | null
  lastWinnerName: string | null
  lastWonAmount: number
  stealInitiated: boolean
  bidDeadline: number
  tradeDeadline: number | null
  tradeOffers: TradeOfferData[]
  playerIndex: number
  poolSize: number
  bidLog: Array<{ name: string; amount: number; action: string }>
  finalResults: AuctionResult[] | null
}

interface AuctionResult {
  socketId: string
  name: string
  ebkTotal: number
  rosterCount: number
  budgetSpent: number
  roster: RosterPlayer[]
}

const POSITION_COLORS: Record<string, string> = {
  PG: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
  SG: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40',
  SF: 'bg-green-500/20 text-green-400 border-green-500/40',
  PF: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
  C:  'bg-red-500/20 text-red-400 border-red-500/40',
}

function PosBadge({ pos }: { pos: string }) {
  const cls = POSITION_COLORS[pos] || 'bg-white/10 text-white/60 border-white/20'
  return (
    <span className={`pos-badge border ${cls}`}>{pos}</span>
  )
}

function TimerRing({ timeLeft, maxTime }: { timeLeft: number; maxTime: number }) {
  const pct = maxTime > 0 ? Math.min(1, timeLeft / maxTime) : 0
  const r = 28
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - pct)
  const color = timeLeft <= 5 ? '#ef4444' : timeLeft <= 10 ? '#f97316' : '#22c55e'

  return (
    <div className="relative w-20 h-20 flex items-center justify-center" role="timer" aria-label={`${timeLeft} seconds remaining`}>
      <svg className="absolute inset-0 -rotate-90" width="80" height="80" aria-hidden="true">
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="4" />
        <circle
          cx="40" cy="40" r={r} fill="none"
          stroke={color} strokeWidth="4"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.1s linear, stroke 0.3s' }}
        />
      </svg>
      <span
        aria-hidden="true"
        className={`font-display text-2xl ${timeLeft <= 5 ? 'text-red-400 animate-timer-throb' : timeLeft <= 10 ? 'text-orange-400' : 'text-white'}`}
      >
        {timeLeft}
      </span>
    </div>
  )
}

export default function AuctionRoomPage() {
  const params = useParams()
  const router = useRouter()
  const { user, loading } = useAuth()
  const code = (params?.code as string)?.toUpperCase()
  // Stable fallback name for unauthenticated users — generated once per mount.
  const anonNameRef = useRef(`GM-${Math.random().toString(36).substring(2, 5).toUpperCase()}`)

  const [auctionState, setAuctionState] = useState<AuctionState | null>(null)
  const [mySocketId, setMySocketId] = useState('')
  const [bidAmount, setBidAmount] = useState(1)
  const [timeLeft, setTimeLeft] = useState(0)
  const [tradeTimeLeft, setTradeTimeLeft] = useState(0)
  const [results, setResults] = useState<AuctionResult[]>([])
  const [phase, setPhase] = useState<AuctionPhase>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [tradeTarget, setTradeTarget] = useState<string | null>(null)
  const [selectedToOffer, setSelectedToOffer] = useState<number[]>([])
  const [selectedToRequest, setSelectedToRequest] = useState<number[]>([])
  const [mobilePanel, setMobilePanel] = useState<WarRoomPanel>('bid')
  // Flash when you win a player (green glow on the current bid card)
  const [justWon, setJustWon] = useState(false)
  const prevWinnerRef = useRef<string | null>(null)
  // True after the first auction:state event is received — prevents a spurious
  // justWon flash when reconnecting to a room where we already won the last player.
  const stateInitializedRef = useRef(false)
  // Persistent error message for the error phase (errorMsg auto-clears after 4s)
  const persistentErrorRef = useRef('')
  // If the user is authenticated, always use their username so the server can reliably
  // re-seat them on reconnect (the server matches by name + userId). For unauthenticated
  // users, use a ref-stable random name generated once at mount.
  const guestName = user?.username ?? anonNameRef.current
  const logEndRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Timer countdown
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    // Reset timers immediately when deadlines change so there's no stale display
    if (!auctionState?.bidDeadline || auctionState.bidDeadline <= 0) setTimeLeft(0)
    if (!auctionState?.tradeDeadline) setTradeTimeLeft(0)
    intervalRef.current = setInterval(() => {
      if (auctionState?.bidDeadline && auctionState.bidDeadline > 0) {
        setTimeLeft(Math.max(0, Math.ceil((auctionState.bidDeadline - Date.now()) / 1000)))
      }
      if (auctionState?.tradeDeadline) {
        setTradeTimeLeft(Math.max(0, Math.ceil((auctionState.tradeDeadline - Date.now()) / 1000)))
      }
    }, 100)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [auctionState?.bidDeadline, auctionState?.tradeDeadline])

  // Reset bid amount whenever a new player comes up OR the current bid changes.
  // currentPlayer?.id changes on every new player, even if currentBid stays 0.
  useEffect(() => {
    if (auctionState) {
      setBidAmount(auctionState.currentBid + 1)
    }
  }, [auctionState?.currentBid, auctionState?.currentPlayer?.id])

  // Flash green when you win a player — fires when lastWinnerSocketId transitions to our id
  useEffect(() => {
    const winner = auctionState?.lastWinnerSocketId
    if (winner && winner !== prevWinnerRef.current && winner === mySocketId) {
      setJustWon(true)
      const t = setTimeout(() => setJustWon(false), 1800)
      prevWinnerRef.current = winner
      return () => clearTimeout(t)
    }
    prevWinnerRef.current = winner ?? null
  }, [auctionState?.lastWinnerSocketId, mySocketId])

  // Scroll bid log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [auctionState?.bidLog])

  useEffect(() => {
    // Capture guestName at effect-run time so the reconnect handler always uses
    // the name that was registered with the server (avoids stale-closure mismatch).
    const nameAtMount = guestName
    const socket = getSocket()
    setMySocketId(socket.id || '')
    // Reset the first-state seed flag whenever code or guestName changes (e.g.
    // navigating between auction rooms in the same component instance). If not reset,
    // the very first auction:state from the new room skips seeding prevWinnerRef,
    // causing the justWon flash to fire spuriously for the winner of the last round
    // before reconnect.
    stateInitializedRef.current = false

    // Named handlers so we can pass them to socket.off() precisely — calling
    // socket.off('connect') without a reference removes ALL connect listeners.
    function handleConnect() {
      // Socket reconnected with a new ID — re-seat ourselves in the auction room
      setMySocketId(socket.id || '')
      socket.emit('auction:get-state', { code, userName: nameAtMount })
    }

    function handleAuctionState(state: AuctionState) {
      // Keep mySocketId fresh in case of reconnects
      setMySocketId(socket.id || '')
      // Seed prevWinnerRef on the very first state event so the justWon flash
      // effect doesn't spuriously fire when reconnecting to a room where we
      // already won the last player (prevWinnerRef starts as null).
      if (!stateInitializedRef.current) {
        prevWinnerRef.current = state.lastWinnerSocketId ?? null
        stateInitializedRef.current = true
      }
      setAuctionState(state)
      const newPhase = state.status as AuctionPhase
      setPhase(newPhase === 'complete' ? 'complete' : newPhase)
      if (state.status === 'complete' && state.finalResults && state.finalResults.length > 0) {
        setResults(state.finalResults)
      }
      if (state.bidDeadline > 0) {
        setTimeLeft(Math.max(0, Math.ceil((state.bidDeadline - Date.now()) / 1000)))
      }
      if (state.tradeDeadline) {
        setTradeTimeLeft(Math.max(0, Math.ceil((state.tradeDeadline - Date.now()) / 1000)))
      }
    }

    function handleAuctionComplete({ results: r }: { results: AuctionResult[] }) {
      setResults(r)
      setPhase('complete')
    }

    function handleAuctionError({ message }: { message: string }) {
      persistentErrorRef.current = message
      setErrorMsg(message)
      setTimeout(() => setErrorMsg(''), 4000)
    }

    function handleSessionExpired() {
      router.replace('/login?reason=session_expired')
    }

    socket.on('connect', handleConnect)
    socket.on('auction:state', handleAuctionState)
    socket.on('auction:complete', handleAuctionComplete)
    socket.on('auction:error', handleAuctionError)
    socket.on('session-expired', handleSessionExpired)

    // Request state on mount — include userName so server can re-seat
    // this socket if we reconnected with a new socketId
    socket.emit('auction:get-state', { code, userName: nameAtMount })

    // Redirect to lobby if no state received within 6 seconds (not a participant)
    const loadTimeout = setTimeout(() => {
      setPhase(prev => prev === 'loading' ? 'error' : prev)
    }, 6000)

    return () => {
      socket.off('connect', handleConnect)
      socket.off('auction:state', handleAuctionState)
      socket.off('auction:complete', handleAuctionComplete)
      socket.off('auction:error', handleAuctionError)
      socket.off('session-expired', handleSessionExpired)
      clearTimeout(loadTimeout)
    }
  }, [code, guestName])

  // Warn the player before they close the tab while an auction is in progress.
  // Leaving mid-auction drops the participant from the room and disrupts other players.
  useEffect(() => {
    if (phase === 'complete' || phase === 'loading' || phase === 'error') return
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [phase])

  const me = auctionState?.participants.find(p => p.socketId === mySocketId)
  const isHost = auctionState && mySocketId === auctionState.hostSocketId
  const canBid = phase === 'bidding' && me && me.budget >= bidAmount && me.rosterCount < (auctionState?.teamSize ?? 0)
  const amLeading = auctionState?.currentBidderSocketId === mySocketId


  function handleBid() {
    if (!canBid) return
    getSocket().emit('auction:bid', { code, amount: bidAmount })
  }

  function handlePass() {
    if (!auctionState || phase !== 'bidding') return
    getSocket().emit('auction:pass', { code, playerIndex: auctionState.playerIndex })
  }

  function handleSteal(playerIdToSteal: number) {
    getSocket().emit('auction:steal', { code, playerIdToSteal })
  }

  function handleSendTradeOffer() {
    if (!tradeTarget || selectedToOffer.length === 0 || selectedToRequest.length === 0) return
    getSocket().emit('auction:trade-offer', {
      code,
      toSocketId: tradeTarget,
      offeredPlayerIds: selectedToOffer,
      requestedPlayerIds: selectedToRequest,
    })
    setTradeTarget(null)
    setSelectedToOffer([])
    setSelectedToRequest([])
  }

  function handleTradeRespond(offerId: string, accept: boolean) {
    getSocket().emit('auction:trade-respond', { code, offerId, accept })
  }

  function handleFinishTrading() {
    getSocket().emit('auction:finish-trading', { code })
  }

  function handleStart() {
    getSocket().emit('auction:start', { code })
  }

  function toggleOffer(id: number) {
    setSelectedToOffer(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleRequest(id: number) {
    setSelectedToRequest(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const maxTime = phase === 'steal-window' ? 10 : 25

  // ── Loading ────────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-2 border-white/[0.05]" />
          <div className="absolute inset-0 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
          <div className="absolute inset-3 rounded-full bg-orange-600/10 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
          </div>
        </div>
        <p className="text-label tracking-[0.3em]">CONNECTING TO WAR ROOM...</p>
      </div>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (phase === 'error') {
    const lastError = persistentErrorRef.current || errorMsg
    const isInProgress = lastError.toLowerCase().includes('progress')
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4">
        <div className="card-surface p-10 max-w-sm w-full text-center animate-scale-in">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
            <span className="text-red-400 text-xl font-black">!</span>
          </div>
          <h2 className="font-display text-3xl text-white mb-2">
            {isInProgress ? 'AUCTION IN PROGRESS' : 'ROOM NOT FOUND'}
          </h2>
          <p className="text-gray-400 text-sm mb-6">
            {isInProgress
              ? 'This War Room has already started. Ask the host to create a new room.'
              : "This War Room doesn't exist or has already ended."}
          </p>
          <Link href="/auction" className="btn-primary w-full">Back to Lobby</Link>
        </div>
      </div>
    )
  }

  // ── Results / Complete ─────────────────────────────────────────────────────
  // Fallback: complete state with no results yet — show a brief loading indicator
  // rather than the generic spinner with no way out (e.g. auction:complete arrived
  // before the auction:state that carries finalResults).
  if (phase === 'complete' && results.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="relative w-14 h-14">
          <div className="absolute inset-0 rounded-full border-2 border-white/[0.05]" />
          <div className="absolute inset-0 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
        </div>
        <p className="text-label tracking-[0.3em]">LOADING FINAL RESULTS...</p>
        <Link href="/auction" className="mt-2 text-white/25 text-xs hover:text-white/50 underline transition-colors">Back to lobby</Link>
      </div>
    )
  }

  if (phase === 'complete' && results.length > 0) {
    // ── Draft grade calculation ────────────────────────────────────────────────
    // Lower EBK total = better draft (core game mechanic)
    const sortedByScore = [...results].sort((a, b) => a.ebkTotal - b.ebkTotal)
    const bestScore  = sortedByScore[0]?.ebkTotal ?? 0
    const worstScore = sortedByScore[sortedByScore.length - 1]?.ebkTotal ?? bestScore

    const getDraftGrade = (ebkTotal: number, rank: number): { grade: string; color: string; bg: string; label: string } => {
      const range = worstScore - bestScore
      const pctFromBest = range > 0 ? (ebkTotal - bestScore) / range : 0
      if (rank === 0)           return { grade: 'A+', color: 'text-green-300', bg: 'bg-green-500/15 border-green-500/30', label: 'Elite Draft' }
      if (pctFromBest <= 0.15)  return { grade: 'A',  color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20', label: 'Excellent' }
      if (pctFromBest <= 0.35)  return { grade: 'B+', color: 'text-blue-300',  bg: 'bg-blue-500/10 border-blue-500/20',  label: 'Strong' }
      if (pctFromBest <= 0.55)  return { grade: 'B',  color: 'text-blue-400',  bg: 'bg-blue-500/10 border-blue-500/15',  label: 'Solid' }
      if (pctFromBest <= 0.75)  return { grade: 'C',  color: 'text-yellow-400',bg: 'bg-yellow-500/10 border-yellow-500/20', label: 'Needs Work' }
      return                           { grade: 'D',  color: 'text-red-400',   bg: 'bg-red-500/10 border-red-500/20',    label: 'Overpaid' }
    }

    // Lower EBK is better — best value is the player who scores least per dollar spent
    const bestValuePlayer = (roster: RosterPlayer[]) =>
      roster.filter(p => p && p.paidPrice > 0).sort((a, b) => (a.ebkScore / a.paidPrice) - (b.ebkScore / b.paidPrice))[0]

    const isMe = (r: AuctionResult) => r.socketId === mySocketId
    const PODIUM_STYLES = [
      { medal: '🥇', border: 'border-yellow-500/40', bg: 'bg-yellow-950/30', glow: 'shadow-[0_0_32px_rgba(234,179,8,0.12)]', rank: 'text-yellow-300', nameSize: 'text-xl sm:text-2xl' },
      { medal: '🥈', border: 'border-white/[0.12]',   bg: 'bg-white/[0.03]', glow: '',                                         rank: 'text-white/60',  nameSize: 'text-lg sm:text-xl' },
      { medal: '🥉', border: 'border-orange-800/30', bg: 'bg-orange-950/20', glow: '',                                         rank: 'text-orange-400', nameSize: 'text-base sm:text-lg' },
    ]

    return (
      <div className="min-h-screen px-4 py-8 sm:py-12 max-w-4xl mx-auto animate-fade-in">

        {/* ── Header — ESPN-style recap banner ── */}
        <div className="text-center mb-10">
          <p className="text-[10px] font-black tracking-[0.5em] text-gray-400 uppercase mb-3">
            War Room · {code} · Draft Recap
          </p>
          <h1 className="font-display text-5xl sm:text-6xl text-white tracking-wider leading-none mb-2">
            DRAFT <span className="text-orange-500">COMPLETE</span>
          </h1>
          <p className="text-gray-400 text-sm">{results.length} GMs · {results[0]?.rosterCount} players each</p>
        </div>

        {/* ── Winner spotlight ── */}
        {sortedByScore[0] && (
          <div className="mb-8 animate-scale-in">
            <div className="relative card-accent border border-yellow-500/30 p-6 sm:p-8 text-center overflow-hidden shadow-[0_0_60px_rgba(234,179,8,0.08)]">
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: 'radial-gradient(ellipse 70% 90% at 50% 0%, rgba(234,179,8,0.07) 0%, transparent 70%)' }} />
              <div className="relative">
                <div className="text-4xl mb-2">🏆</div>
                <p className="text-[10px] font-black tracking-[0.4em] text-yellow-600 uppercase mb-1">Best Draft</p>
                <h2 className="font-display text-4xl sm:text-5xl text-yellow-300 tracking-wider leading-none mb-1">
                  {sortedByScore[0].name}
                  {isMe(sortedByScore[0]) && (
                    <span className="ml-3 text-sm text-orange-400 font-sans font-black align-middle">YOU</span>
                  )}
                </h2>
                <p className="text-gray-400 text-sm mt-1">
                  EBK Total:{' '}
                  <span className="text-yellow-400 font-black text-xl">{sortedByScore[0].ebkTotal.toFixed(1)}</span>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── All GM draft cards ── */}
        <div className="space-y-4 mb-10">
          {sortedByScore.map((r, i) => {
            const style = PODIUM_STYLES[i] || {
              medal: `#${i+1}`, border: 'border-white/[0.07]', bg: '', glow: '', rank: 'text-gray-400', nameSize: 'text-base',
            }
            const grade = getDraftGrade(r.ebkTotal, i)
            const totalBudget = auctionState?.totalBudget ?? 100
            const budgetRemaining = totalBudget - r.budgetSpent
            const budgetPct = (r.budgetSpent / totalBudget) * 100
            const bestVal = bestValuePlayer(r.roster)
            const meStyle = isMe(r) ? 'ring-2 ring-orange-500/50' : ''

            return (
              <div
                key={r.socketId}
                className={`card-surface border ${style.border} ${style.bg} ${style.glow} ${meStyle} rounded-2xl p-5 sm:p-6 animate-slide-up`}
                style={{ animationDelay: `${i * 100}ms`, animationFillMode: 'both' }}
              >
                {/* GM header row */}
                <div className="flex items-start gap-3 sm:gap-4 mb-5">
                  <div className="text-3xl sm:text-4xl shrink-0 leading-none pt-0.5">{style.medal}</div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className={`font-display ${style.nameSize} ${style.rank} leading-none tracking-wide truncate`}>
                        {r.name}
                      </h3>
                      {isMe(r) && (
                        <span className="text-[9px] font-black text-orange-500 bg-orange-950 border border-orange-700/50 rounded px-1.5 py-[2px] uppercase tracking-wider shrink-0">
                          YOU
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400 flex-wrap">
                      <span>${r.budgetSpent}M spent</span>
                      <span className="text-gray-700">·</span>
                      <span className={budgetRemaining <= 5 ? 'text-red-400' : 'text-gray-400'}>${budgetRemaining}M left</span>
                      <span className="text-gray-700">·</span>
                      <span>{r.rosterCount} players</span>
                    </div>
                    <div className="mt-2 budget-bar" style={{ height: '3px' }}>
                      <div className="budget-bar-fill" style={{ width: `${Math.min(100, budgetPct)}%` }} />
                    </div>
                  </div>

                  {/* EBK score + draft grade */}
                  <div className="text-right shrink-0">
                    <div className="font-display text-3xl sm:text-4xl text-orange-400 leading-none tabular-nums">
                      {r.ebkTotal.toFixed(1)}
                    </div>
                    <div className="text-white/30 text-[10px] uppercase tracking-widest mb-2">EBK Total</div>
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-black ${grade.bg} ${grade.color}`}>
                      <span className="text-xl leading-none">{grade.grade}</span>
                      <span className="hidden sm:inline text-[10px] font-bold opacity-80">{grade.label}</span>
                    </div>
                  </div>
                </div>

                {/* Player chips */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {r.roster.filter(Boolean).map(p => (
                    <div
                      key={p.id}
                      title={`${p.firstName} ${p.lastName}`}
                      className="flex items-center gap-1.5 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.06] rounded-lg px-2.5 py-1.5 transition-colors"
                    >
                      <PosBadge pos={p.position} />
                      <span className="text-white text-xs font-bold">{p.firstName[0]}. {p.lastName}</span>
                      <span className="text-orange-400 text-xs font-black tabular-nums">{p.ebkScore.toFixed(1)}</span>
                      <span className="text-white/25 text-[10px] tabular-nums">${p.paidPrice}M</span>
                    </div>
                  ))}
                </div>

                {/* Best value callout */}
                {bestVal && (
                  <div className="flex items-center gap-2 pt-3 border-t border-white/[0.05] text-xs text-gray-400 flex-wrap">
                    <span className="text-green-400 font-black shrink-0">💎 Best Value:</span>
                    <span className="text-white font-bold">{bestVal.firstName[0]}. {bestVal.lastName}</span>
                    <span className="text-gray-400">{bestVal.ebkScore.toFixed(1)} EBK for ${bestVal.paidPrice}M</span>
                    <span className="text-green-500/70 ml-auto font-black tabular-nums" title="Lower is better — least EBK score per million spent">
                      {(bestVal.paidPrice / bestVal.ebkScore).toFixed(2)}M/pt
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Action row ── */}
        <div className="flex justify-center gap-3 flex-wrap">
          <Link href="/auction" className="btn-primary">Play Again</Link>
          <Link href="/leaderboard" className="btn-secondary text-sm">
            Leaderboard
          </Link>
          <Link href="/lobby" className="btn-secondary text-sm">
            Back to Lobby
          </Link>
        </div>
      </div>
    )
  }

  // ── Waiting ────────────────────────────────────────────────────────────────
  if (phase === 'waiting' && auctionState) {
    const hasEnough = (auctionState.participants.length ?? 0) >= 2
    // War-room flavour copy rotates through a few phrases
    const warRoomQuips = [
      'Study the pool. The weak get overpaid.',
      'Every GM in this room thinks they\'re the best. Prove it.',
      'Budget discipline wins auctions. Remember that.',
      'Stars cost stars money. Value wins championships.',
      'The draft board doesn\'t lie. Neither does EBK.',
    ]
    const quipIndex = auctionState.participants.length % warRoomQuips.length

    return (
      <div className="min-h-screen px-4 py-10 max-w-xl mx-auto animate-fade-in">
        {/* ── Header ── */}
        <div className="text-center mb-8 animate-fade-up">
          <div className="live-banner mx-auto w-fit mb-4">
            <span className="live-dot" />
            WAR ROOM LOBBY
          </div>
          <h1 className="font-display leading-none tracking-wider text-orange-600"
            style={{ fontSize: 'clamp(3.5rem, 16vw, 5rem)' }}>
            WAR ROOM
          </h1>
          <p className="text-white/25 text-sm mt-1 italic px-4">&ldquo;{warRoomQuips[quipIndex]}&rdquo;</p>
          <div className="mt-3 font-mono text-white/30 text-sm border border-white/[0.07] bg-white/[0.02] rounded-lg px-3 py-1 inline-block tracking-widest">{code}</div>
        </div>

        {/* ── Atmosphere strip — stats about the draft ── */}
        <div className="grid grid-cols-3 gap-2 mb-5 animate-fade-up-1">
          {[
            { label: 'Pool Size', value: `${auctionState.poolSize}`, sub: 'players' },
            { label: 'Budget', value: `$${auctionState.totalBudget}M`, sub: 'per GM' },
            { label: 'Roster', value: `${auctionState.teamSize}`, sub: 'slots' },
          ].map(stat => (
            <div key={stat.label} className="card-surface rounded-xl px-3 py-3 text-center">
              <div className="font-display text-2xl text-orange-400 leading-none">{stat.value}</div>
              <div className="text-[10px] font-black tracking-widest text-white/25 uppercase mt-0.5">{stat.label}</div>
              <div className="text-[9px] text-white/15 uppercase tracking-wider">{stat.sub}</div>
            </div>
          ))}
        </div>

        {/* ── GMs list ── */}
        <div className="card-accent p-6 space-y-3 mb-5 animate-fade-up-2">
          <div className="flex items-center justify-between mb-3">
            <p className="text-label tracking-[0.2em]">GMs in Room</p>
            <span className="text-label">{auctionState.participants.length} joined</span>
          </div>
          {auctionState.participants.map((p, i) => {
            const isMe = p.socketId === mySocketId
            const isRoomHost = i === 0  // server always keeps host at index 0
            return (
              <div
                key={p.socketId}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 border transition-all animate-stagger-item ${
                  isMe
                    ? 'bg-orange-950/30 border-orange-500/25 shadow-[0_0_16px_rgba(234,88,12,0.06)]'
                    : 'bg-white/[0.025] border-white/[0.05]'
                }`}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-display text-base shrink-0 ${
                  isMe ? 'bg-orange-600 text-white shadow-[0_0_12px_rgba(234,88,12,0.4)]' : 'bg-white/[0.08] text-white/60'
                }`}>
                  {p.name[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white truncate">{p.name}</span>
                    {isMe && <span className="text-[9px] font-black text-orange-500 bg-orange-950/60 border border-orange-700/40 rounded px-1.5 py-0.5 uppercase tracking-wide shrink-0">You</span>}
                  </div>
                  <span className="text-[10px] font-bold text-orange-400/50 uppercase tracking-widest">
                    {isRoomHost ? (isMe ? 'Commissioner' : 'Commissioner') : 'GM'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-green-400 text-[10px] font-bold uppercase tracking-wide">Live</span>
                </div>
              </div>
            )
          })}
          {!hasEnough && (
            <div className="text-center pt-2 pb-1 border-t border-white/[0.05] mt-2">
              <div className="flex items-center justify-center gap-2 text-white/30 text-xs">
                <span className="w-3 h-3 rounded-full border-2 border-white/20 border-t-white/50 animate-spin shrink-0" />
                Waiting for more GMs — share the room code above
              </div>
            </div>
          )}
        </div>

        {/* ── Action — host starts, guests see anticipation state ── */}
        {isHost ? (
          <div className="space-y-3 animate-fade-up-3">
            <button
              onClick={handleStart}
              disabled={!hasEnough}
              className={`btn-primary w-full text-base font-display tracking-widest py-5 transition-all ${
                hasEnough ? 'animate-glow' : ''
              }`}
            >
              {hasEnough ? '🏀 Open the Auction' : 'Waiting for GMs…'}
            </button>
            {hasEnough && (
              <p className="text-center text-white/20 text-xs">
                All {auctionState.participants.length} GMs are in. You control the start.
              </p>
            )}
          </div>
        ) : (
          <div className="animate-fade-up-3">
            <div className="card-surface rounded-2xl px-6 py-5 text-center border border-white/[0.06]">
              <div className="flex items-center justify-center gap-2 mb-3">
                <span className="w-4 h-4 rounded-full border-2 border-orange-500/50 border-t-orange-400 animate-spin shrink-0" />
                <span className="text-orange-400 font-black text-sm uppercase tracking-widest">Awaiting Commissioner</span>
              </div>
              <p className="text-white/30 text-xs leading-relaxed">
                <span className="text-white/50 font-bold">{auctionState.participants[0]?.name}</span> will start the auction when everyone&apos;s ready. Use this time to plan your strategy.
              </p>
              <div className="mt-4 pt-4 border-t border-white/[0.05] flex items-center justify-center gap-6">
                <div className="text-center">
                  <div className="font-display text-xl text-orange-400">{auctionState.poolSize}</div>
                  <div className="text-[9px] text-white/20 uppercase tracking-wider">Players Available</div>
                </div>
                <div className="w-px h-8 bg-white/[0.06]" />
                <div className="text-center">
                  <div className="font-display text-xl text-orange-400">${auctionState.totalBudget}M</div>
                  <div className="text-[9px] text-white/20 uppercase tracking-wider">Your Budget</div>
                </div>
                <div className="w-px h-8 bg-white/[0.06]" />
                <div className="text-center">
                  <div className="font-display text-xl text-orange-400">{auctionState.teamSize}</div>
                  <div className="text-[9px] text-white/20 uppercase tracking-wider">Roster Spots</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Trading ────────────────────────────────────────────────────────────────
  if (phase === 'trading' && auctionState) {
    const myIncomingOffers = auctionState.tradeOffers.filter(o => o.toSocketId === mySocketId)
    const myOutgoingOffers = auctionState.tradeOffers.filter(o => o.fromSocketId === mySocketId)
    const tradeMinutes = Math.floor(tradeTimeLeft / 60)
    const tradeSecs = tradeTimeLeft % 60
    const timerUrgent = tradeTimeLeft <= 60
    const timerWarning = tradeTimeLeft <= 180

    // Countdown bar width as percentage of total trade window (assumes 300s default)
    const tradeBarPct = auctionState.tradeDeadline
      ? Math.min(100, (tradeTimeLeft / 300) * 100)
      : 100

    return (
      <div className="min-h-screen px-3 sm:px-4 py-5 sm:py-6 max-w-5xl mx-auto animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 gap-2 sm:gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 sm:gap-3 mb-0.5 flex-wrap">
              <h1 className="font-display text-2xl sm:text-4xl text-orange-500 tracking-wider leading-none">TRADE WINDOW</h1>
              <div className="live-banner shrink-0">
                <span className="live-dot" />
                OPEN
              </div>
            </div>
            <p className="text-white/30 text-xs mt-1 font-mono truncate">{code} · {auctionState.participants.length} GMs</p>
          </div>
          {/* Timer — urgency pill */}
          <div className={`relative flex flex-col items-center gap-1 rounded-2xl px-3 sm:px-5 py-2.5 sm:py-3 border transition-all overflow-hidden shrink-0 ${
            timerUrgent
              ? 'bg-red-950/50 border-red-500/60 shadow-[0_0_28px_rgba(239,68,68,0.25)]'
              : timerWarning
              ? 'bg-orange-950/40 border-orange-500/40 shadow-[0_0_16px_rgba(249,115,22,0.12)]'
              : 'bg-white/[0.04] border-white/[0.08]'
          }`}>
            {timerUrgent && <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(239,68,68,0.08) 0%, transparent 70%)' }} />}
            <p className={`font-display text-4xl leading-none tabular-nums relative ${timerUrgent ? 'text-red-400 animate-timer-throb' : timerWarning ? 'text-orange-400' : 'text-white'}`}>
              {tradeMinutes}:{tradeSecs.toString().padStart(2, '0')}
            </p>
            <p className={`text-[10px] font-black uppercase tracking-widest relative ${timerUrgent ? 'text-red-400/80' : timerWarning ? 'text-orange-400/70' : 'text-white/25'}`}>
              {timerUrgent ? 'Closing soon!' : timerWarning ? 'Time running out' : 'Trade Window'}
            </p>
          </div>
        </div>

        {/* Countdown progress bar */}
        <div className="h-1 rounded-full bg-white/[0.05] overflow-hidden mb-6">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${
              timerUrgent ? 'bg-gradient-to-r from-red-700 to-red-400' :
              timerWarning ? 'bg-gradient-to-r from-orange-700 to-orange-400' :
              'bg-gradient-to-r from-orange-600 to-orange-400'
            }`}
            style={{ width: `${tradeBarPct}%` }}
          />
        </div>

        {/* Incoming offers banner — high priority, shown at top */}
        {myIncomingOffers.length > 0 && (
          <div className="mb-6 animate-scale-in">
            {/* Urgent attention bar */}
            <div className="flex items-center gap-2 mb-3 px-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-400 animate-pulse shrink-0" />
                <span className="font-display text-2xl text-orange-400 tracking-widest leading-none">
                  {myIncomingOffers.length === 1 ? 'INCOMING OFFER' : `${myIncomingOffers.length} INCOMING OFFERS`}
                </span>
              </div>
              <div className="flex-1 h-px bg-gradient-to-r from-orange-500/30 to-transparent" />
            </div>
            <div className="space-y-4">
              {myIncomingOffers.map(offer => {
                const fromGM = auctionState.participants.find(p => p.socketId === offer.fromSocketId)
                const offeredPlayers = offer.offeredPlayerIds.map(id => fromGM?.roster.find(p => p?.id === id)).filter(Boolean)
                const requestedPlayers = offer.requestedPlayerIds.map(id => me?.roster.find(p => p?.id === id)).filter(Boolean)
                const receiveTotalEbk = offeredPlayers.reduce((s, p) => s + (p?.ebkScore ?? 0), 0)
                const giveTotalEbk = requestedPlayers.reduce((s, p) => s + (p?.ebkScore ?? 0), 0)
                const netEbk = receiveTotalEbk - giveTotalEbk
                return (
                  <div key={offer.id} className="rounded-2xl border border-orange-500/25 overflow-hidden shadow-[0_0_32px_rgba(249,115,22,0.06)]"
                    style={{ background: 'linear-gradient(135deg, rgba(17,17,24,0.98) 0%, rgba(26,15,5,0.98) 100%)' }}>
                    {/* Offer header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-orange-600/20 border border-orange-500/30 flex items-center justify-center font-display text-orange-400 text-sm shrink-0">
                          {offer.fromName[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="text-white font-black text-sm leading-tight">{offer.fromName}</p>
                          <p className="text-white/30 text-[10px] tracking-widest uppercase font-black">Sent a trade offer</p>
                        </div>
                      </div>
                      {/* EBK net indicator */}
                      <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 border ${
                        netEbk < 0
                          ? 'bg-green-950/40 border-green-500/30 text-green-400'
                          : netEbk > 0
                          ? 'bg-red-950/30 border-red-500/20 text-red-400'
                          : 'bg-white/[0.05] border-white/[0.08] text-white/50'
                      }`}>
                        <span className="text-[9px] font-black tracking-widest uppercase">EBK net</span>
                        <span className="font-display text-base leading-none tabular-nums">
                          {netEbk > 0 ? '+' : ''}{netEbk.toFixed(1)}
                        </span>
                      </div>
                    </div>

                    {/* Trade card — YOU RECEIVE / YOU GIVE */}
                    <div className="grid grid-cols-[1fr_28px_1fr] sm:grid-cols-[1fr_36px_1fr] gap-0 p-3 sm:p-4">
                      {/* You receive */}
                      <div className="rounded-xl border border-green-500/25 overflow-hidden">
                        <div className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 bg-green-950/40 border-b border-green-500/15">
                          <svg className="w-3 h-3 text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-green-400 text-[9px] sm:text-[10px] font-black uppercase tracking-widest truncate">Receive</span>
                          <span className="ml-auto text-green-400/60 font-display text-xs sm:text-sm leading-none tabular-nums shrink-0">{receiveTotalEbk.toFixed(1)}</span>
                        </div>
                        <div className="space-y-0 divide-y divide-white/[0.04]">
                          {offeredPlayers.map(p => p && (
                            <div key={p.id} className="flex items-center gap-1.5 px-2 sm:px-3 py-2">
                              <PosBadge pos={p.position} />
                              <span className="text-white font-bold text-[11px] sm:text-xs truncate flex-1">{p.firstName[0]}. {p.lastName}</span>
                              <span className="text-orange-400 text-[11px] sm:text-xs font-black shrink-0">{p.ebkScore.toFixed(1)}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Swap arrow */}
                      <div className="flex items-center justify-center">
                        <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-white/[0.05] border border-white/[0.08] flex items-center justify-center">
                          <svg className="w-3 h-3 sm:w-4 sm:h-4 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                          </svg>
                        </div>
                      </div>

                      {/* You give */}
                      <div className="rounded-xl border border-red-500/20 overflow-hidden">
                        <div className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 bg-red-950/30 border-b border-red-500/15">
                          <svg className="w-3 h-3 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          <span className="text-red-400 text-[9px] sm:text-[10px] font-black uppercase tracking-widest truncate">Give</span>
                          <span className="ml-auto text-red-400/60 font-display text-xs sm:text-sm leading-none tabular-nums shrink-0">{giveTotalEbk.toFixed(1)}</span>
                        </div>
                        <div className="space-y-0 divide-y divide-white/[0.04]">
                          {requestedPlayers.map(p => p && (
                            <div key={p.id} className="flex items-center gap-1.5 px-2 sm:px-3 py-2">
                              <PosBadge pos={p.position} />
                              <span className="text-white font-bold text-[11px] sm:text-xs truncate flex-1">{p.firstName[0]}. {p.lastName}</span>
                              <span className="text-orange-400 text-[11px] sm:text-xs font-black shrink-0">{p.ebkScore.toFixed(1)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Accept / Decline — full width, prominent */}
                    <div className="grid grid-cols-2 gap-2 sm:gap-3 px-3 sm:px-4 pb-3 sm:pb-4">
                      <button
                        onClick={() => handleTradeRespond(offer.id, false)}
                        className="flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-sm uppercase tracking-wider transition-all border bg-red-950/30 border-red-500/40 text-red-400 hover:bg-red-950/50 hover:border-red-500/60 hover:text-red-300 active:bg-red-950/60"
                      >
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Decline
                      </button>
                      <button
                        onClick={() => handleTradeRespond(offer.id, true)}
                        className="flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-sm uppercase tracking-wider transition-all border bg-green-600/25 border-green-500/50 text-green-400 hover:bg-green-600/35 hover:border-green-500/70 hover:text-green-300 active:bg-green-600/45 shadow-[0_0_16px_rgba(34,197,94,0.12)]"
                      >
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        Accept
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {errorMsg && (
          <div role="alert" className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm flex items-start gap-3 animate-slide-up">
            <div className="w-5 h-5 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-red-400 text-xs font-black leading-none">!</span>
            </div>
            <span className="flex-1">{errorMsg}</span>
          </div>
        )}

        {/* Section divider */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-white/20 text-[10px] font-black uppercase tracking-widest">Build a Trade</span>
          <div className="flex-1 h-px bg-white/[0.05]" />
          {selectedToOffer.length > 0 && (
            <span className="text-orange-400 text-[10px] font-black uppercase tracking-widest">
              {selectedToOffer.length} selected to offer
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Your Roster */}
          <div className="card-surface p-4 sm:p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-display text-base sm:text-lg text-white/80 tracking-wider">YOUR ROSTER</h2>
              <div className="flex items-center gap-2">
                {selectedToOffer.length > 0 && (
                  <span className="text-[10px] font-black uppercase tracking-widest bg-orange-600/20 border border-orange-500/40 text-orange-400 rounded-lg px-2 py-1">
                    {selectedToOffer.length} offered
                  </span>
                )}
                <span className="text-orange-400 text-sm font-bold">${me?.budget ?? 0}M</span>
              </div>
            </div>
            <p className="text-white/25 text-[10px] mb-3 font-semibold uppercase tracking-wider">
              {selectedToOffer.length === 0 ? 'Step 1 — tap to offer' : 'Pick a GM and their players below'}
            </p>
            <div className="space-y-1.5 sm:space-y-2">
              {me?.roster.map(p => p && (
                <button
                  key={p.id}
                  onClick={() => toggleOffer(p.id)}
                  className={`w-full flex items-center gap-2 sm:gap-3 rounded-xl px-2.5 sm:px-3 py-2.5 sm:py-3 border transition-all ${
                    selectedToOffer.includes(p.id)
                      ? 'bg-orange-600/20 border-orange-500/50 shadow-[0_0_12px_rgba(234,88,12,0.15)]'
                      : 'bg-white/[0.03] border-white/[0.05] hover:border-white/20 hover:bg-white/[0.05]'
                  }`}
                >
                  <PosBadge pos={p.position} />
                  <span className="flex-1 text-left text-white text-xs sm:text-sm font-bold truncate" title={`${p.firstName} ${p.lastName}`}>{p.firstName} {p.lastName}</span>
                  <span className="text-orange-400 text-xs font-black">{p.ebkScore.toFixed(1)}</span>
                  <span className="text-white/25 text-xs hidden xs:inline">${p.paidPrice}M</span>
                  {selectedToOffer.includes(p.id)
                    ? <span className="w-4 h-4 rounded-full bg-orange-500/30 border border-orange-400 flex items-center justify-center shrink-0"><svg className="w-2.5 h-2.5 text-orange-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg></span>
                    : <span className="w-4 h-4 rounded-full border border-white/[0.12] shrink-0" />
                  }
                </button>
              ))}
              {(!me?.roster || me.roster.length === 0) && (
                <div className="empty-state py-6">
                  <div className="empty-state-icon">🏀</div>
                  <div className="empty-state-title">No players yet</div>
                  <div className="empty-state-body">Win some bids to build your roster</div>
                </div>
              )}
            </div>
          </div>

          {/* Other GMs */}
          <div className="space-y-4">
            {auctionState.participants.filter(p => p.socketId !== mySocketId).length === 0 && (
              <div className="card-surface p-8 rounded-2xl text-center">
                <p className="text-white/25 text-sm font-semibold">No other GMs in this room</p>
              </div>
            )}
            {auctionState.participants.filter(p => p.socketId !== mySocketId).map(gm => (
              <div key={gm.socketId} className={`card-surface p-4 transition-all ${tradeTarget === gm.socketId ? 'border-orange-500/25 shadow-[0_0_24px_rgba(249,115,22,0.06)]' : ''}`}>
                <div className="flex items-center justify-between mb-3 gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-orange-600/20 border border-orange-500/30 flex items-center justify-center font-display text-orange-400 shrink-0 text-sm">
                      {gm.name[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-white truncate text-sm leading-tight">{gm.name}</div>
                      <div className="text-white/30 text-[10px] font-mono">{gm.rosterCount} players · ${gm.budget}M left</div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setTradeTarget(tradeTarget === gm.socketId ? null : gm.socketId)
                      setSelectedToRequest([])
                    }}
                    className={`shrink-0 text-xs py-2 px-3 ${tradeTarget === gm.socketId ? 'btn-secondary' : 'btn-primary'}`}
                  >
                    {tradeTarget === gm.socketId ? '✕ Cancel' : '↔ Trade'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {gm.roster.map(p => p && (
                    <button
                      key={p.id}
                      onClick={() => tradeTarget === gm.socketId && toggleRequest(p.id)}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 border text-xs transition-all ${
                        tradeTarget === gm.socketId && selectedToRequest.includes(p.id)
                          ? 'bg-blue-600/20 border-blue-500/50 text-blue-300 shadow-[0_0_8px_rgba(59,130,246,0.15)]'
                          : tradeTarget === gm.socketId
                          ? 'bg-white/[0.04] border-white/10 text-white/70 hover:border-blue-500/40 cursor-pointer'
                          : 'bg-white/[0.04] border-white/[0.07] text-white/50 cursor-default'
                      }`}
                    >
                      <PosBadge pos={p.position} />
                      <span className="font-bold">{p.firstName[0]}. {p.lastName}</span>
                      <span className="text-orange-400 font-black">{p.ebkScore.toFixed(1)}</span>
                      {tradeTarget === gm.socketId && selectedToRequest.includes(p.id) && <span className="text-blue-400">✓</span>}
                    </button>
                  ))}
                  {gm.roster.length === 0 && (
                    <span className="text-white/20 text-xs italic">No players drafted</span>
                  )}
                </div>

                {/* Trade proposal preview for this GM */}
                {tradeTarget === gm.socketId && (
                  <div className="mt-4 pt-4 border-t border-white/[0.07]">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
                        <p className="text-white/50 text-[10px] font-black uppercase tracking-widest">Step 2 — Trade Proposal</p>
                      </div>
                      <div className="flex-1 h-px bg-white/[0.05]" />
                      {/* Live EBK net preview */}
                      {(selectedToOffer.length > 0 || selectedToRequest.length > 0) && (() => {
                        const offerEbk = selectedToOffer.reduce((s, id) => s + (me?.roster.find(p => p?.id === id)?.ebkScore ?? 0), 0)
                        const requestEbk = selectedToRequest.reduce((s, id) => s + (gm.roster.find(p => p?.id === id)?.ebkScore ?? 0), 0)
                        const net = requestEbk - offerEbk
                        return (
                          <span className={`text-[10px] font-black tabular-nums px-2 py-0.5 rounded-md border ${net < 0 ? 'text-green-400 bg-green-950/30 border-green-500/20' : net > 0 ? 'text-red-400 bg-red-950/20 border-red-500/15' : 'text-white/30 bg-white/[0.03] border-white/[0.06]'}`}>
                            EBK {net > 0 ? '+' : ''}{net.toFixed(1)}
                          </span>
                        )
                      })()}
                    </div>
                    <div className="grid grid-cols-[1fr_28px_1fr] sm:grid-cols-[1fr_36px_1fr] gap-0 mb-4">
                      <div className={`rounded-xl border overflow-hidden transition-all ${
                        selectedToOffer.length > 0
                          ? 'border-orange-500/30 bg-orange-950/20'
                          : 'border-white/[0.08] bg-white/[0.02]'
                      }`}>
                        <div className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 border-b border-white/[0.05]">
                          <svg className="w-3 h-3 text-orange-400/60 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                          </svg>
                          <p className="text-orange-400/60 text-[9px] font-black uppercase tracking-widest truncate">You give</p>
                          {selectedToOffer.length > 0 && (
                            <span className="ml-auto text-orange-400/60 font-display text-xs tabular-nums shrink-0">
                              {selectedToOffer.reduce((s, id) => s + (me?.roster.find(p => p?.id === id)?.ebkScore ?? 0), 0).toFixed(1)}
                            </span>
                          )}
                        </div>
                        <div className="px-2 sm:px-3 py-2 space-y-1.5 min-h-[48px]">
                          {selectedToOffer.length > 0 ? selectedToOffer.map(id => {
                            const p = me?.roster.find(r => r?.id === id)
                            return p ? (
                              <div key={id} className="flex items-center gap-1.5">
                                <PosBadge pos={p.position} />
                                <span className="text-white text-[11px] sm:text-xs font-bold truncate flex-1">{p.firstName[0]}. {p.lastName}</span>
                                <span className="text-orange-400 text-[10px] font-black shrink-0">{p.ebkScore.toFixed(1)}</span>
                              </div>
                            ) : null
                          }) : (
                            <p className="text-white/20 text-[10px] sm:text-[11px] italic pt-1">Select from roster</p>
                          )}
                        </div>
                      </div>
                      {/* Swap icon */}
                      <div className="flex items-center justify-center">
                        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white/[0.05] border border-white/[0.08] flex items-center justify-center">
                          <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                          </svg>
                        </div>
                      </div>
                      <div className={`rounded-xl border overflow-hidden transition-all ${
                        selectedToRequest.length > 0
                          ? 'border-blue-500/30 bg-blue-950/20'
                          : 'border-white/[0.08] bg-white/[0.02]'
                      }`}>
                        <div className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 border-b border-white/[0.05]">
                          <svg className="w-3 h-3 text-blue-400/60 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" />
                          </svg>
                          <p className="text-blue-400/60 text-[9px] font-black uppercase tracking-widest truncate">You get</p>
                          {selectedToRequest.length > 0 && (
                            <span className="ml-auto text-blue-400/60 font-display text-xs tabular-nums shrink-0">
                              {selectedToRequest.reduce((s, id) => s + (gm.roster.find(p => p?.id === id)?.ebkScore ?? 0), 0).toFixed(1)}
                            </span>
                          )}
                        </div>
                        <div className="px-2 sm:px-3 py-2 space-y-1.5 min-h-[48px]">
                          {selectedToRequest.length > 0 ? selectedToRequest.map(id => {
                            const p = gm.roster.find(r => r?.id === id)
                            return p ? (
                              <div key={id} className="flex items-center gap-1.5">
                                <PosBadge pos={p.position} />
                                <span className="text-white text-[11px] sm:text-xs font-bold truncate flex-1">{p.firstName[0]}. {p.lastName}</span>
                                <span className="text-orange-400 text-[10px] font-black shrink-0">{p.ebkScore.toFixed(1)}</span>
                              </div>
                            ) : null
                          }) : (
                            <p className="text-white/20 text-[10px] sm:text-[11px] italic pt-1">Tap their players</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleSendTradeOffer}
                      disabled={selectedToOffer.length === 0 || selectedToRequest.length === 0}
                      className={`w-full py-3.5 text-sm tracking-widest flex items-center justify-center gap-2 rounded-xl font-black uppercase transition-all border ${
                        selectedToOffer.length > 0 && selectedToRequest.length > 0
                          ? 'bg-orange-600/25 border-orange-500/60 text-orange-300 hover:bg-orange-600/35 hover:border-orange-500/80 shadow-[0_0_16px_rgba(249,115,22,0.12)]'
                          : 'bg-white/[0.03] border-white/[0.06] text-white/20 cursor-not-allowed'
                      }`}
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                      </svg>
                      {selectedToOffer.length === 0 ? 'Select players to offer first' : selectedToRequest.length === 0 ? 'Select players to request' : `Send Offer to ${gm.name}`}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Outgoing offers — pending cards */}
        {myOutgoingOffers.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-3 px-1">
              <span className="w-2 h-2 rounded-full bg-yellow-400/70 animate-pulse shrink-0" />
              <span className="text-label tracking-[0.18em]">Pending Offers</span>
              <span className="text-[10px] font-black bg-white/[0.06] border border-white/[0.10] text-white/40 rounded-full px-2 py-0.5">{myOutgoingOffers.length}</span>
              <div className="flex-1 h-px bg-white/[0.05]" />
            </div>
            <div className="space-y-2">
              {myOutgoingOffers.map(offer => {
                const toGM = auctionState.participants.find(p => p.socketId === offer.toSocketId)
                const offeredPlayers = offer.offeredPlayerIds.map(id => me?.roster.find(p => p?.id === id)).filter(Boolean)
                const requestedPlayers = offer.requestedPlayerIds.map(id => toGM?.roster.find(p => p?.id === id)).filter(Boolean)
                return (
                  <div key={offer.id} className="rounded-xl border border-yellow-500/15 overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(17,17,24,0.98) 0%, rgba(20,18,5,0.98) 100%)' }}>
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.04]">
                      <span className="w-2 h-2 rounded-full bg-yellow-400/70 animate-pulse shrink-0" />
                      <span className="text-yellow-400/70 text-xs font-black uppercase tracking-widest flex-1">Awaiting response</span>
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-orange-600/20 border border-orange-500/30 flex items-center justify-center font-display text-orange-400 text-[10px] shrink-0">
                          {offer.toName[0]?.toUpperCase()}
                        </div>
                        <span className="text-white/60 text-xs font-bold">{offer.toName}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-[1fr_32px_1fr] gap-0 px-4 py-3 items-start">
                      <div>
                        <p className="text-orange-400/50 text-[9px] font-black uppercase tracking-widest mb-1.5">Offering</p>
                        <div className="space-y-1">
                          {offeredPlayers.map(p => p && (
                            <div key={p.id} className="flex items-center gap-1.5">
                              <PosBadge pos={p.position} />
                              <span className="text-white/70 text-xs font-bold truncate">{p.firstName[0]}. {p.lastName}</span>
                              <span className="text-orange-400/60 text-xs font-black shrink-0">{p.ebkScore.toFixed(1)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center justify-center pt-4">
                        <div className="w-6 h-6 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                          <svg className="w-3 h-3 text-white/25" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                          </svg>
                        </div>
                      </div>
                      <div>
                        <p className="text-blue-400/50 text-[9px] font-black uppercase tracking-widest mb-1.5">Requesting</p>
                        <div className="space-y-1">
                          {requestedPlayers.map(p => p && (
                            <div key={p.id} className="flex items-center gap-1.5">
                              <PosBadge pos={p.position} />
                              <span className="text-white/70 text-xs font-bold truncate">{p.firstName[0]}. {p.lastName}</span>
                              <span className="text-orange-400/60 text-xs font-black shrink-0">{p.ebkScore.toFixed(1)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    {/* Urgency bar if time is running out */}
                    {timerUrgent && (
                      <div className="px-4 pb-3">
                        <div className="flex items-center gap-2 bg-red-950/30 border border-red-500/25 rounded-lg px-3 py-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse shrink-0" />
                          <span className="text-red-400/80 text-[10px] font-black uppercase tracking-widest">Trade window closing in {tradeMinutes}:{tradeSecs.toString().padStart(2, '0')}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* End trading / timer repeat */}
        <div className="mt-6 pb-8 flex items-center justify-between gap-4">
          {isHost && (
            <button
              onClick={handleFinishTrading}
              className="btn-secondary text-sm"
            >
              End Trading Early
            </button>
          )}
          <div className={`${isHost ? '' : 'ml-auto'} flex items-center gap-2 text-sm font-mono ${timerUrgent ? 'text-red-400' : timerWarning ? 'text-orange-400' : 'text-white/30'}`}>
            <span className={`live-dot ${timerUrgent ? 'bg-red-400' : timerWarning ? 'bg-orange-400' : ''}`} />
            {tradeMinutes}:{tradeSecs.toString().padStart(2, '0')} remaining
          </div>
        </div>
      </div>
    )
  }

  // ── Bidding / Steal Window ─────────────────────────────────────────────────
  if ((phase === 'bidding' || phase === 'steal-window') && auctionState) {
    const cp = auctionState.currentPlayer
    const lastWinner = auctionState.participants.find(p => p.socketId === auctionState.lastWinnerSocketId)
    const canSteal = phase === 'steal-window' && !auctionState.stealInitiated
    // stealPrice is per-player: Math.ceil(paidPrice * 1.5). Compute inline in the roster map.
    // This top-level stealPrice is only used for the steal-window info panel (last won player).
    const stealPrice = lastWinner ? Math.ceil(auctionState.lastWonAmount * 1.5) : 0

    return (
      <div className="min-h-screen flex flex-col">
        {/* Top bar — sticky war room header */}
        <div className="war-room-bar">
          <div className="flex items-center gap-3">
            <span className="font-display text-2xl text-orange-500 tracking-wider">WAR ROOM</span>
            <span className="font-mono text-white/30 text-sm border border-white/[0.07] bg-white/[0.03] rounded px-2 py-0.5">{code}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="live-banner">
              <span className="live-dot" />
              LIVE
            </div>
            <div className="text-white/30 text-xs bg-white/[0.03] border border-white/[0.06] rounded-lg px-2.5 py-1 font-mono" title="Current player in pool">
              {Math.max(0, auctionState.playerIndex + 1)}<span className="text-white/15"> / {auctionState.poolSize}</span>
            </div>
            <div className="hidden sm:block text-white/25 text-xs bg-white/[0.03] border border-white/[0.06] rounded-lg px-2.5 py-1 font-mono" title="Total slots filled">
              {auctionState.participants.reduce((s, p) => s + p.rosterCount, 0)}<span className="text-white/15"> / {auctionState.participants.length * auctionState.teamSize} slots</span>
            </div>
          </div>
        </div>

        {errorMsg && (
          <div role="alert" aria-live="assertive" className="mx-4 mt-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5 text-red-400 text-sm flex items-center gap-2.5 animate-slide-up">
            <div className="w-5 h-5 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
              <span className="text-red-400 text-xs font-black leading-none">!</span>
            </div>
            <span className="flex-1 text-center">{errorMsg}</span>
          </div>
        )}

        {/* Mobile panel switcher — only visible below lg */}
        <div className="lg:hidden flex gap-0 border-b border-white/[0.07] bg-black/30" role="tablist" aria-label="War Room panel">
          {([
            ['bid', 'Bid'],
            ['rosters', 'GMs'],
            ['log', 'Log'],
          ] as [WarRoomPanel, string][]).map(([panel, label]) => (
            <button
              key={panel}
              role="tab"
              aria-selected={mobilePanel === panel}
              onClick={() => setMobilePanel(panel)}
              className={`flex-1 py-2.5 text-xs font-black uppercase tracking-wider transition-colors ${
                mobilePanel === panel
                  ? 'text-orange-400 border-b-2 border-orange-500'
                  : 'text-white/40 border-b-2 border-transparent'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-0 overflow-hidden">
          {/* Left: Rosters */}
          <aside className={`lg:col-span-1 border-r border-white/[0.07] p-4 overflow-y-auto ${mobilePanel !== 'rosters' ? 'hidden lg:block' : ''}`}>
            <p className="text-label tracking-[0.18em] mb-4">Rosters</p>
            <div className="space-y-3">
              {auctionState.participants.map(p => {
                const budgetPct = (p.budget / auctionState.totalBudget) * 100
                const rosterPct = auctionState.teamSize > 0 ? (p.rosterCount / auctionState.teamSize) * 100 : 0
                const isMe = p.socketId === mySocketId
                const isRoomHost = p.socketId === auctionState.hostSocketId
                return (
                  <div key={p.socketId} className={`gm-card ${isMe ? 'gm-card-me' : 'gm-card-other'}`}>
                    <div className="flex items-center gap-2 mb-2.5">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${isMe ? 'bg-orange-600 text-white' : 'bg-white/[0.08] text-white/60'}`}>
                        {p.name[0]?.toUpperCase()}
                      </div>
                      <span className={`text-xs font-black truncate flex-1 ${isMe ? 'text-orange-300' : 'text-white'}`}>{p.name}</span>
                      {isRoomHost && !isMe && <span className="text-[9px] font-bold text-white/25 uppercase tracking-wider shrink-0">Host</span>}
                      {isMe && <span className="text-[10px] font-black text-orange-400/70 uppercase tracking-wider shrink-0">{isRoomHost ? 'Host · You' : 'You'}</span>}
                      {/* Roster fill indicator */}
                      <span className={`text-[9px] font-black tabular-nums shrink-0 ${rosterPct >= 100 ? 'text-green-400' : 'text-white/30'}`}>
                        {p.rosterCount}/{auctionState.teamSize}
                      </span>
                    </div>
                    {/* Budget bar */}
                    <div className="budget-bar mb-1.5">
                      <div
                        className="budget-bar-fill transition-all"
                        style={{ width: `${Math.max(0, budgetPct)}%` }}
                      />
                    </div>
                    <p className="text-white/30 text-[11px] mb-2.5 flex items-center justify-between">
                      <span className={`font-black ${p.budget < 10 ? 'text-red-400/80' : 'text-white/50'}`}>${p.budget}M</span>
                      <span>{p.rosterCount}/{auctionState.teamSize} players</span>
                    </p>
                    <div className="space-y-1">
                      {p.roster.map(player => player && (
                        <div key={player.id} className="relative group">
                          {canSteal && p.socketId !== mySocketId ? (
                            <button
                              onClick={() => handleSteal(player.id)}
                              aria-label={`Steal ${player.firstName} ${player.lastName} for $${Math.ceil(player.paidPrice * 1.5)}M`}
                              className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 border border-yellow-500/30 bg-yellow-500/08 hover:bg-yellow-500/15 text-yellow-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/50"
                            >
                              <PosBadge pos={player.position} />
                              <span className="flex-1 text-left text-xs font-bold truncate">{player.firstName[0]}. {player.lastName}</span>
                              <span className="text-orange-400 text-xs font-black tabular-nums shrink-0">{player.ebkScore.toFixed(1)}</span>
                              <span className="text-yellow-500/60 text-[9px] shrink-0" aria-hidden="true">⚡${Math.ceil(player.paidPrice * 1.5)}M</span>
                            </button>
                          ) : (
                            <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 border border-white/[0.06] bg-white/[0.025]">
                              <PosBadge pos={player.position} />
                              <span className="flex-1 text-xs font-bold text-white/70 truncate">{player.firstName[0]}. {player.lastName}</span>
                              <span className="text-orange-400/70 text-xs font-black tabular-nums shrink-0">{player.ebkScore.toFixed(1)}</span>
                              {player.paidPrice > 0 && (
                                <span className="text-white/20 text-[9px] tabular-nums shrink-0">${player.paidPrice}M</span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                      {p.roster.length === 0 && (
                        <div className="flex items-center gap-1.5 py-2 px-1 opacity-40">
                          <span className="text-white/30 text-base">🏀</span>
                          <span className="text-white/25 text-[10px] font-semibold italic">No players yet</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </aside>

          {/* Center: Auction */}
          <main className={`lg:col-span-2 flex flex-col items-center justify-center p-4 sm:p-6 gap-4 sm:gap-6 ${mobilePanel !== 'bid' ? 'hidden lg:flex' : ''}`}>
            {/* Status badge */}
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-bold tracking-widest ${
              phase === 'steal-window'
                ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
                : 'bg-orange-600/10 border-orange-500/30 text-orange-400'
            }`}>
              {phase === 'steal-window' ? '⚡ STEAL WINDOW' : '🏷 BIDDING'}
            </div>

            {/* Player card — keyed to cp.id so each new player remounts with a fresh animation */}
            {cp && (
              <div key={cp.id} className="card-accent w-full max-w-sm p-6 text-center animate-player-card-enter">
                {/* ON THE BLOCK badge */}
                <div className="inline-flex items-center gap-1.5 bg-orange-950/50 border border-orange-500/40 rounded-full px-3 py-1 mb-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse shrink-0" />
                  <span className="text-orange-400 text-[10px] font-black tracking-[0.2em] uppercase">On The Block</span>
                </div>
                <div className="flex items-center justify-center gap-3 mb-3">
                  <PosBadge pos={cp.position} />
                  <span className="text-white/35 text-xs font-mono tracking-widest">{cp.team}</span>
                  <span className="text-white/20 text-xs">{cp.yearFrom}–{cp.yearTo}</span>
                </div>
                <h2 className="font-display text-5xl md:text-6xl text-white tracking-wider leading-none mb-5">
                  {cp.firstName}<br />{cp.lastName}
                </h2>
                <div className="grid grid-cols-4 gap-2 mb-5">
                  {[
                    { label: 'GP', value: cp.careerGames },
                    { label: 'PPG', value: cp.careerPPG?.toFixed(1) },
                    { label: 'RPG', value: cp.careerRPG?.toFixed(1) },
                    { label: 'APG', value: cp.careerAPG?.toFixed(1) },
                  ].map(s => (
                    <div key={s.label} className="bg-white/[0.04] border border-white/[0.06] rounded-xl py-3 hover:bg-white/[0.06] transition-colors">
                      <p className="font-display text-2xl text-white leading-none">{s.value ?? '–'}</p>
                      <p className="text-label mt-1">{s.label}</p>
                    </div>
                  ))}
                </div>
                <div className="stat-highlight rounded-xl py-4">
                  <span className="text-label tracking-[0.18em]">EBK Score</span>
                  <p className="font-display text-5xl text-orange-400 leading-none mt-1">{cp.ebkScore.toFixed(1)}</p>
                </div>
              </div>
            )}

            {/* Current bid */}
            <div className={`w-full max-w-sm rounded-2xl px-6 py-5 text-center transition-all duration-300 ${
              justWon
                ? 'bg-green-950/40 border border-green-500/50 shadow-[0_0_40px_rgba(34,197,94,0.25)]'
                : amLeading
                ? 'bg-orange-950/40 border border-orange-500/50 shadow-[0_0_32px_rgba(234,88,12,0.18)] animate-glow'
                : auctionState.currentBid > 0
                ? 'bg-white/[0.03] border border-white/[0.08]'
                : 'bg-white/[0.015] border border-white/[0.04]'
            }`} aria-live="polite" aria-atomic="true">
              <div className="text-label mb-1 tracking-[0.2em]">
                {justWon ? 'PLAYER WON!' : 'Current Bid'}
              </div>
              <div
                key={auctionState.currentBid}
                className={`bid-hero animate-bid-update ${
                  justWon ? 'text-green-400' :
                  auctionState.currentBid > 0 ? (amLeading ? 'text-orange-400' : 'text-white') : 'text-white/15'
                }`}
                aria-label={auctionState.currentBid > 0 ? `Current bid: $${auctionState.currentBid}M` : 'No bids yet'}
              >
                {auctionState.currentBid > 0 ? `$${auctionState.currentBid}M` : '–––'}
              </div>
              {auctionState.currentBidderName ? (
                <div
                  key={auctionState.currentBidderSocketId}
                  className={`mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-black tracking-widest uppercase animate-fade-in ${
                    amLeading
                      ? 'bg-orange-950/60 border-orange-500/40 text-orange-400'
                      : 'bg-white/[0.04] border-white/[0.08] text-white/50'
                  }`}>
                  {amLeading ? 'You are leading' : `Leading: ${auctionState.currentBidderName}`}
                </div>
              ) : (
                <p className="text-white/25 text-xs mt-2 tracking-widest uppercase">No bids yet — be first</p>
              )}
            </div>

            {/* Timer */}
            <TimerRing timeLeft={timeLeft} maxTime={maxTime} />

            {/* Bid controls */}
            {phase === 'bidding' && (
              <div className="w-full max-w-xs space-y-3 px-0">
                {/* Quick-add chips */}
                <div className="flex gap-2 justify-center">
                  {[1, 5, 10].map(bump => (
                    <button
                      key={bump}
                      onClick={() => setBidAmount(prev => Math.min(me?.budget ?? prev, prev + bump))}
                      aria-label={`Add $${bump}M to bid`}
                      className="flex-1 py-2.5 sm:py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/60 text-sm sm:text-xs font-black hover:bg-white/[0.08] hover:text-white/80 active:bg-white/[0.12] transition-all touch-action-manipulation"
                      style={{ touchAction: 'manipulation' }}
                    >
                      +{bump}
                    </button>
                  ))}
                </div>
                {/* Stepper */}
                <div className="bid-stepper" role="group" aria-label="Bid amount">
                  <button
                    className="bid-stepper-btn"
                    aria-label="Decrease bid by 1"
                    onClick={() => setBidAmount(prev => Math.max(auctionState.currentBid + 1, prev - 1))}
                  >−</button>
                  <input
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={bidAmount}
                    min={auctionState.currentBid + 1}
                    max={me?.budget ?? 0}
                    aria-label={`Bid amount in millions of dollars`}
                    onKeyDown={e => {
                      // Block decimal point and minus sign — only whole positive integers allowed
                      if (e.key === '.' || e.key === '-' || e.key === 'e' || e.key === 'E') {
                        e.preventDefault()
                      }
                    }}
                    onChange={e => {
                      const raw = parseInt(e.target.value, 10)
                      if (isNaN(raw) || raw < 1) return
                      const minBid = auctionState.currentBid + 1
                      const maxBid = me?.budget ?? minBid
                      setBidAmount(Math.min(maxBid, Math.max(minBid, raw)))
                    }}
                    className="bid-stepper-input"
                  />
                  <button
                    className="bid-stepper-btn"
                    aria-label="Increase bid by 1"
                    onClick={() => setBidAmount(prev => Math.min(me?.budget ?? prev, prev + 1))}
                  >+</button>
                </div>
                <button
                  onClick={handleBid}
                  disabled={!canBid || amLeading}
                  className="btn-primary w-full text-lg font-display tracking-widest"
                >
                  {amLeading
                    ? '🔒 Leading Bid'
                    : me && me.rosterCount >= (auctionState?.teamSize ?? 0)
                    ? 'Roster Full'
                    : me && me.budget < bidAmount
                    ? 'Not Enough Budget'
                    : `Bid $${bidAmount}M`}
                </button>
                <button
                  onClick={handlePass}
                  disabled={amLeading || auctionState.currentBid > 0}
                  title={auctionState.currentBid > 0 ? 'Cannot pass after a bid has been placed' : undefined}
                  className="btn-secondary w-full text-sm"
                >
                  Pass
                </button>
                {me && (
                  <div className="flex items-center justify-between text-xs px-1">
                    <span className="text-label">Budget</span>
                    <span className={`font-black tabular-nums ${me.budget < 10 ? 'text-red-400' : 'text-white/60'}`}>${me.budget}M</span>
                  </div>
                )}
              </div>
            )}

            {/* Steal window info */}
            {phase === 'steal-window' && (
              <div className="w-full max-w-sm animate-fade-up">
                {auctionState.stealInitiated ? (() => {
                  const stealEntry = [...auctionState.bidLog].reverse().find(e => e.action === 'steal')
                  const iMeStole = stealEntry?.name === me?.name
                  return (
                    <div className={`rounded-2xl px-5 py-4 text-center border ${
                      iMeStole
                        ? 'bg-green-950/30 border-green-500/40'
                        : 'bg-white/[0.03] border-white/[0.07]'
                    }`}>
                      {iMeStole ? (
                        <div className="text-green-400 font-black text-sm tracking-wide">⚡ You stole it! Next player incoming...</div>
                      ) : (
                        <div className="text-white/40 text-sm">
                          {stealEntry ? `${stealEntry.name} executed a steal` : 'Steal executed'} — next player incoming...
                        </div>
                      )}
                    </div>
                  )
                })() : (
                  <div className="bg-yellow-950/30 border border-yellow-700/40 rounded-2xl px-5 py-5 text-center shadow-[0_0_24px_rgba(234,179,8,0.08)]">
                    <div className="inline-flex items-center gap-2 mb-3">
                      <span className="text-yellow-400 font-black text-sm tracking-widest uppercase">⚡ Steal Window Open</span>
                    </div>
                    <p className="text-white/60 text-sm mb-1">
                      <span className="text-white font-black">{auctionState.lastWinnerName}</span> won this player for{' '}
                      <span className="text-yellow-400 font-black">${auctionState.lastWonAmount}M</span>
                    </p>
                    <div className="mt-3 bg-yellow-500/10 border border-yellow-500/25 rounded-xl px-4 py-2.5">
                      <div className="text-label mb-0.5 tracking-[0.15em]">Steal Price</div>
                      <div className="font-display text-3xl text-yellow-400 leading-none">${stealPrice}M</div>
                    </div>
                    <p className="text-white/25 text-xs mt-3">Tap ⚡ on any opponent&apos;s player in the Rosters tab to steal</p>
                  </div>
                )}
              </div>
            )}
          </main>

          {/* Right: Bid log */}
          <aside className={`lg:col-span-1 border-l border-white/[0.07] p-4 flex flex-col ${mobilePanel !== 'log' ? 'hidden lg:flex' : ''}`}>
            <p className="text-label tracking-[0.2em] mb-4">Bid Log</p>
            <div className="flex-1 overflow-y-auto space-y-0.5">
              {auctionState.bidLog.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                  <div className="w-8 h-8 rounded-full bg-white/[0.04] border border-white/[0.07] flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                  </div>
                  <p className="text-white/20 text-[11px] font-bold uppercase tracking-widest">No activity yet</p>
                </div>
              )}
              {auctionState.bidLog.map((entry, i) => {
                const isWon   = entry.action === 'won'
                const isSteal = entry.action === 'steal'
                const isPass  = entry.action === 'pass'
                const isTrade = entry.action === 'trade'
                const verb = isWon ? 'WON' : isSteal ? 'STEAL' : isPass ? 'PASS' : isTrade ? 'TRADE' : 'BID'
                return (
                  <div key={i} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs border transition-colors ${
                    isWon   ? 'bg-green-500/[0.07] border-green-500/20' :
                    isSteal ? 'bg-yellow-500/[0.07] border-yellow-500/20' :
                    isPass  ? 'bg-transparent border-transparent opacity-40' :
                    isTrade ? 'bg-blue-500/[0.07] border-blue-500/20' :
                    'bg-white/[0.02] border-white/[0.04]'
                  }`}>
                    <span className={`shrink-0 text-[9px] font-black tracking-widest rounded px-1.5 py-0.5 leading-none ${
                      isWon   ? 'bg-green-500/20 text-green-400' :
                      isSteal ? 'bg-yellow-500/20 text-yellow-400' :
                      isPass  ? 'bg-white/[0.05] text-white/25' :
                      isTrade ? 'bg-blue-500/20 text-blue-400' :
                      'bg-orange-500/15 text-orange-400'
                    }`}>{verb}</span>
                    <span className={`flex-1 truncate font-semibold ${
                      isWon   ? 'text-green-200' :
                      isSteal ? 'text-yellow-200' :
                      isPass  ? 'text-white/25' :
                      isTrade ? 'text-blue-200' :
                      'text-white/70'
                    }`}>{entry.name}</span>
                    {entry.amount > 0 && (
                      <span className={`font-black shrink-0 tabular-nums ${
                        isWon   ? 'text-green-400' :
                        isSteal ? 'text-yellow-400' :
                        'text-orange-400'
                      }`}>${entry.amount}M</span>
                    )}
                  </div>
                )
              })}
              <div ref={logEndRef} />
            </div>
          </aside>
        </div>
      </div>
    )
  }

  // Catch-all: unexpected phase/state combination — show spinner with escape hatch
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <div className="w-10 h-10 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-label tracking-[0.25em]">RECONNECTING...</p>
      <Link href="/auction" className="mt-2 text-white/25 text-xs hover:text-white/50 underline transition-colors">Back to lobby</Link>
    </div>
  )
}
