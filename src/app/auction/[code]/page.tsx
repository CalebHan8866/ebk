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
      <span aria-hidden="true" className={`font-display text-2xl ${timeLeft <= 5 ? 'text-red-400' : timeLeft <= 10 ? 'text-orange-400' : 'text-white'}`}>
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
      setErrorMsg(message)
      setTimeout(() => setErrorMsg(''), 4000)
    }

    socket.on('connect', handleConnect)
    socket.on('auction:state', handleAuctionState)
    socket.on('auction:complete', handleAuctionComplete)
    socket.on('auction:error', handleAuctionError)

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
      clearTimeout(loadTimeout)
    }
  }, [code, guestName])

  const me = auctionState?.participants.find(p => p.socketId === mySocketId)
  const isHost = auctionState && mySocketId === auctionState.hostSocketId
  const canBid = phase === 'bidding' && me && me.budget >= bidAmount && me.rosterCount < (auctionState?.teamSize ?? 0)
  const amLeading = auctionState?.currentBidderSocketId === mySocketId
  const tradeTargetParticipant = auctionState?.participants.find(p => p.socketId === tradeTarget)

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
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4">
        <div className="card-surface p-10 max-w-sm w-full text-center animate-scale-in">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
            <span className="text-red-400 text-xl font-black">!</span>
          </div>
          <h2 className="font-display text-3xl text-white mb-2">ROOM NOT FOUND</h2>
          <p className="text-gray-400 text-sm mb-6">This War Room doesn&apos;t exist or has already ended.</p>
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
      { medal: '🥈', border: 'border-slate-500/30',  bg: 'bg-slate-900/30',  glow: '',                                         rank: 'text-slate-300', nameSize: 'text-lg sm:text-xl' },
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
                    <span className="text-green-400 font-black shrink-0">⚡ Best Value:</span>
                    <span className="text-white font-bold">{bestVal.firstName[0]}. {bestVal.lastName}</span>
                    <span className="text-gray-400">{bestVal.ebkScore.toFixed(1)} EBK for ${bestVal.paidPrice}M</span>
                    <span className="text-green-500/70 ml-auto font-black tabular-nums">
                      {(bestVal.paidPrice / bestVal.ebkScore).toFixed(2)}$/pt
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
    return (
      <div className="min-h-screen px-4 py-10 max-w-xl mx-auto animate-fade-in">
        <div className="text-center mb-8 animate-fade-up">
          <div className="live-banner mx-auto w-fit mb-4">
            <span className="live-dot" />
            WAITING FOR PLAYERS
          </div>
          <h1 className="font-display text-5xl text-orange-500 tracking-wider leading-none">WAR ROOM</h1>
          <div className="mt-2 font-mono text-white/30 text-sm border border-white/[0.07] bg-white/[0.02] rounded-lg px-3 py-1 inline-block tracking-widest">{code}</div>
        </div>
        <div className="card-accent p-6 space-y-3 mb-6 animate-fade-up-1">
          <p className="text-label tracking-[0.2em] text-center mb-4">GMs in Room</p>
          {auctionState.participants.map((p, i) => {
            const isMe = p.socketId === mySocketId
            const isRoomHost = i === 0  // server always keeps host at index 0
            return (
              <div
                key={p.socketId}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 border transition-all animate-stagger-item ${
                  isMe
                    ? 'bg-orange-950/30 border-orange-500/25'
                    : 'bg-white/[0.025] border-white/[0.05]'
                }`}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-display text-sm shrink-0 ${
                  isMe ? 'bg-orange-600 text-white' : 'bg-white/[0.08] text-white/60'
                }`}>
                  {p.name[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-white block truncate">{p.name}</span>
                  {isRoomHost && (
                    <span className="text-[10px] font-bold text-orange-400/60 uppercase tracking-widest">
                      {isMe ? 'Host · You' : 'Host'}
                    </span>
                  )}
                </div>
                {!isRoomHost && isMe && (
                  <span className="text-[10px] font-black text-orange-400 bg-orange-950/50 border border-orange-500/30 rounded px-1.5 py-0.5 uppercase tracking-wider shrink-0">You</span>
                )}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-green-400 text-[10px] font-bold">READY</span>
                </div>
              </div>
            )
          })}
          {auctionState.participants.length < 2 && (
            <div className="text-center pt-2 pb-1">
              <div className="flex items-center justify-center gap-2 text-white/25 text-xs">
                <span className="w-3 h-3 rounded-full border-2 border-white/20 border-t-white/50 animate-spin" />
                Waiting for more players to join...
              </div>
            </div>
          )}
        </div>
        {isHost ? (
          <button
            onClick={handleStart}
            disabled={(auctionState.participants.length ?? 0) < 2}
            className="btn-primary w-full text-lg font-display tracking-widest"
          >
            {(auctionState.participants.length ?? 0) < 2 ? 'Waiting for Players...' : 'Start Auction'}
          </button>
        ) : (
          <div className="flex items-center justify-center gap-2 text-white/30 text-sm py-3">
            <span className="w-4 h-4 rounded-full border-2 border-orange-500/40 border-t-orange-400 animate-spin shrink-0" />
            Waiting for host to start...
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

    return (
      <div className="min-h-screen px-4 py-8 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-4xl text-orange-500 tracking-wider">TRADE WINDOW</h1>
            <p className="text-white/40 text-sm">{code}</p>
          </div>
          <div className="text-right">
            <p className="font-display text-3xl text-white">
              {tradeMinutes}:{tradeSecs.toString().padStart(2, '0')}
            </p>
            <p className="text-white/30 text-xs uppercase">Time Remaining</p>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
            {errorMsg}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Your Roster */}
          <div className="card-surface p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg text-white/80 tracking-wider">YOUR ROSTER</h2>
              <span className="text-orange-400 text-sm font-bold">${me?.budget ?? 0}M left</span>
            </div>
            <div className="space-y-2">
              {me?.roster.map(p => p && (
                <button
                  key={p.id}
                  onClick={() => toggleOffer(p.id)}
                  className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 border transition-all ${
                    selectedToOffer.includes(p.id)
                      ? 'bg-orange-600/20 border-orange-500/40'
                      : 'bg-white/[0.03] border-white/[0.05] hover:border-white/20'
                  }`}
                >
                  <PosBadge pos={p.position} />
                  <span className="flex-1 text-left text-white text-sm font-bold truncate" title={`${p.firstName} ${p.lastName}`}>{p.firstName} {p.lastName}</span>
                  <span className="text-orange-400 text-xs">{p.ebkScore.toFixed(1)}</span>
                  <span className="text-white/30 text-xs">${p.paidPrice}M</span>
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
            {auctionState.participants.filter(p => p.socketId !== mySocketId).map(gm => (
              <div key={gm.socketId} className="card-surface p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-orange-600/20 border border-orange-500/30 flex items-center justify-center font-display text-orange-400">
                      {gm.name[0]?.toUpperCase()}
                    </div>
                    <span className="font-bold text-white">{gm.name}</span>
                    <span className="text-white/30 text-xs">${gm.budget}M left</span>
                  </div>
                  <button
                    onClick={() => {
                      setTradeTarget(tradeTarget === gm.socketId ? null : gm.socketId)
                      setSelectedToRequest([])
                    }}
                    className={tradeTarget === gm.socketId ? 'btn-secondary text-xs py-2 px-4' : 'btn-primary text-xs py-2 px-4'}
                  >
                    {tradeTarget === gm.socketId ? '✕ Cancel' : '↔ Propose Trade'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {gm.roster.map(p => p && (
                    <button
                      key={p.id}
                      onClick={() => tradeTarget === gm.socketId && toggleRequest(p.id)}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 border text-xs transition-all ${
                        tradeTarget === gm.socketId && selectedToRequest.includes(p.id)
                          ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
                          : tradeTarget === gm.socketId
                          ? 'bg-white/[0.04] border-white/10 text-white/70 hover:border-blue-500/40 cursor-pointer'
                          : 'bg-white/[0.04] border-white/[0.07] text-white/50'
                      }`}
                    >
                      <PosBadge pos={p.position} />
                      <span className="font-bold">{p.firstName[0]}. {p.lastName}</span>
                      <span className="text-orange-400">{p.ebkScore.toFixed(1)}</span>
                    </button>
                  ))}
                  {gm.roster.length === 0 && (
                    <span className="text-white/20 text-xs italic">No players drafted</span>
                  )}
                </div>

                {/* Trade offer UI for this GM */}
                {tradeTarget === gm.socketId && (
                  <div className="mt-4 pt-4 border-t border-white/[0.07]">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-xs text-white/40">
                        Offering: <span className="text-orange-400 font-bold">
                          {selectedToOffer.length > 0
                            ? selectedToOffer.map(id => me?.roster.find(p => p?.id === id)).filter(Boolean).map(p => `${p!.firstName[0]}. ${p!.lastName}`).join(', ')
                            : 'Select from your roster'}
                        </span>
                      </div>
                      <div className="text-xs text-white/40">
                        Requesting: <span className="text-blue-400 font-bold">
                          {selectedToRequest.length > 0
                            ? selectedToRequest.map(id => gm.roster.find(p => p?.id === id)).filter(Boolean).map(p => `${p!.firstName[0]}. ${p!.lastName}`).join(', ')
                            : 'Select from their roster'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={handleSendTradeOffer}
                      disabled={selectedToOffer.length === 0 || selectedToRequest.length === 0}
                      className="btn-primary w-full text-sm"
                    >
                      Send Trade Offer
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Incoming Offers */}
        {myIncomingOffers.length > 0 && (
          <div className="mt-6 card-accent p-5">
            <h2 className="font-display text-lg text-white/80 tracking-wider mb-4">INCOMING OFFERS</h2>
            <div className="space-y-3">
              {myIncomingOffers.map(offer => {
                const fromGM = auctionState.participants.find(p => p.socketId === offer.fromSocketId)
                const offeredPlayers = offer.offeredPlayerIds.map(id => fromGM?.roster.find(p => p?.id === id)).filter(Boolean)
                const requestedPlayers = offer.requestedPlayerIds.map(id => me?.roster.find(p => p?.id === id)).filter(Boolean)
                return (
                  <div key={offer.id} className="bg-white/[0.03] rounded-xl p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-white font-bold mb-2">{offer.fromName} offers:</p>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {offeredPlayers.map(p => p && (
                            <span key={p.id} className="bg-green-500/10 border border-green-500/30 text-green-400 text-xs rounded-lg px-2 py-1 font-bold">
                              {p.firstName[0]}. {p.lastName} ({p.ebkScore.toFixed(1)})
                            </span>
                          ))}
                        </div>
                        <p className="text-white/40 text-xs mb-1">for your:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {requestedPlayers.map(p => p && (
                            <span key={p.id} className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg px-2 py-1 font-bold">
                              {p.firstName[0]}. {p.lastName} ({p.ebkScore.toFixed(1)})
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
                        <button
                          onClick={() => handleTradeRespond(offer.id, true)}
                          className="btn-primary text-xs py-2.5 px-4"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleTradeRespond(offer.id, false)}
                          className="btn-danger text-xs py-2.5 px-4"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Outgoing offers */}
        {myOutgoingOffers.length > 0 && (
          <div className="mt-4 card-surface p-4">
            <p className="text-white/40 text-xs uppercase tracking-widest mb-3">Pending Outgoing Offers</p>
            <div className="space-y-2">
              {myOutgoingOffers.map(offer => (
                <p key={offer.id} className="text-white/50 text-sm">
                  Offer to <span className="text-white font-bold">{offer.toName}</span> — awaiting response
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Bid log / End trading */}
        <div className="mt-6 flex items-center justify-between gap-4">
          {isHost && (
            <button
              onClick={handleFinishTrading}
              className="btn-secondary text-sm"
            >
              End Trading Early
            </button>
          )}
          <div className={`${isHost ? '' : 'ml-auto'} flex items-center gap-2 text-white/40 text-sm font-mono`}>
            <span className="live-dot" />
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
            <div className="text-white/30 text-xs bg-white/[0.03] border border-white/[0.06] rounded-lg px-2.5 py-1 font-mono">
              {auctionState.playerIndex + 1}<span className="text-white/15"> / {auctionState.poolSize}</span>
            </div>
          </div>
        </div>

        {errorMsg && (
          <div role="alert" aria-live="assertive" className="mx-4 mt-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2 text-red-400 text-sm text-center">
            {errorMsg}
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
                    <div className="flex flex-wrap gap-1">
                      {p.roster.map(player => player && (
                        <div key={player.id} className="relative group">
                          {canSteal && p.socketId !== mySocketId ? (
                            <button
                              onClick={() => handleSteal(player.id)}
                              aria-label={`Steal ${player.firstName} ${player.lastName} for $${Math.ceil(player.paidPrice * 1.5)}M`}
                              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs border border-yellow-500/40 bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500/20 transition-colors"
                            >
                              <span aria-hidden="true">⚡</span>
                              <span>{player.firstName[0]}. {player.lastName}</span>
                            </button>
                          ) : (
                            <div className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs border border-white/[0.07] bg-white/[0.03] text-white/60">
                              <span>{player.firstName[0]}. {player.lastName}</span>
                            </div>
                          )}
                          {canSteal && p.socketId !== mySocketId && (
                            <div className="absolute bottom-full left-0 mb-1 card-surface border border-yellow-500/30 rounded-lg px-2 py-1 text-xs text-yellow-300 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 transition-opacity" aria-hidden="true">
                              Steal for ${Math.ceil(player.paidPrice * 1.5)}M
                            </div>
                          )}
                        </div>
                      ))}
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

            {/* Player card */}
            {cp && (
              <div className="card-accent w-full max-w-sm p-6 text-center animate-scale-in">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <PosBadge pos={cp.position} />
                  <span className="text-white/25 text-xs font-mono tracking-widest">{cp.team}</span>
                  <span className="text-white/15 text-xs">{cp.yearFrom}–{cp.yearTo}</span>
                </div>
                <h2 className="font-display text-5xl md:text-6xl text-white tracking-wider leading-none mb-6">
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
                className={`bid-hero animate-num-pop ${
                  justWon ? 'text-green-400' :
                  auctionState.currentBid > 0 ? (amLeading ? 'text-orange-400' : 'text-white') : 'text-white/15'
                }`}
                aria-label={auctionState.currentBid > 0 ? `Current bid: $${auctionState.currentBid}M` : 'No bids yet'}
              >
                {auctionState.currentBid > 0 ? `$${auctionState.currentBid}M` : '–––'}
              </div>
              {auctionState.currentBidderName ? (
                <div className={`mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-black tracking-widest uppercase ${
                  amLeading
                    ? 'bg-orange-950/60 border-orange-500/40 text-orange-400'
                    : 'bg-white/[0.04] border-white/[0.08] text-white/50'
                }`}>
                  {amLeading ? '🔥 You are leading' : `Leading: ${auctionState.currentBidderName}`}
                </div>
              ) : (
                <p className="text-white/25 text-xs mt-2 tracking-widest uppercase">No bids yet — be first</p>
              )}
            </div>

            {/* Timer */}
            <TimerRing timeLeft={timeLeft} maxTime={maxTime} />

            {/* Bid controls */}
            {phase === 'bidding' && (
              <div className="w-full max-w-xs sm:max-w-xs space-y-3 px-2 sm:px-0">
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
              <div className="w-full max-w-sm">
                {auctionState.stealInitiated ? (
                  <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl px-5 py-4 text-center">
                    <div className="text-white/40 text-sm">Steal executed — next player incoming...</div>
                  </div>
                ) : (
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
                    <p className="text-white/25 text-xs mt-3">Click ⚡ on any opponent&apos;s player in the roster panel to steal</p>
                  </div>
                )}
              </div>
            )}
          </main>

          {/* Right: Bid log */}
          <aside className={`lg:col-span-1 border-l border-white/[0.07] p-4 flex flex-col ${mobilePanel !== 'log' ? 'hidden lg:flex' : ''}`}>
            <p className="text-label tracking-[0.2em] mb-4">Bid Log</p>
            <div className="flex-1 overflow-y-auto space-y-1">
              {auctionState.bidLog.length === 0 && (
                <div className="empty-state py-8">
                  <div className="empty-state-icon">📋</div>
                  <div className="empty-state-title">No bids yet</div>
                </div>
              )}
              {auctionState.bidLog.map((entry, i) => (
                <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border transition-colors ${
                  entry.action === 'won'   ? 'bg-green-500/10 border-green-500/20' :
                  entry.action === 'steal' ? 'bg-yellow-500/10 border-yellow-500/20' :
                  entry.action === 'pass'  ? 'bg-transparent border-transparent' :
                  entry.action === 'trade' ? 'bg-blue-500/10 border-blue-500/20' :
                  'bg-white/[0.025] border-white/[0.04]'
                }`}>
                  <span className={`w-4 shrink-0 text-center ${
                    entry.action === 'won'   ? 'text-green-400' :
                    entry.action === 'steal' ? 'text-yellow-400' :
                    entry.action === 'pass'  ? 'text-white/20' :
                    entry.action === 'trade' ? 'text-blue-400' :
                    'text-orange-400/80'
                  }`}>
                    {entry.action === 'won' ? '✓' : entry.action === 'steal' ? '⚡' : entry.action === 'pass' ? '·' : entry.action === 'trade' ? '↔' : '↑'}
                  </span>
                  <span className={`flex-1 truncate font-semibold ${
                    entry.action === 'won' ? 'text-green-300' :
                    entry.action === 'steal' ? 'text-yellow-300' :
                    entry.action === 'pass' ? 'text-white/25' :
                    'text-white/70'
                  }`}>{entry.name}</span>
                  {entry.amount > 0 && (
                    <span className={`font-black shrink-0 tabular-nums ${
                      entry.action === 'won' ? 'text-green-400' :
                      entry.action === 'steal' ? 'text-yellow-400' :
                      'text-orange-400'
                    }`}>${entry.amount}M</span>
                  )}
                </div>
              ))}
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
