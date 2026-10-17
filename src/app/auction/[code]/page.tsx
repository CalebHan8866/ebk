'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getSocket } from '@/lib/socket'
import { useAuth } from '@/context/AuthContext'

type AuctionPhase = 'loading' | 'waiting' | 'bidding' | 'steal-window' | 'trading' | 'complete' | 'error'

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
  const pct = maxTime > 0 ? timeLeft / maxTime : 0
  const r = 28
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - pct)
  const color = timeLeft <= 5 ? '#ef4444' : timeLeft <= 10 ? '#f97316' : '#22c55e'

  return (
    <div className="relative w-20 h-20 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" width="80" height="80">
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
      <span className={`font-display text-2xl ${timeLeft <= 5 ? 'text-red-400' : timeLeft <= 10 ? 'text-orange-400' : 'text-white'}`}>
        {timeLeft}
      </span>
    </div>
  )
}

export default function AuctionRoomPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const code = (params?.code as string)?.toUpperCase()

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
  const [guestName] = useState(() => user?.username || `GM-${Math.random().toString(36).substring(2, 5).toUpperCase()}`)
  const logEndRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Timer countdown
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
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

  // Auto-update bid amount
  useEffect(() => {
    if (auctionState) {
      setBidAmount(auctionState.currentBid + 1)
    }
  }, [auctionState?.currentBid])

  // Scroll bid log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [auctionState?.bidLog])

  useEffect(() => {
    const socket = getSocket()
    setMySocketId(socket.id || '')

    socket.on('connect', () => setMySocketId(socket.id || ''))

    socket.on('auction:state', (state: AuctionState) => {
      setAuctionState(state)
      const newPhase = state.status as AuctionPhase
      setPhase(newPhase === 'complete' ? 'complete' : newPhase)
      if (state.bidDeadline > 0) {
        setTimeLeft(Math.max(0, Math.ceil((state.bidDeadline - Date.now()) / 1000)))
      }
      if (state.tradeDeadline) {
        setTradeTimeLeft(Math.max(0, Math.ceil((state.tradeDeadline - Date.now()) / 1000)))
      }
    })

    socket.on('auction:complete', ({ results: r }: { results: AuctionResult[] }) => {
      setResults(r)
      setPhase('complete')
    })

    socket.on('auction:error', ({ message }: { message: string }) => {
      setErrorMsg(message)
      setTimeout(() => setErrorMsg(''), 4000)
    })

    // Request state on mount
    socket.emit('auction:get-state', { code })

    // Redirect to lobby if no state received within 6 seconds (not a participant)
    const loadTimeout = setTimeout(() => {
      setPhase(prev => prev === 'loading' ? 'error' : prev)
    }, 6000)

    return () => {
      socket.off('connect')
      socket.off('auction:state')
      socket.off('auction:complete')
      socket.off('auction:error')
      clearTimeout(loadTimeout)
    }
  }, [code])

  const me = auctionState?.participants.find(p => p.socketId === mySocketId)
  const isHost = auctionState && mySocketId === auctionState.participants[0]?.socketId
  const canBid = phase === 'bidding' && me && me.budget >= bidAmount && me.rosterCount < (auctionState?.teamSize ?? 0)
  const amLeading = auctionState?.currentBidderSocketId === mySocketId
  const tradeTargetParticipant = auctionState?.participants.find(p => p.socketId === tradeTarget)

  function handleBid() {
    if (!canBid) return
    getSocket().emit('auction:bid', { code, amount: bidAmount })
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
        <div className="w-10 h-10 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-white/40 text-sm tracking-widest">CONNECTING TO WAR ROOM...</p>
      </div>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6">
        <p className="text-red-400 text-lg font-bold">Room not found</p>
        <Link href="/auction" className="btn-primary">Back to Lobby</Link>
      </div>
    )
  }

  // ── Results / Complete ─────────────────────────────────────────────────────
  if (phase === 'complete' && results.length > 0) {
    const medals = ['🥇', '🥈', '🥉']
    const medalBg = [
      'bg-yellow-500/10 border-yellow-500/30',
      'bg-gray-400/10 border-gray-400/30',
      'bg-orange-800/10 border-orange-700/30',
    ]

    return (
      <div className="min-h-screen px-4 py-10 max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="font-display text-5xl text-orange-500 tracking-wider mb-1">FINAL ROSTERS</h1>
          <p className="text-white/40 text-sm">War Room · {code}</p>
        </div>

        <div className="space-y-4 mb-10">
          {results.map((r, i) => (
            <div key={r.socketId} className={`card-surface border ${medalBg[i] || 'border-white/[0.07]'} p-5`}>
              <div className="flex items-center gap-4 mb-4">
                <span className="text-3xl">{medals[i] || `#${i + 1}`}</span>
                <div className="flex-1">
                  <p className="font-bold text-lg text-white">{r.name}</p>
                  <p className="text-white/40 text-sm">${r.budgetSpent}M spent · {r.rosterCount} players</p>
                </div>
                <div className="text-right">
                  <p className="font-display text-3xl text-orange-400">{r.ebkTotal}</p>
                  <p className="text-white/30 text-xs uppercase tracking-widest">EBK Score</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {r.roster.map(p => p && (
                  <div key={p.id} className="flex items-center gap-2 bg-white/[0.04] rounded-lg px-3 py-1.5">
                    <PosBadge pos={p.position} />
                    <span className="text-white text-sm font-bold">{p.firstName[0]}. {p.lastName}</span>
                    <span className="text-orange-400 text-xs">{p.ebkScore.toFixed(1)}</span>
                    <span className="text-white/30 text-xs">${p.paidPrice}M</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-center gap-4">
          <Link href="/auction" className="btn-primary">Play Again</Link>
          <Link href="/lobby" className="px-6 py-3 rounded-xl border border-white/10 text-white/60 hover:text-white hover:border-white/30 transition-all">
            Back to Lobby
          </Link>
        </div>
      </div>
    )
  }

  // ── Waiting ────────────────────────────────────────────────────────────────
  if (phase === 'waiting' && auctionState) {
    return (
      <div className="min-h-screen px-4 py-10 max-w-xl mx-auto">
        <div className="text-center mb-8">
          <span className="font-display text-4xl text-orange-500">WAR ROOM</span>
          <span className="ml-3 font-mono text-white/40">{code}</span>
        </div>
        <div className="card-accent p-6 space-y-4 mb-6">
          <p className="text-white/40 text-xs uppercase tracking-widest text-center">Players in Room</p>
          {auctionState.participants.map((p, i) => (
            <div key={p.socketId} className="flex items-center gap-3 bg-white/[0.03] rounded-xl px-4 py-3">
              <div className="w-9 h-9 rounded-full bg-orange-600/20 border border-orange-500/30 flex items-center justify-center font-display text-orange-400">
                {p.name[0]?.toUpperCase()}
              </div>
              <span className="font-bold text-white">{p.name}</span>
              {p.socketId === mySocketId && <span className="ml-auto text-xs text-orange-400 font-bold">(You)</span>}
              {i === 0 && p.socketId !== mySocketId && <span className="ml-auto text-xs text-white/30">Host</span>}
            </div>
          ))}
        </div>
        {isHost ? (
          <button
            onClick={handleStart}
            disabled={(auctionState.participants.length ?? 0) < 2}
            className={`btn-primary w-full text-lg font-display tracking-widest ${
              (auctionState.participants.length ?? 0) < 2 ? 'opacity-40 cursor-not-allowed hover:scale-100' : ''
            }`}
          >
            Start Auction
          </button>
        ) : (
          <div className="text-center text-white/30 text-sm">Waiting for host to start...</div>
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
                  <span className="flex-1 text-left text-white text-sm font-bold">{p.firstName} {p.lastName}</span>
                  <span className="text-orange-400 text-xs">{p.ebkScore.toFixed(1)}</span>
                  <span className="text-white/30 text-xs">${p.paidPrice}M</span>
                </button>
              ))}
              {(!me?.roster || me.roster.length === 0) && (
                <p className="text-white/20 text-sm text-center py-4">No players yet</p>
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
                    className={`text-xs px-3 py-1.5 rounded-lg border font-bold transition-all ${
                      tradeTarget === gm.socketId
                        ? 'bg-orange-600/30 border-orange-500/50 text-orange-300'
                        : 'bg-white/[0.05] border-white/10 text-white/50 hover:text-white hover:border-white/30'
                    }`}
                  >
                    {tradeTarget === gm.socketId ? 'Proposing...' : 'Propose Trade'}
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
                  {gm.roster.length === 0 && <span className="text-white/20 text-xs">Empty roster</span>}
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
                      className={`w-full py-2 rounded-lg text-sm font-bold border transition-all ${
                        selectedToOffer.length > 0 && selectedToRequest.length > 0
                          ? 'bg-orange-600/20 border-orange-500/40 text-orange-300 hover:bg-orange-600/30'
                          : 'bg-white/[0.03] border-white/[0.07] text-white/20 cursor-not-allowed'
                      }`}
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
                          className="px-4 py-2 bg-green-600/20 border border-green-500/40 text-green-400 rounded-lg text-sm font-bold hover:bg-green-600/30 transition-all"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleTradeRespond(offer.id, false)}
                          className="px-4 py-2 bg-red-600/10 border border-red-500/30 text-red-400 rounded-lg text-sm font-bold hover:bg-red-600/20 transition-all"
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
        <div className="mt-6 flex items-center justify-between">
          {isHost && (
            <button
              onClick={handleFinishTrading}
              className="px-6 py-3 bg-white/[0.05] border border-white/10 text-white/60 hover:text-white hover:border-white/30 rounded-xl text-sm font-bold transition-all"
            >
              End Trading Early
            </button>
          )}
          <div className="ml-auto text-white/30 text-sm">
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
    const stealPrice = lastWinner ? Math.ceil(auctionState.lastWonAmount * 1.5) : 0

    return (
      <div className="min-h-screen flex flex-col">
        {/* Top bar */}
        <div className="border-b border-white/[0.07] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-display text-2xl text-orange-500">WAR ROOM</span>
            <span className="font-mono text-white/30 text-sm">{code}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-white/40 text-xs">LIVE</span>
            <span className="text-white/30 text-xs ml-2">
              {auctionState.playerIndex + 1} / {auctionState.poolSize}
            </span>
          </div>
        </div>

        {errorMsg && (
          <div className="mx-4 mt-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2 text-red-400 text-sm text-center">
            {errorMsg}
          </div>
        )}

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-0 overflow-hidden">
          {/* Left: Rosters */}
          <aside className="lg:col-span-1 border-r border-white/[0.07] p-4 overflow-y-auto">
            <p className="font-display text-sm text-white/40 tracking-widest mb-4">ROSTERS</p>
            <div className="space-y-4">
              {auctionState.participants.map(p => {
                const budgetPct = (p.budget / auctionState.totalBudget) * 100
                return (
                  <div key={p.socketId} className={`rounded-xl p-3 ${p.socketId === mySocketId ? 'bg-orange-600/10 border border-orange-500/20' : 'bg-white/[0.03]'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-full bg-orange-600/30 flex items-center justify-center text-orange-400 text-xs font-bold">
                        {p.name[0]?.toUpperCase()}
                      </div>
                      <span className="text-white text-xs font-bold truncate flex-1">{p.name}</span>
                      {p.socketId === mySocketId && <span className="text-orange-400 text-xs">(You)</span>}
                    </div>
                    {/* Budget bar */}
                    <div className="h-1.5 bg-white/10 rounded-full mb-2">
                      <div
                        className="h-1.5 bg-orange-500 rounded-full transition-all"
                        style={{ width: `${Math.max(0, budgetPct)}%` }}
                      />
                    </div>
                    <p className="text-white/40 text-xs mb-2">${p.budget}M · {p.rosterCount}/{auctionState.teamSize} players</p>
                    <div className="flex flex-wrap gap-1">
                      {p.roster.map(player => player && (
                        <div key={player.id} className="relative group">
                          <div className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-xs border ${
                            canSteal && p.socketId !== mySocketId
                              ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300 cursor-pointer hover:bg-yellow-500/20'
                              : 'border-white/[0.07] bg-white/[0.03] text-white/60'
                          }`}
                          onClick={() => canSteal && p.socketId !== mySocketId && handleSteal(player.id)}
                          >
                            {canSteal && p.socketId !== mySocketId && <span className="text-yellow-400">⚡</span>}
                            <span>{player.firstName[0]}. {player.lastName}</span>
                          </div>
                          {canSteal && p.socketId !== mySocketId && (
                            <div className="absolute bottom-full left-0 mb-1 bg-[#0d0d0d] border border-yellow-500/30 rounded-lg px-2 py-1 text-xs text-yellow-300 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 transition-opacity">
                              Steal for ${stealPrice}M
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
          <main className="lg:col-span-2 flex flex-col items-center justify-center p-6 gap-6">
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
              <div className="card-accent w-full max-w-sm p-6 text-center">
                <div className="flex justify-center mb-3">
                  <PosBadge pos={cp.position} />
                </div>
                <h2 className="font-display text-4xl md:text-5xl text-white tracking-wider mb-1">
                  {cp.firstName} {cp.lastName}
                </h2>
                <p className="text-white/40 text-sm mb-5">
                  {cp.team} · {cp.yearFrom}–{cp.yearTo}
                </p>
                <div className="grid grid-cols-4 gap-3 mb-5">
                  {[
                    { label: 'GP', value: cp.careerGames },
                    { label: 'PPG', value: cp.careerPPG?.toFixed(1) },
                    { label: 'RPG', value: cp.careerRPG?.toFixed(1) },
                    { label: 'APG', value: cp.careerAPG?.toFixed(1) },
                  ].map(s => (
                    <div key={s.label} className="bg-white/[0.04] rounded-xl py-3">
                      <p className="font-display text-xl text-white">{s.value ?? '–'}</p>
                      <p className="text-white/30 text-xs">{s.label}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-orange-600/10 border border-orange-500/20 rounded-xl py-3">
                  <span className="text-white/40 text-xs uppercase tracking-widest">EBK Score</span>
                  <p className="font-display text-3xl text-orange-400">{cp.ebkScore.toFixed(1)}</p>
                </div>
              </div>
            )}

            {/* Current bid */}
            <div className="text-center">
              <p className="font-display text-6xl text-white">
                {auctionState.currentBid > 0 ? `$${auctionState.currentBid}M` : 'No Bids'}
              </p>
              {auctionState.currentBidderName ? (
                <p className={`text-sm mt-1 font-bold ${amLeading ? 'text-orange-400' : 'text-white/50'}`}>
                  {amLeading ? 'You are leading' : `Leading: ${auctionState.currentBidderName}`}
                </p>
              ) : (
                <p className="text-white/30 text-sm mt-1">No bids yet — be first!</p>
              )}
            </div>

            {/* Timer */}
            <TimerRing timeLeft={timeLeft} maxTime={maxTime} />

            {/* Bid controls */}
            {phase === 'bidding' && (
              <div className="w-full max-w-xs space-y-3">
                <div className="flex gap-2">
                  <button
                    onClick={() => setBidAmount(prev => Math.max(auctionState.currentBid + 1, prev - 5))}
                    className="w-10 h-12 bg-white/[0.05] border border-white/10 rounded-xl text-white/60 hover:text-white hover:border-white/30 transition-all font-bold"
                  >−</button>
                  <input
                    type="number"
                    value={bidAmount}
                    min={auctionState.currentBid + 1}
                    max={me?.budget ?? 0}
                    onChange={e => setBidAmount(Math.max(auctionState.currentBid + 1, parseInt(e.target.value) || 1))}
                    className="input-field text-center font-display text-2xl"
                  />
                  <button
                    onClick={() => setBidAmount(prev => Math.min(me?.budget ?? prev, prev + 5))}
                    className="w-10 h-12 bg-white/[0.05] border border-white/10 rounded-xl text-white/60 hover:text-white hover:border-white/30 transition-all font-bold"
                  >+</button>
                </div>
                <button
                  onClick={handleBid}
                  disabled={!canBid || amLeading}
                  className={`btn-primary w-full text-lg font-display tracking-widest ${
                    (!canBid || amLeading) ? 'opacity-40 cursor-not-allowed hover:scale-100 hover:shadow-none' : ''
                  }`}
                >
                  {amLeading ? 'Leading Bid' : `Bid $${bidAmount}M`}
                </button>
                {me && (
                  <p className="text-center text-white/30 text-xs">Budget: ${me.budget}M remaining</p>
                )}
              </div>
            )}

            {/* Steal window info */}
            {phase === 'steal-window' && (
              <div className="w-full max-w-sm">
                {auctionState.stealInitiated ? (
                  <div className="text-center text-white/40 text-sm">Steal executed — next player incoming...</div>
                ) : (
                  <div className="text-center">
                    <p className="text-yellow-400 font-bold mb-1">⚡ Steal Window Open</p>
                    <p className="text-white/40 text-sm">
                      {auctionState.lastWinnerName} won <span className="text-white font-bold">{cp?.firstName} {cp?.lastName}</span> for ${auctionState.lastWonAmount}M
                    </p>
                    <p className="text-white/40 text-sm mt-1">Steal cost: <span className="text-yellow-400 font-bold">${stealPrice}M</span></p>
                    <p className="text-white/30 text-xs mt-2">Click ⚡ on a player in the roster panel to steal</p>
                  </div>
                )}
              </div>
            )}
          </main>

          {/* Right: Bid log */}
          <aside className="lg:col-span-1 border-l border-white/[0.07] p-4 flex flex-col">
            <p className="font-display text-sm text-white/40 tracking-widest mb-4">BID LOG</p>
            <div className="flex-1 overflow-y-auto space-y-1.5">
              {auctionState.bidLog.map((entry, i) => (
                <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${
                  entry.action === 'won' ? 'bg-green-500/10 border border-green-500/20' :
                  entry.action === 'steal' ? 'bg-yellow-500/10 border border-yellow-500/20' :
                  entry.action === 'pass' ? 'bg-white/[0.02] border border-white/[0.05]' :
                  entry.action === 'trade' ? 'bg-blue-500/10 border border-blue-500/20' :
                  'bg-white/[0.03] border border-white/[0.05]'
                }`}>
                  <span className={`font-bold ${
                    entry.action === 'won' ? 'text-green-400' :
                    entry.action === 'steal' ? 'text-yellow-400' :
                    entry.action === 'trade' ? 'text-blue-400' :
                    'text-white/70'
                  }`}>
                    {entry.action === 'won' ? '✓' : entry.action === 'steal' ? '⚡' : entry.action === 'pass' ? '–' : entry.action === 'trade' ? '↔' : '↑'}
                    {' '}{entry.name}
                  </span>
                  {entry.amount > 0 && (
                    <span className="text-orange-400 font-bold">${entry.amount}M</span>
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

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
